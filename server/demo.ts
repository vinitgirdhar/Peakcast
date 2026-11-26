import { completeOnboarding } from "./account.js";
import { rule } from "./resolution.js";
import type { Store } from "./database.js";
import type { Category, DraftInput } from "../shared/types.js";

/**
 * Sample community activity, so a new install has trades, price moves,
 * creator markets and settled forecasts to look at instead of empty boards.
 * Every record goes through the real Store, AMM and resolution code; only the
 * timestamps are spread over the past fortnight afterwards. It runs once per
 * database (a marker in `app_meta`) and is labelled as sample players.
 */
const PLAYERS = [
  "Aarav S",
  "Maya Chen",
  "Diego R",
  "Priya N",
  "Lena K",
  "Omar F",
  "Sofia M",
  "Kenji T",
  "Ananya P",
  "Lucas B",
  "Zara H",
  "Ethan W",
];

interface SampleMarket {
  question: string;
  category: Category;
  sourceName: string;
  sourceUrl: string;
  yesRule: string;
  noRule: string;
  /** Final outcome once the sample traders are in, or open when absent. */
  outcome?: "YES" | "NO";
}

const SAMPLE_MARKETS: SampleMarket[] = [
  {
    question: "Will India's CPI inflation print below 4.0% for March 2027?",
    category: "Economy",
    sourceName: "Ministry of Statistics (MoSPI)",
    sourceUrl: "https://www.mospi.gov.in/",
    yesRule:
      "MoSPI's first published all-India CPI year-on-year figure for March 2027 is below 4.0%.",
    noRule:
      "MoSPI's first published all-India CPI year-on-year figure for March 2027 is 4.0% or higher.",
    outcome: "YES",
  },
  {
    question:
      "Will a new iPhone model ship with USB-C 3 speeds by October 2027?",
    category: "Technology",
    sourceName: "Apple Newsroom",
    sourceUrl: "https://www.apple.com/newsroom/",
    yesRule:
      "Apple Newsroom announces an iPhone with USB 3 transfer speeds that ships before 2027-10-31 23:59 UTC.",
    noRule:
      "No iPhone with USB 3 transfer speeds ships before 2027-10-31 23:59 UTC per Apple Newsroom.",
    outcome: "YES",
  },
  {
    question:
      "Will September 2027 Arctic sea ice extent fall below 3.57 million km²?",
    category: "Climate",
    sourceName: "NSIDC Sea Ice Index",
    sourceUrl: "https://nsidc.org/data/seaice_index",
    yesRule:
      "NSIDC publishes a September 2027 monthly average extent below 3.57 million square kilometres.",
    noRule:
      "NSIDC publishes a September 2027 monthly average extent of 3.57 million square kilometres or more.",
    outcome: "NO",
  },
  {
    question: "Will Ethereum trade above $6,000 on 2027-06-30?",
    category: "Crypto",
    sourceName: "CoinGecko ETH/USD",
    sourceUrl: "https://www.coingecko.com/en/coins/ethereum",
    yesRule:
      "CoinGecko's ETH/USD daily close for 2027-06-30 (UTC) is above 6,000 US dollars.",
    noRule:
      "CoinGecko's ETH/USD daily close for 2027-06-30 (UTC) is 6,000 US dollars or lower.",
    outcome: "NO",
  },
  {
    question:
      "Will a reusable rocket booster fly its 40th mission before 2028?",
    category: "Science",
    sourceName: "SpaceX launch updates",
    sourceUrl: "https://www.spacex.com/launches/",
    yesRule:
      "SpaceX's launch page records a single booster's 40th flight before 2028-01-01 00:00 UTC.",
    noRule:
      "No single booster's 40th flight is recorded on SpaceX's launch page before 2028-01-01 00:00 UTC.",
  },
];

/** Small deterministic generator, so every install starts with the same story. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDemoActivity(store: Store, now = Date.now()) {
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  if (store.db.prepare("SELECT 1 FROM app_meta WHERE key='demo_seeded'").get())
    return;
  const next = random(20271);
  const pick = <T>(items: T[]) => items[Math.floor(next() * items.length)];

  const players = PLAYERS.map((name) => {
    const { token } = store.createSession();
    const id = store.account(token).id;
    completeOnboarding(store, id, {
      displayName: name,
      acceptTerms: true,
      confirmAdult: true,
    });
    return id;
  });

  let key = 0;
  const trade = (
    accountId: string,
    marketId: string,
    outcome: "YES" | "NO",
    shares: number,
  ) => {
    const input = { marketId, outcome, action: "buy" as const, shares };
    try {
      const quote = store.quote(input);
      store.trade(
        accountId,
        { ...input, limitMicros: quote.amountMicros },
        `sample-${++key}`,
      );
    } catch {
      // Out of credits or a closed market: a real player would skip it too.
    }
  };

  // House markets: each player places a few trades with a mild bias.
  const house = store.markets().filter((market) => market.status === "open");
  for (const player of players)
    for (let i = 0; i < 3 + Math.floor(next() * 3); i++) {
      const market = pick(house);
      const leanYes = next() < market.probability + 0.1;
      trade(
        player,
        market.id,
        leanYes ? "YES" : "NO",
        10 + Math.floor(next() * 90),
      );
    }

  // Player-created markets: launched, traded, and most of them resolved, so
  // the creator and accuracy boards have entries.
  const closesAt = new Date(now + 400 * 86_400_000).toISOString();
  SAMPLE_MARKETS.forEach((sample, index) => {
    const creator = players[index * 2];
    const draft: DraftInput = {
      question: sample.question,
      sourceName: sample.sourceName,
      sourceUrl: sample.sourceUrl,
      closesAt,
      yesRule: sample.yesRule,
      noRule: sample.noRule,
      invalidRule:
        "If the source does not publish the figure within 7 days of the deadline, resolves INVALID.",
    };
    let marketId: string;
    try {
      const saved = store.saveDraft(creator, draft, "manual", []);
      marketId = store.launchDraft(creator, saved.id, sample.category).id;
    } catch {
      return;
    }
    for (const player of players) {
      if (player === creator || next() < 0.25) continue;
      const right = sample.outcome
        ? next() < 0.7
          ? sample.outcome
          : sample.outcome === "YES"
            ? "NO"
            : "YES"
        : next() < 0.5
          ? "YES"
          : "NO";
      trade(player, marketId, right, 20 + Math.floor(next() * 120));
    }
    if (sample.outcome) rule(store, marketId, sample.outcome);
  });

  // Spread the activity over the past two weeks, oldest first, so charts,
  // 24-hour moves and "recent trades" read like a living market.
  // Only the sample players' rows: a real player's own history is untouched.
  const span = 14 * 86_400_000;
  const mine = `account_id IN (${players.map(() => "?").join(",")})`;
  const stamp = (table: string, order: string) => {
    const rows = store.db
      .prepare(
        `SELECT rowid AS r FROM ${table} WHERE ${mine} ORDER BY ${order}`,
      )
      .all(...players) as { r: number }[];
    const update = store.db.prepare(
      `UPDATE ${table} SET created_at=? WHERE rowid=?`,
    );
    rows.forEach(({ r }, index) =>
      update.run(
        new Date(
          now - span + (span * (index + 1)) / (rows.length + 1),
        ).toISOString(),
        r,
      ),
    );
  };
  stamp("trades", "rowid");
  stamp("ledger", "id");
  store.db
    .prepare("INSERT INTO app_meta (key,value) VALUES ('demo_seeded',?)")
    .run(new Date(now).toISOString());
}
