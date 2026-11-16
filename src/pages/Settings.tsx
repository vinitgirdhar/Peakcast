import { useState } from "react";
import { Moon, Sun, Monitor, Plus, Trash2, ArrowLeft } from "lucide-react";
import { Select } from "../Select.js";
import { useTheme } from "../theme.js";
import type { AIProvider, AIProviderInfo } from "../../shared/types.js";
import { errorMessage } from "../ui.js";
export function Settings({
  managed = false,
  token,
  providers,
  onRefresh,
}: {
  managed?: boolean;
  token: string;
  providers: AIProviderInfo[];
  onRefresh: () => Promise<void>;
}) {
  const { theme, setTheme } = useTheme();
  const [access, setAccess] = useState("");
  const [editing, setEditing] = useState<AIProvider | null>(null);
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<AIProvider | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ollama, setOllama] = useState<string[] | null>(null);
  function edit(id: AIProvider) {
    setProvider(id);
    setModel(
      providers.find((item) => item.id === id)?.model ||
        {
          gemini: "gemini-3.5-flash-lite",
          groq: "openai/gpt-oss-20b",
          openai: "gpt-4.1-mini",
          ollama: "llama3.2",
        }[id],
    );
    setKey("");
    setEditing(id);
    setError("");
    setNotice("");
  }
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`/api/v1/settings/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-AI-Access-Token": access,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Settings could not be saved.");
    return result;
  }
  async function save(remove = false, id = provider) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `providers/${id}`,
        remove ? "DELETE" : "PUT",
        remove ? undefined : { model, ...(key ? { apiKey: key } : {}) },
      );
      setKey("");
      setEditing(null);
      await onRefresh();
      setNotice(remove ? "Provider removed." : "Provider saved.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make Wildcatter your own.</p>
        </div>
      </div>
      <section className="settings-panel">
        <h2>Appearance</h2>
        <p>Choose a look for the app and website.</p>
        <div
          className="appearance-options"
          role="group"
          aria-label="Appearance"
        >
          {(
            [
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-pressed={theme === item.id}
              onClick={() => setTheme(item.id)}
            >
              <item.icon size={22} />
              {item.label}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-panel">
        <div className="panel-heading">
          <h2>AI providers</h2>
          <button className="secondary-button" onClick={() => edit("gemini")}>
            <Plus size={16} />
            Add provider
          </button>
        </div>
        <p>Choose your cloud provider or run a local model with Ollama.</p>
        {!managed && (
          <>
            <label className="form-label" htmlFor="settings-access">
              Workspace access token
            </label>
            <input
              id="settings-access"
              className="text-input"
              type="password"
              autoComplete="off"
              value={access}
              onChange={(event) => setAccess(event.target.value)}
              placeholder="Required to save or remove providers"
            />
          </>
        )}
        <p className="fine-print">
          Provider changes apply to this workspace. Existing API keys are never
          displayed.
        </p>
        <div className="provider-list">
          {providers.map((item) => (
            <div className="provider-row" key={item.id}>
              <div className={`provider-logo provider-${item.id}`}>
                <img src={"/providers/" + item.id + ".svg"} alt="" />
              </div>
              <div>
                <strong>{item.label}</strong>
                <small>{item.configured ? item.model : "Not configured"}</small>
              </div>
              <button className="text-button" onClick={() => edit(item.id)}>
                {item.configured ? "Edit" : "Add"}
              </button>
              {item.configured && (
                <button
                  className="icon-button"
                  aria-label={`Remove ${item.label}`}
                  disabled={busy}
                  onClick={() => setRemoving(item.id)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          ))}
        </div>
        {removing && (
          <div className="provider-editor" role="alert">
            <p>
              Remove {providers.find((item) => item.id === removing)?.label}{" "}
              from this workspace?
            </p>
            <button
              className="secondary-button"
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void save(true, removing).then(() => setRemoving(null))
              }
            >
              Remove provider
            </button>
          </div>
        )}
        {editing && (
          <form
            className="provider-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <button
              className="back-button"
              type="button"
              onClick={() => {
                setEditing(null);
                setKey("");
              }}
            >
              <ArrowLeft size={15} />
              Cancel
            </button>
            <Select
              label="Provider name"
              value={provider}
              options={providers.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              onChange={(value) => edit(value as AIProvider)}
            />
            <label className="form-label" htmlFor="provider-model">
              Model
            </label>
            <input
              id="provider-model"
              className="text-input"
              value={model}
              required
              maxLength={120}
              pattern="[a-zA-Z0-9_.:/-]+"
              onChange={(event) => setModel(event.target.value)}
            />
            {provider !== "ollama" ? (
              <>
                <label className="form-label" htmlFor="provider-key">
                  API key
                </label>
                <input
                  id="provider-key"
                  className="text-input"
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="Leave empty to keep the saved key"
                />
              </>
            ) : (
              <>
                <p className="fine-print">
                  Ollama must be running on the computer hosting the backend, at
                  localhost:11434. No API key is needed.
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void request("ollama")
                      .then((result) => {
                        setOllama(result.models);
                        setNotice(
                          result.available
                            ? "Ollama is running."
                            : "Ollama is not running on the backend computer.",
                        );
                      })
                      .catch((error) => setError(errorMessage(error)))
                  }
                >
                  Check local Ollama
                </button>
                {ollama && (
                  <p className="fine-print">
                    {ollama.length
                      ? `Installed models: ${ollama.join(", ")}`
                      : "No local models found. Install a model in Ollama first."}
                  </p>
                )}
              </>
            )}
            <button
              className="primary-button"
              disabled={busy || (!managed && access.length < 16)}
              type="submit"
            >
              {busy ? "Saving…" : "Save provider"}
            </button>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="settings-notice" role="status">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
