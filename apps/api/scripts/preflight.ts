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

  // Redis. REDIS_URL is what the runtime actually reads (see apps/api/src/lib
  // and services/mta). The Upstash REST pair used to be `required()` here —
  // but NOTHING reads UPSTASH_REDIS_TOKEN anywhere in the codebase, and
  // production is a self-hosted Redis reached over the tailnet, which has no
  // REST endpoint at all. Requiring them meant this preflight could only pass
  // against an architecture we do not run. They are optional now: present for
  // a hosted-Upstash deployment, absent for ours.
  REDIS_URL: required("REDIS_URL").startsWith(
    "redis",
    "REDIS_URL must be a redis:// or rediss:// URL",
  ),
  UPSTASH_REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),

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
/**
 * Describe a variable that passed validation.
 *
 * An optional variable that is simply absent also "passes", and reporting that
 * as "present and well-formed" states the opposite of the truth — which in a
 * preflight check is worse than saying nothing.
 */
function describeEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return "not set (optional)";
  }
  return "present and well-formed";
}

function validateEnv():
  | { ok: true; env: Env; results: CheckResult[] }
  | { ok: false; env: null; results: CheckResult[] } {
  const parsed = envSchema.safeParse(process.env);

  if (parsed.success) {
    const keys = Object.keys(envSchema.shape);
    const results: CheckResult[] = keys.map((name) => ({
      name: `env: ${name}`,
      ok: true,
      detail: describeEnv(name),
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
    return {
      name: `env: ${name}`,
      ok: true,
      detail: describeEnv(name),
    };
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

/**
 * Redis reachability.
 *
 * Only Upstash exposes a REST endpoint we can ping over HTTP. Our production
 * Redis is self-hosted and reached over the tailnet, so there is nothing to
 * fetch — a raw TCP check would mean pulling ioredis into this script, which
 * is not worth a new dependency for a manual preflight. In that case we
 * validate the URL shape and say plainly that connectivity is unverified,
 * pointing at the runbook step that does verify it properly.
 */
async function checkRedis(env: Env): Promise<CheckResult> {
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) {
    return {
      name: "redis: URL shape (self-hosted — connectivity NOT checked here)",
      ok: true,
      optional: true,
      detail:
        "No Upstash REST credentials, so this is a self-hosted Redis. Verify " +
        "reachability AND that both boxes share one queue with Step 6 of " +
        "docs/infra/redis-tailnet-setup.md — reaching *a* Redis from each box " +
        "is not evidence they reach the *same* one.",
    };
  }

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
    // A failing OPTIONAL check used to render as a bare ❌, identical to a
    // blocking one, while the summary counted it as passing — so the icons and
    // the exit code disagreed with no way to tell which entries caused it.
    const icon = r.ok ? "✅" : r.optional ? "⚠️ " : "❌";
    const tag = r.optional ? (r.ok ? " (warn)" : " (non-blocking)") : "";
    console.warn(`  ${icon} ${r.name} — ${r.detail}${tag}`);
  }
}

/** A required check fails the run; optional checks never flip the exit code. */
function isBlocking(r: CheckResult): boolean {
  return !r.ok && r.optional !== true;
}

/**
 * The API and the MTA run on different boxes and must share one Redis, because
 * one enqueues outbound mail and the other consumes it. A localhost URL cannot
 * be shared, so it means each service has its own private queue — and that
 * fails in the worst possible way: the API enqueues, returns success, and the
 * mail never leaves. No bounce, no error, nothing in any log.
 *
 * Reported rather than fatal: a single-box deployment where both processes
 * genuinely are on the same host is legitimate, and unlike a bad API_URL this
 * does not corrupt outbound mail, it stops it — loudly enough to find once you
 * know to look, which is what this line is for.
 */
function checkSharedQueue(env: Env): CheckResult {
  const isLocal = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(env.REDIS_URL);
  if (!isLocal) {
    return {
      name: "redis: shared queue (non-local URL)",
      ok: true,
      detail: "REDIS_URL is not localhost, so both boxes can reach it.",
    };
  }
  return {
    name: "redis: shared queue",
    ok: false,
    optional: true,
    detail:
      "REDIS_URL points at localhost. If the API and MTA are on separate " +
      "boxes this means each has its OWN queue: sends are accepted and then " +
      "silently never delivered. See docs/infra/redis-tailnet-setup.md. " +
      "Ignore only if both processes run on this same host.",
  };
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
      Promise.resolve(checkSharedQueue(envCheck.env)),
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
