/**
 * Types for email migration operations.
 *
 * Covers import from Gmail, Outlook, Apple Mail, generic IMAP,
 * and raw MBOX files into the Emailed platform.
 */

export type MigrationProvider = "gmail" | "outlook" | "apple-mail" | "imap" | "mbox";

export type MigrationStatus =
  | "pending"
  | "initializing"
  | "authenticating"
  | "discovering"
  | "importing"
  | "mapping"
  | "deduplicating"
  | "finalizing"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export interface MigrationProgress {
  readonly jobId: string;
  readonly provider: MigrationProvider;
  status: MigrationStatus;
  totalMessages: number;
  processedMessages: number;
  skippedMessages: number;
  failedMessages: number;
  totalAttachments: number;
  processedAttachments: number;
  totalSizeBytes: number;
  processedSizeBytes: number;
  percentComplete: number;
  currentPhase: string;
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  estimatedTimeRemainingMs: number | null;
  errors: MigrationError[];
  warnings: MigrationWarning[];
}

export interface MigrationError {
  readonly code: string;
  readonly message: string;
  readonly messageId?: string;
  readonly timestamp: Date;
  readonly retryable: boolean;
}

export interface MigrationWarning {
  readonly code: string;
  readonly message: string;
  readonly messageId?: string;
  readonly timestamp: Date;
}

export interface MigrationOptions {
  readonly batchSize: number;
  readonly maxConcurrency: number;
  readonly includeSpam: boolean;
  readonly includeTrash: boolean;
  readonly includeDrafts: boolean;
  readonly includeSent: boolean;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly labelFilter?: string[];
  readonly folderFilter?: string[];
  readonly skipDuplicates: boolean;
  readonly downloadAttachments: boolean;
  readonly maxAttachmentSizeMb: number;
  readonly resumeFromCheckpoint?: string;
  readonly dryRun: boolean;
}

export interface GmailImportOptions extends MigrationOptions {
  readonly includeLabels: boolean;
  readonly includeStars: boolean;
  readonly includeCategories: boolean;
  readonly preserveReadStatus: boolean;
}

export interface OutlookImportOptions extends MigrationOptions {
  readonly includeCategories: boolean;
  readonly includeFlags: boolean;
  readonly includeConversations: boolean;
  readonly preserveReadStatus: boolean;
}

export interface ImapImportOptions extends MigrationOptions {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string;
  readonly password: string;
  readonly authMethod: "plain" | "login" | "oauth2";
  readonly oauthToken?: string;
  readonly selectedMailboxes?: string[];
  readonly fetchBodies: boolean;
}

export interface MboxImportOptions {
  readonly batchSize: number;
  readonly skipDuplicates: boolean;
  readonly downloadAttachments: boolean;
  readonly maxAttachmentSizeMb: number;
  readonly targetMailboxId: string;
  readonly targetLabelIds?: string[];
  readonly dryRun: boolean;
}

export interface MigrationCheckpoint {
  readonly jobId: string;
  readonly provider: MigrationProvider;
  readonly lastProcessedId: string;
  readonly lastProcessedTimestamp: Date;
  readonly pageToken?: string;
  readonly folderOffsets: Record<string, number>;
  readonly processedMessageIds: Set<string>;
  readonly createdAt: Date;
}

export interface ImportedMessage {
  readonly externalId: string;
  readonly internalId: string;
  readonly messageId: string;
  readonly subject: string;
  readonly from: string;
  readonly to: string[];
  readonly date: Date;
  readonly sizeBytes: number;
  readonly labels: string[];
  readonly flags: Set<string>;
  readonly attachmentCount: number;
  readonly importedAt: Date;
}

export interface MigrationSummary {
  readonly jobId: string;
  readonly provider: MigrationProvider;
  readonly totalImported: number;
  readonly totalSkipped: number;
  readonly totalFailed: number;
  readonly totalAttachments: number;
  readonly totalSizeBytes: number;
  readonly durationMs: number;
  readonly labelsMapped: number;
  readonly duplicatesFound: number;
  readonly errors: MigrationError[];
  readonly warnings: MigrationWarning[];
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export interface SourceMailbox {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly messageCount: number;
  readonly unreadCount: number;
  readonly specialUse?: "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive" | "starred";
}

export interface SourceLabel {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly messageCount: number;
  readonly type: "system" | "user";
}

export interface SourceContact {
  readonly email: string;
  readonly name?: string;
  readonly frequency: number;
  readonly lastContacted?: Date;
}

export interface LabelMapping {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly action: "map" | "create" | "skip";
}

export interface FolderMapping {
  readonly sourcePath: string;
  readonly targetMailboxId: string;
  readonly targetMailboxName: string;
  readonly action: "map" | "create" | "merge" | "skip";
}

export interface AttachmentReference {
  readonly messageExternalId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly downloadUrl?: string;
  readonly storageKey?: string;
  readonly uploaded: boolean;
}
