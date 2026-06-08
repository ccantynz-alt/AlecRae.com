import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Encryption Keys — Zero-Knowledge E2E Email Keypairs
// ---------------------------------------------------------------------------

/**
 * Per-account E2E encryption keypair store.
 *
 * ZERO-KNOWLEDGE INVARIANT: the server stores ONLY the public key and the
 * CLIENT-ENCRYPTED (wrapped) private key. The wrapped private key is encrypted
 * with an AES-GCM key derived from the user's passphrase, which never touches
 * the server. The server can therefore never decrypt the private key — it holds
 * opaque ciphertext. NO plaintext private key is ever persisted here.
 *
 * Exactly one row per account (upserted on key (re)generation).
 */
export const encryptionKeys = pgTable(
  "encryption_keys",
  {
    id: text("id").primaryKey(),

    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Base64-encoded SPKI public key. Safe to store and share with senders. */
    publicKey: text("public_key").notNull(),

    /**
     * The private key after CLIENT-SIDE encryption with a passphrase-derived
     * AES-GCM key. Format: `<iv-b64>.<ciphertext-b64>`. This is opaque
     * ciphertext to the server — never a plaintext private key.
     */
    encryptedPrivateKey: text("encrypted_private_key").notNull(),

    /** Algorithm descriptor for the keypair + private-key wrapping. */
    algorithm: text("algorithm")
      .notNull()
      .default("RSA-OAEP-4096 + AES-256-GCM"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("encryption_keys_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const encryptionKeysRelations = relations(encryptionKeys, ({ one }) => ({
  account: one(accounts, {
    fields: [encryptionKeys.accountId],
    references: [accounts.id],
  }),
}));
