import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export type * from "@playwright/test";

const storageKey = "peakcast.token.v1";

/** Loads the app so its on-device engine is answering /api/v1 in this page. */
export async function openEngine(page: Page) {
  if (!page.url().startsWith("http")) await page.goto("/terms");
  await page.waitForFunction(
    () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
  );
}

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
}

/**
 * Calls the app's own API inside the page. There is no server: the request is
 * answered by the on-device engine, so it sees the same data as the UI.
 */
export async function api<T = unknown>(
  page: Page,
  path: string,
  init: {
    method?: string;
    token?: string;
    data?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult<T>> {
  await openEngine(page);
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch("/api/v1" + path, {
        method: init.method ?? (init.data === undefined ? "GET" : "POST"),
        headers: {
          ...(init.data === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
          ...init.headers,
        },
        ...(init.data === undefined ? {} : { body: JSON.stringify(init.data) }),
      });
      return {
        status: response.status,
        ok: response.ok,
        body: await response.json(),
      };
    },
    { path, init },
  );
}

export interface ApiMock {
  status?: number;
  json?: unknown;
  /** Body of a function `(body) => newBody` applied to the real answer. */
  transform?: string;
}

/**
 * Fakes answers from the app's own API. Playwright's page.route cannot see
 * them, because the on-device engine answers inside the page without any
 * network request. `path` is matched as a prefix of path + query, for example
 * "/api/v1/quotes" or "/api/v1/markets?". Call before page.goto.
 */
export async function mockApi(page: Page, path: string, mock: ApiMock) {
  await page.addInitScript(
    ([path, mock]) => {
      const scope = window as unknown as {
        __peakcastMocks?: Record<string, ApiMock>;
      };
      if (!scope.__peakcastMocks) {
        const mocks: Record<string, ApiMock> = {};
        scope.__peakcastMocks = mocks;
        const native = window.fetch.bind(window);
        // The app replaces window.fetch with its engine at startup; keep that
        // as the real answer and put the mocks in front of it.
        let app = native;
        const wrapped = async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          const url = new URL(new Request(input, init).url);
          if (
            url.origin !== location.origin ||
            !url.pathname.startsWith("/api/")
          )
            return native(input, init);
          const key = Object.keys(mocks).find((prefix) =>
            (url.pathname + url.search).startsWith(prefix),
          );
          const found = key ? mocks[key] : undefined;
          if (!found) return app(input, init);
          let status = found.status ?? 200;
          let json = found.json;
          if (found.transform) {
            const real = await app(input, init);
            status = real.status;
            json = new Function("body", found.transform)(await real.json());
          }
          return new Response(JSON.stringify(json), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        };
        Object.defineProperty(window, "fetch", {
          configurable: true,
          get: () => wrapped,
          set: (value: typeof fetch) => {
            app = value;
          },
        });
      }
      scope.__peakcastMocks[path] = mock;
    },
    [path, mock] as const,
  );
}

/** Removes a mock in the open page; later requests reach the real engine. */
export const clearApiMock = (page: Page, path: string) =>
  page.evaluate((path) => {
    delete (window as unknown as { __peakcastMocks: Record<string, unknown> })
      .__peakcastMocks[path];
  }, path);

/** Gives a page an account that has finished onboarding, as a returning user has. */
export async function onboard(page: Page): Promise<string> {
  const session = await api<{ token: string }>(page, "/sessions", {
    method: "POST",
  });
  const done = await api(page, "/account", {
    method: "PUT",
    token: session.body.token,
    data: { displayName: "Tester", acceptTerms: true, confirmAdult: true },
  });
  expect(done.ok).toBe(true);
  await page.evaluate(
    ([key, token]) => localStorage.setItem(key, token),
    [storageKey, session.body.token],
  );
  return session.body.token;
}

/** Set `test.use({ onboarded: false })` to start as a first-time visitor. */
export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) await onboard(page);
    await use(page);
  },
});
