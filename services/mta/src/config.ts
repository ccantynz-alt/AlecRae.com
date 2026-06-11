/**
 * @alecrae/mta — Shared hostname configuration.
 *
 * Single source of truth for the MTA's public SMTP hostname (used for the
 * server banner, EHLO/HELO identity, and relay handshakes). Env-driven with
 * the production `.com` default — the old `mail.alecrae.dev` placeholder
 * must never be announced in production (CLAUDE.md known issue #26).
 *
 * Precedence: MTA_HOSTNAME (production convention, see
 * docs/infra/.env.production.template) → SMTP_HOSTNAME (legacy) → default.
 */

const DEFAULT_MTA_HOSTNAME = "mail.alecrae.com";

/** Resolve the MTA's public hostname from the environment. */
export function getMtaHostname(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env["MTA_HOSTNAME"]?.trim() ||
    env["SMTP_HOSTNAME"]?.trim() ||
    DEFAULT_MTA_HOSTNAME
  );
}
