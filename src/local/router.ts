// The slice of Fastify that server/routes.ts uses, answering in-process
// instead of over HTTP. Validation and error messages match server/app.ts.
import type { FastifyInstance } from "fastify";
import { FormatRegistry, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { DomainError } from "../../server/database.js";

if (!FormatRegistry.Has("uuid"))
  FormatRegistry.Set("uuid", (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );

interface RouteSchema {
  params?: TSchema;
  querystring?: TSchema;
  body?: TSchema;
  headers?: TSchema;
  response?: Record<number, TSchema>;
}
interface LocalRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  log: Console;
}
interface LocalReply {
  statusCode: number;
  sent: boolean;
  payload: unknown;
  code(status: number): LocalReply;
  header(name: string, value: string): LocalReply;
  send(payload: unknown): LocalReply;
}
type Handler = (request: LocalRequest, reply: LocalReply) => unknown;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  schema: RouteSchema;
  handler: Handler;
}
interface RouteOptions {
  schema?: RouteSchema;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const invalid = (schema: TSchema | undefined, value: unknown) =>
  schema !== undefined && !Value.Check(schema, value);

/**
 * TypeBox compiles `pattern` without the "u" flag, so \p{L} (letters in any
 * script, used for display names) never matches. Ajv on the server uses "u".
 * Such patterns become an equivalent format checked with the flag.
 */
function unicodePatterns(node: unknown) {
  if (typeof node !== "object" || node === null) return;
  const schema = node as { pattern?: unknown; format?: string };
  if (typeof schema.pattern === "string" && schema.pattern.includes("\\p")) {
    const source = schema.pattern;
    const format = `unicode-pattern:${source}`;
    if (!FormatRegistry.Has(format))
      FormatRegistry.Set(format, (value) =>
        new RegExp(source, "u").test(value),
      );
    delete schema.pattern;
    schema.format = format;
  }
  Object.values(node).forEach(unicodePatterns);
}

export class LocalApp {
  private readonly routes: Route[] = [];
  readonly log = console;

  private add(
    method: string,
    url: string,
    options: RouteOptions | Handler,
    handler?: Handler,
  ) {
    const keys: string[] = [];
    const source = url.replace(/:([A-Za-z]+)/g, (_, key: string) => {
      keys.push(key);
      return "([^/]+)";
    });
    const schema = (typeof options === "function" ? {} : options.schema) ?? {};
    unicodePatterns(schema);
    this.routes.push({
      method,
      pattern: new RegExp(`^${source}$`),
      keys,
      schema,
      handler: typeof options === "function" ? options : handler!,
    });
  }

  get = (url: string, options: RouteOptions | Handler, handler?: Handler) =>
    this.add("GET", url, options, handler);
  post = (url: string, options: RouteOptions | Handler, handler?: Handler) =>
    this.add("POST", url, options, handler);
  put = (url: string, options: RouteOptions | Handler, handler?: Handler) =>
    this.add("PUT", url, options, handler);
  patch = (url: string, options: RouteOptions | Handler, handler?: Handler) =>
    this.add("PATCH", url, options, handler);
  delete = (url: string, options: RouteOptions | Handler, handler?: Handler) =>
    this.add("DELETE", url, options, handler);
  route = (
    route: RouteOptions & { method: string; url: string; handler: Handler },
  ) => this.add(route.method, route.url, route, route.handler);

  /** registerApi is written against Fastify; this object covers what it calls. */
  asFastify() {
    return this as unknown as FastifyInstance;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let route: Route | undefined;
    let match: RegExpExecArray | null = null;
    for (const candidate of this.routes) {
      if (candidate.method !== request.method) continue;
      match = candidate.pattern.exec(url.pathname);
      if (match) {
        route = candidate;
        break;
      }
    }
    if (!route || !match) return json(404, { message: "Route not found." });
    try {
      const text = await request.text();
      const local: LocalRequest = {
        params: Object.fromEntries(
          route.keys.map((key, i) => [key, decodeURIComponent(match![i + 1])]),
        ),
        query: Object.fromEntries(url.searchParams),
        body: text ? JSON.parse(text) : undefined,
        headers: Object.fromEntries(request.headers),
        log: console,
      };
      const { schema } = route;
      if (
        invalid(schema.params, local.params) ||
        invalid(schema.querystring, local.query) ||
        invalid(schema.headers, local.headers) ||
        (local.body !== undefined && invalid(schema.body, local.body))
      )
        return json(400, {
          message:
            "Invalid request. Check field types, ranges and required values.",
        });
      const reply: LocalReply = {
        statusCode: 200,
        sent: false,
        payload: undefined,
        code(status) {
          reply.statusCode = status;
          return reply;
        },
        header: () => reply,
        send(payload) {
          reply.sent = true;
          reply.payload = payload;
          return reply;
        },
      };
      const result = await route.handler(local, reply);
      const payload = JSON.parse(
        JSON.stringify(reply.sent ? reply.payload : result),
      );
      // Like Fastify's serializer: only fields the response schema declares.
      const responseSchema = schema.response?.[reply.statusCode];
      return json(
        reply.statusCode,
        responseSchema ? Value.Clean(responseSchema, payload) : payload,
      );
    } catch (error) {
      if (error instanceof SyntaxError)
        return json(400, { message: "The request body is not valid JSON." });
      if (error instanceof DomainError)
        return json(error.statusCode, { message: error.message });
      console.error("On-device request failed", error);
      return json(500, {
        message: "The app could not complete this request.",
      });
    }
  }
}
