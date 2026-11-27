import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SHARES,
  MICRO,
  SIZER_MESSAGES,
  edgeAt,
  isSizablePrice,
  kellyFraction,
  parseCredits,
  parsePercent,
  parseSizerPrefs,
  sizeBet,
  type Multiplier,
  type SizerInput,
  type Sizing,
} from "../shared/micro/sizer.js";

const credits = (value: number) => value * MICRO;
const input = (
  belief: number,
  price: number,
  feeBps: number,
  bankroll: number,
  multiplier: Multiplier,
): SizerInput => ({
  belief,
  price,
  feeBps,
  bankrollMicros: credits(bankroll),
  multiplier,
});

function sized(value: SizerInput): Sizing {
  const result = sizeBet(value);
  assert.ok(result.ok, JSON.stringify(result));
  return result.sizing;
}

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );

test("1: full Kelly on YES at an even price", () => {
  const sizing = sized(input(0.6, 0.5, 0, 5000, 1));
  assert.equal(sizing.side, "YES");
  near(sizing.kellyFraction, 0.2);
  assert.equal(sizing.stakeMicros, 1_000_000_000);
  assert.equal(sizing.shares, 2000);
  assert.equal(sizing.expectedProfitMicros, 200_000_000);
  near(sizing.expectedGrowth, 0.0201355);
  near(sizing.edge, 0.1);
  assert.equal(sizing.feeKillsEdge, false);
});

test("2: quarter Kelly is full Kelly on a blended belief", () => {
  const sizing = sized(input(0.6, 0.5, 0, 5000, 0.25));
  assert.equal(sizing.stakeMicros, 250_000_000);
  assert.equal(sizing.shares, 500);
  assert.equal(sizing.expectedProfitMicros, 50_000_000);
  near(sizing.blendedBelief, 0.525);
  near(sizing.appliedFraction, 0.05);
  // Full Kelly at the blended belief stakes the same fraction.
  near(kellyFraction(sizing.blendedBelief, 0.5), sizing.appliedFraction);
});

test("3: a low belief picks NO", () => {
  const sizing = sized(input(0.3, 0.5, 0, 1000, 1));
  assert.equal(sizing.side, "NO");
  near(sizing.beliefSide, 0.7);
  near(sizing.kellyFraction, 0.4);
  assert.equal(sizing.stakeMicros, 400_000_000);
});

test("4: a 1% fee raises the all-in price", () => {
  const sizing = sized(input(0.6, 0.5, 100, 5000, 1));
  near(sizing.effectivePrice, 0.505, 1e-12);
  near(sizing.kellyFraction, 0.191919);
  assert.equal(sizing.stakeMicros, 959_595_959);
});

test("5: a fee can remove a thin edge", () => {
  const sizing = sized(input(0.503, 0.5, 100, 5000, 1));
  assert.equal(sizing.side, null);
  assert.equal(sizing.stakeMicros, 0);
  assert.equal(sizing.shares, 0);
  assert.equal(sizing.feeKillsEdge, true);
  assert.ok(sizing.edge <= 0);
  assert.equal(sizing.beliefSide, 0);
  assert.equal(sizing.expectedGrowth, 0);
});

test("6: agreeing with the market is no edge, and not the fee's doing", () => {
  const sizing = sized(input(0.5, 0.5, 0, 5000, 1));
  assert.equal(sizing.side, null);
  assert.equal(sizing.feeKillsEdge, false);
  assert.equal(sizing.edge, 0);
});

test("7: shares are capped at the trade maximum and the stake at the bankroll", () => {
  const sizing = sized(input(0.99, 0.01, 0, 5000, 1));
  assert.equal(sizing.shares, MAX_SHARES);
  assert.ok(sizing.stakeMicros <= credits(5000));
  // One trade of 10,000 shares at 1¢ costs 100 credits and expects 9,900 back.
  assert.deepEqual(sizing.cap, {
    costMicros: credits(100),
    expectedProfitMicros: credits(9800),
  });
  assert.equal(sized(input(0.01, 0.99, 0, 5000, 1)).shares, MAX_SHARES);
  assert.equal(sized(input(0.6, 0.5, 0, 5000, 1)).cap, null);
  // Exactly 10,000 affordable shares is not a cap.
  assert.equal(sized(input(0.6, 0.5, 0, 25_000, 1)).cap, null);
});

test("isSizablePrice rejects LMSR prices outside 1–99¢", () => {
  for (const price of [0.01, 0.5, 0.99, 0.0100000001])
    assert.equal(isSizablePrice(price), true, String(price));
  for (const price of [0.004, 0.995, 0, 1, Number.NaN])
    assert.equal(isSizablePrice(price), false, String(price));
});

test("8: a bankroll of 0 is valid and stakes nothing", () => {
  const sizing = sized(input(0.6, 0.5, 0, 0, 0.5));
  assert.equal(sizing.side, "YES");
  assert.equal(sizing.stakeMicros, 0);
  assert.equal(sizing.shares, 0);
  assert.equal(sizing.expectedProfitMicros, 0);
});

test("9: every invalid field gets its exact message", () => {
  const valid = input(0.6, 0.5, 0, 100, 0.25);
  const cases: [
    Partial<Record<keyof SizerInput, unknown>>,
    keyof SizerInput,
  ][] = [
    [{ belief: 0 }, "belief"],
    [{ belief: 1 }, "belief"],
    [{ belief: Number.NaN }, "belief"],
    [{ belief: "0.5" }, "belief"],
    [{ price: 0.001 }, "price"],
    [{ price: 0.995 }, "price"],
    [{ price: Infinity }, "price"],
    [{ feeBps: -1 }, "feeBps"],
    [{ feeBps: 1001 }, "feeBps"],
    [{ feeBps: 1.5 }, "feeBps"],
    [{ bankrollMicros: -1 }, "bankrollMicros"],
    [{ bankrollMicros: 1.5 }, "bankrollMicros"],
    [{ bankrollMicros: 2 ** 60 }, "bankrollMicros"],
    [{ multiplier: 0.3 }, "multiplier"],
    [{ multiplier: "1" }, "multiplier"],
  ];
  for (const [change, field] of cases) {
    const result = sizeBet({ ...valid, ...change } as SizerInput);
    assert.equal(result.ok, false, JSON.stringify(change));
    if (!result.ok)
      assert.deepEqual(result.errors, { [field]: SIZER_MESSAGES[field] });
  }
  assert.equal(
    SIZER_MESSAGES.belief,
    "Give your probability as a whole percent from 1 to 99.",
  );
  assert.equal(
    SIZER_MESSAGES.price,
    "Give the YES price in whole cents from 1 to 99.",
  );
  assert.equal(SIZER_MESSAGES.feeBps, "Fee must be 0% to 10%.");
  assert.equal(
    SIZER_MESSAGES.bankrollMicros,
    "Enter practice credits of 0 or more.",
  );
  assert.equal(SIZER_MESSAGES.multiplier, "Pick ¼, ½ or full Kelly.");
});

test("garbage input reports every field instead of throwing", () => {
  for (const value of [null, undefined, {}, 42, "x"]) {
    const result = sizeBet(value as unknown as SizerInput);
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.deepEqual(Object.keys(result.errors).sort(), [
        "bankrollMicros",
        "belief",
        "feeBps",
        "multiplier",
        "price",
      ]);
  }
});

test("prices one hair outside 1¢–99¢ from float noise still size", () => {
  assert.ok(sizeBet(input(0.6, 0.0100000001, 0, 10, 1)).ok);
  assert.ok(sizeBet(input(0.6, 0.9899999999, 0, 10, 1)).ok);
});

test("a 10% fee caps the all-in price below 1", () => {
  const sizing = sized(input(0.99, 0.99, 1000, 100, 1));
  assert.ok(sizing.effectivePrice <= 0.9999);
  assert.equal(sizing.side, null);
  assert.equal(sizing.feeKillsEdge, false);
});

// mulberry32: a tiny seeded generator, so the property run is reproducible.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("10: 1,000 seeded random inputs keep every invariant", () => {
  const random = seeded(20261127);
  const multipliers: Multiplier[] = [0.25, 0.5, 1];
  for (let index = 0; index < 1000; index += 1) {
    const value: SizerInput = {
      belief: 0.01 + random() * 0.98,
      price: (1 + Math.floor(random() * 99)) / 100,
      feeBps: random() < 0.5 ? 0 : Math.floor(random() * 1001),
      bankrollMicros: Math.floor(random() * 1e9) * (random() < 0.5 ? 1 : MICRO),
      multiplier: multipliers[Math.floor(random() * 3)],
    };
    const sizing = sized(value);
    assert.deepEqual(sizeBet(value), { ok: true, sizing });
    assert.ok(sizing.stakeMicros >= 0);
    assert.ok(sizing.stakeMicros <= value.bankrollMicros);
    assert.ok(Number.isSafeInteger(sizing.stakeMicros));
    assert.ok(Number.isSafeInteger(sizing.shares));
    // Up to ~98× a huge stake can pass 2^53; it is still a whole number.
    assert.ok(Number.isInteger(sizing.expectedProfitMicros));
    assert.ok(sizing.appliedFraction <= sizing.kellyFraction);
    assert.ok(sizing.kellyFraction <= 1);
    assert.ok(sizing.shares <= MAX_SHARES);
    if (sizing.cap) {
      assert.equal(sizing.shares, MAX_SHARES);
      assert.ok(sizing.cap.costMicros <= sizing.stakeMicros);
    }
    if (sizing.side) {
      assert.ok(sizing.edge > 0);
      assert.ok(sizing.expectedGrowth >= 0, JSON.stringify(value));
    } else assert.equal(sizing.stakeMicros, 0);
  }
});

test("kellyFraction and edgeAt", () => {
  near(kellyFraction(0.6, 0.5), 0.2);
  assert.equal(kellyFraction(0.4, 0.5), 0);
  assert.equal(kellyFraction(0.6, 1), 0);
  assert.equal(kellyFraction(Number.NaN, 0.5), 0);
  near(edgeAt(0.6, 0.53), 0.07);
  assert.ok(edgeAt(0.5, 0.52) < 0);
});

test("parseCredits accepts up to 2 decimals and rejects the rest", () => {
  assert.deepEqual(parseCredits("12.5"), { ok: true, micros: 12_500_000 });
  assert.deepEqual(parseCredits(" 12.50 "), { ok: true, micros: 12_500_000 });
  assert.deepEqual(parseCredits("0"), { ok: true, micros: 0 });
  assert.deepEqual(parseCredits("7."), { ok: true, micros: 7_000_000 });
  assert.deepEqual(parseCredits("0.01"), { ok: true, micros: 10_000 });
  assert.deepEqual(parseCredits("1000000000"), {
    ok: true,
    micros: 1e15,
  });
  const error = (text: string) => {
    const result = parseCredits(text);
    assert.equal(result.ok, false, text);
    return result.ok ? "" : result.error;
  };
  assert.equal(error("1.234"), "Use at most 2 decimal places.");
  assert.equal(error("-1"), SIZER_MESSAGES.bankrollMicros);
  assert.match(error("abc"), /like 250 or 12\.50/);
  assert.match(error("1,000"), /like 250/);
  assert.match(error(""), /Enter a bankroll/);
  assert.match(error("   "), /Enter a bankroll/);
  assert.match(error("1000000000.01"), /at most 1,000,000,000/);
  assert.match(error("5000000000"), /at most/);
  assert.match(error(undefined as unknown as string), /Enter a bankroll/);
});

test("parsePercent takes whole percents from 1 to 99", () => {
  assert.deepEqual(parsePercent("35"), { ok: true, value: 0.35 });
  assert.deepEqual(parsePercent(" 7% "), { ok: true, value: 0.07 });
  assert.deepEqual(parsePercent("99"), { ok: true, value: 0.99 });
  for (const text of ["0", "100", "35.5", "-5", "", "abc", "1e1"])
    assert.deepEqual(parsePercent(text), {
      ok: false,
      error: SIZER_MESSAGES.belief,
    });
  assert.equal(parsePercent(null as unknown as string).ok, false);
});

test("parseSizerPrefs falls back to quarter Kelly on anything odd", () => {
  const fallback = { version: 1, multiplier: 0.25 };
  for (const raw of [
    undefined,
    null,
    "x",
    [],
    42,
    {},
    { version: 2, multiplier: 1 },
    { version: 1, multiplier: 2 },
  ])
    assert.deepEqual(parseSizerPrefs(raw), fallback);
  assert.deepEqual(parseSizerPrefs({ version: 1, multiplier: 0.5 }), {
    version: 1,
    multiplier: 0.5,
  });
  assert.deepEqual(
    parseSizerPrefs({ version: 1, multiplier: 1, lastMarketId: "fed-rate" }),
    { version: 1, multiplier: 1, lastMarketId: "fed-rate" },
  );
  for (const lastMarketId of ["", "a b", 7, "x".repeat(121), "<script>"])
    assert.deepEqual(
      parseSizerPrefs({ version: 1, multiplier: 0.5, lastMarketId }),
      { version: 1, multiplier: 0.5 },
    );
});
