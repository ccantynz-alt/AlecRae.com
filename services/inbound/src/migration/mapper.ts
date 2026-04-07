/**
 * EmailDataMapper — Maps data structures from external providers
 * to Emailed's internal format. Handles label/folder mapping,
 * contact deduplication, and attachment handling.
 */

import type {
  LabelMapping,
  FolderMapping,
  SourceLabel,
  SourceMailbox,
  SourceContact,
  AttachmentReference,
  MigrationProvider,
} from "./types";

interface ViennaLabel {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly system: boolean;
}

interface ViennaMailbox {
  readonly id: string;
  readonly name: string;
  readonly role: string | null;
}

interface MergedContact {
  readonly primaryEmail: string;
  readonly aliases: string[];
  readonly name: string;
  readonly frequency: number;
  readonly lastContacted: Date | null;
}

interface AttachmentUploadResult {
  readonly storageKey: string;
  readonly url: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

interface StorageClient {
  upload(key: string, data: Uint8Array, contentType: string): Promise<AttachmentUploadResult>;
  exists(key: string): Promise<boolean>;
}

interface HttpClient {
  get(url: string, headers?: Record<string, string>): Promise<{ data: Uint8Array; status: number }>;
}

const GMAIL_SYSTEM_LABELS: Record<string, string> = {
  INBOX: "Inbox",
  SENT: "Sent",
  DRAFT: "Drafts",
  TRASH: "Trash",
  SPAM: "Spam",
  STARRED: "Starred",
  IMPORTANT: "Important",
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
  UNREAD: "Unread",
};

const OUTLOOK_CATEGORY_COLORS: Record<string, string> = {
  Red: "#ef4444",
  Orange: "#f59e0b",
  Yellow: "#eab308",
  Green: "#10b981",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
};

const VIENNA_DEFAULT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
];

export class EmailDataMapper {
  private readonly viennaLabels: Map<string, ViennaLabel>;
  private readonly viennaMailboxes: Map<string, ViennaMailbox>;
  private readonly storageClient: StorageClient;
  private readonly httpClient: HttpClient;
  private readonly accountId: string;
  private colorIndex: number;

  constructor(
    accountId: string,
    existingLabels: ViennaLabel[],
    existingMailboxes: ViennaMailbox[],
    storageClient: StorageClient,
    httpClient: HttpClient,
  ) {
    this.accountId = accountId;
    this.viennaLabels = new Map(existingLabels.map((l) => [l.name.toLowerCase(), l]));
    this.viennaMailboxes = new Map(existingMailboxes.map((m) => [m.role ?? m.name.toLowerCase(), m]));
    this.storageClient = storageClient;
    this.httpClient = httpClient;
    this.colorIndex = 0;
  }

  /**
   * Maps Gmail labels to Vienna labels. System labels are mapped to
   * their Vienna equivalents. User labels are created or matched by name.
   */
  mapGmailLabels(gmailLabels: SourceLabel[]): LabelMapping[] {
    const mappings: LabelMapping[] = [];

    for (const label of gmailLabels) {
      const systemName = GMAIL_SYSTEM_LABELS[label.id];

      if (systemName !== undefined) {
        const existing = this.findViennaLabelByName(systemName);
        if (existing) {
          mappings.push({
            sourceId: label.id,
            sourceName: label.name,
            targetId: existing.id,
            targetName: existing.name,
            action: "map",
          });
        } else {
          mappings.push({
            sourceId: label.id,
            sourceName: label.name,
            targetId: this.generateLabelId(),
            targetName: systemName,
            action: "create",
          });
        }
        continue;
      }

      if (label.type === "user") {
        const normalizedName = this.normalizeGmailLabelName(label.name);
        const existing = this.findViennaLabelByName(normalizedName);

        if (existing) {
          mappings.push({
            sourceId: label.id,
            sourceName: label.name,
            targetId: existing.id,
            targetName: existing.name,
            action: "map",
          });
        } else {
          mappings.push({
            sourceId: label.id,
            sourceName: label.name,
            targetId: this.generateLabelId(),
            targetName: normalizedName,
            action: "create",
          });
        }
      }
    }

    return mappings;
  }

  /**
   * Maps Outlook categories to Vienna labels. Colors are preserved
   * where possible.
   */
  mapOutlookCategories(categories: SourceLabel[]): LabelMapping[] {
    const mappings: LabelMapping[] = [];

    for (const category of categories) {
      const normalizedName = category.name.trim();
      const existing = this.findViennaLabelByName(normalizedName);

      if (existing) {
        mappings.push({
          sourceId: category.id,
          sourceName: category.name,
          targetId: existing.id,
          targetName: existing.name,
          action: "map",
        });
      } else {
        const color = category.color
          ? (OUTLOOK_CATEGORY_COLORS[category.color] ?? this.nextColor())
          : this.nextColor();

        mappings.push({
          sourceId: category.id,
          sourceName: category.name,
          targetId: this.generateLabelId(),
          targetName: normalizedName,
          action: "create",
        });
      }
    }

    return mappings;
  }

  /**
   * Maps source folder structures (IMAP, Outlook, Apple Mail) to
   * Vienna mailboxes. Special-use folders are mapped to their
   * Vienna counterparts.
   */
  mapFolderStructure(sourceFolders: SourceMailbox[]): FolderMapping[] {
    const mappings: FolderMapping[] = [];

    for (const folder of sourceFolders) {
      if (folder.specialUse) {
        const viennaMailbox = this.findViennaMailboxByRole(folder.specialUse);
        if (viennaMailbox) {
          mappings.push({
            sourcePath: folder.path,
            targetMailboxId: viennaMailbox.id,
            targetMailboxName: viennaMailbox.name,
            action: "map",
          });
          continue;
        }
      }

      const existingByName = this.findViennaMailboxByName(folder.name);
      if (existingByName) {
        mappings.push({
          sourcePath: folder.path,
          targetMailboxId: existingByName.id,
          targetMailboxName: existingByName.name,
          action: "merge",
        });
      } else {
        const newId = this.generateMailboxId();
        mappings.push({
          sourcePath: folder.path,
          targetMailboxId: newId,
          targetMailboxName: this.sanitizeFolderName(folder.name),
          action: "create",
        });
      }
    }

    return mappings;
  }

  /**
   * Deduplicates and merges contacts from an external provider
   * with existing contacts. Uses email normalization and name
   * matching heuristics.
   */
  deduplicateContacts(sourceContacts: SourceContact[]): MergedContact[] {
    const contactMap = new Map<string, MergedContact>();

    for (const contact of sourceContacts) {
      const normalizedEmail = this.normalizeEmail(contact.email);
      const existing = contactMap.get(normalizedEmail);

      if (existing) {
        const mergedName = this.pickBestName(existing.name, contact.name);
        const aliases = new Set([...existing.aliases, contact.email]);
        aliases.delete(existing.primaryEmail);

        contactMap.set(normalizedEmail, {
          primaryEmail: existing.primaryEmail,
          aliases: Array.from(aliases),
          name: mergedName,
          frequency: existing.frequency + contact.frequency,
          lastContacted: this.latestDate(existing.lastContacted, contact.lastContacted ?? null),
        });
      } else {
        contactMap.set(normalizedEmail, {
          primaryEmail: contact.email,
          aliases: [],
          name: contact.name ?? "",
          frequency: contact.frequency,
          lastContacted: contact.lastContacted ?? null,
        });
      }
    }

    return Array.from(contactMap.values()).sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Downloads an attachment from a remote URL and uploads it to
   * Vienna's object storage. Returns an updated reference with
   * the storage key.
   */
  async handleAttachment(
    ref: AttachmentReference,
    authHeaders: Record<string, string>,
  ): Promise<AttachmentReference> {
    if (ref.uploaded && ref.storageKey) {
      return ref;
    }

    if (!ref.downloadUrl) {
      return { ...ref, uploaded: false };
    }

    const storageKey = this.buildAttachmentStorageKey(ref);

    const alreadyExists = await this.storageClient.exists(storageKey);
    if (alreadyExists) {
      return { ...ref, storageKey, uploaded: true };
    }

    const response = await this.httpClient.get(ref.downloadUrl, authHeaders);
    if (response.status !== 200) {
      return { ...ref, uploaded: false };
    }

    await this.storageClient.upload(storageKey, response.data, ref.contentType);

    return {
      ...ref,
      storageKey,
      uploaded: true,
    };
  }

  /**
   * Processes a batch of attachment references, downloading and
   * uploading them with concurrency control.
   */
  async handleAttachmentBatch(
    refs: AttachmentReference[],
    authHeaders: Record<string, string>,
    maxConcurrency: number,
  ): Promise<AttachmentReference[]> {
    const results: AttachmentReference[] = [];
    const pending: Promise<void>[] = [];

    for (const ref of refs) {
      const task = this.handleAttachment(ref, authHeaders).then((result) => {
        results.push(result);
      });

      pending.push(task);

      if (pending.length >= maxConcurrency) {
        await Promise.race(pending);
        const resolvedIndices: number[] = [];
        for (let i = 0; i < pending.length; i++) {
          const settled = await Promise.race([
            pending[i]?.then(() => true),
            Promise.resolve(false),
          ]);
          if (settled) {
            resolvedIndices.push(i);
          }
        }
        for (const idx of resolvedIndices.reverse()) {
          pending.splice(idx, 1);
        }
      }
    }

    await Promise.all(pending);
    return results;
  }

  private findViennaLabelByName(name: string): ViennaLabel | undefined {
    return this.viennaLabels.get(name.toLowerCase());
  }

  private findViennaMailboxByRole(role: string): ViennaMailbox | undefined {
    return this.viennaMailboxes.get(role);
  }

  private findViennaMailboxByName(name: string): ViennaMailbox | undefined {
    for (const [, mailbox] of this.viennaMailboxes) {
      if (mailbox.name.toLowerCase() === name.toLowerCase()) {
        return mailbox;
      }
    }
    return undefined;
  }

  private normalizeGmailLabelName(name: string): string {
    return name
      .replace(/^CATEGORY_/, "")
      .replace(/\//g, " / ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[^\w\s\-./]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeEmail(email: string): string {
    const parts = email.toLowerCase().trim().split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return email.toLowerCase().trim();
    }

    let local = parts[0];
    const domain = parts[1];

    if (domain === "gmail.com" || domain === "googlemail.com") {
      local = local.replace(/\./g, "");
      const plusIndex = local.indexOf("+");
      if (plusIndex !== -1) {
        local = local.substring(0, plusIndex);
      }
      return `${local}@gmail.com`;
    }

    return `${local}@${domain}`;
  }

  private pickBestName(existingName: string, newName: string | undefined): string {
    if (!newName || newName.trim().length === 0) {
      return existingName;
    }
    if (existingName.trim().length === 0) {
      return newName.trim();
    }
    return newName.trim().length > existingName.trim().length ? newName.trim() : existingName;
  }

  private latestDate(a: Date | null, b: Date | null): Date | null {
    if (!a) return b;
    if (!b) return a;
    return a.getTime() > b.getTime() ? a : b;
  }

  private buildAttachmentStorageKey(ref: AttachmentReference): string {
    const safeFilename = ref.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `migrations/${this.accountId}/${ref.messageExternalId}/${safeFilename}`;
  }

  private generateLabelId(): string {
    return `lbl_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
  }

  private generateMailboxId(): string {
    return `mbx_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
  }

  private nextColor(): string {
    const color = VIENNA_DEFAULT_COLORS[this.colorIndex % VIENNA_DEFAULT_COLORS.length];
    this.colorIndex += 1;
    return color ?? VIENNA_DEFAULT_COLORS[0] ?? "#6366f1";
  }
}
