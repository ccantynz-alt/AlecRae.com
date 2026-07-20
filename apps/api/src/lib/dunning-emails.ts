/**
 * Dunning notification emails (issue #116c).
 *
 * The dunning state machine in billing.ts was fully real — grace window,
 * plan snapshot/restore, downgrade sweep — but never told the customer
 * anything. A failed card was discoverable only when a Pro feature stopped
 * working. This module is the single place that turns a dunning state
 * transition into an actual email, gated the same way `auth.ts`'s welcome
 * email is (opt-in via env var, so nothing goes to a real customer until
 * Craig turns it on) and always fire-and-forget/never-throwing, since a
 * notification failure must never break the billing state transition it
 * describes.
 */

import { sendTransactionalEmail } from "./transactional-email.js";

const WEB_URL = process.env["WEB_URL"] ?? "https://mail.alecrae.com";

/**
 * Gate for outbound dunning email. Off by default — same reasoning as
 * `VAPRON_WELCOME_EMAIL`: this reaches a real customer's inbox about a real
 * billing event, which is exactly the kind of "touches money / public-facing
 * communication" action the Boss Rule reserves for Craig to switch on.
 */
function dunningEmailsEnabled(): boolean {
  return process.env["VAPRON_DUNNING_EMAILS"] === "true";
}

function wrapEmail(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">${bodyHtml}<p style="margin-top:32px;font-size:13px;color:#666;">AlecRae — Email, Evolved.</p></div>`;
}

function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export interface DunningEmailRecipient {
  email: string;
  name: string;
}

/** Sent on the first failed payment of a new dunning cycle. */
export async function sendPaymentFailedEmail(
  recipient: DunningEmailRecipient,
  plan: string,
  graceExpiresAt: Date,
): Promise<void> {
  if (!dunningEmailsEnabled()) return;

  const deadline = graceExpiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await sendTransactionalEmail({
    to: recipient.email,
    subject: "Your AlecRae payment didn't go through",
    html: wrapEmail(
      `<p>Hi ${recipient.name},</p>` +
        `<p>We weren't able to charge your card for your <strong>${planLabel(plan)}</strong> plan. ` +
        `We'll automatically retry over the next few days — no action needed if your card issue resolves itself.</p>` +
        `<p>If your <strong>${planLabel(plan)}</strong> plan is still unpaid by <strong>${deadline}</strong>, ` +
        `it will be downgraded to Free and you'll lose access to paid features.</p>` +
        `<p><a href="${WEB_URL}/settings/billing" style="color:#2563eb;">Update your payment method</a></p>`,
    ),
  }).catch((err: unknown) => {
    console.error("[dunning-emails] Payment-failed email send failed:", err);
  });
}

/** Sent when the grace window expires and the account is downgraded to free. */
export async function sendDowngradedEmail(
  recipient: DunningEmailRecipient,
  previousPlan: string,
): Promise<void> {
  if (!dunningEmailsEnabled()) return;

  await sendTransactionalEmail({
    to: recipient.email,
    subject: "Your AlecRae account has been downgraded to Free",
    html: wrapEmail(
      `<p>Hi ${recipient.name},</p>` +
        `<p>We were unable to collect payment for your <strong>${planLabel(previousPlan)}</strong> plan ` +
        `after several attempts, so your account has been downgraded to Free.</p>` +
        `<p>You can restore your plan any time — your data and settings are untouched.</p>` +
        `<p><a href="${WEB_URL}/settings/billing" style="color:#2563eb;">Resubscribe</a></p>`,
    ),
  }).catch((err: unknown) => {
    console.error("[dunning-emails] Downgraded email send failed:", err);
  });
}

/** Sent when a payment recovers after at least one failure was recorded. */
export async function sendPaymentRecoveredEmail(
  recipient: DunningEmailRecipient,
  restoredPlan: string | null,
): Promise<void> {
  if (!dunningEmailsEnabled()) return;

  const body = restoredPlan
    ? `<p>Your payment succeeded and your <strong>${planLabel(restoredPlan)}</strong> plan has been restored.</p>`
    : `<p>Your payment succeeded — your account is back in good standing.</p>`;

  await sendTransactionalEmail({
    to: recipient.email,
    subject: "Your AlecRae payment succeeded",
    html: wrapEmail(`<p>Hi ${recipient.name},</p>${body}`),
  }).catch((err: unknown) => {
    console.error("[dunning-emails] Recovery email send failed:", err);
  });
}
