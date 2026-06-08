/**
 * Preflight validation — run BEFORE or AFTER a production deploy to confirm the
 * environment is correctly configured. Closes Gap G4 (a missing/bad secret
 * silently breaks production).
 *
 * Two phases:
 *   1. ENV SHAPE  — Zod validates every required var from `.env.production`.
 *   2. CONNECTIVITY — cheap, safe round-trips: Postgres SELECT 1, Redis ping,
 *      Meilisearch /health, plus key-format checks for Anthropic + Stripe
 *      (no paid API calls are made).
 *
 * Prints a ✅/❌ checklist and exits 1 if any required item fails, 0 if green.
 *
 * Run with:  bun run preflight
 *        or:  bun run scripts/preflight.ts
 */
import { z } from "zod";
import { checkConnectionHealth } from "@alecrae/db";

// ─── Result types ──────────────────────────────────────────────────────────

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  /** Non-fatal checks are reported but never flip the exit code. */
  readonly optional?: boolean;
}

// ─── ENV SHAPE — Zod schema (every required var from .env.production) ─────────

/**
 * A required non-empty string that must not still hold a `.env.production`
 * template placeholder. Returns a `ZodString` (not `ZodEffects`) so callers can
 * keep chaining string-only checks like `.startsWith()` / `.url()` / `.min()`.
 * The placeholder rejection uses `.regex()` with a negative lookahead, which
 * preserves the `ZodString` type.
 */
const required = (label: string): z.ZodString =>
  z
    .string({ required_error: `${label} is not set` })
    .trim()
    .min(1, `${label} is empty`)
    .regex(
      /^(?!(?:YOUR_|GENERATE_|price_YOUR|sk_live_YOUR|whsec_YOUR))/i,
      `${label} still holds a template placeholder`,
    );

/**
 * The production environment contract. Mirrors the required secrets in
 * `.env.production`. Optional/feature-flag vars (OTEL, DNS, MTA, R2, Cloudflare)
 * are intentionally excluded — they are not deploy blockers for the core app.
 */
const envSchema = z.object({
  // Database (Neon)
  DATABASE_URL: required("DATABASE_URL").startsWith(
    "postgres",
    "DATABASE_URL must be a postgres:// URL",
  ),

  // Redis (Upstash — REST trio + raw URL)
  REDIS_URL: required("REDIS_URL"),
  UPSTASH_REDIS_URL: required("UPSTASH_REDIS_URL").url(
    "UPSTASH_REDIS_URL must be a valid URL",
  ),
  UPSTASH_REDIS_TOKEN: required("UPSTASH_REDIS_TOKEN"),

  // Search (Meilisearch)
  MEILI_URL: required("MEILI_URL").url("MEILI_URL must be a valid URL"),
  MEILI_MASTER_KEY: required("MEILI_MASTER_KEY"),

  // Auth
  JWT_SECRET: required("JWT_SECRET").min(
    32,
    "JWT_SECRET must be at least 32 characters",
  ),

  // AI
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  OPENAI_API_KEY: required("OPENAI_API_KEY"),

  // Stripe billing (key, webhook secret, + 3 price IDs)
  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: required("STRIPE_WEBHOOK_SECRET").startsWith(
    "whsec_",
    "STRIPE_WEBHOOK_SECRET must start with whsec_",
  ),
  STRIPE_PRICE_STARTER: required("STRIPE_PRICE_STARTER").startsWith(
    "price_",
    "STRIPE_PRICE_STARTER must start with price_",
  ),
  STRIPE_PRICE_PROFESSIONAL: required("STRIPE_PRICE_PROFESSIONAL").startsWith(
    "price_",
    "STRIPE_PRICE_PROFESSIONAL must start with price_",
  ),
  STRIPE_PRICE_ENTERPRISE: required("STRIPE_PRICE_ENTERPRISE").startsWith(
    "price_",
    "STRIPE_PRICE_ENTERPRISE must start with price_",
  ),

  // OAuth — Google
  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET"),

  // OAuth — Microsoft
  MICROSOFT_CLIENT_ID: required("MICROSOFT_CLIENT_ID"),
  MICROSOFT_CLIENT_SECRET: required("MICROSOFT_CLIENT_SECRET"),
});

type Env = z.infer<typeof envSchema>;

/**
 * Validate `process.env` against the schema. Returns either the parsed env or a
 * per-field list of failures (one CheckResult per offending variable).
 */
function validateEnv():
  | { ok: true; env: Env; results: CheckResult[] }
  | { ok: false; env: null; results: CheckResult[] } {
  const parsed = envSchema.safeParse(process.env);

  if (parsed.success) {
    const keys = Object.keys(envSchema.shape);
    const results: CheckResult[] = keys.map((name) => ({
      name: `env: ${name}`,
      ok: true,
      detail: "present and well-formed",
    }));
    return { ok: true, env: parsed.data, results };
  }

  const fieldErrors = parsed.error.flatten().fieldErrors;
  const keys = Object.keys(envSchema.shape);
  const results: CheckResult[] = keys.map((name) => {
    const errs = fieldErrors[name as keyof typeof fieldErrors];
    if (errs && errs.length > 0) {
      return { name: `env: ${name}`, ok: false, detail: errs[0] ?? "invalid" };
    }
    return { name: `env: ${name}`, ok: true, detail: "present and well-formed" };
  });
  return { ok: false, env: null, results };
}

// ─── CONNECTIVITY checks ─────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 8000;

/** fetch() with an AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Postgres SELECT 1 via the project's shared db client. */
async function checkPostgres(): Promise<CheckResult> {
  try {
    const health = await checkConnectionHealth();
    if (health.healthy) {
      return {
        name: "postgres: SELECT 1",
        ok: true,
        detail: `connected (${health.latencyMs}ms)`,
      };
    }
    return {
      name: "postgres: SELECT 1",
      ok: false,
      detail: health.error ?? "connection unhealthy",
    };
  } catch (error: unknown) {
    return {
      name: "postgres: SELECT 1",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Redis ping via Upstash REST API (works from edge — no raw TCP needed). */
async function checkRedis(env: Env): Promise<CheckResult> {
  try {
    const res = await fetchWithTimeout(`${env.UPSTASH_REDIS_URL}/ping`, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_TOKEN}` },
    });
    if (!res.ok) {
      return {
        name: "redis: PING (Upstash REST)",
        ok: false,
        detail: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    const body = (await res.json()) as { result?: unknown };
    const pong = body.result === "PONG";
    return {
      name: "redis: PING (Upstash REST)",
      ok: pong,
      detail: pong ? "PONG" : `unexpected response: ${JSON.stringify(body)}`,
    };
  } catch (error: unknown) {
    return {
      name: "redis: PING (Upstash REST)",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Meilisearch /health GET — returns { status: "available" } when ready. */
async function checkMeilisearch(env: Env): Promise<CheckResult> {
  try {
    const res = await fetchWithTimeout(
      `${env.MEILI_URL.replace(/\/$/, "")}/health`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${env.MEILI_MASTER_KEY}` },
      },
    );
    if (!res.ok) {
      return {
        name: "meilisearch: /health",
        ok: false,
        detail: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    const body = (await res.json()) as { status?: string };
    const available = body.status === "available";
    return {
      name: "meilisearch: /health",
      ok: available,
      detail: available ? "available" : `status: ${body.status ?? "unknown"}`,
    };
  } catch (error: unknown) {
    return {
      name: "meilisearch: /health",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Anthropic key-format check. We deliberately do NOT call the messages API
 * (that costs tokens). A live `/v1/models` GET is free, so we use it: a 200
 * proves the key authenticates; a 401 proves it does not. Network failures
 * fall back to a non-fatal format-only result.
 */
async function checkAnthropic(env: Env): Promise<CheckResult> {
  const formatOk = /^sk-ant-/.test(env.ANTHROPIC_API_KEY);
  if (!formatOk) {
    return {
      name: "anthropic: key auth",
      ok: false,
      detail: "key does not match expected sk-ant- prefix",
    };
  }
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) {
      return { name: "anthropic: key auth", ok: true, detail: "authenticated (200)" };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name: "anthropic: key auth",
        ok: false,
        detail: `rejected (HTTP ${res.status})`,
      };
    }
    // Unexpected status — format is valid, treat as non-fatal warning.
    return {
      name: "anthropic: key auth",
      ok: true,
      detail: `format ok; models endpoint returned HTTP ${res.status}`,
      optional: true,
    };
  } catch (error: unknown) {
    return {
      name: "anthropic: key auth",
      ok: true,
      detail: `format ok; network check skipped (${error instanceof Error ? error.message : String(error)})`,
      optional: true,
    };
  }
}

/**
 * Stripe key auth via a cheap GET (`/v1/balance` is free and read-only).
 * 200 proves the key works; 401 proves it does not. Falls back to a
 * non-fatal format check on network failure.
 */
async function checkStripe(env: Env): Promise<CheckResult> {
  const formatOk = /^sk_(live|test)_/.test(env.STRIPE_SECRET_KEY);
  if (!formatOk) {
    return {
      name: "stripe: key auth",
      ok: false,
      detail: "key does not match expected sk_live_/sk_test_ prefix",
    };
  }
  try {
    const res = await fetchWithTimeout("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (res.ok) {
      return { name: "stripe: key auth", ok: true, detail: "authenticated (200)" };
    }
    if (res.status === 401) {
      return { name: "stripe: key auth", ok: false, detail: "rejected (HTTP 401)" };
    }
    return {
      name: "stripe: key auth",
      ok: true,
      detail: `format ok; balance endpoint returned HTTP ${res.status}`,
      optional: true,
    };
  } catch (error: unknown) {
    return {
      name: "stripe: key auth",
      ok: true,
      detail: `format ok; network check skipped (${error instanceof Error ? error.message : String(error)})`,
      optional: true,
    };
  }
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printChecklist(title: string, results: readonly CheckResult[]): void {
  console.warn(`\n${title}`);
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const tag = r.optional && r.ok ? " (warn)" : "";
    console.warn(`  ${icon} ${r.name} — ${r.detail}${tag}`);
  }
}

/** A required check fails the run; optional checks never flip the exit code. */
function isBlocking(r: CheckResult): boolean {
  return !r.ok && r.optional !== true;
}

async function main(): Promise<void> {
  console.warn("AlecRae — Production Preflight");
  console.warn("=".repeat(40));

  // Phase 1: env shape.
  const envCheck = validateEnv();
  printChecklist("ENV SHAPE", envCheck.results);

  // Phase 2: connectivity — only when the env shape is valid, since the checks
  // need well-formed URLs/keys to run meaningfully.
  let connectivity: CheckResult[] = [];
  if (envCheck.ok) {
    connectivity = await Promise.all([
      checkPostgres(),
      checkRedis(envCheck.env),
      checkMeilisearch(envCheck.env),
      checkAnthropic(envCheck.env),
      checkStripe(envCheck.env),
    ]);
    printChecklist("CONNECTIVITY", connectivity);
  } else {
    console.warn("\nCONNECTIVITY");
    console.warn("  ⏭  skipped — fix the ENV SHAPE failures above first");
  }

  // Summary + exit code.
  const all = [...envCheck.results, ...connectivity];
  const blocking = all.filter(isBlocking);
  const passed = all.filter((r) => r.ok).length;

  console.warn("\n" + "=".repeat(40));
  if (blocking.length === 0) {
    console.warn(`✅ ALL GREEN — ${passed}/${all.length} checks passed.`);
    process.exit(0);
  } else {
    console.warn(
      `❌ ${blocking.length} blocking failure(s). ${passed}/${all.length} checks passed.`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Preflight crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
