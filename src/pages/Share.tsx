import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { WildcatterClient } from "../../shared/client.js";
import type { Market } from "../../shared/types.js";
import { Collapse } from "../motion.js";
import { errorMessage } from "../ui.js";
import "../share.css";

type Field = HTMLInputElement | HTMLTextAreaElement;
interface Notice {
  text: string;
  copied?: "link" | "embed";
}

/** Copy link, embed snippet and a live widget preview for one market. */
export function SharePanel({
  open,
  id,
  market,
  client,
  shareOrigin,
}: {
  open: boolean;
  id: string;
  market: Market;
  client: WildcatterClient;
  /** Null on the desktop app, whose loopback server nobody else can reach. */
  shareOrigin: string | null;
}) {
  // Match the preview to the app's current appearance, not only the OS setting.
  const theme =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  return (
    <Collapse open={open} id={id}>
      <section
        className="resolution-panel share-panel"
        aria-label="Share this market"
      >
        {shareOrigin ? (
          <ShareFields market={market} client={client} origin={shareOrigin} />
        ) : (
          <p className="panel-hint">
            Links and embeds come from the hosted Wildcatter app; this desktop
            workspace runs only on this computer.
          </p>
        )}
        <div className="share-preview">
          <span className="form-label">Widget preview</span>
          <iframe
            src={`/embed/markets/${encodeURIComponent(market.id)}?theme=${theme}`}
            title={`Widget preview: ${market.title}`}
            width={480}
            height={200}
            loading="lazy"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      </section>
    </Collapse>
  );
}

function ShareFields({
  market,
  client,
  origin,
}: {
  market: Market;
  client: WildcatterClient;
  origin: string;
}) {
  const id = useId();
  const link = `${origin}/markets/${encodeURIComponent(market.id)}`;
  const [snippet, setSnippet] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const snippetField = useRef<HTMLTextAreaElement>(null);

  // The server builds the snippet, so its escaping is the only escaping.
  useEffect(() => {
    let active = true;
    void client
      .oembed(link)
      .then((data) => {
        if (active) setSnippet(data.html);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
    // The client is rebuilt on every app render; only the link matters here.
  }, [link]);

  // Confirmations fade; the manual-copy instruction stays until the next action.
  useEffect(() => {
    if (!notice?.copied) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy(
    text: string,
    field: Field | null,
    what: "link" | "embed",
  ) {
    const name = what === "link" ? "Link" : "Embed snippet";
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ text: `${name} copied to clipboard.`, copied: what });
    } catch {
      field?.focus();
      field?.select();
      setNotice({
        text: `Clipboard access is unavailable. The ${name.toLowerCase()} is selected; press Ctrl+C (⌘C on Mac) to copy it.`,
      });
    }
  }

  const icon = (what: "link" | "embed") =>
    notice?.copied === what ? <Check size={15} /> : <Copy size={15} />;
  return (
    <div className="share-fields">
      <label className="form-label" htmlFor={`${id}-link`}>
        Market link
      </label>
      <div className="copy-row">
        <input
          ref={linkField}
          id={`${id}-link`}
          className="text-input"
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => void copy(link, linkField.current, "link")}
        >
          {icon("link")}
          Copy link
        </button>
      </div>
      <label className="form-label" htmlFor={`${id}-embed`}>
        Embed snippet
      </label>
      <div className="copy-row">
        <textarea
          ref={snippetField}
          id={`${id}-embed`}
          className="text-input"
          readOnly
          rows={3}
          value={snippet}
          placeholder={error ? "" : "Loading snippet…"}
          aria-describedby={`${id}-embed-hint`}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={!snippet}
          onClick={() => void copy(snippet, snippetField.current, "embed")}
        >
          {icon("embed")}
          Copy embed
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <small className="field-hint" id={`${id}-embed-hint`}>
        Paste into any page that accepts HTML. The widget shows the live
        probability and opens this market in a new tab.
      </small>
      <p className="share-status" role="status">
        {notice?.text}
      </p>
    </div>
  );
}
