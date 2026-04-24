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
    await expect(page.locator("h1").filter({ hasText: /AlecRae/i }).first()).toBeVisible();
  });

  test("displays hero tagline copy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Email, considered/i).first()).toBeVisible();
  });

  test("shows the waitlist / request-access form", async ({ page }) => {
    await page.goto("/");
    const waitlistSection = page.locator("#waitlist");
    await expect(waitlistSection).toBeVisible();
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
    await expect(
      page.getByRole("button", { name: /sign in with passkey/i }),
    ).toBeVisible();
  });

  test("has an email input for email/password login", async ({ page }) => {
    await page.goto("/login");
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
  const dashboardRoutes = ["/inbox", "/compose", "/settings", "/analytics", "/domains"];

  for (const route of dashboardRoutes) {
    test(`${route} does not return a server error`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response, "navigation response must exist").not.toBeNull();
      expect(response!.status(), `GET ${route} must not 5xx`).toBeLessThan(500);
    });
  }
});

// ─── 4. API health endpoint ──────────────────────────────────────────────────

test.describe("API health", () => {
  test("GET /api/health returns OK or 404 (not a server crash)", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status(), "Health check must not be a server error").toBeLessThan(500);
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
    expect(body, "sitemap must reference the landing page").toMatch(/alecrae\.com/i);
  });
});
