/**
 * Recipient-domain verification for the inbound SMTP receiver — the relay
 * control.
 *
 * `SmtpReceiver` has always had the hook (`domainVerifier`) and the RCPT TO
 * logic to use it. Nothing ever supplied one, and the check was written as
 * `if (this.config.domainVerifier)`, so it was skipped: RCPT TO answered 250
 * for any recipient on any domain. That is an open relay, in the service whose
 * entire job is to sit on port 25 — the same defect that ran on this box for
 * nine days and was actively abused for advance-fee spam (issue #105), and the
 * same one issue #127 closed on the MTA side.
 *
 * The posture here matches #127 deliberately:
 *
 *  - **Unknown domain → 550.** We host it or we do not relay for it.
 *  - **No subdomain inheritance.** Hosting `example.com` must not make us the
 *    relay for `anything.example.com`; the lookup is exact.
 *  - **Unverified or inactive → refuse**, distinguishing the two so a domain
 *    mid-onboarding gets a retryable 450 while a deactivated one gets 550.
 *  - **Database unreachable → throw**, which the receiver turns into a 450
 *    "temporary failure". A conforming sender retries and legitimate mail
 *    survives a database blip, while we still relay nothing. Returning
 *    "registered" on error would be the failure that matters.
 */

import { eq } from "drizzle-orm";
import type {
  DomainVerifier,
  DomainCheckResult,
} from "../receiver/smtp-receiver.js";

/**
 * Build the verifier the receiver should run for every RCPT TO.
 *
 * Requires `DATABASE_URL`. Without it there is no way to know which domains we
 * host, so the verifier refuses everything rather than guessing — an in-memory
 * dev run should not be able to accept mail for domains it cannot check.
 */
export function createDomainVerifier(): DomainVerifier {
  const hasDb = Boolean(process.env["DATABASE_URL"]);

  if (!hasDb) {
    console.error(
      "[DomainVerifier] DATABASE_URL is not set — every recipient will be refused. " +
        "The inbound receiver cannot determine which domains we host without it.",
    );
    return async (): Promise<DomainCheckResult> => ({
      registered: false,
      active: false,
      dnsStale: false,
    });
  }

  return async (domain: string): Promise<DomainCheckResult> => {
    // Deliberately NOT wrapped in try/catch. A thrown error becomes a 450 in
    // the receiver, which is the correct answer to "we cannot currently tell".
    // Swallowing it here would have to return something, and every available
    // answer is worse than a retry.
    const { getDatabase, domains } = await import("@alecrae/db");
    const db = getDatabase();

    const [row] = await db
      .select({
        isActive: domains.isActive,
        verificationStatus: domains.verificationStatus,
      })
      .from(domains)
      .where(eq(domains.domain, domain.toLowerCase()))
      .limit(1);

    if (!row) {
      return { registered: false, active: false, dnsStale: false };
    }

    return {
      registered: true,
      active: row.isActive,
      // A registered domain that has not passed DNS verification is treated as
      // "not ready yet" rather than "not ours" — the receiver answers 450, so
      // mail sent during onboarding is retried by the sender instead of being
      // permanently rejected while the customer is still publishing records.
      dnsStale: row.verificationStatus !== "verified",
    };
  };
}
