"use client";

export type PlanTier = "free" | "personal" | "pro" | "team" | "enterprise";

const TIER_ORDER: PlanTier[] = ["free", "personal", "pro", "team", "enterprise"];

export function isPlanAtLeast(userPlan: PlanTier, required: PlanTier): boolean {
  return TIER_ORDER.indexOf(userPlan) >= TIER_ORDER.indexOf(required);
}

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  personal: "Personal",
  pro: "Pro",
  team: "Team",
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
  ai_categorization: "personal",
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
