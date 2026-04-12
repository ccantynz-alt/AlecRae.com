/**
 * @emailed/support - Ticket System
 *
 * Create, update, resolve, escalate tickets.
 * Track SLA compliance. Auto-categorize incoming tickets.
 */

import type {
  Ticket,
  TicketNote,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  CreateTicketInput,
  UpdateTicketInput,
  SlaInfo,
  Result,
} from "../types";
import { ok, err, SLA_POLICIES } from "../types";

// ─── Auto-Categorization ────────────────────────────────────────────────────

interface CategorySignal {
  category: TicketCategory;
  keywords: string[];
  weight: number;
}

const CATEGORY_SIGNALS: CategorySignal[] = [
  {
    category: "delivery_issue",
    keywords: ["not delivered", "delivery failed", "not receiving", "delayed", "stuck", "queue", "deferred", "timeout", "connection refused"],
    weight: 1.0,
  },
  {
    category: "dns_configuration",
    keywords: ["dns", "spf", "dkim", "dmarc", "mx record", "cname", "txt record", "nameserver", "propagation"],
    weight: 1.0,
  },
  {
    category: "authentication_failure",
    keywords: ["authentication", "auth fail", "spf fail", "dkim fail", "dmarc fail", "not authenticated", "signing", "signature"],
    weight: 1.0,
  },
  {
    category: "reputation_problem",
    keywords: ["reputation", "blacklist", "blocklist", "spam", "junk", "blocked", "rejected", "spam folder", "inbox placement"],
    weight: 1.0,
  },
  {
    category: "bounce_issue",
    keywords: ["bounce", "bounced", "hard bounce", "soft bounce", "undeliverable", "user unknown", "mailbox full", "550", "553", "5.1.1"],
    weight: 1.0,
  },
  {
    category: "rate_limiting",
    keywords: ["rate limit", "throttle", "too many", "429", "slow down", "quota", "limit exceeded", "sending limit"],
    weight: 1.0,
  },
  {
    category: "account_access",
    keywords: ["login", "password", "access", "locked out", "can't log in", "two factor", "2fa", "api key", "reset password"],
    weight: 1.0,
  },
  {
    category: "billing",
    keywords: ["bill", "invoice", "charge", "payment", "subscription", "upgrade", "downgrade", "plan", "pricing", "refund", "cancel"],
    weight: 1.2, // Higher weight - billing should be detected confidently
  },
  {
    category: "feature_request",
    keywords: ["feature", "request", "wish", "would be nice", "suggestion", "add support for", "can you add", "roadmap"],
    weight: 0.8,
  },
  {
    category: "bug_report",
    keywords: ["bug", "broken", "error", "crash", "not working", "unexpected", "regression", "incorrect", "wrong"],
    weight: 0.9,
  },
];

/**
 * Auto-categorize a ticket based on subject and description text.
 * Uses weighted keyword matching with confidence scoring.
 */
export function autoCategorize(
  subject: string,
  description: string,
): { category: TicketCategory; confidence: number } {
  const text = `${subject} ${description}`.toLowerCase();
  const scores = new Map<TicketCategory, number>();

  for (const signal of CATEGORY_SIGNALS) {
    let matchCount = 0;
    for (const keyword of signal.keywords) {
      if (text.includes(keyword)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      const score = (matchCount / signal.keywords.length) * signal.weight;
      scores.set(
        signal.category,
        (scores.get(signal.category) ?? 0) + score,
      );
    }
  }

  if (scores.size === 0) {
    return { category: "general_inquiry", confidence: 0.3 };
  }

  // Find the highest-scoring category
  let bestCategory: TicketCategory = "general_inquiry";
  let bestScore = 0;
  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Confidence is based on the gap between best and second-best
  const sortedScores = Array.from(scores.values()).sort((a, b) => b - a);
  const first = sortedScores[0] ?? 0;
  const second = sortedScores[1] ?? 0;
  const gap = sortedScores.length > 1 && first > 0
    ? (first - second) / first
    : 1.0;

  const confidence = Math.min(1.0, bestScore * 0.5 + gap * 0.5);

  return { category: bestCategory, confidence };
}

/**
 * Auto-assign priority based on category and text signals.
 */
export function autoPrioritize(
  category: TicketCategory,
  subject: string,
  description: string,
): TicketPriority {
  const text = `${subject} ${description}`.toLowerCase();

  // Critical signals
  const criticalPatterns = [
    "all email", "complete outage", "can't send any", "none of our",
    "production down", "urgent", "emergency", "data loss", "security breach",
    "account compromised",
  ];
  if (criticalPatterns.some((p) => text.includes(p))) {
    return "critical";
  }

  // High priority signals
  const highPatterns = [
    "most of our", "high bounce", "blacklisted", "blocked by",
    "can't send to", "important", "asap", "immediately",
  ];
  if (highPatterns.some((p) => text.includes(p))) {
    return "high";
  }

  // Category-based defaults
  switch (category) {
    case "delivery_issue":
    case "authentication_failure":
    case "reputation_problem":
      return "high";
    case "bounce_issue":
    case "rate_limiting":
    case "dns_configuration":
      return "medium";
    case "account_access":
    case "billing":
    case "bug_report":
      return "medium";
    case "feature_request":
    case "general_inquiry":
      return "low";
    default:
      return "medium";
  }
}

// ─── SLA Management ─────────────────────────────────────────────────────────

function createSlaInfo(priority: TicketPriority, createdAt: Date): SlaInfo {
  const policy = SLA_POLICIES[priority];
  return {
    policy,
    firstResponseDue: new Date(
      createdAt.getTime() + policy.firstResponseMinutes * 60_000,
    ),
    resolutionDue: new Date(
      createdAt.getTime() + policy.resolutionMinutes * 60_000,
    ),
    firstResponseAt: null,
    firstResponseBreached: false,
    resolutionBreached: false,
  };
}

function checkSlaCompliance(sla: SlaInfo, now: Date = new Date()): SlaInfo {
  const updated = { ...sla };

  if (!updated.firstResponseAt && now > updated.firstResponseDue) {
    updated.firstResponseBreached = true;
  }

  if (now > updated.resolutionDue) {
    updated.resolutionBreached = true;
  }

  return updated;
}

// ─── Ticket System ──────────────────────────────────────────────────────────

export interface TicketStore {
  get(id: string): Promise<Ticket | undefined>;
  save(ticket: Ticket): Promise<void>;
  list(filter: TicketFilter): Promise<Ticket[]>;
  count(filter: TicketFilter): Promise<number>;
}

export interface TicketFilter {
  accountId?: string;
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory;
  assignedTo?: string | null;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

export class TicketSystem {
  private readonly store: TicketStore;

  constructor(store: TicketStore) {
    this.store = store;
  }

  /**
   * Create a new support ticket with auto-categorization and SLA assignment.
   */
  async createTicket(input: CreateTicketInput): Promise<Result<Ticket>> {
    try {
      const now = new Date();

      // Auto-categorize if not provided
      const { category: autoCategory } = autoCategorize(
        input.subject,
        input.description,
      );
      const category = input.category ?? autoCategory;

      // Auto-prioritize if not provided
      const priority =
        input.priority ?? autoPrioritize(category, input.subject, input.description);

      const ticket: Ticket = {
        id: generateTicketId(),
        accountId: input.accountId,
        conversationId: "",
        subject: input.subject,
        description: input.description,
        status: "open",
        priority,
        category,
        assignedTo: null,
        tags: input.tags ?? [],
        sla: createSlaInfo(priority, now),
        notes: [],
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        closedAt: null,
      };

      // Add a system note about auto-categorization
      ticket.notes.push({
        id: generateNoteId(),
        author: "system",
        authorType: "system",
        content: `Ticket auto-categorized as "${category}" with priority "${priority}".`,
        internal: true,
        createdAt: now,
      });

      await this.store.save(ticket);
      return ok(ticket);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update a ticket's properties.
   */
  async updateTicket(
    ticketId: string,
    updates: UpdateTicketInput,
    updatedBy = "system",
  ): Promise<Result<Ticket>> {
    try {
      const ticket = await this.store.get(ticketId);
      if (!ticket) {
        return err(new Error(`Ticket not found: ${ticketId}`));
      }

      const now = new Date();
      const changes: string[] = [];

      if (updates.status !== undefined && updates.status !== ticket.status) {
        changes.push(`Status: ${ticket.status} -> ${updates.status}`);
        ticket.status = updates.status;

        if (updates.status === "resolved") {
          ticket.resolvedAt = now;
        } else if (updates.status === "closed") {
          ticket.closedAt = now;
          if (!ticket.resolvedAt) {
            ticket.resolvedAt = now;
          }
        }
      }

      if (updates.priority !== undefined && updates.priority !== ticket.priority) {
        changes.push(`Priority: ${ticket.priority} -> ${updates.priority}`);
        ticket.priority = updates.priority;
        // Recalculate SLA with new priority
        ticket.sla = createSlaInfo(updates.priority, ticket.createdAt);
      }

      if (updates.category !== undefined && updates.category !== ticket.category) {
        changes.push(`Category: ${ticket.category} -> ${updates.category}`);
        ticket.category = updates.category;
      }

      if (updates.assignedTo !== undefined && updates.assignedTo !== ticket.assignedTo) {
        changes.push(
          `Assigned: ${ticket.assignedTo ?? "unassigned"} -> ${updates.assignedTo ?? "unassigned"}`,
        );
        ticket.assignedTo = updates.assignedTo ?? null;
      }

      if (updates.tags) {
        ticket.tags = updates.tags;
      }

      if (changes.length > 0) {
        ticket.updatedAt = now;
        ticket.notes.push({
          id: generateNoteId(),
          author: updatedBy,
          authorType: updatedBy === "system" ? "system" : updatedBy.startsWith("ai-") ? "ai" : "human",
          content: `Updated: ${changes.join(", ")}`,
          internal: true,
          createdAt: now,
        });
      }

      // Check SLA compliance
      ticket.sla = checkSlaCompliance(ticket.sla, now);

      await this.store.save(ticket);
      return ok(ticket);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Add a note to a ticket.
   */
  async addNote(
    ticketId: string,
    author: string,
    content: string,
    options?: { internal?: boolean; authorType?: "ai" | "human" | "system" },
  ): Promise<Result<TicketNote>> {
    try {
      const ticket = await this.store.get(ticketId);
      if (!ticket) {
        return err(new Error(`Ticket not found: ${ticketId}`));
      }

      const now = new Date();
      const note: TicketNote = {
        id: generateNoteId(),
        author,
        authorType: options?.authorType ?? "human",
        content,
        internal: options?.internal ?? false,
        createdAt: now,
      };

      ticket.notes.push(note);
      ticket.updatedAt = now;

      // Record first response time for SLA
      if (
        !ticket.sla.firstResponseAt &&
        (note.authorType === "ai" || note.authorType === "human") &&
        !note.internal
      ) {
        ticket.sla.firstResponseAt = now;
        ticket.sla.firstResponseBreached = now > ticket.sla.firstResponseDue;
      }

      ticket.sla = checkSlaCompliance(ticket.sla, now);
      await this.store.save(ticket);

      return ok(note);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Resolve a ticket.
   */
  async resolveTicket(
    ticketId: string,
    resolution: string,
    resolvedBy = "ai-agent",
  ): Promise<Result<Ticket>> {
    const noteResult = await this.addNote(ticketId, resolvedBy, `Resolution: ${resolution}`, {
      internal: false,
      authorType: resolvedBy.startsWith("ai-") ? "ai" : "human",
    });

    if (!noteResult.ok) {
      return err(noteResult.error);
    }

    return this.updateTicket(ticketId, { status: "resolved" }, resolvedBy);
  }

  /**
   * Escalate a ticket to a human agent or team.
   */
  async escalateTicket(
    ticketId: string,
    reason: string,
    assignTo?: string,
  ): Promise<Result<Ticket>> {
    const noteResult = await this.addNote(ticketId, "ai-agent", `Escalation reason: ${reason}`, {
      internal: true,
      authorType: "ai",
    });

    if (!noteResult.ok) {
      return err(noteResult.error);
    }

    return this.updateTicket(
      ticketId,
      {
        status: "escalated",
        assignedTo: assignTo ?? null,
      },
      "ai-agent",
    );
  }

  /**
   * Get a ticket by ID.
   */
  async getTicket(ticketId: string): Promise<Result<Ticket>> {
    try {
      const ticket = await this.store.get(ticketId);
      if (!ticket) {
        return err(new Error(`Ticket not found: ${ticketId}`));
      }
      // Refresh SLA status
      ticket.sla = checkSlaCompliance(ticket.sla);
      return ok(ticket);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * List tickets with filtering.
   */
  async listTickets(filter: TicketFilter): Promise<Result<Ticket[]>> {
    try {
      const tickets = await this.store.list(filter);
      // Refresh SLA status for all tickets
      const now = new Date();
      for (const ticket of tickets) {
        ticket.sla = checkSlaCompliance(ticket.sla, now);
      }
      return ok(tickets);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get SLA compliance metrics for a set of tickets.
   */
  async getSlaMetrics(filter: TicketFilter): Promise<
    Result<{
      total: number;
      firstResponseOnTime: number;
      firstResponseBreached: number;
      resolutionOnTime: number;
      resolutionBreached: number;
      avgFirstResponseMinutes: number;
      avgResolutionMinutes: number;
    }>
  > {
    try {
      const tickets = await this.store.list(filter);
      const now = new Date();

      let firstResponseOnTime = 0;
      let firstResponseBreached = 0;
      let resolutionOnTime = 0;
      let resolutionBreached = 0;
      let totalFirstResponseMinutes = 0;
      let firstResponseCount = 0;
      let totalResolutionMinutes = 0;
      let resolutionCount = 0;

      for (const ticket of tickets) {
        const sla = checkSlaCompliance(ticket.sla, now);

        if (sla.firstResponseAt) {
          const responseTime =
            (sla.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60_000;
          totalFirstResponseMinutes += responseTime;
          firstResponseCount++;

          if (sla.firstResponseBreached) {
            firstResponseBreached++;
          } else {
            firstResponseOnTime++;
          }
        }

        if (ticket.resolvedAt) {
          const resolutionTime =
            (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 60_000;
          totalResolutionMinutes += resolutionTime;
          resolutionCount++;

          if (sla.resolutionBreached) {
            resolutionBreached++;
          } else {
            resolutionOnTime++;
          }
        }
      }

      return ok({
        total: tickets.length,
        firstResponseOnTime,
        firstResponseBreached,
        resolutionOnTime,
        resolutionBreached,
        avgFirstResponseMinutes:
          firstResponseCount > 0
            ? totalFirstResponseMinutes / firstResponseCount
            : 0,
        avgResolutionMinutes:
          resolutionCount > 0
            ? totalResolutionMinutes / resolutionCount
            : 0,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// ─── In-Memory Ticket Store ─────────────────────────────────────────────────

export class InMemoryTicketStore implements TicketStore {
  private tickets = new Map<string, Ticket>();

  async get(id: string): Promise<Ticket | undefined> {
    const ticket = this.tickets.get(id);
    return ticket ? structuredClone(ticket) : undefined;
  }

  async save(ticket: Ticket): Promise<void> {
    this.tickets.set(ticket.id, structuredClone(ticket));
  }

  async list(filter: TicketFilter): Promise<Ticket[]> {
    let results = Array.from(this.tickets.values());

    if (filter.accountId) {
      results = results.filter((t) => t.accountId === filter.accountId);
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      results = results.filter((t) => statuses.includes(t.status));
    }

    if (filter.priority) {
      const priorities = Array.isArray(filter.priority)
        ? filter.priority
        : [filter.priority];
      results = results.filter((t) => priorities.includes(t.priority));
    }

    if (filter.category) {
      results = results.filter((t) => t.category === filter.category);
    }

    if (filter.assignedTo !== undefined) {
      results = results.filter((t) => t.assignedTo === filter.assignedTo);
    }

    const createdAfter = filter.createdAfter;
    if (createdAfter) {
      results = results.filter((t) => t.createdAt >= createdAfter);
    }

    const createdBefore = filter.createdBefore;
    if (createdBefore) {
      results = results.filter((t) => t.createdAt < createdBefore);
    }

    // Sort by priority (critical first), then by creation time
    const priorityOrder: Record<TicketPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    results.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return results.slice(offset, offset + limit).map((t) => structuredClone(t));
  }

  async count(filter: TicketFilter): Promise<number> {
    const results = await this.list({ ...filter, limit: Infinity, offset: 0 });
    return results.length;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let ticketCounter = 0;
let noteCounter = 0;

function generateTicketId(): string {
  ticketCounter++;
  const timestamp = Date.now().toString(36);
  const counter = ticketCounter.toString(36).padStart(4, "0");
  return `TKT-${timestamp}-${counter}`;
}

function generateNoteId(): string {
  noteCounter++;
  return `note-${Date.now().toString(36)}-${noteCounter.toString(36)}`;
}
