// Google Play phone screenshots (1080×1920): real captures of the built app in
// its Android layout, each framed with a short headline in the app's own type
// and colours. Run after `npm run build:web`:
//   node scripts/make-store-screenshots.mjs
// Output: docs/brand/play-screenshots/01-markets.png … 06-portfolio.png
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "docs/brand/play-screenshots";
const PHONE = { width: 390, height: 844, scale: 3 };

const shots = [
  {
    file: "01-markets.png",
    title: "Forecast what<br><em>happens next.</em>",
    note: "Practice with demo credits. No sign-up, works offline.",
    path: "/markets",
  },
  {
    file: "02-market.png",
    title: "Back <em>YES</em> or <em>NO</em><br>in one tap.",
    note: "Live prices from an automated market maker.",
    path: "/markets/fed-rate",
  },
  {
    file: "03-rules.png",
    title: "Every question has<br><em>clear rules.</em>",
    note: "A named source, a deadline and what counts as YES.",
    path: "/markets/fed-rate/rules",
  },
  {
    file: "04-create.png",
    title: "Ask your<br><em>own questions.</em>",
    note: "A rule checker flags vague wording before you launch.",
    path: "/markets",
    create: true,
  },
  {
    file: "05-leaderboard.png",
    title: "See who reads<br><em>the future best.</em>",
    note: "Top traders, creators and most accurate forecasters.",
    path: "/leaderboard",
  },
  {
    file: "06-portfolio.png",
    title: "Your forecasts,<br><em>all in one place.</em>",
    note: "Positions, accuracy and history stay on your phone.",
    path: "/portfolio",
  },
];

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { stdio: "ignore" },
);
const browser = await chromium.launch();
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  const context = await browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height },
    deviceScaleFactor: PHONE.scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  // ?platform=android shows the Android app's layout (src/platform.ts).
  await page.goto(`${BASE}/terms?platform=android`);
  await page.waitForFunction(
    () => document.getElementById("root")?.childElementCount,
  );
  await page.evaluate(async () => {
    const call = async (path, init = {}) =>
      (
        await fetch("/api/v1" + path, {
          ...init,
          headers: { "Content-Type": "application/json", ...init.headers },
        })
      ).json();
    const { token } = await call("/sessions", { method: "POST" });
    const auth = { Authorization: `Bearer ${token}` };
    await call("/account", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        displayName: "Vinit",
        acceptTerms: true,
        confirmAdult: true,
      }),
    });
    const buy = async (marketId, outcome, shares) => {
      const order = { marketId, outcome, action: "buy", shares };
      const quote = await call("/quotes", {
        method: "POST",
        body: JSON.stringify(order),
      });
      await call("/trades", {
        method: "POST",
        headers: { ...auth, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ ...order, limitMicros: quote.amountMicros }),
      });
    };
    await buy("fed-rate", "YES", 60);
    await buy("bitcoin-150k", "NO", 40).catch(() => undefined);
    const markets = (await call("/markets")).items.filter(
      (m) => m.status === "open",
    );
    await buy(markets[3].id, "YES", 35);
    await call("/bonus/claim", { method: "POST", headers: auth });
    localStorage.setItem("peakcast.token.v1", token);
    localStorage.setItem("peakcast.theme", "light");
  });

  const captures = [];
  for (const shot of shots) {
    await page.goto(BASE + shot.path);
    await page.waitForSelector(".mobile-dock");
    await page.waitForTimeout(900);
    if (shot.create) {
      await page.getByRole("button", { name: "Create" }).last().click();
      await page.waitForTimeout(700);
    }
    captures.push(await page.screenshot({ type: "png" }));
  }

  const inter = readFileSync(
    "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  ).toString("base64");
  const frame = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
  });
  mkdirSync(OUT, { recursive: true });
  for (const [index, shot] of shots.entries()) {
    await frame.setContent(`<style>
      @font-face{font-family:Inter;src:url(data:font/woff2;base64,${inter}) format("woff2");font-weight:100 900}
      html,body{margin:0}
      .canvas{width:1080px;height:1920px;position:relative;overflow:hidden;font-family:Inter,sans-serif;
        background:radial-gradient(900px 620px at 50% -8%,rgba(106,141,255,.28),transparent 70%),
          radial-gradient(700px 520px at 110% 92%,rgba(75,75,232,.14),transparent 70%),#F7F8FA}
      .head{position:absolute;top:112px;left:0;right:0;text-align:center;padding:0 80px}
      h1{margin:0;font-size:84px;line-height:1.04;font-weight:780;letter-spacing:-3.2px;color:#16171A}
      h1 em{font-style:normal;background:linear-gradient(120deg,#5E7BFF,#3B2BD1);-webkit-background-clip:text;color:transparent}
      p{margin:26px auto 0;max-width:940px;font-size:33px;line-height:1.35;font-weight:500;color:#5F636B;letter-spacing:-.3px}
      .phone{position:absolute;left:50%;top:470px;width:640px;height:1385px;transform:translateX(-50%);
        border-radius:92px;padding:16px;background:#0E0F12;box-sizing:border-box;
        box-shadow:0 2px 0 1px #2a2b30 inset,0 60px 120px -30px rgba(22,12,107,.35),0 30px 60px -20px rgba(0,0,0,.25)}
      .screen{width:100%;height:100%;border-radius:78px;overflow:hidden;background:#F7F8FA}
      .screen img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
      .island{position:absolute;top:34px;left:50%;width:150px;height:42px;transform:translateX(-50%);border-radius:24px;background:#0E0F12}
    </style><div class="canvas"><div class="head"><h1>${shot.title}</h1><p>${shot.note}</p></div>
      <div class="phone"><div class="screen"><img src="data:image/png;base64,${captures[index].toString("base64")}"></div></div></div>`);
    await frame.evaluate(() => document.fonts.ready);
    writeFileSync(
      `${OUT}/${shot.file}`,
      await frame.screenshot({ type: "png" }),
    );
  }
  console.log(`Wrote ${shots.length} screenshots to ${OUT}`);
} finally {
  await browser.close();
  server.kill();
}
