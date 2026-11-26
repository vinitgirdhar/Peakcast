import { createHash } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyHelmetOptions } from "@fastify/helmet";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { DomainError, type Store } from "./database.js";
import { OEmbedQuerySchema, OEmbedSchema } from "./schemas.js";
import { marketActor } from "./workspaces.js";
import {
  moveLabel,
  movePoints,
  percent,
  statusLabel,
} from "../shared/format.js";
import type { Market, OEmbed } from "../shared/types.js";

export const EMBED_WIDTH = 480;
export const EMBED_HEIGHT = 200;
type Theme = "light" | "dark" | "auto";

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/** Escapes text for HTML element content and quoted attribute values. */
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => entities[char]);

const dark =
  "--surface:#151517;--ink:#f5f5f7;--muted:#a6a6ad;--border:#2d2d31;--chip:#212124;--yes:#79d6b3;--no:#f3a0af;color-scheme:dark";
// One static stylesheet allowed by its hash: the widget has no script and no style attributes.
const style = [
  "*{box-sizing:border-box;margin:0}",
  ":root{--surface:#fff;--ink:#202124;--muted:#64676d;--border:#e7e8eb;--chip:#f2f3f5;--yes:#087961;--no:#b23862;color-scheme:light}",
  `:root[data-theme=dark]{${dark}}`,
  `@media (prefers-color-scheme:dark){:root[data-theme=auto]{${dark}}}`,
  "html,body{height:100%}",
  'body{background:var(--surface);color:var(--ink);font:14px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}',
  ".card{display:flex;flex-direction:column;gap:8px;height:100%;padding:14px 16px;border:1px solid var(--border);border-radius:12px;overflow:hidden}",
  ".row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)}",
  ".row>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".brand{color:var(--ink);font-weight:700;letter-spacing:-.02em}",
  ".status{flex-shrink:0;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--ink);font-weight:600}",
  "h1{font-size:15px;font-weight:620;line-height:1.3;letter-spacing:-.01em;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}",
  ".figures{display:flex;align-items:center;gap:12px;flex:1;min-height:0}",
  ".probability{display:flex;flex-direction:column}",
  ".probability strong{font-size:34px;font-weight:680;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}",
  ".probability span,.missing p{font-size:12px;color:var(--muted)}",
  ".change{font-size:12px;font-weight:640;font-variant-numeric:tabular-nums;white-space:nowrap}",
  ".up{color:var(--yes)}.down{color:var(--no)}.flat{color:var(--muted)}",
  ".spark{flex:1;min-width:48px;height:40px;overflow:visible}",
  "polyline{fill:none;stroke:var(--ink);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}",
  "a{flex-shrink:0;color:var(--ink);font-weight:600;text-decoration:none}",
  "a:hover{text-decoration:underline}",
  "a:focus-visible{outline:2px solid #6183c5;outline-offset:2px;border-radius:4px}",
  ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}",
  ".missing{align-items:center;justify-content:center;text-align:center}",
].join("");
const styleHash = `'sha256-${createHash("sha256").update(style).digest("base64")}'`;

/** Widget headers: framable anywhere, otherwise stricter than the app's own CSP. */
const embedHelmet: Omit<FastifyHelmetOptions, "global"> = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      styleSrc: [styleHash],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      // Public, read-only data with no session or state-changing control, so
      // there is nothing to clickjack; any publisher (https, http or localhost) may frame it.
      frameAncestors: ["*"],
    },
  },
  frameguard: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
};

/** Market id from an app path: /markets/{id} or /markets/{id}/rules. */
export function marketIdFromPath(pathname: string): string | undefined {
  const match = /^\/markets\/([^/]+)(?:\/rules)?\/?$/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

const marketUrl = (origin: string, id: string) =>
  `${origin}/markets/${encodeURIComponent(id)}`;

/** Polyline points for a 120×40 sparkline, zoomed to the traded range. */
export function sparkline(values: number[]): string {
  const low = Math.max(0, Math.min(...values) - 0.05);
  const high = Math.min(1, Math.max(...values) + 0.05);
  return values
    .map(
      (value, index) =>
        `${((index / (values.length - 1)) * 120).toFixed(1)},${(38 - ((value - low) / (high - low)) * 36).toFixed(1)}`,
    )
    .join(" ");
}

function changeLine(change: number): string {
  const points = movePoints(change);
  const direction = points ? (change > 0 ? "up" : "down") : "flat";
  const visible = points
    ? `${change > 0 ? "▲" : "▼"} ${points} ${points === 1 ? "pt" : "pts"}`
    : "No change";
  return `<p class="change ${direction}"><span aria-hidden="true">${visible} · 24h</span><span class="sr">${moveLabel(change) ?? "No change in 24 hours"}</span></p>`;
}

function widget(market: Market, values: number[], link: string): string {
  const title = escapeHtml(market.title);
  const deadline = new Date(market.closesAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return [
    '<main class="card">',
    `<header class="row"><span><span class="brand">Peakcast</span> · Demo credits</span><span class="status">${escapeHtml(statusLabel(market))}</span></header>`,
    `<h1 title="${title}">${title}</h1>`,
    `<div class="figures"><p class="probability"><strong>${percent(market.probability)}</strong><span>chance of YES</span></p>${changeLine(market.change24h)}`,
    `<svg class="spark" viewBox="0 0 120 40" preserveAspectRatio="none" role="img" aria-label="YES probability after each demo trade"><polyline points="${sparkline(values)}"/></svg></div>`,
    `<footer class="row"><span>${market.status === "open" ? "Closes" : "Deadline"} <time datetime="${escapeHtml(market.closesAt)}">${deadline}</time></span>`,
    `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Forecast on Peakcast<span aria-hidden="true"> →</span></a></footer>`,
    "</main>",
  ].join("");
}

const missing =
  '<main class="card missing"><p class="brand">Peakcast</p><h1>Market not found</h1><p>This forecast is not available.</p></main>';

const page = (theme: Theme, title: string, body: string) =>
  `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${style}</style></head><body>${body}</body></html>`;

/** A public market; a private one is as unknown here as a missing id. */
function publicMarket(store: Store, id: string): Market {
  marketActor(store, undefined, id);
  return store.market(id);
}

/** The public market, or undefined when it does not exist; other failures propagate. */
function findMarket(store: Store, id: string): Market | undefined {
  try {
    return publicMarket(store, id);
  } catch (error) {
    if (error instanceof DomainError && error.statusCode === 404)
      return undefined;
    throw error;
  }
}

function ownMarketId(link: string, origin: string): string {
  const url = URL.parse(link);
  const id =
    url && url.origin === origin && !url.username && !url.password
      ? marketIdFromPath(url.pathname)
      : undefined;
  if (!id)
    throw new DomainError(
      "Use a market link from this Peakcast server, such as /markets/{id}.",
    );
  return id;
}

const iframe = (
  origin: string,
  market: Market,
  width: number,
  height: number,
) =>
  `<iframe src="${escapeHtml(`${origin}/embed/markets/${encodeURIComponent(market.id)}`)}" width="${width}" height="${height}" title="${escapeHtml(`Peakcast forecast: ${market.title}`)}" loading="lazy" sandbox="allow-popups allow-popups-to-escape-sandbox" style="border:0;border-radius:12px;max-width:100%"></iframe>`;

/** The SPA shell with link-preview tags for a market page; undefined for any other path. */
export function marketShell(
  shell: string,
  store: Store,
  path: string,
  origin: string,
): string | undefined {
  const id = marketIdFromPath(path);
  const market = id === undefined ? undefined : findMarket(store, id);
  if (!market) return undefined;
  const url = marketUrl(origin, market.id);
  const title = escapeHtml(market.title);
  const description = escapeHtml(
    `${percent(market.probability)} chance of YES · ${statusLabel(market)} · Demo-credit forecast on Peakcast`,
  );
  const tags = [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Peakcast">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(`${origin}/icon-512.png`)}">`,
    '<meta name="twitter:card" content="summary">',
    `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(`${origin}/api/v1/oembed?url=${encodeURIComponent(url)}`)}" title="${title}">`,
  ].join("");
  // A replacer function keeps `$&`-style patterns in titles literal.
  return shell.replace("</head>", () => `${tags}</head>`);
}

/** Public HTML widget and oEmbed endpoint; `ownOrigin` is this server's origin for the request. */
export function registerEmbeds(
  app: FastifyInstance,
  store: Store,
  ownOrigin: (request: FastifyRequest) => string,
) {
  app.get<{ Params: { id: string }; Querystring: { theme?: Theme } }>(
    "/embed/markets/:id",
    {
      helmet: embedHelmet,
      schema: {
        hide: true,
        querystring: Type.Object({
          theme: Type.Optional(
            Type.Union([
              Type.Literal("light"),
              Type.Literal("dark"),
              Type.Literal("auto"),
            ]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const theme = request.query.theme ?? "auto";
      const market = findMarket(store, request.params.id);
      // Ending on the current price gives the sparkline at least two points.
      const html = market
        ? page(
            theme,
            `${market.title} · Peakcast`,
            widget(
              market,
              [
                ...store.history(market.id).map((point) => point.probability),
                market.probability,
              ],
              marketUrl(ownOrigin(request), market.id),
            ),
          )
        : page(theme, "Market not found · Peakcast", missing);
      return reply
        .code(market ? 200 : 404)
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "public, max-age=30")
        .send(html);
    },
  );

  app.get<{ Querystring: Static<typeof OEmbedQuerySchema> }>(
    "/api/v1/oembed",
    {
      schema: {
        tags: ["Markets"],
        summary: "oEmbed (JSON) for a market link on this server",
        description:
          "Returns an iframe of the read-only market widget at /embed/markets/{id}. The url must be this server's own /markets/{id} link; anything else is 400, an unknown market 404. Width and height default to 480×200 and never exceed maxwidth/maxheight.",
        querystring: OEmbedQuerySchema,
        response: { 200: OEmbedSchema },
      },
    },
    async (request): Promise<OEmbed> => {
      const origin = ownOrigin(request);
      const market = publicMarket(
        store,
        ownMarketId(request.query.url, origin),
      );
      const width = Math.min(
        EMBED_WIDTH,
        Number(request.query.maxwidth ?? EMBED_WIDTH),
      );
      const height = Math.min(
        EMBED_HEIGHT,
        Number(request.query.maxheight ?? EMBED_HEIGHT),
      );
      return {
        version: "1.0",
        type: "rich",
        provider_name: "Peakcast",
        provider_url: origin,
        title: market.title,
        html: iframe(origin, market, width, height),
        width,
        height,
      };
    },
  );
}
