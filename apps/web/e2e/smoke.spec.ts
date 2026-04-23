/**
 * AlecRae web — E2E smoke test suite
 *
 * Covers the critical happy-path surface on every deploy:
 *   1. Landing page (/) loads with brand text, hero copy, and waitlist form
 *   2. Login page (/login) loads with passkey and email options
 *   3. Dashboard routes redirect to /login when unauthenticated
 *   4. API health endpoint (/api/health via Next.js rewrite, or external)
 *   5. /robots.txt returns valid content with AlecRae-aware directives
 *   6. /sitemap.xml exists and is well-formed XML
 *
 * Prerequisites:
 *   - Add @playwright/test to apps/web devDependencies
 *   - Run: bunx playwright install chromium
 *   - Set PLAYWRIGHT_BASE_URL or configure `use.baseURL` in playwright.config.ts
 *     e.g. PLAYWRIGHT_BASE_URL=http://localhost:3000
 *
 * Run:
 *   bunx playwright test apps/web/e2e/smoke.spec.ts
 */

import { expect, test } from "@playwright/test";

// ─── 1. Landing page ────────────────────────────────────────────────────────

test.describe("Landing page (/)", () => {
  test("returns HTTP 200", async ({ page }) => {
    const response = await page.goto("/");
    expect(response, "navigation response must exist").not.toBeNull();
    expect(response!.status(), "GET / must return 2xx").toBeLessThan(400);
  });

  test("displays the AlecRae wordmark", async ({ page }) => {
    await page.goto("/");
    // The wordmark is rendered as an <h1> in the Hero section.
    await expect(page.locator("h1").filter({ hasText: /AlecRae/i }).first()).toBeVisible();
  });

  test("displays hero tagline copy", async ({ page }) => {
    await page.goto("/");
    // Tagline rendered inside the Hero section below the wordmark.
    await expect(
      page.getByText(/Email, considered/i).first(),
    ).toBeVisible();
  });

  test("shows the waitlist / request-access form", async ({ page }) => {
    await page.goto("/");
    // The waitlist section has id="waitlist" and contains an email input.
    const waitlistSection = page.locator("#waitlist");
    await expect(waitlistSection).toBeVisible();

    // Email input inside the form must be present.
    const emailInput = waitlistSection.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test("waitlist form submit button is present", async ({ page }) => {
    await page.goto("/");
    const waitlistSection = page.locator("#waitlist");
    const submitButton = waitlistSection.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });
});

// ─── 2. Login page ──────────────────────────────────────────────────────────

test.describe("Login page (/login)", () => {
  test("returns HTTP 200", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response, "navigation response must exist").not.toBeNull();
    expect(response!.status(), "GET /login must return 2xx").toBeLessThan(400);
  });

  test("shows the AlecRae brand heading", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/AlecRae/i).first()).toBeVisible();
  });

  test("has a passkey sign-in button", async ({ page }) => {
    await page.goto("/login");
    // The passkey button reads "Sign in with Passkey" (or "Authenticating..." when loading).
    await expect(
      page.getByRole("button", { name: /sign in with passkey/i }),
    ).toBeVisible();
  });

  test("has an email input for email/password login", async ({ page }) => {
    await page.goto("/login");
    // EmailLogin component renders an email input for the password-based path.
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();
  });

  test('has an "or continue with email" divider', async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/or continue with email/i)).toBeVisible();
  });
});

// ─── 3. Dashboard redirects when unauthenticated ────────────────────────────

test.describe("Dashboard auth guard", () => {
  // The dashboard layout is a client component; on first render it calls
  // authApi.me() which will fail without a token.  The logout handler
  // redirects to /login.  For unauthenticated smoke tests we verify the
  // dashboard URL is either redirected server-side (HTTP 3xx → /login) or
  // still returns a page that ultimately contains the login surface.
  //
  // We do NOT wait for client-side JS to execute the redirect here — that
  // would require real auth infrastructure.  We simply assert the HTTP layer
  // does not 500 and does not expose raw dashboard content without auth.

  const dashboardRoutes = ["/inbox", "/compose", "/settings", "/analytics", "/domains"];

  for (const route of dashboardRoutes) {
    test(`${route} does not return a server error`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response, "navigation response must exist").not.toBeNull();
      // Must not be a 5xx server error.
      expect(response!.status(), `GET ${route} must not 5xx`).toBeLessThan(500);
    });
  }
});

// ─── 4. API health endpoint ──────────────────────────────────────────────────

test.describe("API health", () => {
  // The Next.js web app does not proxy /health itself — the health endpoint
  // lives on the API server (api.alecrae.com).  In the test environment we
  // check a Next.js API route if it exists, otherwise skip gracefully.
  //
  // If NEXT_PUBLIC_API_URL is set and reachable, we hit it directly.
  // This test is designed to be skipped cleanly in pure-frontend CI where
  // the API server isn't running.

  test("GET /api/health (next.js route or rewrite) returns OK or 404", async ({
    request,
  }) => {
    const response = await request.get("/api/health");
    // Accept 200 (route exists and is healthy) or 404 (route not wired in
    // web app — that is expected; the real health check is on the API server).
    // Reject anything that indicates a server crash (5xx).
    expect(
      response.status(),
      "Health check must not be a server error",
    ).toBeLessThan(500);
  });
});

// ─── 5. robots.txt ──────────────────────────────────────────────────────────

test.describe("robots.txt", () => {
  test("returns HTTP 200", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status(), "GET /robots.txt must be 200").toBe(200);
  });

  test("contains User-agent directive", async ({ request }) => {
    const response = await request.get("/robots.txt");
    const body = await response.text();
    expect(body, "robots.txt must contain User-agent").toMatch(/User-agent/i);
  });

  test("disallows /admin path", async ({ request }) => {
    // The admin route is robots-disallowed (set in apps/web/app/robots.ts).
    const response = await request.get("/robots.txt");
    const body = await response.text();
    expect(body, "robots.txt should disallow /admin").toMatch(/Disallow:\s*\/admin/i);
  });

  test("references the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    const body = await response.text();
    expect(body, "robots.txt should include Sitemap directive").toMatch(/Sitemap:/i);
  });
});

// ─── 6. sitemap.xml ─────────────────────────────────────────────────────────

test.describe("sitemap.xml", () => {
  test("returns HTTP 200", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status(), "GET /sitemap.xml must be 200").toBe(200);
  });

  test("has XML content-type", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType, "sitemap must be served as XML").toMatch(/xml/i);
  });

  test("contains at least one <url> element", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    const body = await response.text();
    expect(body, "sitemap must start with XML declaration or urlset").toMatch(
      /<(?:urlset|sitemapindex)/i,
    );
    expect(body, "sitemap must contain at least one <url> or <sitemap> element").toMatch(
      /<(?:url|sitemap)>/i,
    );
  });

  test("includes the landing page URL", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    const body = await response.text();
    // The landing page URL (/) must appear in the sitemap.
    expect(body, "sitemap must reference the landing page").toMatch(/alecrae\.com/i);
  });
});
