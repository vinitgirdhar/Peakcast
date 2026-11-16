import { Select } from "../Select.js";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ChevronDown,
  Rocket,
  Sparkles,
  Trash2,
} from "lucide-react";
import { WildcatterClient } from "../../shared/client.js";
import type {
  AIProvider,
  AIProviderInfo,
  Category,
  Draft,
  DraftInput,
  Market,
} from "../../shared/types.js";
import { errorMessage } from "../ui.js";
import { motion } from "motion/react";

const categories: Category[] = [
  "Economy",
  "Technology",
  "Crypto",
  "Science",
  "Climate",
  "World",
];
const blankDraft: DraftInput = {
  question: "",
  sourceName: "",
  sourceUrl: "",
  closesAt: "",
  yesRule: "",
  noRule: "",
  invalidRule: "",
};
export function DraftStudio({
  managed = false,
  client,
  configured,
  providers,
  defaultProvider,
  example,
  onNotice,
  onLaunched,
  view,
  onView,
}: {
  managed?: boolean;
  client: WildcatterClient;
  configured: boolean;
  providers: AIProviderInfo[];
  defaultProvider: AIProvider | null;
  example?: Market;
  onNotice: (text: string) => void;
  onLaunched: (market: Market) => void;
  view: "create" | "drafts";
  onView: (view: "create" | "drafts") => void;
}) {
  const [input, setInput] = useState<DraftInput>(blankDraft);
  const [closingLocal, setClosingLocal] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<Category>("World");
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [provider, setProvider] = useState<AIProvider>(
    defaultProvider ?? "groq",
  );
  useEffect(() => {
    void client
      .drafts()
      .then((data) => setDrafts(data.items))
      .catch((error) => setError(errorMessage(error)));
  }, []);

  function fillExample() {
    if (!example) return;
    const closing = new Date(example.closesAt);
    setClosingLocal(
      new Date(closing.getTime() - closing.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
    setInput({
      question: example.title,
      sourceName: example.sourceName,
      sourceUrl: example.sourceUrl,
      closesAt: example.closesAt,
      yesRule: example.yesRule,
      noRule: example.noRule,
      invalidRule: example.invalidRule,
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { ...input, closesAt: new Date(closingLocal).toISOString() };
      const saved =
        mode === "manual"
          ? await client.saveDraft(body)
          : await client.generateDraft(body, accessToken, provider);
      setDrafts((previous) => [saved, ...previous]);
      onNotice(
        mode === "manual"
          ? "Manual draft saved privately. No market was published."
          : "AI-assisted draft saved. Review the rules before any publication.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function launch(id: string) {
    setError("");
    setBusy(true);
    try {
      onLaunched(await client.launchDraft(id, category));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await client.deleteDraft(id);
      setDrafts((previous) => previous.filter((draft) => draft.id !== id));
      onNotice("Draft deleted.");
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  const fields: {
    key: keyof DraftInput;
    label: string;
    placeholder: string;
  }[] = [
    {
      key: "yesRule",
      label: "Resolves YES when",
      placeholder:
        "Name the exact measurement, threshold, period and qualifying record.",
    },
    {
      key: "noRule",
      label: "Resolves NO when",
      placeholder:
        "Define the alternative and how the absence of a qualifying event is established.",
    },
    {
      key: "invalidRule",
      label: "If evidence is missing or ambiguous",
      placeholder: "Define review, invalidation and refund conditions.",
    },
  ];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>{view === "drafts" ? "Saved drafts" : "Draft studio"}</h1>
          <p>
            {view === "drafts"
              ? "Your private forecasting questions."
              : "Start with a clear, measurable question."}
          </p>
        </div>
        <span className={`system-pill ${configured ? "enabled" : ""}`}>
          <Sparkles size={14} />
          {configured
            ? `${providers.filter((item) => item.configured).length} AI providers`
            : "AI not connected"}
        </span>
      </div>
      <nav className="view-tabs" aria-label="Studio views">
        <button
          aria-current={view === "create" ? "page" : undefined}
          onClick={() => onView("create")}
        >
          {view === "create" && (
            <motion.span className="tab-selection" layoutId="studio-view" />
          )}
          New draft
        </button>
        <button
          aria-current={view === "drafts" ? "page" : undefined}
          onClick={() => onView("drafts")}
        >
          {view === "drafts" && (
            <motion.span className="tab-selection" layoutId="studio-view" />
          )}
          Saved drafts <span className="count-pill">{drafts.length}</span>
        </button>
      </nav>
      <div className="studio-layout">
        {view === "create" && (
          <section className="draft-form-panel">
            <div className="panel-heading">
              <h2>Create a private draft</h2>
              <button className="text-button" onClick={fillExample}>
                Use an example
              </button>
            </div>
            <p className="studio-explainer">
              Drafts stay private. Review your source before saving.
            </p>
            <form onSubmit={(event) => void save(event)}>
              {configured && (
                <div className="draft-ai-controls">
                  <div className="form-two-columns">
                    <div>
                      <label className="form-label" htmlFor="draft-mode">
                        Drafting mode
                      </label>
                      <Select
                        id="draft-mode"
                        label="Drafting mode"
                        value={mode}
                        disabled={busy}
                        onChange={(value) => setMode(value as "manual" | "ai")}
                        options={[
                          { value: "manual", label: "Write my own rules" },
                          { value: "ai", label: "Refine with AI" },
                        ]}
                      />
                    </div>
                    {mode === "ai" && (
                      <div>
                        <label className="form-label" htmlFor="ai-provider">
                          AI provider
                        </label>
                        <Select
                          id="ai-provider"
                          label="AI provider"
                          value={provider}
                          disabled={busy}
                          onChange={(value) => {
                            setProvider(value as AIProvider);
                            setError("");
                          }}
                          options={providers.map((item) => ({
                            value: item.id,
                            label:
                              item.label +
                              (item.configured ? "" : " — not configured"),
                            disabled: !item.configured,
                          }))}
                        />
                      </div>
                    )}
                  </div>
                  {mode === "ai" && (
                    <>
                      {!managed && (
                        <>
                          <label className="form-label" htmlFor="ai-token">
                            AI access token
                          </label>
                          <input
                            className="text-input"
                            id="ai-token"
                            disabled={busy}
                            type="password"
                            minLength={16}
                            maxLength={256}
                            autoComplete="off"
                            required
                            value={accessToken}
                            onChange={(event) =>
                              setAccessToken(event.target.value)
                            }
                          />
                        </>
                      )}
                      <p className="fine-print">
                        Use your workspace access token, not a provider API key.
                        Only the selected provider receives this draft; usage
                        may incur charges.
                      </p>
                    </>
                  )}
                </div>
              )}
              <label className="form-label" htmlFor="draft-question">
                The question
              </label>
              <input
                className="text-input"
                id="draft-question"
                placeholder="Will a measurable event happen by a specific date?"
                value={input.question}
                minLength={12}
                maxLength={240}
                required
                onChange={(event) =>
                  setInput({ ...input, question: event.target.value })
                }
              />
              <div className="form-two-columns">
                <div>
                  <label className="form-label" htmlFor="source-name">
                    Primary source
                  </label>
                  <input
                    className="text-input"
                    id="source-name"
                    placeholder="Official publishing organization"
                    value={input.sourceName}
                    minLength={2}
                    maxLength={120}
                    required
                    onChange={(event) =>
                      setInput({ ...input, sourceName: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="close-date">
                    Closes at (your timezone)
                  </label>
                  <input
                    className="text-input"
                    id="close-date"
                    type="datetime-local"
                    value={closingLocal}
                    required
                    onChange={(event) => setClosingLocal(event.target.value)}
                  />
                </div>
              </div>
              <label className="form-label" htmlFor="source-url">
                Source URL
              </label>
              <input
                className="text-input"
                id="source-url"
                type="url"
                pattern="https://.*"
                placeholder="https://official-source.example/data"
                value={input.sourceUrl}
                required
                maxLength={1000}
                onChange={(event) =>
                  setInput({ ...input, sourceUrl: event.target.value })
                }
              />
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="form-label" htmlFor={field.key}>
                    {field.label}
                  </label>
                  <textarea
                    id={field.key}
                    rows={3}
                    minLength={15}
                    maxLength={2000}
                    required
                    placeholder={field.placeholder}
                    value={input[field.key]}
                    onChange={(event) =>
                      setInput({ ...input, [field.key]: event.target.value })
                    }
                  />
                </div>
              ))}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button
                className="primary-button liquid-material"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? mode === "ai"
                    ? `Refining with ${providers.find((item) => item.id === provider)?.label ?? "AI"}…`
                    : "Saving draft…"
                  : mode === "manual"
                    ? "Save private draft"
                    : "Refine and save with AI"}
                <ArrowRight size={16} />
              </button>
            </form>
          </section>
        )}
        {view === "drafts" && (
          <aside className="studio-sidebar">
            <div className="saved-drafts">
              <h2>
                Your saved drafts{" "}
                <span className="count-pill">{drafts.length}</span>
              </h2>
              {drafts.length ? (
                drafts.map((draft) => (
                  <details key={draft.id}>
                    <summary>
                      <span>{draft.question}</span>
                      <ChevronDown size={16} />
                    </summary>
                    <span className="small-pill">
                      {draft.mode === "manual"
                        ? "Manual draft"
                        : `${providers.find((item) => item.id === draft.mode)?.label ?? "AI-assisted"} draft`}
                    </span>
                    <p>
                      <strong>Primary source:</strong> {draft.sourceName}
                    </p>
                    <p className="draft-source-url">{draft.sourceUrl}</p>
                    <p>
                      <strong>Closes (your timezone):</strong>{" "}
                      {new Date(draft.closesAt).toLocaleString()}
                    </p>
                    <p>
                      <strong>YES:</strong> {draft.yesRule}
                    </p>
                    <p>
                      <strong>NO:</strong> {draft.noRule}
                    </p>
                    <p>
                      <strong>Review:</strong> {draft.invalidRule}
                    </p>
                    {draft.reviewNotes.map((note) => (
                      <p key={note} className="fine-print">
                        {note}
                      </p>
                    ))}
                    <div className="draft-launch">
                      <Select
                        label="Market category"
                        value={category}
                        onChange={(value) => setCategory(value as Category)}
                        options={categories.map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void launch(draft.id)}
                      >
                        <Rocket size={15} /> Launch market
                      </button>
                    </div>
                    <p className="fine-print">
                      Launching stakes 500 demo credits as liquidity and opens
                      trading at 50%. You earn 1% of every trade.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => void remove(draft.id)}
                    >
                      <Trash2 size={14} /> Delete draft
                    </button>
                  </details>
                ))
              ) : (
                <p>Your drafts will appear here after you save one.</p>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
