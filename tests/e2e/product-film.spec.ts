import { test, expect } from "@playwright/test";

test("product film keeps loading lightweight and supplies captions and credits", async ({
  page,
}) => {
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("wildcatter-product-introduction.mp4"))
      videoRequests.push(request.url());
  });
  await page.goto("/");
  const section = page.getByRole("region", {
    name: "A closer look at Wildcatter.",
  });
  await expect(section).toBeVisible();
  const video = section.locator("video");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("controls");
  await expect(video).not.toHaveAttribute("src");
  await expect(
    section.getByRole("button", { name: "Play the Wildcatter product film" }),
  ).toBeVisible();
  await expect(video).toHaveAttribute("playsinline", "");
  await expect(video).not.toHaveAttribute("autoplay");
  await expect(video.locator("track")).toHaveAttribute("kind", "captions");
  await expect(video.locator("track")).toHaveAttribute("srclang", "en");
  expect(videoRequests).toEqual([]);
  const poster = await page.request.get(
    "/media/wildcatter-product-introduction.jpg",
  );
  expect(poster.status()).toBe(200);
  expect(poster.headers()["content-type"]).toContain("image/jpeg");
  const captions = await page.request.get(
    "/media/wildcatter-product-introduction.en.vtt",
  );
  expect(captions.status()).toBe(200);
  expect(await captions.text()).toMatch(/^WEBVTT/);
  await section.getByText("About the film & credits", { exact: true }).click();
  await expect(section.locator("details")).toContainText(
    "separate local workspace",
  );
  await expect(section.locator("details")).toContainText("Sascha Ende");
});

test("product film serves seekable media and decodes in Chromium", async ({
  page,
  browserName,
}) => {
  const range = await page.request.get(
    "/media/wildcatter-product-introduction.mp4",
    { headers: { Range: "bytes=0-1023" } },
  );
  expect(range.status()).toBe(206);
  expect(range.headers()["content-type"]).toContain("video/mp4");
  expect(range.headers()["content-range"]).toMatch(/^bytes 0-1023\//);
  expect((await range.body()).length).toBe(1024);
  await page.goto("/");
  const video = page.locator("#product-film video");
  // The local Chromium decoder verifies playback; WebKit still checks serving and markup.
  if (browserName === "chromium") {
    await video.evaluate((element: HTMLVideoElement) => {
      element.muted = true;
    });
    await page
      .getByRole("button", { name: "Play the Wildcatter product film" })
      .click();
    await expect(video).toHaveAttribute("controls", "");
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.currentTime),
      )
      .toBeGreaterThan(0.2);
    expect(
      await video.evaluate((element: HTMLVideoElement) => element.duration),
    ).toBeCloseTo(114, 0);
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
      element.currentTime = 80;
    });
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => ({
          time: element.currentTime,
          seeking: element.seeking,
          ready: element.readyState,
          error: element.error?.message,
        })),
      )
      .toMatchObject({ time: 80, seeking: false });
    expect(
      await video.evaluate((element: HTMLVideoElement) => element.error),
    ).toBeNull();
  }
});
