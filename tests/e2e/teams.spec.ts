import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
  onboard,
} from "./fixtures.js";
import { buildApp } from "../../server/app.js";
import { choose } from "./select.js";

// ponytail: Teams journeys get their own in-memory server, so workspaces,
// wallets and launches never touch the shared server other specs count on.
// This file runs its own server, so pages onboard against it rather than the shared one.
test.use({ onboarded: false });
test.beforeEach(async ({ page }) => {
  await onboard(page, origin);
});
let server: Awaited<ReturnType<typeof buildApp>>;
let origin = "";
test.beforeAll(async () => {
  for (const key of [
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "AI_ACCESS_TOKEN",
    "AI_DEFAULT_PROVIDER",
  ])
    delete process.env[key];
  process.env.AI_SETTINGS_DIR = mkdtempSync(join(tmpdir(), "wildcatter-e2e-"));
  server = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  origin = await server.listen({ host: "127.0.0.1", port: 0 });
});
test.afterAll(async () => {
  await server?.close();
});

const audit = async (page: Page, selector: string) =>
  expect(
    (
      await new AxeBuilder({ page })
        .include(selector)
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
/** No horizontal page scroll; on failure, names the elements that stick out. */
const fitsWidth = async (page: Page) =>
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
        ? []
        : [...document.querySelectorAll("body *")]
            .filter((node) => node.getBoundingClientRect().right > innerWidth)
            .map((node) => `${node.tagName}.${node.className}`),
    ),
  ).toEqual([]);
/** Another person on the same kind of device: a separate context, so a separate demo session. */
async function freshPage(browser: Browser, device: BrowserContextOptions) {
  const page = await (await browser.newContext(device)).newPage();
  await onboard(page, origin);
  return page;
}
// The members page also has a copy-status region, so target the toast itself.
const toast = (page: Page) => page.locator(".toast");

async function createWorkspace(page: Page, name: string, alias: string) {
  await page.goto(`${origin}/teams`);
  await page.getByLabel("Workspace name").fill(name);
  await page.getByLabel("Your display name").fill(alias);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/teams\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

async function createInvite(page: Page) {
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Members" })
    .click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByLabel("New invite link").inputValue();
  expect(link).toMatch(new RegExp(`^${origin}/join#[a-f0-9]{64}$`));
  return link;
}

test("an owner invites a colleague, launches a private market they trade, and outsiders never see it", async ({
  browser,
  page,
  isMobile,
  hasTouch,
  viewport,
  userAgent,
  deviceScaleFactor,
}) => {
  test.setTimeout(120_000);
  const device = { isMobile, hasTouch, viewport, userAgent, deviceScaleFactor };
  await page.goto(`${origin}/teams`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Teams Preview",
  );
  await expect(
    page.getByRole("heading", { name: "No workspaces yet" }),
  ).toBeVisible();
  await audit(page, ".teams-page");
  if (isMobile) {
    const dock = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(dock.getByRole("button")).toHaveCount(6);
    await expect(dock.getByRole("button", { name: "Teams" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(dock.getByRole("button", { name: "Developers" })).toHaveCount(
      0,
    );
    await fitsWidth(page);
  }

  const wid = await createWorkspace(page, "Forecast Guild", "Olive Owner");
  await expect(toast(page)).toContainText("Forecast Guild created");
  await expect(page.locator(".workspace-actions")).toContainText(
    "10,000.00 workspace credits",
  );
  await expect(
    page.getByRole("heading", { name: "No private markets yet" }),
  ).toBeVisible();
  await audit(page, ".workspace-page");

  const link = await createInvite(page);
  await expect(page.locator(".invite-created")).toContainText(
    "you won't see this link again",
  );
  await expect(
    page.getByRole("heading", { name: "Only you so far." }),
  ).toBeVisible();
  await audit(page, ".workspace-members");
  if (isMobile) await fitsWidth(page);

  // A colleague opens the link in another browser and joins.
  const colleague = await freshPage(browser, device);
  await colleague.goto(link);
  await expect(
    colleague.getByRole("heading", { name: "Join Forecast Guild" }),
  ).toBeVisible();
  expect(new URL(colleague.url()).hash).toBe("");
  await audit(colleague, ".join-page");
  await colleague.getByLabel("Your display name").fill("olive owner");
  await colleague.getByRole("button", { name: "Join workspace" }).click();
  await expect(colleague.getByRole("alert")).toContainText(
    "That display name is taken",
  );
  await colleague.getByLabel("Your display name").fill("Max Member");
  await colleague.getByRole("button", { name: "Join workspace" }).click();
  await expect(colleague).toHaveURL(`${origin}/teams/${wid}`);
  await expect(toast(colleague)).toContainText("You joined Forecast Guild.");

  // The owner promotes the colleague, then launches a private market.
  await page.reload();
  const max = page.locator(".member-row", { hasText: "Max Member" });
  await choose(page, "Role for Max Member", "resolver");
  await max.getByRole("button", { name: "Save role" }).click();
  await expect(toast(page)).toContainText("Max Member is now a resolver.");
  await expect(max).toContainText("Resolver · joined");

  await page.getByRole("button", { name: "Draft a market" }).click();
  await page
    .getByLabel("The question")
    .fill("Will the Sensex close above 90,000 points on 2027-03-31?");
  await page.getByLabel("Primary source").fill("BSE");
  await page.getByLabel("Closes at (your timezone)").fill("2027-03-31T09:00");
  await page.getByLabel("Source URL").fill("https://www.bseindia.com/sensex");
  await page
    .getByLabel("Resolves YES when")
    .fill(
      "Resolves YES if BSE reports a Sensex close above 90,000 on 2027-03-31.",
    );
  await page.getByLabel("Resolves NO when").fill("Otherwise, resolves NO.");
  await page
    .getByLabel("If evidence is missing or ambiguous")
    .fill(
      "If BSE does not publish the close by 2027-04-07 23:59 IST, resolves INVALID.",
    );
  await page.getByRole("button", { name: "Save private draft" }).click();
  await expect(toast(page)).toContainText("Manual draft saved");
  await page.getByRole("button", { name: /^Saved drafts/ }).click();
  const draft = page.locator(".saved-drafts details").first();
  await draft.locator("summary").click();
  await expect(
    draft.getByRole("combobox", { name: "Launch to" }),
  ).toContainText("Private: Forecast Guild");
  await expect(draft).toContainText(
    "500 workspace credits from your Forecast Guild wallet",
  );
  for (const acknowledgement of [/I reviewed/, /I opened the source/]) {
    const box = draft.getByLabel(acknowledgement);
    if (await box.count()) await box.check();
  }
  await draft.getByRole("button", { name: "Launch market" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/teams/${wid}/markets/ws-[0-9a-f-]{36}$`),
  );
  const marketPath = new URL(page.url()).pathname;
  const marketId = marketPath.split("/").at(-1)!;
  await expect(page.locator(".private-pill")).toHaveText(
    "Private to Forecast Guild",
  );
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toHaveCount(0);

  // The member finds it in the workspace and trades from their wallet.
  await colleague.goto(`${origin}/teams/${wid}`);
  await colleague.locator(".market-card").first().click();
  await expect(colleague).toHaveURL(`${origin}${marketPath}`);
  await colleague.getByRole("button", { name: "Buy YES shares" }).click();
  await expect(toast(colleague)).toContainText("Bought 25 YES shares");
  if (isMobile) await fitsWidth(colleague);

  // An outsider gets "not found" everywhere and never sees the market.
  const outsider = await freshPage(browser, device);
  await outsider.goto(`${origin}${marketPath}`);
  await expect(outsider.getByText("Workspace not found.")).toBeVisible();
  await outsider.goto(`${origin}/markets/${marketId}`);
  await expect(
    outsider.getByRole("heading", { name: "Market not found" }),
  ).toBeVisible();
  await outsider.goto(`${origin}/markets`);
  await outsider.getByLabel("Search markets").fill("Sensex");
  await expect(
    outsider.getByRole("heading", { name: "No markets match" }),
  ).toBeVisible();
  expect(
    (
      await outsider.request.get(`${origin}/api/v1/markets/${marketId}`)
    ).status(),
  ).toBe(404);

  // The workspace board ranks both members by name.
  await page.goto(`${origin}/teams/${wid}/leaderboard`);
  const board = page.locator(".rank-list");
  await expect(board).toContainText("Max Member");
  await expect(board).toContainText("Olive Owner");
  await expect(page.locator(".leaderboard .fine-print")).toContainText(
    "members appear by display name",
  );
  await audit(page, ".workspace-page");
  if (isMobile) await fitsWidth(page);
  await colleague.context().close();
  await outsider.context().close();
});

test("revoking needs a confirmation, and dead or garbage invites show an error without a join form", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  await createWorkspace(page, "Quiet Club", "Quinn");
  const link = await createInvite(page);
  await page.getByRole("button", { name: "Done" }).click();
  const invite = page
    .locator(".member-row", { hasText: "Member invite" })
    .first();
  const revoke = invite.getByRole("button", { name: "Revoke", exact: true });
  await revoke.click();
  await invite.getByRole("button", { name: "Cancel" }).click();
  await expect(revoke).toBeFocused();
  await expect(invite).toContainText("Active");
  await revoke.click();
  await invite.getByRole("button", { name: "Revoke link" }).click();
  await expect(invite).toContainText("Revoked");
  await expect(toast(page)).toContainText("Invite revoked.");

  const stranger = await freshPage(browser, {});
  for (const target of [link, `${origin}/join#not-a-real-token`]) {
    // A fresh load each time: a fragment-only change would not reload the page.
    await stranger.goto("about:blank");
    await stranger.goto(target);
    await expect(
      stranger.getByText("This invite link is invalid or has expired."),
    ).toBeVisible();
    await expect(
      stranger.getByRole("button", { name: "Join workspace" }),
    ).toHaveCount(0);
    expect(new URL(stranger.url()).hash).toBe("");
  }
  await audit(stranger, "main");
  await stranger.context().close();
});

/** Calls the API as the demo session this page started. */
async function api(page: Page, method: string, path: string, data?: object) {
  const token = await page.evaluate(() =>
    localStorage.getItem("wildcatter.demo.token.v1"),
  );
  const response = await page.request.fetch(`${origin}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("a workspace resolver rules a disputed private market; conflicted rulers see the server's reason", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  // Setup through the API; the ruling itself goes through the market page.
  const [disputer, resolver] = [
    await freshPage(browser, {}),
    await freshPage(browser, {}),
  ];
  for (const person of [page, disputer, resolver])
    await person.goto(`${origin}/teams`);
  const { id: wid } = await api(page, "POST", "/workspaces", {
    name: "Ruling Room",
    displayName: "Ora Owner",
  });
  for (const [person, role, displayName] of [
    [disputer, "member", "Dee Disputer"],
    [resolver, "resolver", "Rae Resolver"],
  ] as const) {
    const { token } = await api(page, "POST", `/workspaces/${wid}/invites`, {
      role,
    });
    await api(person, "POST", "/workspaces/join", { token, displayName });
  }
  const draft = await api(page, "POST", "/drafts", {
    question: "Will the Sensex close above 90,000 points on 2027-03-31?",
    sourceName: "BSE",
    sourceUrl: "https://www.bseindia.com/sensex",
    closesAt: "2027-03-31T03:30:00.000Z",
    yesRule:
      "Resolves YES if BSE reports a Sensex close above 90,000 on 2027-03-31.",
    noRule: "Otherwise, resolves NO.",
    invalidRule:
      "If BSE does not publish the close by 2027-04-07 23:59 IST, resolves INVALID.",
  });
  const market = await api(page, "POST", `/drafts/${draft.id}/launch`, {
    category: "World",
    workspaceId: wid,
  });
  await api(page, "POST", `/markets/${market.id}/resolution`, {
    outcome: "YES",
    evidenceUrl: "https://www.bseindia.com/sensex",
  });
  const marketPage = `${origin}/teams/${wid}/markets/${market.id}`;

  await disputer.goto(marketPage);
  const disputePanel = disputer.getByRole("region", {
    name: "Market resolution",
  });
  await expect(disputePanel).toContainText("If a workspace resolver overturns");
  await disputePanel
    .getByRole("button", { name: "Dispute · 100-credit bond" })
    .click();
  await expect(toast(disputer)).toContainText("Dispute filed.");
  await expect(disputePanel).toContainText(
    "Payouts wait for a ruling by a workspace owner, admin or resolver.",
  );
  await expect(
    disputePanel.getByRole("button", { name: "Issue final ruling" }),
  ).toHaveCount(0);

  // The owner created the market, so the server refuses their ruling.
  await page.goto(marketPage);
  const ownerPanel = page.getByRole("region", { name: "Market resolution" });
  await ownerPanel.getByRole("button", { name: "Issue final ruling" }).click();
  await expect(ownerPanel.getByRole("alert")).toContainText(
    "You created, disputed or hold shares in this market.",
  );

  await resolver.goto(marketPage);
  const panel = resolver.getByRole("region", { name: "Market resolution" });
  await expect(panel.getByLabel("Operator token")).toHaveCount(0);
  await choose(resolver, "Final outcome", "NO");
  await panel.getByRole("button", { name: "Issue final ruling" }).click();
  await expect(toast(resolver)).toContainText("Ruling recorded.");
  await expect(panel).toContainText("Final outcome: NO");
  await audit(resolver, ".detail-secondary");
  await disputer.context().close();
  await resolver.context().close();
});
