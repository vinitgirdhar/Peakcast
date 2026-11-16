import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteTrade, probability, MICRO } from "../server/amm.js";

test("binary prices are bounded and complementary even for extreme inventory", () => {
  assert.equal(probability(0, 0, 1000), 0.5);
  for (const q of [-1e6, -1000, 0, 1000, 1e6]) {
    const p = probability(q, 0, 1000);
    assert.ok(p >= 0 && p <= 1);
    assert.ok(Math.abs(p + probability(0, q, 1000) - 1) < 1e-12);
  }
});

test("buying moves price toward the purchased outcome and charges within payout", () => {
  const quote = quoteTrade(
    { yes: 0, no: 0, liquidity: 1000 },
    "YES",
    "buy",
    100,
  );
  assert.ok(quote.amountMicros > 50 * MICRO);
  assert.ok(quote.amountMicros < 100 * MICRO);
  assert.ok(quote.priceAfter > 0.5);
});

test("round trip cannot manufacture credits from rounding", () => {
  for (const side of ["YES", "NO"] as const) {
    const buy = quoteTrade(
      { yes: 300, no: 0, liquidity: 1000 },
      side,
      "buy",
      91,
    );
    const sell = quoteTrade(
      {
        yes: side === "YES" ? 391 : 300,
        no: side === "NO" ? 91 : 0,
        liquidity: 1000,
      },
      side,
      "sell",
      91,
    );
    assert.ok(buy.amountMicros >= sell.amountMicros);
    assert.ok(buy.amountMicros - sell.amountMicros <= 2);
  }
});

test("quote rejects zero, fractional, nonfinite and excessive shares or invalid pool", () => {
  for (const shares of [0, -1, 1.5, NaN, Infinity, 10001]) {
    assert.throws(() =>
      quoteTrade({ yes: 0, no: 0, liquidity: 1000 }, "YES", "buy", shares),
    );
  }
  assert.throws(() =>
    quoteTrade({ yes: 0, no: 0, liquidity: 0 }, "YES", "buy", 1),
  );
});
