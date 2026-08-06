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

/**
 * The single source of truth for which plan tier unlocks which feature.
 *
 * This MUST stay in step with the server-side `requirePlan(...)` gates in
 * apps/api/src/server.ts — the UI gate is a courtesy, the server gate is the
 * enforcement. `PlanGate` derives its threshold from this map and takes no
 * per-call-site override, because a hand-passed threshold silently drifts:
 * the AI Triage page carried `required="personal"` against this map's "pro"
 * and the backend's `requirePlan("pro")`, so Personal-tier users were let
 * into the page and then 403'd by every request it made.
 *
 * `satisfies` (rather than a `Record<string, …>` annotation) keeps the exact
 * key union, so `PlanGate feature="typo"` is a compile error instead of an
 * undefined lookup at runtime.
 */
export const FEATURE_PLANS = {
  // AI Features
  ai_agent: "pro",
  voice_clone: "pro",
  video_meetings: "pro",
  email_query: "pro",
  knowledge_graph: "pro",
  programs: "pro", // programmable email — sandboxed code execution, cost/security profile like ai_agent
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
  // NB: the server gates /v1/sso/config on admin role only, with no
  // requirePlan(). This UI threshold is therefore stricter than the server's
  // — a Free-tier admin can still configure SSO via the API. Revenue-policy
  // gap, not a security hole (admin role is still required); left to a
  // deliberate decision rather than changed silently here.
  sso: "team",
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
} satisfies Record<string, PlanTier>;

/** Every gateable feature name. `PlanGate` accepts only these. */
export type FeatureKey = keyof typeof FEATURE_PLANS;
