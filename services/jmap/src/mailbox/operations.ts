import type {
  JmapId,
  Mailbox,
  MailboxRole,
  MailboxRights,
  GetArgs,
  GetResponse,
  ChangesArgs,
  ChangesResponse,
  SetArgs,
  SetResponse,
  QueryArgs,
  QueryResponse,
  JmapSetError,
} from "../types.js";

// --- Mailbox Store ---

interface MailboxChange {
  state: string;
  type: "create" | "update" | "destroy";
  mailboxId: JmapId;
}

const DEFAULT_RIGHTS: MailboxRights = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
};

function generateId(): JmapId {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class MailboxOperations {
  private mailboxes = new Map<string, Map<JmapId, Mailbox>>(); // accountId -> mailboxes
  private changes = new Map<string, MailboxChange[]>(); // accountId -> changes
  private stateCounter = new Map<string, number>(); // accountId -> counter

  /**
   * Initialize default mailboxes for an account.
   */
  initAccount(accountId: JmapId): void {
    if (this.mailboxes.has(accountId)) return;

    const defaultMailboxes: { name: string; role: MailboxRole; sortOrder: number }[] = [
      { name: "Inbox", role: "inbox", sortOrder: 1 },
      { name: "Drafts", role: "drafts", sortOrder: 2 },
      { name: "Sent", role: "sent", sortOrder: 3 },
      { name: "Junk", role: "junk", sortOrder: 4 },
      { name: "Trash", role: "trash", sortOrder: 5 },
      { name: "Archive", role: "archive", sortOrder: 6 },
    ];

    const store = new Map<JmapId, Mailbox>();
    for (const def of defaultMailboxes) {
      const id = generateId();
      store.set(id, {
        id,
        name: def.name,
        parentId: null,
        role: def.role,
        sortOrder: def.sortOrder,
        totalEmails: 0,
        unreadEmails: 0,
        totalThreads: 0,
        unreadThreads: 0,
        myRights: { ...DEFAULT_RIGHTS, mayRename: false, mayDelete: false },
        isSubscribed: true,
      });
    }

    this.mailboxes.set(accountId, store);
    this.stateCounter.set(accountId, 0);
    this.changes.set(accountId, []);
  }

  private getState(accountId: JmapId): string {
    return String(this.stateCounter.get(accountId) ?? 0);
  }

  private advanceState(accountId: JmapId): string {
    const current = this.stateCounter.get(accountId) ?? 0;
    const next = current + 1;
    this.stateCounter.set(accountId, next);
    return String(next);
  }

  private recordChange(accountId: JmapId, type: MailboxChange["type"], mailboxId: JmapId): void {
    const state = this.getState(accountId);
    const accountChanges = this.changes.get(accountId) ?? [];
    accountChanges.push({ state, type, mailboxId });
    this.changes.set(accountId, accountChanges);
  }

  private getStore(accountId: JmapId): Map<JmapId, Mailbox> {
    this.initAccount(accountId);
    const store = this.mailboxes.get(accountId);
    if (!store) {
      throw new Error(`Mailbox store missing for account ${accountId}`);
    }
    return store;
  }

  // --- Mailbox/get (RFC 8621 Section 2.5) ---

  async get(args: GetArgs): Promise<GetResponse<Mailbox>> {
    const store = this.getStore(args.accountId);
    const list: Mailbox[] = [];
    const notFound: JmapId[] = [];

    if (args.ids === null) {
      // Return all mailboxes
      for (const mailbox of store.values()) {
        list.push(this.filterProperties(mailbox, args.properties));
      }
    } else {
      for (const id of args.ids) {
        const mailbox = store.get(id);
        if (mailbox) {
          list.push(this.filterProperties(mailbox, args.properties));
        } else {
          notFound.push(id);
        }
      }
    }

    return {
      accountId: args.accountId,
      state: this.getState(args.accountId),
      list,
      notFound,
    };
  }

  // --- Mailbox/changes (RFC 8621 Section 2.6) ---

  async getChanges(args: ChangesArgs): Promise<ChangesResponse> {
    const accountChanges = this.changes.get(args.accountId) ?? [];
    const sinceState = parseInt(args.sinceState, 10);
    const currentState = this.getState(args.accountId);

    if (isNaN(sinceState) || sinceState < 0) {
      throw new Error("cannotCalculateChanges");
    }

    const relevantChanges = accountChanges.filter(
      (c) => parseInt(c.state, 10) >= sinceState,
    );

    const maxChanges = args.maxChanges ?? relevantChanges.length;
    const limited = relevantChanges.slice(0, maxChanges);

    const created = new Set<JmapId>();
    const updated = new Set<JmapId>();
    const destroyed = new Set<JmapId>();

    for (const change of limited) {
      switch (change.type) {
        case "create":
          created.add(change.mailboxId);
          break;
        case "update":
          if (!created.has(change.mailboxId)) {
            updated.add(change.mailboxId);
          }
          break;
        case "destroy":
          if (created.has(change.mailboxId)) {
            created.delete(change.mailboxId);
          } else {
            updated.delete(change.mailboxId);
            destroyed.add(change.mailboxId);
          }
          break;
      }
    }

    return {
      accountId: args.accountId,
      oldState: args.sinceState,
      newState: currentState,
      hasMoreChanges: relevantChanges.length > maxChanges,
      created: [...created],
      updated: [...updated],
      destroyed: [...destroyed],
    };
  }

  // --- Mailbox/set (RFC 8621 Section 2.7) ---

  async set(args: SetArgs<Mailbox>): Promise<SetResponse<Mailbox>> {
    const store = this.getStore(args.accountId);
    const oldState = this.getState(args.accountId);

    // Check state consistency
    if (args.ifInState && args.ifInState !== oldState) {
      return {
        accountId: args.accountId,
        oldState,
        newState: oldState,
        ...(args.create
          ? {
              notCreated: Object.fromEntries(
                Object.keys(args.create).map((k) => [k, { type: "stateMismatch" }]),
              ),
            }
          : {}),
      };
    }

    const created: Record<JmapId, Mailbox> = {};
    const updated: Record<JmapId, Mailbox | null> = {};
    const destroyedIds: JmapId[] = [];
    const notCreated: Record<JmapId, JmapSetError> = {};
    const notUpdated: Record<JmapId, JmapSetError> = {};
    const notDestroyed: Record<JmapId, JmapSetError> = {};

    // Process creates
    if (args.create) {
      for (const [clientId, data] of Object.entries(args.create)) {
        const error = this.validateCreate(data, store);
        if (error) {
          notCreated[clientId] = error;
          continue;
        }

        const id = generateId();
        const mailbox: Mailbox = {
          id,
          name: data.name ?? "Untitled",
          parentId: data.parentId ?? null,
          role: data.role ?? null,
          sortOrder: data.sortOrder ?? 10,
          totalEmails: 0,
          unreadEmails: 0,
          totalThreads: 0,
          unreadThreads: 0,
          myRights: { ...DEFAULT_RIGHTS },
          isSubscribed: data.isSubscribed ?? true,
        };

        store.set(id, mailbox);
        created[clientId] = mailbox;
        this.recordChange(args.accountId, "create", id);
      }
    }

    // Process updates
    if (args.update) {
      for (const [id, patch] of Object.entries(args.update)) {
        const existing = store.get(id);
        if (!existing) {
          notUpdated[id] = { type: "notFound" };
          continue;
        }

        const error = this.validateUpdate(patch, existing, store);
        if (error) {
          notUpdated[id] = error;
          continue;
        }

        if (patch.name !== undefined) existing.name = patch.name;
        if (patch.parentId !== undefined) existing.parentId = patch.parentId;
        if (patch.sortOrder !== undefined) existing.sortOrder = patch.sortOrder;
        if (patch.isSubscribed !== undefined) existing.isSubscribed = patch.isSubscribed;

        updated[id] = null; // null means "updated but no server-set properties changed"
        this.recordChange(args.accountId, "update", id);
      }
    }

    // Process destroys
    if (args.destroy) {
      for (const id of args.destroy) {
        const existing = store.get(id);
        if (!existing) {
          notDestroyed[id] = { type: "notFound" };
          continue;
        }

        if (existing.role) {
          notDestroyed[id] = {
            type: "forbidden",
            description: `Cannot delete system mailbox with role '${existing.role}'`,
          };
          continue;
        }

        // Check for children
        const hasChildren = [...store.values()].some((m) => m.parentId === id);
        if (hasChildren) {
          notDestroyed[id] = {
            type: "mailboxHasChild",
            description: "Mailbox has child mailboxes",
          };
          continue;
        }

        if (existing.totalEmails > 0) {
          notDestroyed[id] = {
            type: "mailboxHasEmail",
            description: "Mailbox still contains emails",
          };
          continue;
        }

        store.delete(id);
        destroyedIds.push(id);
        this.recordChange(args.accountId, "destroy", id);
      }
    }

    const newState = this.advanceState(args.accountId);

    return {
      accountId: args.accountId,
      oldState,
      newState,
      ...(Object.keys(created).length > 0 ? { created } : {}),
      ...(Object.keys(updated).length > 0 ? { updated } : {}),
      ...(destroyedIds.length > 0 ? { destroyed: destroyedIds } : {}),
      ...(Object.keys(notCreated).length > 0 ? { notCreated } : {}),
      ...(Object.keys(notUpdated).length > 0 ? { notUpdated } : {}),
      ...(Object.keys(notDestroyed).length > 0 ? { notDestroyed } : {}),
    };
  }

  // --- Mailbox/query (RFC 8621 Section 2.8) ---

  async query(args: QueryArgs): Promise<QueryResponse> {
    const store = this.getStore(args.accountId);
    let mailboxes = [...store.values()];

    // Apply filters
    if (args.filter) {
      const filter = args.filter;
      if (filter["parentId"] !== undefined) {
        mailboxes = mailboxes.filter((m) => m.parentId === filter["parentId"]);
      }
      if (filter["role"] !== undefined) {
        mailboxes = mailboxes.filter((m) => m.role === filter["role"]);
      }
      if (filter["hasAnyRole"] !== undefined) {
        const hasRole = filter["hasAnyRole"] as boolean;
        mailboxes = mailboxes.filter((m) => hasRole ? m.role !== null : m.role === null);
      }
      if (filter["name"] !== undefined) {
        const name = (filter["name"] as string).toLowerCase();
        mailboxes = mailboxes.filter((m) => m.name.toLowerCase().includes(name));
      }
    }

    // Apply sort
    const comparator = args.sort?.[0];
    if (comparator) {
      const prop = comparator.property as keyof Mailbox;
      const asc = comparator.isAscending !== false;

      mailboxes.sort((a, b) => {
        const aVal = a[prop];
        const bVal = b[prop];
        if (typeof aVal === "string" && typeof bVal === "string") {
          return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        if (typeof aVal === "number" && typeof bVal === "number") {
          return asc ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
    } else {
      // Default sort: by sortOrder
      mailboxes.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const total = mailboxes.length;

    // Apply position/limit
    const position = args.position ?? 0;
    const limit = args.limit ?? total;
    const slice = mailboxes.slice(position, position + limit);

    return {
      accountId: args.accountId,
      queryState: this.getState(args.accountId),
      canCalculateChanges: true,
      position,
      ids: slice.map((m) => m.id),
      ...(args.calculateTotal ? { total } : {}),
    };
  }

  // --- Helpers ---

  private filterProperties(mailbox: Mailbox, properties?: string[]): Mailbox {
    if (!properties) return mailbox;

    const filtered: Record<string, unknown> = { id: mailbox.id };
    for (const prop of properties) {
      if (prop in mailbox) {
        filtered[prop] = mailbox[prop as keyof Mailbox];
      }
    }
    return filtered as unknown as Mailbox;
  }

  private validateCreate(data: Partial<Mailbox>, store: Map<JmapId, Mailbox>): JmapSetError | null {
    if (!data.name || data.name.trim().length === 0) {
      return { type: "invalidProperties", description: "Mailbox name is required", properties: ["name"] };
    }

    if (data.name.length > 255) {
      return { type: "invalidProperties", description: "Mailbox name too long", properties: ["name"] };
    }

    // Check for duplicate name at the same level
    for (const existing of store.values()) {
      if (existing.name === data.name && existing.parentId === (data.parentId ?? null)) {
        return { type: "invalidProperties", description: "Mailbox with this name already exists at this level", properties: ["name"] };
      }
    }

    // Validate parent exists
    if (data.parentId && !store.has(data.parentId)) {
      return { type: "notFound", description: "Parent mailbox not found", properties: ["parentId"] };
    }

    // Cannot create with system role
    if (data.role) {
      const existing = [...store.values()].find((m) => m.role === data.role);
      if (existing) {
        return { type: "invalidProperties", description: `Role '${data.role}' already assigned`, properties: ["role"] };
      }
    }

    return null;
  }

  private validateUpdate(
    patch: Partial<Mailbox>,
    existing: Mailbox,
    store: Map<JmapId, Mailbox>,
  ): JmapSetError | null {
    if (patch.role !== undefined && existing.role) {
      return { type: "invalidProperties", description: "Cannot change role of system mailbox", properties: ["role"] };
    }

    if (patch.name !== undefined) {
      if (!patch.name || patch.name.trim().length === 0) {
        return { type: "invalidProperties", description: "Mailbox name cannot be empty", properties: ["name"] };
      }

      // Check duplicate at same level
      for (const other of store.values()) {
        if (other.id !== existing.id && other.name === patch.name && other.parentId === existing.parentId) {
          return { type: "invalidProperties", description: "Name already taken at this level", properties: ["name"] };
        }
      }
    }

    if (patch.parentId !== undefined) {
      // Prevent circular references
      if (patch.parentId === existing.id) {
        return { type: "invalidProperties", description: "Cannot make mailbox its own parent", properties: ["parentId"] };
      }

      if (patch.parentId && !store.has(patch.parentId)) {
        return { type: "notFound", description: "Parent mailbox not found", properties: ["parentId"] };
      }
    }

    return null;
  }

  /**
   * Get a mailbox by its role.
   */
  getByRole(accountId: JmapId, role: MailboxRole): Mailbox | undefined {
    const store = this.getStore(accountId);
    for (const mailbox of store.values()) {
      if (mailbox.role === role) return mailbox;
    }
    return undefined;
  }

  /**
   * Update email counts for a mailbox.
   */
  updateCounts(
    accountId: JmapId,
    mailboxId: JmapId,
    delta: { totalEmails?: number; unreadEmails?: number; totalThreads?: number; unreadThreads?: number },
  ): void {
    const store = this.getStore(accountId);
    const mailbox = store.get(mailboxId);
    if (!mailbox) return;

    if (delta.totalEmails !== undefined) mailbox.totalEmails += delta.totalEmails;
    if (delta.unreadEmails !== undefined) mailbox.unreadEmails += delta.unreadEmails;
    if (delta.totalThreads !== undefined) mailbox.totalThreads += delta.totalThreads;
    if (delta.unreadThreads !== undefined) mailbox.unreadThreads += delta.unreadThreads;

    // Clamp to 0
    mailbox.totalEmails = Math.max(0, mailbox.totalEmails);
    mailbox.unreadEmails = Math.max(0, mailbox.unreadEmails);
    mailbox.totalThreads = Math.max(0, mailbox.totalThreads);
    mailbox.unreadThreads = Math.max(0, mailbox.unreadThreads);
  }
}
