/**
 * Transactional email — single chokepoint for system emails (welcome, verify,
 * password reset, notifications), sent via the Vapron platform.
 *
 * Kept separate from user-composed mail (which flows through the MTA / messages
 * pipeline). Callers get a typed result and the function never throws for the
 * "no provider configured" case — it returns { sent: false } so a missing key
 * can't break a signup/auth flow. Genuine provider errors do propagate as
 * VapronError so callers can decide whether to retry or swallow.
 */

import { vapron, isVapronConfigured } from "./vapron.js";

export interface TransactionalEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface TransactionalEmailResult {
  sent: boolean;
  provider: "vapron" | "none";
  id?: string;
}

/** Send a transactional/system email. No-ops (sent: false) when unconfigured. */
export async function sendTransactionalEmail(
  params: TransactionalEmailParams,
): Promise<TransactionalEmailResult> {
  if (!isVapronConfigured()) {
    console.warn(
      `[transactional-email] No provider configured (VAPRON_API_KEY unset); skipping send to ${params.to}`,
    );
    return { sent: false, provider: "none" };
  }

  const res = await vapron.email.send(params);
  return { sent: true, provider: "vapron", ...(res.id !== undefined ? { id: res.id } : {}) };
}
