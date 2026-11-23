import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Gavel } from "lucide-react";
import { Select } from "../Select.js";
import { WildcatterClient } from "../../shared/client.js";
import type { Market, ResolutionOutcome } from "../../shared/types.js";
import { errorMessage } from "../ui.js";
import { DetailPanel } from "./MarketExtras.js";

const outcomes = [
  { value: "YES", label: "YES" },
  { value: "NO", label: "NO" },
  { value: "INVALID", label: "Invalid (split payout)" },
];

export function ResolutionPanel({
  market,
  isCreator,
  client,
  onChange,
  onNotice,
  onRule,
}: {
  market: Market;
  isCreator: boolean;
  client: WildcatterClient;
  onChange: () => Promise<void>;
  onNotice: (text: string) => void;
  /** Private markets only: a workspace owner, admin or resolver rules here. */
  onRule?: (outcome: ResolutionOutcome) => Promise<Market>;
}) {
  const [outcome, setOutcome] = useState<ResolutionOutcome>("YES");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [operatorToken, setOperatorToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const { status, resolution } = market;
  const windowEnds = resolution ? Date.parse(resolution.challengeEndsAt) : 0;
  const windowOpen = now < windowEnds;

  // Re-render once when the challenge window closes so "Finalize" appears.
  useEffect(() => {
    if (status !== "proposed" || Date.now() >= windowEnds) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      windowEnds - Date.now() + 250,
    );
    return () => clearTimeout(timer);
  }, [status, windowEnds]);

  async function run(work: () => Promise<Market>, notice: string) {
    setError("");
    setBusy(true);
    try {
      await work();
      await onChange();
      onNotice(notice);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // House markets have no creator, so only the operator can resolve them.
  // In a workspace, a resolver may also rule a closed market nobody proposed.
  const privateMarket = Boolean(market.workspaceId);
  const unproposedClosed =
    status === "closed" && (market.feeBps === 0 || privateMarket);
  if (!resolution && !isCreator && !unproposedClosed) return null;
  const memberForm = onRule && (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void run(
          () => onRule(outcome),
          "Ruling recorded. Payouts were credited.",
        );
      }}
    >
      <span className="form-label">Final outcome</span>
      <Select
        label="Final outcome"
        value={outcome}
        onChange={(value) => setOutcome(value as ResolutionOutcome)}
        options={outcomes}
      />
      <p className="panel-hint">
        You cannot rule a market you created, disputed or hold shares in.
      </p>
      <button className="primary-button" disabled={busy}>
        Issue final ruling
      </button>
    </form>
  );
  const operatorForm = (
    <details>
      <summary>Operator ruling</summary>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void run(
            () => client.ruleMarket(market.id, outcome, operatorToken),
            "Ruling recorded. Payouts were credited.",
          ).then(() => setOperatorToken(""));
        }}
      >
        <span className="form-label">Final outcome</span>
        <Select
          label="Final outcome"
          value={outcome}
          onChange={(value) => setOutcome(value as ResolutionOutcome)}
          options={outcomes}
        />
        <label className="form-label" htmlFor="operator-token">
          Operator token
        </label>
        {/* Held in memory only; never stored in the browser. */}
        <input
          className="text-input"
          id="operator-token"
          type="password"
          autoComplete="off"
          minLength={16}
          maxLength={256}
          required
          value={operatorToken}
          onChange={(event) => setOperatorToken(event.target.value)}
        />
        <button className="primary-button" disabled={busy}>
          Issue final ruling
        </button>
      </form>
    </details>
  );
  const rulingForm = privateMarket ? memberForm : operatorForm;
  return (
    <DetailPanel
      title="Resolution"
      label="Market resolution"
      icon={<Gavel size={17} />}
      summary={
        status === "proposed"
          ? "Proposed"
          : status === "disputed"
            ? "Disputed"
            : status === "resolved"
              ? "Final"
              : undefined
      }
    >
      {!resolution && !isCreator && (
        <>
          <p>
            {privateMarket
              ? "Trading has closed and the creator has not proposed an outcome. A workspace owner, admin or resolver can rule it."
              : "This house market has closed. An operator rules its outcome."}
          </p>
          {rulingForm}
        </>
      )}
      {!resolution && isCreator && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(
              () => client.proposeResolution(market.id, outcome, evidenceUrl),
              "Outcome proposed. Trading is halted during the challenge window.",
            );
          }}
        >
          <p className="panel-hint">
            You launched this market. Once the result is known, propose the
            outcome with a link to the evidence. Trading pauses while others can
            dispute it.
          </p>
          <span className="form-label">Proposed outcome</span>
          <Select
            label="Proposed outcome"
            value={outcome}
            onChange={(value) => setOutcome(value as ResolutionOutcome)}
            options={outcomes}
          />
          <label className="form-label" htmlFor="evidence-url">
            Evidence link
          </label>
          <input
            className="text-input"
            id="evidence-url"
            type="url"
            pattern="https://.*"
            placeholder="https://"
            minLength={10}
            maxLength={1000}
            required
            value={evidenceUrl}
            onChange={(event) => setEvidenceUrl(event.target.value)}
          />
          <button className="secondary-button" disabled={busy}>
            Propose outcome
          </button>
        </form>
      )}
      {resolution && (
        <>
          <p>
            <strong>
              {status === "resolved" ? "Final outcome" : "Proposed outcome"}:{" "}
              {resolution.outcome}
            </strong>
            {resolution.evidenceUrl && (
              <>
                {" · "}
                <a
                  href={resolution.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Evidence <ExternalLink size={12} />
                </a>
              </>
            )}
          </p>
          {status === "proposed" && (
            <p>
              {windowOpen
                ? `Challenge window closes ${new Date(windowEnds).toLocaleTimeString()}.`
                : "Challenge window closed with no dispute."}
            </p>
          )}
          {status === "proposed" && windowOpen && (
            <p className="panel-hint">
              The challenge window is a short pause before payout. Anyone except
              the creator can dispute the outcome; if nobody does, it becomes
              final.
            </p>
          )}
          {status === "proposed" && windowOpen && !isCreator && (
            <p className="panel-hint">
              Think it is wrong? Disputing holds a 100-credit bond. If{" "}
              {privateMarket ? "a workspace resolver" : "the operator"}{" "}
              overturns the outcome you get it back plus up to 100 credits; if
              not, it goes to the creator.
            </p>
          )}
          {status === "proposed" && windowOpen && !isCreator && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => client.disputeResolution(market.id),
                  "Dispute filed. Your 100-credit bond is held until the ruling.",
                )
              }
            >
              Dispute · 100-credit bond
            </button>
          )}
          {status === "proposed" && !windowOpen && (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => client.settleMarket(market.id),
                  "Market settled. Payouts were credited.",
                )
              }
            >
              Finalize and pay out
            </button>
          )}
          {status === "disputed" && (
            <>
              <p>
                Disputed. Payouts wait for{" "}
                {privateMarket
                  ? "a ruling by a workspace owner, admin or resolver"
                  : "an operator ruling"}
                .
              </p>
              {rulingForm}
            </>
          )}
          {status === "resolved" && (
            <p>
              {resolution.outcome === "INVALID"
                ? "Every share was paid 0.5 credit."
                : `${resolution.outcome} shares were paid 1 credit each.`}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </DetailPanel>
  );
}
