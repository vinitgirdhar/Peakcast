import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ArrowLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export function Developers({
  token,
  installed,
  onInstall,
  view,
  onView,
}: {
  token: string;
  installed: boolean;
  onInstall: () => Promise<void>;
  view: "overview" | "api" | "setup";
  onView: (view: "overview" | "api" | "setup") => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const origin = window.location.origin;
  const endpoints = [
    {
      method: "GET",
      route: "/markets",
      text: "Discover and filter markets",
      auth: "Public",
    },
    {
      method: "GET",
      route: "/markets/:id/history",
      text: "Observed demo price history",
      auth: "Public",
    },
    {
      method: "POST",
      route: "/sessions",
      text: "Create a demo account and token",
      auth: "Public",
    },
    {
      method: "POST",
      route: "/quotes",
      text: "Quote a buy or sell",
      auth: "Public",
    },
    {
      method: "POST",
      route: "/trades",
      text: "Execute with price limits and idempotency",
      auth: "Bearer",
    },
    {
      method: "GET",
      route: "/portfolio",
      text: "Your positions, balance and activity",
      auth: "Bearer",
    },
    {
      method: "POST",
      route: "/drafts",
      text: "Save a private market draft",
      auth: "Bearer",
    },
    {
      method: "POST",
      route: "/drafts/generate",
      text: "Optional configured AI refinement",
      auth: "Bearer + AI token",
    },
  ];
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyError("");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(
        "Clipboard access is unavailable. Create a token using the sessions API.",
      );
    }
  }
  return (
    <div className="page">
      {view !== "overview" && (
        <button className="back-button" onClick={() => onView("overview")}>
          <ArrowLeft size={16} />
          Developer tools
        </button>
      )}
      <div className="page-heading">
        <div>
          <h1>
            {view === "api"
              ? "API & credentials"
              : view === "setup"
                ? "App & integrations"
                : "Developer tools"}
          </h1>
          <p>
            {view === "api"
              ? "Connect to your demo account."
              : view === "setup"
                ? "Install the app or configure AI drafting."
                : "Build with the Wildcatter API."}
          </p>
        </div>
        <a className="primary-button" href="/api-docs/">
          Open API reference <ArrowUpRight size={16} />
        </a>
      </div>
      {view === "overview" && (
        <div className="resource-list">
          <button onClick={() => onView("api")}>
            <span className="soft-icon">
              <Code2 size={23} />
            </span>
            <span>
              <strong>API & credentials</strong>
              <small>Endpoints, access token and code example</small>
            </span>
            <ChevronRight size={20} />
          </button>
          <button onClick={() => onView("setup")}>
            <span className="soft-icon">
              <Globe2 size={23} />
            </span>
            <span>
              <strong>App & integrations</strong>
              <small>Installation, AI setup and demo details</small>
            </span>
            <ChevronRight size={20} />
          </button>
          <a href="/api/v1/openapi.json">
            <span className="soft-icon">
              <Download size={23} />
            </span>
            <span>
              <strong>OpenAPI specification</strong>
              <small>Machine-readable API schema</small>
            </span>
            <ArrowUpRight size={20} />
          </a>
        </div>
      )}
      {view === "api" && (
        <>
          <div className="developer-intro">
            <div>
              <span className="soft-icon">
                <Code2 size={24} />
              </span>
              <h2>Connect your client</h2>
              <p>Base URL for this workspace:</p>
              <code>{origin}/api/v1</code>
            </div>
            <div className="developer-token">
              <h3>Your demo API credential</h3>
              <p>
                This token accesses your current demo portfolio and expires
                after 30 days. Treat it as a password.
              </p>
              <button
                className="secondary-button liquid-material"
                onClick={() => void copyToken()}
                disabled={!token}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied demo token" : "Copy demo API token"}
              </button>
              {copyError && (
                <p className="form-error" role="alert">
                  {copyError}
                </p>
              )}
            </div>
          </div>
          <section className="api-section">
            <div className="panel-heading">
              <h2>Start building</h2>
              <a className="text-button" href="/api/v1/openapi.json">
                OpenAPI JSON <ExternalLink size={13} />
              </a>
            </div>
            <div className="developer-grid">
              <div className="endpoint-list">
                {endpoints.map((endpoint) => (
                  <div
                    className="endpoint"
                    key={endpoint.route + endpoint.method}
                  >
                    <span className={`method ${endpoint.method.toLowerCase()}`}>
                      {endpoint.method}
                    </span>
                    <div>
                      <code>{endpoint.route}</code>
                      <span>{endpoint.text}</span>
                    </div>
                    <span className="endpoint-auth">{endpoint.auth}</span>
                  </div>
                ))}
              </div>
              <details className="code-example">
                <summary>JavaScript / TypeScript example</summary>
                <pre tabIndex={0} aria-label="TypeScript API example">
                  <code>{`import { WildcatterClient } from './shared/client.js';

const publicApi = new WildcatterClient('${origin}');
const { token } = await publicApi.createSession();
const api = new WildcatterClient('${origin}', token);

const { items } = await api.markets();
const order = {
  marketId: items[0].id,
  outcome: 'YES',
  action: 'buy',
  shares: 10,
} as const;

const quote = await api.quote(order);
await api.trade(
  { ...order, limitMicros: quote.amountMicros },
  crypto.randomUUID(),
);

console.log(await api.portfolio());`}</code>
                </pre>
              </details>
            </div>
          </section>
        </>
      )}
      {view === "setup" && (
        <>
          <div className="developer-notes">
            <section>
              <ShieldCheck size={23} />
              <h3>About this demo</h3>
              <p>
                Practice with sample markets and demo credits. No deposits,
                withdrawals or real-money payouts. AI can help draft questions;
                it cannot trade or settle markets.
              </p>
            </section>
            <section>
              <Globe2 size={23} />
              <h3>Install Wildcatter</h3>
              <p>
                On iPhone, open Safari’s Share menu and choose Add to Home
                Screen. On Android, use your browser’s Install app option.
              </p>
              {installed && (
                <button
                  className="text-button"
                  onClick={() => void onInstall()}
                >
                  <Download size={15} />
                  Install Wildcatter
                </button>
              )}
            </section>
            <section>
              <Sparkles size={23} />
              <h3>Connect your AI provider</h3>
              <details>
                <summary>Server configuration</summary>
                <p>
                  Configure GEMINI_API_KEY or GROQ_API_KEY and AI_ACCESS_TOKEN
                  on the server. The optional GEMINI_MODEL and GROQ_MODEL
                  override their defaults. Choose a provider in Draft Studio.
                  OpenAI remains optional via OPENAI_API_KEY and OPENAI_MODEL.
                  AI can refine private drafts; it cannot trade or settle
                  markets.
                </p>
              </details>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
