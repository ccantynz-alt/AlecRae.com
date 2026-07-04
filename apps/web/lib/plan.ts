"use client";

export type PlanTier =
  | "free"
  | "personal"
  | "pro"
  | "team"
  | "business"
  | "business_plus"
  | "enterprise";

// The API/DB uses different tier names than the frontend. This maps DB values
// to frontend PlanTier values so isPlanAtLeast() doesn't return -1 for paying customers.
const API_TIER_MAP: Record<string, PlanTier> = {
  free: "free",
  starter: "personal",
  professional: "pro",
  team: "team",
  business: "business",
  business_plus: "business_plus",
  enterprise: "enterprise",
};

export function normalizeApiPlanTier(apiTier: string | undefined | null): PlanTier {
  if (!apiTier) return "free";
  return API_TIER_MAP[apiTier] ?? "free";
}

const TIER_ORDER: PlanTier[] = [
  "free",
  "personal",
  "pro",
  "team",
  "business",
  "business_plus",
  "enterprise",
];

export function isPlanAtLeast(
  userPlan: PlanTier | undefined | null,
  required: PlanTier,
): boolean {
  const idx = TIER_ORDER.indexOf(userPlan as PlanTier);
  if (idx === -1) return false; // unknown or missing plan → deny
  return idx >= TIER_ORDER.indexOf(required);
}

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  personal: "Personal",
  pro: "Pro",
  team: "Team",
  business: "Business",
  business_plus: "Business Plus",
  enterprise: "Enterprise",
};

export const FEATURE_PLANS: Record<string, PlanTier> = {
  // AI Features
  ai_agent: "pro",
  voice_clone: "pro",
  video_meetings: "pro",
  email_query: "pro",
  knowledge_graph: "pro",
  sentiment_timeline: "pro",
  ai_categorization: "pro", // batch Claude calls → cost risk; Personal tier too low
  productivity_analytics: "pro",
  semantic_search: "pro",
  context_intelligence: "pro",
  scheduling_intelligence: "pro",
  attachment_intelligence: "pro",
  // Personal+ features
  grammar_full: "personal",
  voice_dictation: "personal",
  translation: "personal",
  e2e_encryption: "personal",
  email_recall: "personal",
  contact_enrichment: "personal",
  email_hygiene: "personal",
  files: "personal",
  send_time_optimization: "personal",
  security: "personal",
  // Team features
  shared_inboxes: "team",
  delegation: "team",
  team_chat: "team",
  collaboration: "team",
  // Free features
  grammar_basic: "free",
  templates: "free",
  contacts: "free",
  calendar: "free",
  snooze: "free",
  labels: "free",
  search: "free",
  analytics_basic: "free",
  gamification: "free",
};
