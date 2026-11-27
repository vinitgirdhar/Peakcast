import Fastify, { type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store, DomainError } from "./database.js";
import { marketShell, registerEmbeds } from "./embed.js";
import { ErrorSchema } from "./schemas.js";
import { settleDue } from "./resolution.js";
import { seedDemoActivity } from "./demo.js";
import { registerApi } from "./routes.js";

interface AppOptions {
  databasePath?: string;
  staticRoot?: string;
  logger?: boolean;
  rateLimiting?: boolean;
  publicOrigin?: string;
  /** Reachable only from this device (the desktop app): no shareable links or embeds. */
  localOnly?: boolean;
  /** How long a proposed outcome can be disputed before anyone may settle it. */
  disputeWindowMs?: number;
  /** How often undisputed proposals past their window are paid out; 0 disables. */
  autoSettleMs?: number;
  /** Workspaces (Teams); the loopback-only desktop app turns them off. Default true. */
  teams?: boolean;
  /** Adds sample players and activity to a new database (server/demo.ts). */
  demoActivity?: boolean;
}

export async function buildApp(options: AppOptions = {}) {
  const publicUrl = options.publicOrigin
    ? new URL(options.publicOrigin)
    : undefined;
  if (
    publicUrl &&
    (publicUrl.protocol !== "https:" ||
      publicUrl.origin !== options.publicOrigin)
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an exact HTTPS origin without a path.",
    );
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16_384,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const store = new Store(
    options.databasePath ??
      process.env.DATABASE_PATH ??
      "./data/peakcast.sqlite",
  );
  if (options.demoActivity) seedDemoActivity(store);
  const windowSeconds = Number(process.env.DISPUTE_WINDOW_SECONDS ?? 120);
  const disputeWindowMs =
    options.disputeWindowMs ??
    (Number.isFinite(windowSeconds) && windowSeconds >= 0
      ? windowSeconds
      : 120) * 1000;
  const autoSettleMs = options.autoSettleMs ?? 15_000;
  // Payouts must not depend on someone pressing "Finalize".
  const sweep =
    autoSettleMs > 0
      ? setInterval(() => {
          try {
            settleDue(store);
          } catch (error) {
            app.log.error(error, "Automatic settlement failed");
          }
        }, autoSettleMs)
      : undefined;
  sweep?.unref();
  app.addHook("onClose", async () => {
    clearInterval(sweep);
    store.close();
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // The on-device engine compiles sql.js WebAssembly; without this the app cannot start.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  if (options.rateLimiting !== false)
    await app.register(rateLimit, {
      max: 300,
      timeWindow: "1 minute",
      allowList: (request) => !/^\/(api|embed)\//.test(request.url),
    });
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/v1/") || route.schema?.hide) return;
    const codes = [400, 403, 413, 429, 500];
    if (route.schema?.security?.length) codes.push(401);
    if (
      /\/markets\/|\/quotes$|\/trades$|\/orders|\/watchlist\//.test(route.url)
    )
      codes.push(404, 409);
    if (route.url.endsWith("/drafts/:id") || route.url.endsWith("/oembed"))
      codes.push(404);
    if (route.url.endsWith("/launch")) codes.push(404, 409);
    if (route.url.endsWith("/bonus/claim")) codes.push(409);
    if (route.url.startsWith("/api/v1/workspaces")) codes.push(404, 409);
    if (route.url === "/api/v1/markets/:id/ruling") codes.push(503);
    const responses = route.schema?.response;
    route.schema = {
      ...route.schema,
      response: {
        ...Object.fromEntries(codes.map((code) => [code, ErrorSchema])),
        ...(typeof responses === "object" && responses !== null
          ? responses
          : {}),
      },
    };
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Peakcast API",
        version: "0.1.0",
        description:
          "Demo-credit prediction markets. Amounts are integer microcredits (1 credit = 1,000,000). Create a session for a 30-day bearer credential. Public data requires no token. No real funds, on-chain settlement or production identity.",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Demo session token returned by POST /api/v1/sessions",
          },
          operatorToken: {
            type: "apiKey",
            in: "header",
            name: "X-Operator-Token",
            description:
              "Server operator secret (OPERATOR_TOKEN) for final market rulings.",
          },
        },
      },
      tags: [
        { name: "Markets" },
        { name: "Trading" },
        { name: "Accounts" },
        { name: "Drafts" },
        { name: "Workspaces" },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/api-docs",
    uiConfig: { persistAuthorization: false },
  });

  const isPublicHost = (request: FastifyRequest) =>
    Boolean(publicUrl && request.headers.host === publicUrl.host);
  /** This server's origin as the requester sees it; the host was vetted on request. */
  const ownOrigin = (request: FastifyRequest) =>
    isPublicHost(request)
      ? publicUrl!.origin
      : (URL.parse(`http://${request.headers.host ?? "localhost"}`)?.origin ??
        "http://localhost");

  app.addHook("onRequest", async (request, reply) => {
    // shortcut: one opt-in HTTPS preview origin; review deployment controls before production hosting.
    const host = request.headers.host?.split(":")[0];
    const publicHost = isPublicHost(request);
    if (host && !["127.0.0.1", "localhost"].includes(host) && !publicHost)
      throw new DomainError("This host is not enabled for the demo.", 403);
    const origin = request.headers.origin;
    if (
      origin &&
      (publicHost
        ? origin !== publicUrl?.origin
        : origin !== `http://${request.headers.host}` &&
          origin !== `https://${request.headers.host}`)
    )
      throw new DomainError(
        "Cross-origin access is not enabled for this local demo.",
        403,
      );
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; validation?: unknown };
    const status = err.validation ? 400 : (err.statusCode ?? 500);
    if (status >= 500 && !(error instanceof DomainError))
      request.log.error({ error: err.name }, "Request failed");
    reply.code(status).send({
      message: err.validation
        ? "Invalid request. Check field types, ranges and required values."
        : status >= 500 && !(error instanceof DomainError)
          ? "The server could not complete this request."
          : err.message,
    });
  });

  registerApi(app, store, {
    disputeWindowMs,
    operatorToken: () => process.env.OPERATOR_TOKEN,
    teams: options.teams !== false,
    shareOrigin: (request) => (options.localOnly ? null : ownOrigin(request)),
  });

  app.get<{ Params: { name: string } }>(
    "/downloads/:name",
    { schema: { hide: true } },
    async (request, reply) => {
      const name = request.params.name;
      if (!["Peakcast-Windows.zip", "Peakcast-Android.apk"].includes(name))
        throw new DomainError("Download not found.", 404);
      const path = resolve("release/downloads", name);
      // Hosted demos do not ship the 170 MB build; they point at the release asset.
      const hosted = name.endsWith(".zip")
        ? process.env.WINDOWS_DOWNLOAD_URL
        : process.env.ANDROID_DOWNLOAD_URL;
      if (!existsSync(path) && hosted?.startsWith("https://"))
        return reply.redirect(hosted);
      if (!existsSync(path))
        throw new DomainError("This app build is not available yet.", 404);
      reply.header("Content-Disposition", `attachment; filename="${name}"`);
      reply.type(
        name.endsWith(".apk")
          ? "application/vnd.android.package-archive"
          : "application/zip",
      );
      return reply.send(createReadStream(path));
    },
  );
  registerEmbeds(app, store, ownOrigin);
  app.get("/api/v1/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  const staticRoot = options.staticRoot ?? resolve("dist");
  if (existsSync(staticRoot)) {
    const shellPath = resolve(staticRoot, "index.html");
    const shell = existsSync(shellPath)
      ? readFileSync(shellPath, "utf8")
      : undefined;
    await app.register(fastifyStatic, {
      root: staticRoot,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/api") &&
        !request.url.split("?")[0].split("/").at(-1)?.includes(".")
      ) {
        // Market pages carry link-preview tags so shared links unfurl.
        const page =
          shell &&
          marketShell(
            shell,
            store,
            request.url.split("?")[0],
            ownOrigin(request),
          );
        return page
          ? reply.type("text/html; charset=utf-8").send(page)
          : reply.sendFile("index.html");
      }
      return reply.code(404).send({ message: "Route not found." });
    });
  }
  return app;
}
