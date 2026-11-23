import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext } from "@playwright/test";

// Read-only journeys: nothing here trades or creates markets.
const origin = "http://127.0.0.1:3101";
const yesPercent = async (request: APIRequestContext) =>
  `${Math.round(
    (await (await request.get("/api/v1/markets/fed-rate")).json()).probability *
      100,
  )}%`;

test("the embed widget shows the live probability and links back to the market", async ({
  page,
  request,
}) => {
  const expected = await yesPercent(request);
  await page.goto("/embed/markets/fed-rate?theme=dark");
  await expect(page.locator(".probability strong")).toHaveText(expected);
  await expect(page.locator("polyline")).toHaveCount(1);
  const link = page.getByRole("link", { name: "Forecast on Wildcatter" });
  await expect(link).toHaveAttribute("href", `${origin}/markets/fed-rate`);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("another site can frame the widget", async ({ page, request }) => {
  const expected = await yesPercent(request);
  // A real loopback server on another port plays the publisher. (A route.fulfill
  // page has no address, so Chrome's local-network checks would block the frame.)
  const publisher = createServer((_request, response) =>
    response
      .writeHead(200, { "content-type": "text/html" })
      .end(
        `<!doctype html><title>Publisher</title><iframe title="Forecast" src="${origin}/embed/markets/fed-rate" width="360" height="200"></iframe>`,
      ),
  );
  await new Promise<void>((resolve) =>
    publisher.listen(0, "127.0.0.1", resolve),
  );
  try {
    const { port } = publisher.address() as AddressInfo;
    await page.goto(`http://127.0.0.1:${port}/`);
    const widget = page.frameLocator("iframe");
    await expect(widget.locator(".probability strong")).toHaveText(expected);
    await expect(
      widget.getByRole("link", { name: "Forecast on Wildcatter" }),
    ).toBeVisible();
  } finally {
    publisher.close();
  }
});

test("the market page shares a link and an embed snippet with a live preview", async ({
  page,
  context,
  browserName,
}) => {
  const chromium = browserName === "chromium";
  if (chromium)
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/markets/fed-rate");
  const share = page.getByRole("button", { name: "Share", exact: true });
  await expect(share).toHaveAttribute("aria-expanded", "false");
  await share.click();
  await expect(share).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: "Share this market" });
  const link = `${origin}/markets/fed-rate`;
  await expect(panel.getByLabel("Market link")).toHaveValue(link);
  await expect(panel.getByLabel("Embed snippet")).toHaveValue(
    new RegExp(
      `^<iframe src="${origin}/embed/markets/fed-rate" width="480" height="200" title="Wildcatter forecast: [^"]+" loading="lazy"`,
    ),
  );
  await expect(
    panel.frameLocator("iframe").locator(".probability strong"),
  ).toHaveText(/^\d+%$/);

  await panel.getByRole("button", { name: "Copy link" }).click();
  const status = panel.getByRole("status");
  if (chromium) {
    await expect(status).toHaveText("Link copied to clipboard.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
  } else {
    // Without clipboard permission the text is selected for a manual copy.
    await expect(status).toContainText(/Link copied|link is selected/);
  }
});
