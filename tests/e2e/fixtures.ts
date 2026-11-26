import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export type * from "@playwright/test";

const storageKey = "wildcatter.demo.token.v1";

/** Gives a page an account that has finished onboarding, as a returning user has. */
export async function onboard(page: Page, origin = ""): Promise<string> {
  const session = await (
    await page.request.post(`${origin}/api/v1/sessions`)
  ).json();
  const done = await page.request.put(`${origin}/api/v1/account`, {
    headers: { authorization: `Bearer ${session.token}` },
    data: { displayName: "Tester", acceptTerms: true, confirmAdult: true },
  });
  expect(done.ok()).toBe(true);
  await page.addInitScript(
    ([key, token]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, token);
    },
    [storageKey, session.token],
  );
  return session.token;
}

/** Set `test.use({ onboarded: false })` to start as a first-time visitor. */
export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) await onboard(page);
    await use(page);
  },
});
