/**
 * AES-256-GCM encryption for secrets stored in `connected_accounts` — OAuth
 * access/refresh tokens and IMAP/SMTP passwords, all previously stored as
 * bare plaintext columns (issue #80).
 *
 * The implementation moved to `@alecrae/crypto`'s secret-box when DKIM keys
 * needed the same treatment (issue #160): `services/dns` writes them and
 * `services/mta` reads them, neither of which can import from `apps/api`.
 * Copying the routine into a third place is precisely how issue #124's
 * header-injection fix ended up applied to one of two builders, so this file
 * is now a thin, named re-export — the names below are what ~20 call sites
 * already use, and changing them would be churn with no benefit.
 *
 * Behaviour is unchanged: legacy plaintext rows decrypt transparently and
 * self-heal to the encrypted form on the next write, so no data migration is
 * needed. See secret-box.ts for the JWT_SECRET rotation caveat.
 */

import {
  sealSecret,
  sealSecretOrNull,
  openSecret,
  openSecretOrNull,
} from "@alecrae/crypto";

export const encryptSecret = sealSecret;
export const decryptSecret = openSecret;
export const encryptSecretOrNull = sealSecretOrNull;
export const decryptSecretOrNull = openSecretOrNull;
