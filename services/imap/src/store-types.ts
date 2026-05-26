/**
 * IMAP storage contract.
 *
 * Abstract types and the MessageStore interface that glue the IMAP
 * protocol handlers to whichever backend actually persists mail (Postgres
 * via Drizzle in production, in-memory in tests). Lives outside of
 * handlers/messages.ts so that the storage adapter and tests can depend
 * on a narrow, type-only surface without pulling in the handler file —
 * which is currently being rebuilt to match the new ImapFetchItem /
 * ImapMessage shapes.
 */

import type {
  ImapMessage,
  ImapSearchCriteria,
  ImapFlag,
} from "./types.js";

/** Flag-mutation mode used by the STORE command. */
export type FlagOperation = "set" | "add" | "remove";

/** Result of a COPY/MOVE — tracks the source UID and its new UID in the target mailbox. */
export interface UidMapping {
  readonly sourceUid: number;
  readonly destUid: number;
}

/** Payload for APPEND — a raw RFC 5322 message plus IMAP metadata. */
export interface AppendData {
  readonly flags: ImapFlag[];
  readonly internalDate: Date;
  readonly rawMessage: string;
}

/**
 * Abstract storage interface that bridges IMAP to the underlying mailbox
 * system. The real implementation connects to the same storage backend
 * as JMAP via Drizzle / Postgres.
 */
export interface MessageStore {
  getMessages(
    mailbox: string,
    userId: string,
    uids: number[],
  ): Promise<ImapMessage[]>;

  getMessagesBySequence(
    mailbox: string,
    userId: string,
    seqNums: number[],
  ): Promise<ImapMessage[]>;

  getMessageCount(mailbox: string, userId: string): Promise<number>;

  searchMessages(
    mailbox: string,
    userId: string,
    criteria: ImapSearchCriteria,
  ): Promise<number[]>;

  updateFlags(
    mailbox: string,
    userId: string,
    uids: number[],
    operation: FlagOperation,
    flags: ImapFlag[],
  ): Promise<ImapMessage[]>;

  copyMessages(
    fromMailbox: string,
    toMailbox: string,
    userId: string,
    uids: number[],
  ): Promise<UidMapping[]>;

  moveMessages(
    fromMailbox: string,
    toMailbox: string,
    userId: string,
    uids: number[],
  ): Promise<UidMapping[]>;

  expunge(
    mailbox: string,
    userId: string,
    uids?: number[],
  ): Promise<number[]>;

  appendMessage(
    mailbox: string,
    userId: string,
    message: AppendData,
  ): Promise<{ uid: number }>;
}
