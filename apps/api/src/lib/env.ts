/**
 * Fail-fast production environment validation.
 *
 * In production (NODE_ENV === "production") the API must not boot with a
 * broken environment — a missing JWT_SECRET or WEBAUTHN_* var otherwise
 * surfaces as a runtime 500 on the first login attempt (see CLAUDE.md known
 * issues #23 and #25). `assertProductionEnv()` validates everything up front
 * and throws ONE aggregated error listing every missing/invalid variable.
 *
 * In non-production environments (local dev, CI, tests) it is a no-op so the
 * API keeps booting with zero configuration.
 *
 * Required in production (throws):
 *   - DATABASE_URL      Postgres connection string
 *   - JWT_SECRET        >= 32 characters (jwt.ts + oauth-state.ts signing)
 *   - WEBAUTHN_RP_ID    e.g. "alecrae.com" (passkey.ts throws without it)
 *   - WEBAUTHN_ORIGIN   e.g. "https://mail.alecrae.com"
 *
 * Recommended in production (console.warn only):
 *   - REDIS_URL, WEBHOOK_SECRET, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY
 */

import { z } from "zod";

const productionEnvSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: "missing — set the Postgres connection string" })
    .min(1, "must not be empty — set the Postgres connection string"),
  JWT_SECRET: z
    .string({ required_error: "missing — set a stable secret of at least 32 characters" })
    .min(32, "must be at least 32 characters (login + OAuth state signing break without it)"),
  WEBAUTHN_RP_ID: z
    .string({ required_error: "missing — set the WebAuthn relying-party ID (e.g. 'alecrae.com')" })
    .min(1, "must not be empty (e.g. 'alecrae.com')"),
  WEBAUTHN_ORIGIN: z
    .string({ required_error: "missing — set the WebAuthn origin (e.g. 'https://mail.alecrae.com')" })
    .url("must be a valid URL (e.g. 'https://mail.alecrae.com')"),
});

const RECOMMENDED_VARS = [
  "REDIS_URL",
  "WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
] as const;

/**
 * Validate the production environment at boot.
 *
 * - No-op unless NODE_ENV === "production".
 * - Throws a single aggregated Error naming every missing/invalid required
 *   variable so an operator can fix the whole environment in one pass.
 * - Emits a console.warn for recommended-but-unset variables (features
 *   degrade gracefully without them, so they never block boot).
 */
export function assertProductionEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env["NODE_ENV"] !== "production") {
    return;
  }

  const parsed = productionEnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `[env] Production environment validation failed (${lines.length} problem${lines.length === 1 ? "" : "s"}):\n` +
        `${lines.join("\n")}\n` +
        "[env] Refusing to boot — fix the variables above and restart. " +
        "See docs/infra/.env.production.template for reference values.",
    );
  }

  const missingRecommended = RECOMMENDED_VARS.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === "";
  });
  if (missingRecommended.length > 0) {
    console.warn(
      `[env] Recommended environment variables are not set: ${missingRecommended.join(", ")}. ` +
        "The API will boot, but the related features (Redis-backed rate limiting/queues, " +
        "webhook signing, AI, billing) run degraded or disabled.",
    );
  }
}
