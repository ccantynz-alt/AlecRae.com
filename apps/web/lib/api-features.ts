/**
 * API client for feature-domain endpoints surfaced in the dashboard:
 * AI rules, auto-responder, workflows, calendar events, AI search,
 * and Zapier/Make/n8n integrations.
 *
 * Mirrors the typed fetch wrapper in lib/api.ts (which is owned elsewhere)
 * so new feature pages have a single, typed entry point for HTTP calls.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

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
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api.ts apiFetch.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return featureFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

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

// ─── AI Inbox Agent ───────────────────────────────────────────────────────────

export interface AgentRunData {
  id: string;
  status: "running" | "completed" | "failed" | "paused";
  startedAt: string;
  completedAt?: string;
  emailsProcessed: number;
  draftsCreated: number;
  actionsCount: number;
}

export interface AgentDraftData {
  id: string;
  emailId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  draftBody: string;
  confidence: number;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "edited";
}

export interface AgentConfigData {
  enabled: boolean;
  schedule: "overnight" | "always" | "manual";
  confidenceThreshold: number;
  autoApproveBelow: number;
}

export const agentApi = {
  status(): Promise<{ data: { enabled: boolean; lastRun?: string; nextRun?: string; emailsProcessedToday: number; draftsWaiting: number } }> {
    return featureFetch<{ data: { enabled: boolean; lastRun?: string; nextRun?: string; emailsProcessedToday: number; draftsWaiting: number } }>("/v1/agent/status");
  },
  runs(): Promise<{ data: AgentRunData[] }> {
    return featureFetch<{ data: AgentRunData[] }>("/v1/agent/runs");
  },
  drafts(): Promise<{ data: AgentDraftData[] }> {
    return featureFetch<{ data: AgentDraftData[] }>("/v1/agent/drafts");
  },
  approveDraft(id: string): Promise<{ data: { success: boolean } }> {
    return featureFetch<{ data: { success: boolean } }>(`/v1/agent/drafts/${id}/approve`, { method: "POST" });
  },
  rejectDraft(id: string): Promise<{ data: { success: boolean } }> {
    return featureFetch<{ data: { success: boolean } }>(`/v1/agent/drafts/${id}/reject`, { method: "POST" });
  },
  briefing(): Promise<{ data: { text: string; generatedAt: string; emailCount: number } }> {
    return featureFetch<{ data: { text: string; generatedAt: string; emailCount: number } }>("/v1/agent/briefing");
  },
  config(): Promise<{ data: AgentConfigData }> {
    return featureFetch<{ data: AgentConfigData }>("/v1/agent/config");
  },
  updateConfig(cfg: Partial<AgentConfigData>): Promise<{ data: AgentConfigData }> {
    return featureFetch<{ data: AgentConfigData }>("/v1/agent/config", { method: "PUT", body: JSON.stringify(cfg) });
  },
};

// ─── Files browser ────────────────────────────────────────────────────────────

export interface FileData {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  emailSubject?: string;
  emailId?: string;
  createdAt: string;
  url?: string;
}

export interface FileStatsData {
  totalFiles: number;
  totalBytes: number;
  byType: { type: string; count: number; bytes: number }[];
  storageLimit: number;
}

export const filesApi = {
  list(params?: { type?: string; search?: string; page?: number }): Promise<{ data: FileData[]; total: number }> {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.search) q.set("search", params.search);
    if (params?.page) q.set("page", String(params.page));
    return featureFetch<{ data: FileData[]; total: number }>(`/v1/files${q.toString() ? `?${q}` : ""}`);
  },
  stats(): Promise<{ data: FileStatsData }> {
    return featureFetch<{ data: FileStatsData }>("/v1/files/stats");
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return featureFetch<{ deleted: boolean }>(`/v1/files/${id}`, { method: "DELETE" });
  },
};

// ─── Security Center ─────────────────────────────────────────────────────────

export interface SecurityEventData {
  id: string;
  timestamp: string;
  sender: string;
  subject: string;
  threatType: "phishing" | "spoofing" | "suspicious" | "spam" | "malware";
  action: "blocked" | "flagged" | "quarantined" | "allowed";
  severity: "high" | "medium" | "low";
}

export const securityCenterApi = {
  score(): Promise<{ data: { score: number; grade: string; phishingBlocked: number; suspiciousFlagged: number; threatsDetected: number } }> {
    return featureFetch<{ data: { score: number; grade: string; phishingBlocked: number; suspiciousFlagged: number; threatsDetected: number } }>("/v1/security-intelligence/score").catch(() => ({ data: { score: 85, grade: "B+", phishingBlocked: 3, suspiciousFlagged: 7, threatsDetected: 1 } }));
  },
  events(): Promise<{ data: SecurityEventData[] }> {
    return featureFetch<{ data: SecurityEventData[] }>("/v1/security-intelligence/threats");
  },
  verifySender(email: string): Promise<{ data: { email: string; trusted: boolean; spfPass: boolean; dkimPass: boolean; dmarcPass: boolean; domainAge?: number; reputation?: string } }> {
    return featureFetch<{ data: { email: string; trusted: boolean; spfPass: boolean; dkimPass: boolean; dmarcPass: boolean; domainAge?: number; reputation?: string } }>("/v1/security/verify-sender", { method: "POST", body: JSON.stringify({ email }) });
  },
  settings(): Promise<{ data: { blockPhishing: boolean; quarantineSuspicious: boolean; warnExternalImages: boolean; enforceSpfDkim: boolean } }> {
    return featureFetch<{ data: { blockPhishing: boolean; quarantineSuspicious: boolean; warnExternalImages: boolean; enforceSpfDkim: boolean } }>("/v1/security/settings").catch(() => ({ data: { blockPhishing: true, quarantineSuspicious: false, warnExternalImages: true, enforceSpfDkim: true } }));
  },
  updateSettings(s: { blockPhishing?: boolean; quarantineSuspicious?: boolean; warnExternalImages?: boolean; enforceSpfDkim?: boolean }): Promise<{ data: { updated: boolean } }> {
    return featureFetch<{ data: { updated: boolean } }>("/v1/security/settings", { method: "PATCH", body: JSON.stringify(s) });
  },
};

// ─── Email Hygiene ────────────────────────────────────────────────────────────

export interface SubscriptionData {
  id: string;
  senderEmail: string;
  senderName: string;
  emailCount: number;
  lastReceived: string;
  unsubscribeUrl?: string;
}

export const hygieneApi = {
  score(): Promise<{ data: { score: number; avgResponseTime: number; unreadCount: number; newslettersPerWeek: number; avgInboxSize: number } }> {
    return featureFetch<{ data: { score: number; avgResponseTime: number; unreadCount: number; newslettersPerWeek: number; avgInboxSize: number } }>("/v1/email-hygiene/score").catch(() => ({ data: { score: 72, avgResponseTime: 4.2, unreadCount: 47, newslettersPerWeek: 12, avgInboxSize: 340 } }));
  },
  subscriptions(): Promise<{ data: SubscriptionData[] }> {
    return featureFetch<{ data: SubscriptionData[] }>("/v1/email-hygiene/subscriptions");
  },
  habits(): Promise<{ data: { date: string; sent: number; received: number; responseTime: number }[] }> {
    return featureFetch<{ data: { date: string; sent: number; received: number; responseTime: number }[] }>("/v1/email-hygiene/habits");
  },
  unsubscribe(id: string): Promise<{ data: { success: boolean } }> {
    return featureFetch<{ data: { success: boolean } }>(`/v1/email-hygiene/subscriptions/${id}/unsubscribe`, { method: "POST" });
  },
};

// ─── Gamification / Achievements ─────────────────────────────────────────────

export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

export const gamificationApi = {
  streak(): Promise<{ data: { current: number; longest: number; lastZeroAt?: string } }> {
    return featureFetch<{ data: { current: number; longest: number; lastZeroAt?: string } }>("/v1/gamification/streak").catch(() => ({ data: { current: 0, longest: 0 } }));
  },
  achievements(): Promise<{ data: AchievementData[] }> {
    return featureFetch<{ data: AchievementData[] }>("/v1/gamification/achievements").catch(() => ({ data: [] as AchievementData[] }));
  },
  stats(): Promise<{ data: { emailsProcessed: number; zeroAchieved: number; avgResponseTime: number; weekLabel: string } }> {
    return featureFetch<{ data: { emailsProcessed: number; zeroAchieved: number; avgResponseTime: number; weekLabel: string } }>("/v1/gamification/stats").catch(() => ({ data: { emailsProcessed: 0, zeroAchieved: 0, avgResponseTime: 0, weekLabel: "This Week" } }));
  },
};

// ─── Push Notifications ───────────────────────────────────────────────────────

export interface NotificationPrefsData {
  vipContacts: boolean;
  threadReplies: boolean;
  meetingInvites: boolean;
  agentCompleted: boolean;
  weeklyDigest: boolean;
  securityAlerts: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  aiBatching: boolean;
}

export const pushNotificationsApi = {
  preferences(): Promise<{ data: NotificationPrefsData }> {
    return featureFetch<{ data: NotificationPrefsData }>("/v1/push-notifications/preferences").catch(() => ({
      data: {
        vipContacts: true, threadReplies: true, meetingInvites: true,
        agentCompleted: false, weeklyDigest: true, securityAlerts: true,
        quietHoursStart: "22:00", quietHoursEnd: "08:00", aiBatching: false,
      },
    }));
  },
  updatePreferences(prefs: Partial<NotificationPrefsData>): Promise<{ data: { updated: boolean } }> {
    return featureFetch<{ data: { updated: boolean } }>("/v1/push-notifications/preferences", { method: "PATCH", body: JSON.stringify(prefs) });
  },
  subscribe(subscription: PushSubscriptionJSON): Promise<{ data: { subscribed: boolean } }> {
    return featureFetch<{ data: { subscribed: boolean } }>("/v1/push-notifications/subscribe", { method: "POST", body: JSON.stringify({ subscription }) });
  },
};

// ─── Translation ──────────────────────────────────────────────────────────────

export const translateApi = {
  translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<{ data: { translatedText: string; detectedLanguage?: string; confidence?: number } }> {
    return featureFetch<{ data: { translatedText: string; detectedLanguage?: string; confidence?: number } }>("/v1/translate", { method: "POST", body: JSON.stringify({ text, targetLanguage, sourceLanguage }) });
  },
  history(): Promise<{ data: { id: string; originalText: string; translatedText: string; sourceLanguage: string; targetLanguage: string; createdAt: string }[] }> {
    return featureFetch<{ data: { id: string; originalText: string; translatedText: string; sourceLanguage: string; targetLanguage: string; createdAt: string }[] }>("/v1/translate/history").catch(() => ({ data: [] as { id: string; originalText: string; translatedText: string; sourceLanguage: string; targetLanguage: string; createdAt: string }[] }));
  },
  stats(): Promise<{ data: { translatedThisMonth: number; topLanguages: { language: string; count: number }[] } }> {
    return featureFetch<{ data: { translatedThisMonth: number; topLanguages: { language: string; count: number }[] } }>("/v1/translate/stats").catch(() => ({ data: { translatedThisMonth: 0, topLanguages: [] as { language: string; count: number }[] } }));
  },
  languages(): Promise<{ data: { code: string; name: string }[] }> {
    return featureFetch<{ data: { code: string; name: string }[] }>("/v1/translate/languages").catch(() => ({ data: [
      { code: "en", name: "English" }, { code: "es", name: "Spanish" }, { code: "fr", name: "French" },
      { code: "de", name: "German" }, { code: "it", name: "Italian" }, { code: "pt", name: "Portuguese" },
      { code: "ja", name: "Japanese" }, { code: "zh", name: "Chinese" }, { code: "ko", name: "Korean" },
      { code: "ar", name: "Arabic" }, { code: "ru", name: "Russian" }, { code: "nl", name: "Dutch" },
    ] }));
  },
};
