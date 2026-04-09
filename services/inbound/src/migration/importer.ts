/**
 * EmailMigrationEngine — Handles importing emails from external
 * providers (Gmail, Outlook, Apple Mail, generic IMAP, MBOX files)
 * into the Emailed platform.
 *
 * Features:
 * - Progress tracking with percentage complete
 * - Incremental import (resume interrupted imports)
 * - Label/folder mapping via EmailDataMapper
 * - Deduplication by Message-ID
 * - Batch processing with configurable chunk size
 */

import { EmailDataMapper } from "./mapper";
import type {
  MigrationProvider,
  MigrationProgress,
  MigrationStatus,
  MigrationCheckpoint,
  MigrationSummary,
  MigrationError,
  MigrationWarning,
  MigrationOptions,
  GmailImportOptions,
  OutlookImportOptions,
  ImapImportOptions,
  MboxImportOptions,
  ImportedMessage,
  SourceMailbox,
  SourceLabel,
  SourceContact,
  AttachmentReference,
  LabelMapping,
  FolderMapping,
} from "./types";

// ── External client interfaces ──────────────────────────────

interface GmailApiClient {
  listLabels(token: string): Promise<SourceLabel[]>;
  listMessages(token: string, query: string, pageToken?: string): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
  }>;
  getMessage(token: string, messageId: string, format: "full" | "raw"): Promise<GmailMessage>;
  getAttachment(token: string, messageId: string, attachmentId: string): Promise<Uint8Array>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    mimeType: string;
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string; attachmentId?: string; size: number };
    parts?: GmailMessagePart[];
  };
  sizeEstimate: number;
  raw?: string;
}

interface GmailMessagePart {
  mimeType: string;
  filename?: string;
  headers: Array<{ name: string; value: string }>;
  body?: { data?: string; attachmentId?: string; size: number };
  parts?: GmailMessagePart[];
}

interface MsGraphClient {
  listMailFolders(token: string): Promise<SourceMailbox[]>;
  listCategories(token: string): Promise<SourceLabel[]>;
  listMessages(
    token: string,
    folderId: string,
    skip: number,
    top: number,
  ): Promise<{ messages: OutlookMessage[]; hasMore: boolean }>;
  getMessageMime(token: string, messageId: string): Promise<Uint8Array>;
  getAttachment(token: string, messageId: string, attachmentId: string): Promise<Uint8Array>;
}

interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  isRead: boolean;
  categories: string[];
  hasAttachments: boolean;
  bodyPreview: string;
  body: { contentType: string; content: string };
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
}

interface ImapConnection {
  connect(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  loginOAuth2(username: string, token: string): Promise<void>;
  listMailboxes(): Promise<SourceMailbox[]>;
  selectMailbox(path: string): Promise<{ exists: number; uidNext: number }>;
  fetchMessages(
    start: number,
    end: number,
    fields: string[],
  ): Promise<Array<{ uid: number; flags: string[]; date: Date; size: number; raw: Uint8Array }>>;
  logout(): Promise<void>;
  disconnect(): Promise<void>;
}

interface FileReader {
  readFile(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<{ size: number; exists: boolean }>;
  createReadStream(path: string, options?: { start: number; end: number }): AsyncIterable<Uint8Array>;
}

interface MessageStore {
  storeMessage(accountId: string, mailboxId: string, raw: Uint8Array, labels: string[], flags: Set<string>): Promise<ImportedMessage>;
  messageExistsByExternalId(accountId: string, externalId: string): Promise<boolean>;
  messageExistsByMessageId(accountId: string, messageId: string): Promise<boolean>;
}

interface CheckpointStore {
  save(checkpoint: MigrationCheckpoint): Promise<void>;
  load(jobId: string): Promise<MigrationCheckpoint | null>;
  delete(jobId: string): Promise<void>;
}

type ProgressCallback = (progress: MigrationProgress) => void;

// ── Default migration options ───────────────────────────────

const DEFAULT_OPTIONS: MigrationOptions = {
  batchSize: 100,
  maxConcurrency: 5,
  includeSpam: false,
  includeTrash: false,
  includeDrafts: true,
  includeSent: true,
  labelFilter: undefined,
  folderFilter: undefined,
  skipDuplicates: true,
  downloadAttachments: true,
  maxAttachmentSizeMb: 25,
  resumeFromCheckpoint: undefined,
  dryRun: false,
};

const DEFAULT_GMAIL_OPTIONS: GmailImportOptions = {
  ...DEFAULT_OPTIONS,
  includeLabels: true,
  includeStars: true,
  includeCategories: true,
  preserveReadStatus: true,
};

const DEFAULT_OUTLOOK_OPTIONS: OutlookImportOptions = {
  ...DEFAULT_OPTIONS,
  includeCategories: true,
  includeFlags: true,
  includeConversations: true,
  preserveReadStatus: true,
};

// ── Migration engine ────────────────────────────────────────

export class EmailMigrationEngine {
  private readonly accountId: string;
  private readonly mapper: EmailDataMapper;
  private readonly messageStore: MessageStore;
  private readonly checkpointStore: CheckpointStore;
  private readonly gmailClient: GmailApiClient;
  private readonly msGraphClient: MsGraphClient;
  private readonly fileReader: FileReader;
  private progress: MigrationProgress;
  private onProgressCallback: ProgressCallback | null;
  private cancelRequested: boolean;
  private pauseRequested: boolean;

  constructor(
    accountId: string,
    mapper: EmailDataMapper,
    messageStore: MessageStore,
    checkpointStore: CheckpointStore,
    gmailClient: GmailApiClient,
    msGraphClient: MsGraphClient,
    fileReader: FileReader,
  ) {
    this.accountId = accountId;
    this.mapper = mapper;
    this.messageStore = messageStore;
    this.checkpointStore = checkpointStore;
    this.gmailClient = gmailClient;
    this.msGraphClient = msGraphClient;
    this.fileReader = fileReader;
    this.onProgressCallback = null;
    this.cancelRequested = false;
    this.pauseRequested = false;

    this.progress = this.createInitialProgress("gmail");
  }

  /**
   * Register a callback for progress updates.
   */
  onProgress(callback: ProgressCallback): void {
    this.onProgressCallback = callback;
  }

  /**
   * Request cancellation of the current import.
   */
  cancel(): void {
    this.cancelRequested = true;
  }

  /**
   * Request pause of the current import. A checkpoint is saved.
   */
  pause(): void {
    this.pauseRequested = true;
  }

  /**
   * Get the current migration progress snapshot.
   */
  getProgress(): Readonly<MigrationProgress> {
    return { ...this.progress };
  }

  // ── Gmail Import ────────────────────────────────────────

  async importFromGmail(
    oauthToken: string,
    userOptions?: Partial<GmailImportOptions>,
  ): Promise<MigrationSummary> {
    const options: GmailImportOptions = { ...DEFAULT_GMAIL_OPTIONS, ...userOptions };
    this.resetState("gmail");

    this.updateStatus("authenticating");

    // Discover labels
    this.updateStatus("discovering");
    const gmailLabels = await this.gmailClient.listLabels(oauthToken);
    const labelMappings = options.includeLabels
      ? this.mapper.mapGmailLabels(gmailLabels)
      : [];
    const labelMap = new Map(labelMappings.map((m) => [m.sourceId, m]));

    // Build query based on options
    const query = this.buildGmailQuery(options);

    // Load checkpoint if resuming
    let checkpoint = options.resumeFromCheckpoint
      ? await this.checkpointStore.load(options.resumeFromCheckpoint)
      : null;

    const processedIds = checkpoint
      ? new Set(checkpoint.processedMessageIds)
      : new Set<string>();

    // Discover total message count
    this.updateStatus("importing");
    let pageToken: string | undefined = checkpoint?.pageToken;
    let hasMorePages = true;

    while (hasMorePages && !this.cancelRequested && !this.pauseRequested) {
      const page = await this.gmailClient.listMessages(oauthToken, query, pageToken);

      const messageBatch = page.messages.filter((m) => !processedIds.has(m.id));

      if (this.progress.totalMessages === 0) {
        this.progress.totalMessages = messageBatch.length + (page.nextPageToken ? messageBatch.length * 10 : 0);
      }

      for (let i = 0; i < messageBatch.length; i += options.batchSize) {
        if (this.cancelRequested || this.pauseRequested) break;

        const batch = messageBatch.slice(i, i + options.batchSize);
        await this.processGmailBatch(oauthToken, batch, labelMap, options);

        for (const msg of batch) {
          processedIds.add(msg.id);
        }

        await this.saveCheckpoint({
          jobId: this.progress.jobId,
          provider: "gmail",
          lastProcessedId: batch[batch.length - 1]?.id ?? "",
          lastProcessedTimestamp: new Date(),
          pageToken,
          folderOffsets: {},
          processedMessageIds: processedIds,
          createdAt: new Date(),
        });
      }

      pageToken = page.nextPageToken;
      hasMorePages = pageToken !== undefined;
    }

    return this.finalize();
  }

  private async processGmailBatch(
    oauthToken: string,
    batch: Array<{ id: string; threadId: string }>,
    labelMap: Map<string, LabelMapping>,
    options: GmailImportOptions,
  ): Promise<void> {
    const tasks = batch.map(async (msgRef) => {
      try {
        const message = await this.gmailClient.getMessage(oauthToken, msgRef.id, "full");

        if (options.skipDuplicates) {
          const messageId = this.extractGmailHeader(message, "Message-ID");
          if (messageId) {
            const exists = await this.messageStore.messageExistsByMessageId(this.accountId, messageId);
            if (exists) {
              this.progress.skippedMessages += 1;
              this.updateProgress();
              return;
            }
          }
        }

        const labels = this.resolveGmailLabels(message.labelIds, labelMap);
        const flags = this.resolveGmailFlags(message, options);

        if (options.downloadAttachments) {
          await this.processGmailAttachments(oauthToken, message, options);
        }

        const rawData = message.raw
          ? this.decodeBase64Url(message.raw)
          : new Uint8Array(0);

        if (!options.dryRun && rawData.length > 0) {
          await this.messageStore.storeMessage(
            this.accountId,
            this.resolveTargetMailbox(labels),
            rawData,
            labels,
            flags,
          );
        }

        this.progress.processedMessages += 1;
        this.progress.processedSizeBytes += message.sizeEstimate;
        this.updateProgress();
      } catch (error) {
        this.recordError(msgRef.id, error);
      }
    });

    const concurrencyLimit = options.maxConcurrency;
    for (let i = 0; i < tasks.length; i += concurrencyLimit) {
      await Promise.allSettled(tasks.slice(i, i + concurrencyLimit));
    }
  }

  private async processGmailAttachments(
    oauthToken: string,
    message: GmailMessage,
    options: GmailImportOptions,
  ): Promise<void> {
    const parts = this.flattenGmailParts(message.payload.parts ?? []);
    for (const part of parts) {
      if (!part.body?.attachmentId || !part.filename) continue;
      const sizeBytes = part.body.size;
      if (sizeBytes > options.maxAttachmentSizeMb * 1024 * 1024) {
        this.recordWarning(message.id, `Attachment ${part.filename} exceeds size limit (${sizeBytes} bytes)`);
        continue;
      }

      const ref: AttachmentReference = {
        messageExternalId: message.id,
        filename: part.filename,
        contentType: part.mimeType,
        sizeBytes,
        uploaded: false,
      };

      await this.mapper.handleAttachment(ref, { Authorization: `Bearer ${oauthToken}` });
      this.progress.processedAttachments += 1;
    }
  }

  private flattenGmailParts(parts: GmailMessagePart[]): GmailMessagePart[] {
    const result: GmailMessagePart[] = [];
    for (const part of parts) {
      result.push(part);
      if (part.parts) {
        result.push(...this.flattenGmailParts(part.parts));
      }
    }
    return result;
  }

  // ── Outlook Import ──────────────────────────────────────

  async importFromOutlook(
    oauthToken: string,
    userOptions?: Partial<OutlookImportOptions>,
  ): Promise<MigrationSummary> {
    const options: OutlookImportOptions = { ...DEFAULT_OUTLOOK_OPTIONS, ...userOptions };
    this.resetState("outlook");

    this.updateStatus("authenticating");
    this.updateStatus("discovering");

    const folders = await this.msGraphClient.listMailFolders(oauthToken);
    const categories = options.includeCategories
      ? await this.msGraphClient.listCategories(oauthToken)
      : [];

    const folderMappings = this.mapper.mapFolderStructure(folders);
    const categoryMappings = this.mapper.mapOutlookCategories(categories);
    const categoryMap = new Map(categoryMappings.map((m) => [m.sourceName, m]));
    const folderMap = new Map(folderMappings.map((m) => [m.sourcePath, m]));

    let checkpoint = options.resumeFromCheckpoint
      ? await this.checkpointStore.load(options.resumeFromCheckpoint)
      : null;

    const folderOffsets: Record<string, number> = checkpoint?.folderOffsets ?? {};
    const processedIds = checkpoint
      ? new Set(checkpoint.processedMessageIds)
      : new Set<string>();

    this.updateStatus("importing");

    for (const folder of folders) {
      if (this.cancelRequested || this.pauseRequested) break;

      if (!this.shouldImportFolder(folder, options)) continue;

      const folderMapping = folderMap.get(folder.path);
      if (!folderMapping || folderMapping.action === "skip") continue;

      let skip = folderOffsets[folder.id] ?? 0;
      let hasMore = true;

      while (hasMore && !this.cancelRequested && !this.pauseRequested) {
        const page = await this.msGraphClient.listMessages(
          oauthToken,
          folder.id,
          skip,
          options.batchSize,
        );

        for (const message of page.messages) {
          if (processedIds.has(message.id)) continue;

          try {
            if (options.skipDuplicates) {
              const exists = await this.messageStore.messageExistsByExternalId(
                this.accountId,
                `outlook:${message.id}`,
              );
              if (exists) {
                this.progress.skippedMessages += 1;
                processedIds.add(message.id);
                this.updateProgress();
                continue;
              }
            }

            const mimeData = await this.msGraphClient.getMessageMime(oauthToken, message.id);
            const labels = this.resolveOutlookLabels(message.categories, categoryMap);
            const flags = new Set<string>();
            if (message.isRead && options.preserveReadStatus) flags.add("\\Seen");
            if (message.hasAttachments) {
              this.progress.totalAttachments += (message.attachments?.length ?? 0);
            }

            if (!options.dryRun) {
              await this.messageStore.storeMessage(
                this.accountId,
                folderMapping.targetMailboxId,
                mimeData,
                labels,
                flags,
              );
            }

            processedIds.add(message.id);
            this.progress.processedMessages += 1;
            this.progress.processedSizeBytes += mimeData.byteLength;
            this.updateProgress();
          } catch (error) {
            this.recordError(message.id, error);
          }
        }

        skip += page.messages.length;
        folderOffsets[folder.id] = skip;
        hasMore = page.hasMore;

        await this.saveCheckpoint({
          jobId: this.progress.jobId,
          provider: "outlook",
          lastProcessedId: `folder:${folder.id}:${skip}`,
          lastProcessedTimestamp: new Date(),
          folderOffsets,
          processedMessageIds: processedIds,
          createdAt: new Date(),
        });
      }
    }

    return this.finalize();
  }

  // ── Apple Mail (MBOX) Import ────────────────────────────

  async importFromAppleMail(mboxPath: string): Promise<MigrationSummary> {
    return this.importFromMbox(mboxPath, {
      batchSize: 100,
      skipDuplicates: true,
      downloadAttachments: true,
      maxAttachmentSizeMb: 25,
      targetMailboxId: "inbox",
      dryRun: false,
    });
  }

  // ── Generic IMAP Import ─────────────────────────────────

  async importFromIMAP(
    connection: ImapConnection,
    userOptions?: Partial<ImapImportOptions>,
  ): Promise<MigrationSummary> {
    const options: ImapImportOptions = {
      ...DEFAULT_OPTIONS,
      host: "",
      port: 993,
      secure: true,
      username: "",
      password: "",
      authMethod: "plain",
      fetchBodies: true,
      ...userOptions,
    };

    this.resetState("imap");
    this.updateStatus("authenticating");

    await connection.connect();

    if (options.authMethod === "oauth2" && options.oauthToken) {
      await connection.loginOAuth2(options.username, options.oauthToken);
    } else {
      await connection.login(options.username, options.password);
    }

    this.updateStatus("discovering");
    const mailboxes = await connection.listMailboxes();
    const folderMappings = this.mapper.mapFolderStructure(mailboxes);
    const folderMap = new Map(folderMappings.map((m) => [m.sourcePath, m]));

    let checkpoint = options.resumeFromCheckpoint
      ? await this.checkpointStore.load(options.resumeFromCheckpoint)
      : null;

    const folderOffsets: Record<string, number> = checkpoint?.folderOffsets ?? {};
    const processedIds = checkpoint
      ? new Set(checkpoint.processedMessageIds)
      : new Set<string>();

    this.updateStatus("importing");

    const filteredMailboxes = options.selectedMailboxes
      ? mailboxes.filter((m) => options.selectedMailboxes?.includes(m.path))
      : mailboxes;

    for (const mailbox of filteredMailboxes) {
      if (this.cancelRequested || this.pauseRequested) break;
      if (!this.shouldImportFolder(mailbox, options)) continue;

      const folderMapping = folderMap.get(mailbox.path);
      if (!folderMapping || folderMapping.action === "skip") continue;

      const selected = await connection.selectMailbox(mailbox.path);
      const totalInMailbox = selected.exists;
      let offset = folderOffsets[mailbox.path] ?? 0;

      this.progress.totalMessages += totalInMailbox;

      while (offset < totalInMailbox && !this.cancelRequested && !this.pauseRequested) {
        const end = Math.min(offset + options.batchSize, totalInMailbox);
        const messages = await connection.fetchMessages(
          offset + 1,
          end,
          options.fetchBodies ? ["FLAGS", "INTERNALDATE", "RFC822"] : ["FLAGS", "INTERNALDATE", "RFC822.SIZE"],
        );

        for (const msg of messages) {
          const externalId = `imap:${mailbox.path}:${msg.uid}`;
          if (processedIds.has(externalId)) continue;

          try {
            if (options.skipDuplicates && msg.raw.byteLength > 0) {
              const msgId = this.extractMessageIdFromRaw(msg.raw);
              if (msgId) {
                const exists = await this.messageStore.messageExistsByMessageId(this.accountId, msgId);
                if (exists) {
                  this.progress.skippedMessages += 1;
                  processedIds.add(externalId);
                  this.updateProgress();
                  continue;
                }
              }
            }

            const flags = new Set(msg.flags);

            if (!options.dryRun && msg.raw.byteLength > 0) {
              await this.messageStore.storeMessage(
                this.accountId,
                folderMapping.targetMailboxId,
                msg.raw,
                [],
                flags,
              );
            }

            processedIds.add(externalId);
            this.progress.processedMessages += 1;
            this.progress.processedSizeBytes += msg.size;
            this.updateProgress();
          } catch (error) {
            this.recordError(externalId, error);
          }
        }

        offset = end;
        folderOffsets[mailbox.path] = offset;

        await this.saveCheckpoint({
          jobId: this.progress.jobId,
          provider: "imap",
          lastProcessedId: `${mailbox.path}:${offset}`,
          lastProcessedTimestamp: new Date(),
          folderOffsets,
          processedMessageIds: processedIds,
          createdAt: new Date(),
        });
      }
    }

    await connection.logout();
    await connection.disconnect();

    return this.finalize();
  }

  // ── Raw MBOX Import ─────────────────────────────────────

  async importFromMbox(
    filePath: string,
    userOptions: MboxImportOptions,
  ): Promise<MigrationSummary> {
    this.resetState("mbox");
    this.updateStatus("discovering");

    const stat = await this.fileReader.stat(filePath);
    if (!stat.exists) {
      throw new Error(`MBOX file not found: ${filePath}`);
    }

    this.progress.totalSizeBytes = stat.size;

    this.updateStatus("importing");

    const stream = this.fileReader.createReadStream(filePath);
    let buffer = new Uint8Array(0);
    let messageCount = 0;
    const mboxSeparator = new TextEncoder().encode("From ");
    const processedIds = new Set<string>();

    for await (const chunk of stream) {
      if (this.cancelRequested || this.pauseRequested) break;

      buffer = this.concatUint8Arrays(buffer, chunk);
      this.progress.processedSizeBytes += chunk.byteLength;

      const messages = this.splitMboxBuffer(buffer, mboxSeparator);
      buffer = messages.remainder;

      for (const rawMessage of messages.complete) {
        messageCount += 1;

        try {
          if (userOptions.skipDuplicates) {
            const msgId = this.extractMessageIdFromRaw(rawMessage);
            if (msgId) {
              const exists = await this.messageStore.messageExistsByMessageId(this.accountId, msgId);
              if (exists) {
                this.progress.skippedMessages += 1;
                this.updateProgress();
                continue;
              }
            }
          }

          if (!userOptions.dryRun) {
            await this.messageStore.storeMessage(
              this.accountId,
              userOptions.targetMailboxId,
              rawMessage,
              userOptions.targetLabelIds ?? [],
              new Set<string>(),
            );
          }

          this.progress.processedMessages += 1;
          this.updateProgress();
        } catch (error) {
          this.recordError(`mbox:msg:${messageCount}`, error);
        }

        if (messageCount % userOptions.batchSize === 0) {
          await this.saveCheckpoint({
            jobId: this.progress.jobId,
            provider: "mbox",
            lastProcessedId: `offset:${this.progress.processedSizeBytes}`,
            lastProcessedTimestamp: new Date(),
            folderOffsets: { default: this.progress.processedSizeBytes },
            processedMessageIds: processedIds,
            createdAt: new Date(),
          });
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.byteLength > 0 && !this.cancelRequested) {
      try {
        if (!userOptions.dryRun) {
          await this.messageStore.storeMessage(
            this.accountId,
            userOptions.targetMailboxId,
            buffer,
            userOptions.targetLabelIds ?? [],
            new Set<string>(),
          );
        }
        this.progress.processedMessages += 1;
      } catch (error) {
        this.recordError(`mbox:msg:final`, error);
      }
    }

    this.progress.totalMessages = messageCount;
    return this.finalize();
  }

  // ── Helpers ─────────────────────────────────────────────

  private resetState(provider: MigrationProvider): void {
    this.cancelRequested = false;
    this.pauseRequested = false;
    this.progress = this.createInitialProgress(provider);
  }

  private createInitialProgress(provider: MigrationProvider): MigrationProgress {
    return {
      jobId: `mig_${crypto.randomUUID().replace(/-/g, "").substring(0, 20)}`,
      provider,
      status: "pending",
      totalMessages: 0,
      processedMessages: 0,
      skippedMessages: 0,
      failedMessages: 0,
      totalAttachments: 0,
      processedAttachments: 0,
      totalSizeBytes: 0,
      processedSizeBytes: 0,
      percentComplete: 0,
      currentPhase: "initializing",
      startedAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      estimatedTimeRemainingMs: null,
      errors: [],
      warnings: [],
    };
  }

  private updateStatus(status: MigrationStatus): void {
    this.progress.status = status;
    this.progress.currentPhase = status;
    this.progress.updatedAt = new Date();
    this.emitProgress();
  }

  private updateProgress(): void {
    const total = this.progress.totalMessages;
    const processed = this.progress.processedMessages + this.progress.skippedMessages + this.progress.failedMessages;

    this.progress.percentComplete = total > 0 ? Math.min(Math.round((processed / total) * 100), 100) : 0;
    this.progress.updatedAt = new Date();

    if (processed > 0 && total > processed) {
      const elapsedMs = this.progress.updatedAt.getTime() - this.progress.startedAt.getTime();
      const msPerMessage = elapsedMs / processed;
      this.progress.estimatedTimeRemainingMs = Math.round(msPerMessage * (total - processed));
    }

    this.emitProgress();
  }

  private emitProgress(): void {
    if (this.onProgressCallback) {
      this.onProgressCallback({ ...this.progress });
    }
  }

  private async saveCheckpoint(checkpoint: MigrationCheckpoint): Promise<void> {
    await this.checkpointStore.save(checkpoint);
  }

  private finalize(): MigrationSummary {
    const finalStatus: MigrationStatus = this.cancelRequested
      ? "cancelled"
      : this.pauseRequested
        ? "paused"
        : this.progress.failedMessages > 0 && this.progress.processedMessages === 0
          ? "failed"
          : "completed";

    this.progress.status = finalStatus;
    this.progress.completedAt = new Date();
    this.progress.percentComplete = finalStatus === "completed" ? 100 : this.progress.percentComplete;
    this.emitProgress();

    return {
      jobId: this.progress.jobId,
      provider: this.progress.provider,
      totalImported: this.progress.processedMessages,
      totalSkipped: this.progress.skippedMessages,
      totalFailed: this.progress.failedMessages,
      totalAttachments: this.progress.processedAttachments,
      totalSizeBytes: this.progress.processedSizeBytes,
      durationMs: (this.progress.completedAt?.getTime() ?? Date.now()) - this.progress.startedAt.getTime(),
      labelsMapped: 0,
      duplicatesFound: this.progress.skippedMessages,
      errors: [...this.progress.errors],
      warnings: [...this.progress.warnings],
      startedAt: this.progress.startedAt,
      completedAt: this.progress.completedAt ?? new Date(),
    };
  }

  private recordError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.progress.failedMessages += 1;
    this.progress.errors.push({
      code: "IMPORT_ERROR",
      message: `[${context}] ${message}`,
      messageId: context,
      timestamp: new Date(),
      retryable: true,
    });
    this.updateProgress();
  }

  private recordWarning(context: string, message: string): void {
    this.progress.warnings.push({
      code: "IMPORT_WARNING",
      message: `[${context}] ${message}`,
      messageId: context,
      timestamp: new Date(),
    });
  }

  private buildGmailQuery(options: GmailImportOptions): string {
    const parts: string[] = [];
    if (!options.includeSpam) parts.push("-in:spam");
    if (!options.includeTrash) parts.push("-in:trash");
    if (options.startDate) parts.push(`after:${this.formatGmailDate(options.startDate)}`);
    if (options.endDate) parts.push(`before:${this.formatGmailDate(options.endDate)}`);
    if (options.labelFilter && options.labelFilter.length > 0) {
      parts.push(options.labelFilter.map((l) => `label:${l}`).join(" OR "));
    }
    return parts.join(" ");
  }

  private formatGmailDate(date: Date): string {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  private extractGmailHeader(message: GmailMessage, headerName: string): string | undefined {
    return message.payload.headers.find(
      (h) => h.name.toLowerCase() === headerName.toLowerCase(),
    )?.value;
  }

  private resolveGmailLabels(
    labelIds: string[],
    labelMap: Map<string, LabelMapping>,
  ): string[] {
    const resolved: string[] = [];
    for (const id of labelIds) {
      const mapping = labelMap.get(id);
      if (mapping && mapping.action !== "skip") {
        resolved.push(mapping.targetId);
      }
    }
    return resolved;
  }

  private resolveGmailFlags(message: GmailMessage, options: GmailImportOptions): Set<string> {
    const flags = new Set<string>();
    if (options.preserveReadStatus && !message.labelIds.includes("UNREAD")) {
      flags.add("\\Seen");
    }
    if (options.includeStars && message.labelIds.includes("STARRED")) {
      flags.add("\\Flagged");
    }
    if (message.labelIds.includes("DRAFT")) {
      flags.add("\\Draft");
    }
    return flags;
  }

  private resolveOutlookLabels(
    categories: string[],
    categoryMap: Map<string, LabelMapping>,
  ): string[] {
    const resolved: string[] = [];
    for (const cat of categories) {
      const mapping = categoryMap.get(cat);
      if (mapping && mapping.action !== "skip") {
        resolved.push(mapping.targetId);
      }
    }
    return resolved;
  }

  private resolveTargetMailbox(labels: string[]): string {
    return labels[0] ?? "inbox";
  }

  private shouldImportFolder(folder: SourceMailbox, options: MigrationOptions): boolean {
    if (folder.specialUse === "spam" && !options.includeSpam) return false;
    if (folder.specialUse === "trash" && !options.includeTrash) return false;
    if (folder.specialUse === "drafts" && !options.includeDrafts) return false;
    if (folder.specialUse === "sent" && !options.includeSent) return false;
    if (options.folderFilter && options.folderFilter.length > 0) {
      return options.folderFilter.includes(folder.path);
    }
    return true;
  }

  private extractMessageIdFromRaw(raw: Uint8Array): string | null {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const headerSection = decoder.decode(raw.slice(0, Math.min(raw.byteLength, 8192)));
    const match = headerSection.match(/^Message-ID:\s*(.+)$/im);
    return match?.[1]?.trim() ?? null;
  }

  private decodeBase64Url(encoded: string): Uint8Array {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.byteLength + b.byteLength);
    result.set(a, 0);
    result.set(b, a.byteLength);
    return result;
  }

  private splitMboxBuffer(
    buffer: Uint8Array,
    separator: Uint8Array,
  ): { complete: Uint8Array[]; remainder: Uint8Array } {
    const complete: Uint8Array[] = [];
    let searchStart = 0;
    let lastSplit = 0;

    const decoder = new TextDecoder("utf-8", { fatal: false });

    while (searchStart < buffer.byteLength - separator.byteLength) {
      let found = false;

      if (searchStart === 0 || buffer[searchStart - 1] === 0x0a) {
        let match = true;
        for (let j = 0; j < separator.byteLength; j++) {
          if (buffer[searchStart + j] !== separator[j]) {
            match = false;
            break;
          }
        }
        if (match && searchStart > lastSplit) {
          complete.push(buffer.slice(lastSplit, searchStart));
          lastSplit = searchStart;
          found = true;
        }
      }

      searchStart += 1;
    }

    return {
      complete,
      remainder: buffer.slice(lastSplit),
    };
  }
}
