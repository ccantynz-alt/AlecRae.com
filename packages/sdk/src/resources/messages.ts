/**
 * Messages resource — send, retrieve, search, and manage email messages.
 *
 * Provides typed methods for all message-related API operations including
 * single send, batch send, template rendering, and message lifecycle management.
 */

import { type Result, ok, err } from "@emailed/shared";
import type { EmailAddress, EmailStatus, Attachment } from "@emailed/shared";
import type { HttpClient, ApiResponse, PaginatedResponse, ApiError } from "../client/http.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for sending a single email message. */
export interface SendMessageParams {
  /** Sender address. */
  readonly from: EmailAddress;
  /** Primary recipients. */
  readonly to: readonly EmailAddress[];
  /** CC recipients. */
  readonly cc?: readonly EmailAddress[];
  /** BCC recipients. */
  readonly bcc?: readonly EmailAddress[];
  /** Reply-to address. */
  readonly replyTo?: EmailAddress;
  /** Email subject line. */
  readonly subject: string;
  /** Plain text body. */
  readonly text?: string;
  /** HTML body. */
  readonly html?: string;
  /** File attachments. */
  readonly attachments?: readonly AttachmentInput[];
  /** Tags for categorization and filtering (max 10). */
  readonly tags?: readonly string[];
  /** Arbitrary key-value metadata (max 50 entries). */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Custom email headers. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Schedule sending for a future time (ISO 8601). */
  readonly scheduledAt?: string;
  /** Template ID to render instead of providing text/html directly. */
  readonly templateId?: string;
  /** Template variables for rendering. */
  readonly templateData?: Readonly<Record<string, unknown>>;
  /** Domain ID to send from (uses default domain if omitted). */
  readonly domainId?: string;
}

/** Attachment input for sending (content as base64 or URL). */
export interface AttachmentInput {
  readonly filename: string;
  readonly contentType: string;
  /** Base64-encoded content. Mutually exclusive with url. */
  readonly content?: string;
  /** URL to fetch attachment from. Mutually exclusive with content. */
  readonly url?: string;
  /** "attachment" or "inline" (default "attachment"). */
  readonly disposition?: "attachment" | "inline";
  /** Content-ID for inline attachments. */
  readonly contentId?: string;
}

/** Parameters for batch sending. */
export interface BatchSendParams {
  /** Array of individual message parameters. Max 1000 per batch. */
  readonly messages: readonly SendMessageParams[];
  /** Tags applied to all messages in the batch. */
  readonly batchTags?: readonly string[];
  /** Metadata applied to all messages in the batch. */
  readonly batchMetadata?: Readonly<Record<string, string>>;
}

/** Result of sending a single message. */
export interface SendMessageResult {
  readonly id: string;
  readonly status: EmailStatus;
  readonly messageId: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly subject: string;
  readonly createdAt: string;
  readonly scheduledAt?: string;
}

/** Result of a batch send operation. */
export interface BatchSendResult {
  readonly batchId: string;
  readonly totalMessages: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly results: readonly BatchSendItemResult[];
}

/** Result for an individual message within a batch. */
export interface BatchSendItemResult {
  readonly index: number;
  readonly id?: string;
  readonly status: "accepted" | "rejected";
  readonly error?: string;
}

/** A message as returned by the API. */
export interface Message {
  readonly id: string;
  readonly accountId: string;
  readonly domainId: string;
  readonly messageId: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly cc: readonly EmailAddress[];
  readonly bcc: readonly EmailAddress[];
  readonly replyTo?: EmailAddress;
  readonly subject: string;
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly attachments: readonly Attachment[];
  readonly status: EmailStatus;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scheduledAt?: string;
  readonly sentAt?: string;
  readonly deliveredAt?: string;
}

/** Query parameters for listing messages. */
export interface ListMessagesQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: EmailStatus;
  readonly from?: string;
  readonly to?: string;
  readonly subject?: string;
  readonly tag?: string;
  readonly domainId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly sortBy?: "createdAt" | "updatedAt" | "sentAt";
  readonly sortOrder?: "asc" | "desc";
}

/** Query parameters for searching messages. */
export interface SearchMessagesQuery {
  /** Full-text search query. */
  readonly query: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: EmailStatus;
  readonly tag?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

/** Template rendering parameters. */
export interface RenderTemplateParams {
  readonly templateId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Template rendering result. */
export interface RenderTemplateResult {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

// ---------------------------------------------------------------------------
// Messages Resource
// ---------------------------------------------------------------------------

export class MessagesResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Send a single email message.
   *
   * @param params - Message parameters (from, to, subject, body, etc.)
   * @returns The created message with its ID and initial status
   */
  async send(
    params: SendMessageParams,
  ): Promise<Result<ApiResponse<SendMessageResult>, ApiError | Error>> {
    return this.client.post<SendMessageResult>("/messages", params);
  }

  /**
   * Send a batch of email messages in a single API call.
   *
   * Up to 1000 messages can be sent per batch. Each message is validated
   * independently — partial success is possible.
   *
   * @param params - Batch parameters with an array of messages
   * @returns Batch result with per-message acceptance/rejection status
   */
  async sendBatch(
    params: BatchSendParams,
  ): Promise<Result<ApiResponse<BatchSendResult>, ApiError | Error>> {
    if (params.messages.length === 0) {
      return err(new Error("Batch must contain at least one message"));
    }
    if (params.messages.length > 1000) {
      return err(new Error("Batch cannot exceed 1000 messages"));
    }

    return this.client.post<BatchSendResult>("/messages/batch", {
      messages: params.messages.map((msg) => ({
        ...msg,
        tags: [
          ...(msg.tags ?? []),
          ...(params.batchTags ?? []),
        ],
        metadata: {
          ...params.batchMetadata,
          ...msg.metadata,
        },
      })),
    });
  }

  /**
   * Retrieve a single message by ID.
   *
   * @param messageId - The message's unique identifier
   * @returns The full message object
   */
  async get(
    messageId: string,
  ): Promise<Result<ApiResponse<Message>, ApiError | Error>> {
    return this.client.get<Message>(`/messages/${encodeURIComponent(messageId)}`);
  }

  /**
   * List messages with filtering and pagination.
   *
   * @param query - Filter and pagination parameters
   * @returns Paginated list of messages
   */
  async list(
    query?: ListMessagesQuery,
  ): Promise<Result<ApiResponse<PaginatedResponse<Message>>, ApiError | Error>> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (query) {
      if (query.page !== undefined) params["page"] = query.page;
      if (query.pageSize !== undefined) params["page_size"] = query.pageSize;
      if (query.status !== undefined) params["status"] = query.status;
      if (query.from !== undefined) params["from"] = query.from;
      if (query.to !== undefined) params["to"] = query.to;
      if (query.subject !== undefined) params["subject"] = query.subject;
      if (query.tag !== undefined) params["tag"] = query.tag;
      if (query.domainId !== undefined) params["domain_id"] = query.domainId;
      if (query.startDate !== undefined) params["start_date"] = query.startDate;
      if (query.endDate !== undefined) params["end_date"] = query.endDate;
      if (query.sortBy !== undefined) params["sort_by"] = query.sortBy;
      if (query.sortOrder !== undefined) params["sort_order"] = query.sortOrder;
    }

    return this.client.get<PaginatedResponse<Message>>("/messages", params);
  }

  /**
   * Full-text search across messages.
   *
   * Searches subject, body, sender, and recipient fields using the
   * platform's Meilisearch-powered search engine.
   *
   * @param query - Search query and filter parameters
   * @returns Paginated search results
   */
  async search(
    query: SearchMessagesQuery,
  ): Promise<Result<ApiResponse<PaginatedResponse<Message>>, ApiError | Error>> {
    const params: Record<string, string | number | boolean | undefined> = {
      q: query.query,
    };

    if (query.page !== undefined) params["page"] = query.page;
    if (query.pageSize !== undefined) params["page_size"] = query.pageSize;
    if (query.status !== undefined) params["status"] = query.status;
    if (query.tag !== undefined) params["tag"] = query.tag;
    if (query.startDate !== undefined) params["start_date"] = query.startDate;
    if (query.endDate !== undefined) params["end_date"] = query.endDate;

    return this.client.get<PaginatedResponse<Message>>("/messages/search", params);
  }

  /**
   * Cancel a scheduled message that has not yet been sent.
   *
   * Only messages with status "queued" or "scheduled" can be cancelled.
   *
   * @param messageId - The message's unique identifier
   * @returns The updated message with status "dropped"
   */
  async cancel(
    messageId: string,
  ): Promise<Result<ApiResponse<Message>, ApiError | Error>> {
    return this.client.post<Message>(
      `/messages/${encodeURIComponent(messageId)}/cancel`,
    );
  }

  /**
   * Render a template with the provided data without sending.
   *
   * Useful for previewing emails before sending.
   *
   * @param params - Template ID and rendering data
   * @returns Rendered subject, text, and HTML
   */
  async renderTemplate(
    params: RenderTemplateParams,
  ): Promise<Result<ApiResponse<RenderTemplateResult>, ApiError | Error>> {
    return this.client.post<RenderTemplateResult>("/messages/render", params);
  }
}
