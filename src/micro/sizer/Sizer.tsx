import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowUpRight, Info } from "lucide-react";
import type { Market } from "../../../shared/types.js";
import {
  MULTIPLIERS,
  isSizablePrice,
  SIZER_MESSAGES,
  parseCredits,
  parsePercent,
  parseSizerPrefs,
  sizeBet,
  type Multiplier,
  type SizerErrors,
  type SizerPrefs,
} from "../../../shared/micro/sizer.js";
import { Select } from "../../Select.js";
import { Collapse } from "../../motion.js";
import { formatCredits } from "../../ui.js";
import { loadMicro, saveMicro } from "../storage.js";
import type { MicroAppProps } from "../types.js";
import { Segments } from "../Segments.js";
import {
  MULTIPLIER_LABELS,
  SizerResult,
  points,
  type QuoteTarget,
  type ResultView,
} from "./SizerResult.js";
import "./sizer.css";

const MANUAL = "manual";
const MARKET_PRICE_MESSAGE =
  "This market's price is outside 1–99¢; enter a price yourself.";
type Field = "belief" | "price" | "bankroll";
const FIELD_ERROR_KEY: Record<Field, keyof SizerErrors> = {
  belief: "belief",
  price: "price",
  bankroll: "bankrollMicros",
};
const FEE_OPTIONS = [
  { value: 0, label: "No fee" },
  { value: 100, label: "1% fee" },
] as const;
const MULTIPLIER_OPTIONS = MULTIPLIERS.map((value) => ({
  value,
  label: MULTIPLIER_LABELS[value],
}));

/** Whole hundredths below the balance, so the default never exceeds it. */
const balanceText = (micros: number): string =>
  (Math.floor(micros / 10_000) / 100).toFixed(2);

interface Inputs {
  market: Market | null;
  priceText: string;
  feeBps: number;
  beliefText: string;
  bankrollText: string;
  multiplier: Multiplier;
}

/** Parses the text fields, then sizes; errors are keyed by field. */
function evaluate(inputs: Inputs) {
  const belief = parsePercent(inputs.beliefText);
  const price = inputs.market
    ? marketPrice(inputs.market)
    : parsePercent(inputs.priceText);
  const bankroll = parseCredits(inputs.bankrollText);
  const priceError = inputs.market
    ? MARKET_PRICE_MESSAGE
    : SIZER_MESSAGES.price;
  const errors: Partial<Record<Field, string>> = {
    ...(belief.ok ? {} : { belief: SIZER_MESSAGES.belief }),
    ...(price.ok ? {} : { price: priceError }),
    ...(bankroll.ok ? {} : { bankroll: bankroll.error }),
  };
  if (!belief.ok || !price.ok || !bankroll.ok) return { errors, sizing: null };
  const result = sizeBet({
    belief: belief.value,
    price: price.value,
    feeBps: inputs.market ? inputs.market.feeBps : inputs.feeBps,
    bankrollMicros: bankroll.micros,
    multiplier: inputs.multiplier,
  });
  if (result.ok) return { errors, sizing: result.sizing };
  const fieldErrors = Object.fromEntries(
    (Object.keys(FIELD_ERROR_KEY) as Field[])
      .filter((field) => result.errors[FIELD_ERROR_KEY[field]])
      .map((field) => [field, result.errors[FIELD_ERROR_KEY[field]]]),
  );
  return { errors: fieldErrors, sizing: null };
}

/** LMSR prices are unbounded, so a market can sit outside the 1–99¢ the sizer accepts. */
const marketPrice = (market: Market) =>
  isSizablePrice(market.probability)
    ? { ok: true as const, value: market.probability }
    : { ok: false as const };

/** A sentence for the polite live region, announced once typing settles. */
function useAnnouncement(text: string): string {
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(text), 300);
    return () => clearTimeout(timer);
  }, [text]);
  return announced;
}

export default function Sizer({
  client,
  markets,
  portfolio,
  navigate,
}: MicroAppProps) {
  const [prefs, setPrefs] = useState<SizerPrefs>(() =>
    loadMicro("sizer", parseSizerPrefs),
  );
  const [marketId, setMarketId] = useState(prefs.lastMarketId ?? MANUAL);
  const [priceText, setPriceText] = useState("50");
  const [feeBps, setFeeBps] = useState(0);
  const [beliefText, setBeliefText] = useState("");
  // Null until edited: follows the available balance while it loads.
  const [bankrollEdit, setBankrollEdit] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const openMarkets = useMemo(
    () => markets.filter((item) => item.status === "open"),
    [markets],
  );
  const market = openMarkets.find((item) => item.id === marketId) ?? null;
  const fromBalance = bankrollEdit === null && portfolio !== null;
  const bankrollText =
    bankrollEdit ?? (portfolio ? balanceText(portfolio.balanceMicros) : "");
  const { errors, sizing } = evaluate({
    market,
    priceText,
    feeBps,
    beliefText,
    bankrollText,
    multiplier: prefs.multiplier,
  });
  // In market mode the price field is hidden; its error shows on the market instead.
  const marketError = market ? errors.price : undefined;
  const shown = (field: Field) =>
    submitted || touched.has(field) ? errors[field] : undefined;
  const anyShown = (Object.keys(errors) as Field[]).some(shown);
  const view: ResultView = sizing
    ? { kind: "sized", sizing, multiplier: prefs.multiplier }
    : marketError
      ? { kind: "invalid", message: marketError }
      : anyShown
        ? { kind: "invalid", message: "Fix the highlighted fields." }
        : { kind: "prompt" };
  const announced = useAnnouncement(headline(view));

  const savePrefs = (next: SizerPrefs) => {
    setPrefs(next);
    saveMicro("sizer", next);
  };
  const touch = (field: Field) =>
    setTouched((current) => new Set(current).add(field));
  const pickMarket = (id: string) => {
    setMarketId(id);
    savePrefs({
      version: 1,
      multiplier: prefs.multiplier,
      ...(id === MANUAL ? {} : { lastMarketId: id }),
    });
  };
  // Results update as you type; Enter in a field reveals and announces every error.
  const revealErrors = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement))
      return;
    event.preventDefault();
    setSubmitted(true);
    // Errors stay visible after the next edit, without being re-announced.
    setTouched(new Set<Field>(["price", "belief", "bankroll"]));
    const first = (["price", "belief", "bankroll"] as Field[]).find(
      (field) => errors[field],
    );
    if (first) document.getElementById(`sizer-${first}`)?.focus();
  };
  /** Any edit ends the "just submitted" moment, so later errors are not alerts. */
  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setSubmitted(false);
      set(value);
    };
  const fieldProps = (field: Field) => ({
    error: shown(field),
    alert: submitted,
    onBlur: () => touch(field),
  });
  const quoteTarget: QuoteTarget | null = market
    ? { client, marketId: market.id }
    : null;

  return (
    <div className="sizer">
      <p className="notice-info sizer-banner" role="note">
        <span>
          Educational tool for Peakcast practice credits. It shows a textbook
          formula, not a recommendation, and nothing here is financial advice.
        </span>
      </p>
      <div className="sizer-layout">
        <form
          className="sizer-card sizer-inputs"
          aria-labelledby="sizer-inputs-title"
          noValidate
          onSubmit={(event) => event.preventDefault()}
          onKeyDown={revealErrors}
        >
          <h2 id="sizer-inputs-title" className="sizer-card-title">
            Your bet
          </h2>
          <MarketField
            markets={openMarkets}
            market={market}
            priceError={marketError}
            onPick={pickMarket}
            onOpen={(id) => navigate(`/markets/${id}`)}
          />
          <Collapse open={!market}>
            <NumberField
              id="sizer-price"
              label="YES price"
              hint="1–99¢"
              suffix="¢"
              value={priceText}
              onChange={edited(setPriceText)}
              {...fieldProps("price")}
            />
            <SegmentField id="sizer-fee-label" label="Fee">
              <Segments
                labelledBy="sizer-fee-label"
                layoutId="sizer-fee"
                options={FEE_OPTIONS}
                value={feeBps}
                onChange={edited(setFeeBps)}
              />
            </SegmentField>
          </Collapse>
          <NumberField
            id="sizer-belief"
            label="Your probability of YES"
            hint="1–99%"
            suffix="%"
            placeholder="60"
            value={beliefText}
            onChange={edited(setBeliefText)}
            {...fieldProps("belief")}
          />
          <NumberField
            id="sizer-bankroll"
            label="Bankroll"
            hint={fromBalance ? "Your available practice credits" : undefined}
            suffix="credits"
            inputMode="decimal"
            value={bankrollText}
            onChange={edited(setBankrollEdit)}
            {...fieldProps("bankroll")}
          />
          <SegmentField id="sizer-multiplier-label" label="Kelly multiplier">
            <Segments
              labelledBy="sizer-multiplier-label"
              layoutId="sizer-multiplier"
              options={MULTIPLIER_OPTIONS}
              value={prefs.multiplier}
              onChange={(multiplier) => savePrefs({ ...prefs, multiplier })}
            />
          </SegmentField>
          <p className="sizer-hint">
            Quarter Kelly is the default: it gives up a little growth for much
            less risk if your probability is off.
          </p>
        </form>
        <SizerResult view={view} quoteTarget={quoteTarget} />
      </div>
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
    </div>
  );
}

function headline(view: ResultView): string {
  if (view.kind === "invalid") return view.message;
  if (view.kind === "prompt") return "";
  const { sizing } = view;
  if (!sizing.side) return "No edge at this price. Kelly stakes 0.";
  return `Buy ${sizing.side}: stake ${formatCredits(sizing.stakeMicros)} practice credits, edge ${points(sizing.edge)} points after fees.`;
}

function MarketField({
  markets,
  market,
  priceError,
  onPick,
  onOpen,
}: {
  markets: Market[];
  market: Market | null;
  priceError?: string;
  onPick: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const options = [
    { value: MANUAL, label: "Enter a price myself" },
    ...markets.map((item) => ({ value: item.id, label: item.title })),
  ];
  return (
    <div className="sizer-field">
      <label className="form-label" htmlFor="sizer-market">
        Market <span>Optional</span>
      </label>
      <Select
        id="sizer-market"
        label="Market"
        value={market?.id ?? MANUAL}
        options={options}
        onChange={onPick}
      />
      {markets.length === 0 && (
        <p className="sizer-hint">
          No open markets right now, so enter a price yourself.
        </p>
      )}
      <Collapse open={market !== null}>
        {market && (
          <div className="sizer-crowd">
            <p>
              <Info size={15} aria-hidden="true" />
              <span>
                Using the crowd price now: YES{" "}
                {(market.probability * 100).toFixed(1)}¢
                {market.feeBps > 0
                  ? `, ${market.feeBps / 100}% creator fee`
                  : ", no fee"}
                .
              </span>
            </p>
            <button
              type="button"
              className="text-button sizer-open"
              onClick={() => onOpen(market.id)}
            >
              Open market
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        {market && priceError && (
          <div className="form-error notice-warning sizer-market-error">
            <p>{priceError}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => onPick(MANUAL)}
            >
              Enter a price
            </button>
          </div>
        )}
      </Collapse>
    </div>
  );
}

function SegmentField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="sizer-field">
      <span className="form-label" id={id}>
        {label}
      </span>
      {children}
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  hint?: string;
  suffix: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  /** Announce the error: only after the form was submitted. */
  alert: boolean;
}

function NumberField({
  id,
  label,
  hint,
  suffix,
  placeholder,
  inputMode = "numeric",
  value,
  onChange,
  onBlur,
  error,
  alert,
}: NumberFieldProps) {
  const described = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="sizer-field">
      <label className="form-label" htmlFor={id}>
        {label}
        {hint && <span id={`${id}-hint`}>{hint}</span>}
      </label>
      <div className={`sizer-input ${error ? "invalid" : ""}`}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <span aria-hidden="true">{suffix}</span>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="sizer-field-error"
          role={alert ? "alert" : undefined}
        >
          {error}
        </p>
      )}
    </div>
  );
}
