/**
 * API client for feature-domain endpoints surfaced in the dashboard:
 * AI rules, auto-responder, workflows, calendar events, AI search,
 * and Zapier/Make/n8n integrations.
 *
 * Mirrors the typed fetch wrapper in lib/api.ts (which is owned elsewhere)
 * so new feature pages have a single, typed entry point for HTTP calls.
 */

import { getApiBase } from "./api-base";

const API_BASE = getApiBase();

interface FeatureApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function featureFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("alecrae_api_key") ?? ""
      : "";

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as FeatureApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── AI Rules (/v1/rules) ────────────────────────────────────────────────────

export interface RuleConditionData {
  field: string;
  operator: string;
  value: string;
}

export interface RuleActionData {
  type: string;
  value?: string;
}

export interface EmailRuleData {
  id: string;
  accountId: string;
  name: string;
  description: string;
  conditions: RuleConditionData[];
  matchMode: "all" | "any";
  actions: RuleActionData[];
  enabled: boolean;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleFromTextResult {
  rule: EmailRuleData;
  message: string;
  preview: string;
}

export const aiRulesApi = {
  list(): Promise<{ data: EmailRuleData[] }> {
    return featureFetch<{ data: EmailRuleData[] }>("/v1/rules");
  },

  createFromText(instruction: string): Promise<{ data: RuleFromTextResult }> {
    return featureFetch<{ data: RuleFromTextResult }>(
      "/v1/rules/create-from-text",
      { method: "POST", body: JSON.stringify({ instruction }) },
    );
  },

  create(payload: {
    name: string;
    description?: string;
    conditions: RuleConditionData[];
    matchMode?: "all" | "any";
    actions: RuleActionData[];
    enabled?: boolean;
  }): Promise<{ data: EmailRuleData }> {
    return featureFetch<{ data: EmailRuleData }>("/v1/rules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: {
      name?: string;
      enabled?: boolean;
      conditions?: RuleConditionData[];
      actions?: RuleActionData[];
    },
  ): Promise<{ data: EmailRuleData }> {
    return featureFetch<{ data: EmailRuleData }>(`/v1/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  remove(id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return featureFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/rules/${id}`,
      { method: "DELETE" },
    );
  },
};

// ─── Auto-Responder (/v1/auto-responder) ─────────────────────────────────────

export type AutoResponderMode = "off" | "vacation" | "busy" | "custom";

export interface AutoResponderData {
  id: string;
  mode: AutoResponderMode;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  isActive: boolean;
  schedule: {
    startDate: string;
    endDate?: string;
    timezone: string;
  } | null;
  rules: {
    respondToContacts: boolean;
    respondToUnknown: boolean;
    excludeDomains?: string[];
    excludeLabels?: string[];
    maxResponsesPerSender?: number;
    aiSmartReply: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const autoResponderApi = {
  get(): Promise<{ data: AutoResponderData | null }> {
    return featureFetch<{ data: AutoResponderData | null }>(
      "/v1/auto-responder",
    );
  },

  upsert(payload: {
    mode: AutoResponderMode;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    schedule?: { startDate: string; endDate?: string; timezone: string };
    rules?: {
      respondToContacts: boolean;
      respondToUnknown: boolean;
      maxResponsesPerSender?: number;
      aiSmartReply: boolean;
    };
  }): Promise<{ data: { id: string; mode: string; subject: string } }> {
    return featureFetch<{ data: { id: string; mode: string; subject: string } }>(
      "/v1/auto-responder",
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  activate(): Promise<{ data: { id: string; isActive: boolean } }> {
    return featureFetch<{ data: { id: string; isActive: boolean } }>(
      "/v1/auto-responder/activate",
      { method: "POST" },
    );
  },

  deactivate(): Promise<{ data: { id: string; isActive: boolean } }> {
    return featureFetch<{ data: { id: string; isActive: boolean } }>(
      "/v1/auto-responder/deactivate",
      { method: "POST" },
    );
  },
};

// ─── Workflows (/v1/workflows) ───────────────────────────────────────────────

export interface WorkflowTriggerData {
  type: "email_received" | "email_sent" | "schedule" | "manual";
  conditions: {
    from?: string;
    subject?: string;
    labels?: string[];
    hasAttachment?: boolean;
  };
}

export interface WorkflowActionData {
  type:
    | "reply"
    | "forward"
    | "label"
    | "archive"
    | "move"
    | "notify"
    | "webhook"
    | "ai_classify";
  config: Record<string, unknown>;
}

export interface WorkflowData {
  id: string;
  accountId: string;
  name: string;
  description: string | null;
  trigger: WorkflowTriggerData;
  actions: WorkflowActionData[];
  isActive: boolean;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplateData {
  id: string;
  name: string;
  description: string | null;
  category: string;
  trigger: WorkflowTriggerData;
  actions: WorkflowActionData[];
}

export interface WorkflowStatsData {
  totalWorkflows: number;
  activeWorkflows: number;
  totalRuns: number;
  successRate: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  mostActiveWorkflows: {
    id: string;
    name: string;
    runCount: number;
    lastRunAt: string | null;
  }[];
}

export interface WorkflowRunData {
  id: string;
  workflowId: string;
  emailId: string | null;
  status: "success" | "failed" | "skipped";
  actionsExecuted: number;
  error: string | null;
  duration: number;
  createdAt: string;
}

export const workflowsApi = {
  list(params?: {
    limit?: number;
    cursor?: string;
    active?: boolean;
  }): Promise<{ data: WorkflowData[]; cursor: string | null; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.active !== undefined) qs.set("active", String(params.active));
    const query = qs.toString();
    return featureFetch<{
      data: WorkflowData[];
      cursor: string | null;
      hasMore: boolean;
    }>(`/v1/workflows${query ? `?${query}` : ""}`);
  },

  templates(): Promise<{ data: WorkflowTemplateData[] }> {
    return featureFetch<{ data: WorkflowTemplateData[] }>(
      "/v1/workflows/templates",
    );
  },

  stats(): Promise<{ data: WorkflowStatsData }> {
    return featureFetch<{ data: WorkflowStatsData }>("/v1/workflows/stats");
  },

  create(payload: {
    name: string;
    description?: string;
    trigger: WorkflowTriggerData;
    actions: WorkflowActionData[];
    isActive?: boolean;
  }): Promise<{ data: WorkflowData }> {
    return featureFetch<{ data: WorkflowData }>("/v1/workflows", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  fromTemplate(
    templateId: string,
    payload: { name: string; description?: string },
  ): Promise<{ data: WorkflowData }> {
    return featureFetch<{ data: WorkflowData }>(
      `/v1/workflows/from-template/${templateId}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  toggle(id: string): Promise<{ data: { id: string; isActive: boolean } }> {
    return featureFetch<{ data: { id: string; isActive: boolean } }>(
      `/v1/workflows/${id}/toggle`,
      { method: "POST" },
    );
  },

  run(
    id: string,
  ): Promise<{
    data: { run: WorkflowRunData; actionsExecuted: number; totalActions: number };
  }> {
    return featureFetch<{
      data: {
        run: WorkflowRunData;
        actionsExecuted: number;
        totalActions: number;
      };
    }>(`/v1/workflows/${id}/run`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  remove(id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return featureFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/workflows/${id}`,
      { method: "DELETE" },
    );
  },
};

// ─── Calendar Events (/v1/calendar-events) ───────────────────────────────────

export interface CalendarAttendeeData {
  email: string;
  name?: string;
  status: "accepted" | "declined" | "tentative" | "pending";
}

export interface CalendarEventData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  attendees: CalendarAttendeeData[] | null;
  color: string | null;
  videoLink: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodayAgendaData {
  date: string;
  eventCount: number;
  events: CalendarEventData[];
  aiAgenda: string;
}

export interface FindTimeSlotData {
  startAt: string;
  endAt: string;
  confidence: number;
  attendeesAvailable: string[];
}

export const calendarEventsApi = {
  list(params?: {
    startAfter?: string;
    endBefore?: string;
    limit?: number;
  }): Promise<{
    data: CalendarEventData[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const qs = new URLSearchParams();
    if (params?.startAfter) qs.set("startAfter", params.startAfter);
    if (params?.endBefore) qs.set("endBefore", params.endBefore);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return featureFetch<{
      data: CalendarEventData[];
      cursor: string | null;
      hasMore: boolean;
    }>(`/v1/calendar-events${query ? `?${query}` : ""}`);
  },

  today(): Promise<{ data: TodayAgendaData }> {
    return featureFetch<{ data: TodayAgendaData }>("/v1/calendar-events/today");
  },

  create(payload: {
    title: string;
    description?: string;
    location?: string;
    startAt: string;
    endAt: string;
    allDay?: boolean;
    attendees?: CalendarAttendeeData[];
    videoLink?: string;
  }): Promise<{ data: { id: string; title: string; startAt: string; endAt: string } }> {
    return featureFetch<{
      data: { id: string; title: string; startAt: string; endAt: string };
    }>("/v1/calendar-events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return featureFetch<{ deleted: boolean; id: string }>(
      `/v1/calendar-events/${id}`,
      { method: "DELETE" },
    );
  },

  findTime(payload: {
    attendeeEmails: string[];
    durationMinutes: number;
  }): Promise<{
    data: {
      durationMinutes: number;
      attendeeCount: number;
      suggestedSlots: FindTimeSlotData[];
      note: string;
    };
  }> {
    return featureFetch<{
      data: {
        durationMinutes: number;
        attendeeCount: number;
        suggestedSlots: FindTimeSlotData[];
        note: string;
      };
    }>("/v1/calendar-events/find-time", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ─── AI Search (/v1/search/ai) ───────────────────────────────────────────────

export interface AISearchHit {
  id: string;
  subject: string;
  from: { email: string; name: string | null };
  snippet: string;
  date: string;
}

export interface AISearchResult {
  query: string;
  parsedFilters: Record<string, unknown>;
  results: AISearchHit[];
  totalHits: number;
  processingTimeMs: number;
  message?: string;
}

export const aiSearchApi = {
  search(query: string, limit = 20): Promise<{ data: AISearchResult }> {
    return featureFetch<{ data: AISearchResult }>("/v1/search/ai", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    });
  },
};

// ─── Integrations (/v1/integrations — Zapier/Make/n8n) ───────────────────────

export type IntegrationPlatform = "zapier" | "make" | "n8n" | "custom";

export interface IntegrationData {
  id: string;
  platform: IntegrationPlatform;
  name: string;
  webhookUrl: string;
  isActive: boolean;
  triggerConfig: { events: string[]; filters?: Record<string, unknown> };
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationEventTypeData {
  type: string;
  description: string;
}

export const integrationsApi = {
  list(): Promise<{ data: IntegrationData[] }> {
    return featureFetch<{ data: IntegrationData[] }>("/v1/integrations");
  },

  events(): Promise<{ data: IntegrationEventTypeData[] }> {
    return featureFetch<{ data: IntegrationEventTypeData[] }>(
      "/v1/integrations/events",
    );
  },

  create(payload: {
    platform: IntegrationPlatform;
    name: string;
    webhookUrl: string;
    events: string[];
  }): Promise<{
    data: {
      id: string;
      name: string;
      platform: string;
      secret: string;
      createdAt: string;
    };
  }> {
    return featureFetch<{
      data: {
        id: string;
        name: string;
        platform: string;
        secret: string;
        createdAt: string;
      };
    }>("/v1/integrations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: {
      name?: string;
      webhookUrl?: string;
      isActive?: boolean;
      events?: string[];
    },
  ): Promise<{ data: { id: string; updated: boolean } }> {
    return featureFetch<{ data: { id: string; updated: boolean } }>(
      `/v1/integrations/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  test(
    id: string,
  ): Promise<{
    data: { success: boolean; statusCode?: number; statusText?: string; error?: string };
  }> {
    return featureFetch<{
      data: {
        success: boolean;
        statusCode?: number;
        statusText?: string;
        error?: string;
      };
    }>(`/v1/integrations/${id}/test`, { method: "POST" });
  },

  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return featureFetch<{ deleted: boolean; id: string }>(
      `/v1/integrations/${id}`,
      { method: "DELETE" },
    );
  },
};
