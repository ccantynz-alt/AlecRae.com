import type {
  JmapRequest,
  JmapResponse,
  JmapMethodCall,
  JmapMethodResponse,
  JmapSession,
  JmapId,
  CoreCapability,
  MailCapability,
} from "../types.js";

// --- Method Handler Registry ---

type MethodHandler = (
  args: Record<string, unknown>,
  context: RequestContext,
) => Promise<Record<string, unknown>>;

export interface RequestContext {
  accountId: JmapId;
  username: string;
  createdIds: Map<JmapId, JmapId>;
  sessionState: string;
}

// --- JMAP Protocol Handler per RFC 8620 ---

export class JmapHandler {
  private methods = new Map<string, MethodHandler>();
  private sessionState = "0";
  private stateCounter = 0;

  /**
   * Register a method handler (e.g., "Mailbox/get", "Email/query").
   */
  registerMethod(name: string, handler: MethodHandler): void {
    this.methods.set(name, handler);
  }

  /**
   * Generate a JMAP Session object per RFC 8620 Section 2.
   */
  getSession(username: string, accountId: JmapId): JmapSession {
    const coreCapability: CoreCapability = {
      maxSizeUpload: 50_000_000,
      maxConcurrentUpload: 4,
      maxSizeRequest: 10_000_000,
      maxConcurrentRequests: 4,
      maxCallsInRequest: 16,
      maxObjectsInGet: 500,
      maxObjectsInSet: 500,
      collationAlgorithms: ["i;ascii-casemap", "i;ascii-numeric", "i;unicode-casemap"],
    };

    const mailCapability: MailCapability = {
      maxMailboxesPerEmail: null,
      maxMailboxDepth: null,
      maxSizeMailboxName: 255,
      maxSizeAttachmentsPerEmail: 50_000_000,
      emailQuerySortOptions: ["receivedAt", "sentAt", "size", "from", "to", "subject"],
      mayCreateTopLevelMailbox: true,
    };

    return {
      capabilities: {
        "urn:ietf:params:jmap:core": coreCapability,
        "urn:ietf:params:jmap:mail": mailCapability,
      },
      accounts: {
        [accountId]: {
          name: username,
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {
            "urn:ietf:params:jmap:mail": {},
          },
        },
      },
      primaryAccounts: {
        "urn:ietf:params:jmap:mail": accountId,
      },
      username,
      apiUrl: "/jmap",
      downloadUrl: "/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
      uploadUrl: "/jmap/upload/{accountId}/",
      eventSourceUrl: "/jmap/eventsource?types={types}&closeafter={closeafter}&ping={ping}",
      state: this.sessionState,
    };
  }

  /**
   * Process a complete JMAP request with method call batching per RFC 8620 Section 3.
   */
  async processRequest(request: JmapRequest, accountId: JmapId, username: string): Promise<JmapResponse> {
    // Validate capabilities
    const validCapabilities = new Set([
      "urn:ietf:params:jmap:core",
      "urn:ietf:params:jmap:mail",
    ]);

    for (const capability of request.using) {
      if (!validCapabilities.has(capability)) {
        return {
          methodResponses: [
            [
              "error",
              {
                type: "unknownCapability",
                description: `Unknown capability: ${capability}`,
              },
              request.methodCalls[0]?.[2] ?? "0",
            ],
          ],
          sessionState: this.sessionState,
        };
      }
    }

    // Validate request limits
    const session = this.getSession(username, accountId);
    const core = session.capabilities["urn:ietf:params:jmap:core"];

    if (request.methodCalls.length > core.maxCallsInRequest) {
      return {
        methodResponses: [
          [
            "error",
            {
              type: "limit",
              description: `Too many method calls. Maximum: ${core.maxCallsInRequest}`,
            },
            request.methodCalls[0]?.[2] ?? "0",
          ],
        ],
        sessionState: this.sessionState,
      };
    }

    const context: RequestContext = {
      accountId,
      username,
      createdIds: new Map(Object.entries(request.createdIds ?? {})),
      sessionState: this.sessionState,
    };

    // Process method calls sequentially (they may reference each other)
    const responses: JmapMethodResponse[] = [];

    for (const call of request.methodCalls) {
      const response = await this.processMethodCall(call, context);
      responses.push(response);
    }

    // Build createdIds from context
    const createdIds: Record<JmapId, JmapId> = {};
    for (const [clientId, serverId] of context.createdIds) {
      createdIds[clientId] = serverId;
    }

    return {
      methodResponses: responses,
      ...(Object.keys(createdIds).length > 0 ? { createdIds } : {}),
      sessionState: this.sessionState,
    };
  }

  /**
   * Process a single JMAP method call.
   */
  private async processMethodCall(
    call: JmapMethodCall,
    context: RequestContext,
  ): Promise<JmapMethodResponse> {
    const [method, args, callId] = call;

    // Resolve back-references (#ref syntax per RFC 8620 Section 3.7)
    const resolvedArgs = this.resolveBackReferences(args, context);

    const handler = this.methods.get(method);
    if (!handler) {
      return [
        "error",
        {
          type: "unknownMethod",
          description: `Unknown method: ${method}`,
        },
        callId,
      ];
    }

    try {
      const result = await handler(resolvedArgs, context);
      return [method, result, callId];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return [
        "error",
        {
          type: "serverFail",
          description: message,
        },
        callId,
      ];
    }
  }

  /**
   * Resolve back-references in method arguments per RFC 8620 Section 3.7.
   * Properties starting with '#' reference results from previous method calls.
   */
  private resolveBackReferences(
    args: Record<string, unknown>,
    context: RequestContext,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && value.startsWith("#")) {
        // Resolve creation ID reference
        const refId = value.slice(1);
        const serverId = context.createdIds.get(refId);
        resolved[key] = serverId ?? value;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        resolved[key] = this.resolveBackReferences(value as Record<string, unknown>, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Advance the session state (called after any mutation).
   */
  advanceState(): string {
    this.stateCounter++;
    this.sessionState = String(this.stateCounter);
    return this.sessionState;
  }

  getState(): string {
    return this.sessionState;
  }
}
