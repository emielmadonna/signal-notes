import { test, expect, type APIRequestContext } from "@playwright/test";
import { signIn, USERS } from "./helpers";

/**
 * P5 card-013 — THE AUTH WALL, proven route by route.
 *
 * Two contracts, deliberately different, both from CLAUDE.md's middleware:
 *   1. A PAGE fetched without a session redirects to /signin?next=<where they
 *      were headed> — a human gets sent to sign in and back afterwards.
 *   2. An /api/* call without a session gets machine-readable 401 JSON, NEVER
 *      a 307 to an HTML page — a fetch() caller must be able to read the error.
 *
 * Every protected surface is hit unauthenticated; every API route is hit
 * unauthenticated; the real statuses are asserted (and printed to the run log).
 */

// Every protected PAGE route the product exposes. The bracket routes use real
// (or realistic) ids — the redirect happens in middleware BEFORE the route
// ever runs, so the id only has to be shaped like one.
const COMPLETE_BRIEFING = "345eef7d-ace6-486e-ba49-2d38a4a7f37a";
const SOME_ID = "00000000-0000-0000-0000-000000000000";

const PROTECTED_PAGES: string[] = [
  "/",
  "/documents/new",
  `/documents/${SOME_ID}`,
  "/compose",
  `/briefings/${COMPLETE_BRIEFING}`,
  `/briefings/${COMPLETE_BRIEFING}/generating`,
];

test.describe("auth wall — protected pages redirect unauthenticated visitors", () => {
  for (const path of PROTECTED_PAGES) {
    test(`unauthenticated ${path} → /signin?next=`, async ({ page }) => {
      // No sign-in: this context has no session cookie.
      const resp = await page.goto(path);
      await expect(page).toHaveURL(/\/signin\?next=/);
      // The `next` param remembers exactly where they were headed.
      const next = new URL(page.url()).searchParams.get("next");
      expect(next).toBe(path);
      // The final landing is a real 200 sign-in page, not an error.
      expect(resp?.status()).toBeLessThan(400);
      // eslint-disable-next-line no-console
      console.log(`AUTH-WALL PAGE ${path} → ${page.url()}`);
    });
  }
});

test("sign-in page itself loads unauthenticated", async ({ page }) => {
  const resp = await page.goto("/signin");
  expect(resp?.status()).toBe(200);
  await expect(page).toHaveURL(/\/signin(\?|$)/);
  await expect(
    page.getByText("Briefings grounded in your own documents.")
  ).toBeVisible();
});

test("a signed-in visit to /signin bounces to the workspace", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.goto("/signin");
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await expect(page.getByText(USERS.northwind.org).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("API routes answer 401 JSON (never an HTML redirect) unauthenticated", async ({
  playwright,
}) => {
  // A bare request context: no cookies, exactly what a stranger's fetch() is.
  const api: APIRequestContext = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
  });

  type Probe = { label: string; run: () => Promise<import("@playwright/test").APIResponse> };
  const probes: Probe[] = [
    {
      label: "POST /api/documents/upload",
      run: () => api.post("/api/documents/upload", { multipart: {} as never }),
    },
    {
      label: "POST /api/documents/fetch-url",
      run: () =>
        api.post("/api/documents/fetch-url", { data: { url: "https://example.com" } }),
    },
    {
      label: "POST /api/briefings/generate",
      run: () =>
        api.post("/api/briefings/generate", { data: { documentIds: [SOME_ID] } }),
    },
    {
      label: `GET /api/briefings/${COMPLETE_BRIEFING}/events`,
      run: () => api.get(`/api/briefings/${COMPLETE_BRIEFING}/events`),
    },
  ];

  const rows: string[] = [];
  for (const probe of probes) {
    const res = await probe.run();
    const status = res.status();
    const ctype = res.headers()["content-type"] ?? "";
    const body = await res.json(); // must parse as JSON, not HTML
    rows.push(
      `${probe.label} → ${status} ${ctype} :: ${JSON.stringify(body)}`
    );
    expect(status, `${probe.label} must be 401`).toBe(401);
    expect(ctype, `${probe.label} must be JSON`).toContain("application/json");
    // The body is a human-readable { error } — not an empty body, not HTML.
    expect(typeof body.error, `${probe.label} must carry an error message`).toBe(
      "string"
    );
    expect(body.error.length).toBeGreaterThan(0);
  }
  // eslint-disable-next-line no-console
  console.log("API-AUTH-WALL\n" + rows.join("\n"));
  await api.dispose();
});
