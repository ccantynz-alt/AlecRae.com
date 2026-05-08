/**
 * Improvement targets per metric, lifted from `.ai-flywheel/config.json`.
 *
 * Each metric has a target value, direction (maximize or minimize), and a
 * threshold below/above which it counts as "warming" vs "tuned" vs "expert".
 * Used by both /admin/flywheel and /your-alecrae rendering.
 */

import type { SignalCategory } from "./types.js";

export interface MetricTarget {
  readonly key: string;
  readonly label: string;
  readonly category: SignalCategory;
  readonly target: number;
  readonly direction: "maximize" | "minimize";
  readonly unit: "rate" | "count" | "ms" | "edit_distance";
  readonly description: string;
}

export const METRIC_TARGETS: readonly MetricTarget[] = [
  {
    key: "compose_acceptance_rate",
    label: "Compose acceptance",
    category: "compose",
    target: 0.65,
    direction: "maximize",
    unit: "rate",
    description:
      "Share of AI-drafted emails sent without being discarded. Higher = drafts feel like the user wrote them.",
  },
  {
    key: "triage_accuracy",
    label: "Triage accuracy",
    category: "triage",
    target: 0.92,
    direction: "maximize",
    unit: "rate",
    description:
      "Share of priority-inbox classifications where the user's action matched the AI's priority.",
  },
  {
    key: "smart_reply_acceptance_rate",
    label: "Smart reply acceptance",
    category: "smart_reply",
    target: 0.55,
    direction: "maximize",
    unit: "rate",
    description: "Share of suggested replies that were chosen and sent.",
  },
  {
    key: "voice_profile_edit_distance",
    label: "Voice profile edit distance",
    category: "voice_profile",
    target: 0.1,
    direction: "minimize",
    unit: "edit_distance",
    description:
      "Average edit distance between AI draft and final sent message. Lower = AI sounds more like the user.",
  },
  {
    key: "phishing_false_positive_rate",
    label: "Phishing false positive rate",
    category: "phishing",
    target: 0.02,
    direction: "minimize",
    unit: "rate",
    description: "Share of phishing flags the user marked as safe. Lower = fewer over-cautious blocks.",
  },
  {
    key: "search_satisfaction_rate",
    label: "Search satisfaction",
    category: "search",
    target: 0.8,
    direction: "maximize",
    unit: "rate",
    description: "Share of searches where the user clicked a result and didn't immediately re-query.",
  },
  {
    key: "inbox_agent_approval_rate",
    label: "Inbox agent approval",
    category: "inbox_agent",
    target: 0.7,
    direction: "maximize",
    unit: "rate",
    description: "Share of overnight-agent draft proposals approved by the user in the morning briefing.",
  },
  {
    key: "voice_clone_unchanged_rate",
    label: "Voice clone unchanged-on-send",
    category: "voice_clone",
    target: 0.6,
    direction: "maximize",
    unit: "rate",
    description:
      "Share of voice-cloned drafts sent without any edits. Higher = the clone is indistinguishable from the user.",
  },
] as const;

/**
 * Score a single metric against its target. Returns 0..1 where 1 = at-or-past target.
 */
export function scoreAgainstTarget(value: number, target: MetricTarget): number {
  if (target.direction === "maximize") {
    if (target.target <= 0) return 1;
    return Math.max(0, Math.min(1, value / target.target));
  }
  // minimize: target is the *cap*; perfect = 0, terrible = target * 5
  if (target.target <= 0) return value <= 0 ? 1 : 0;
  if (value <= target.target) return 1;
  const cap = target.target * 5;
  if (value >= cap) return 0;
  return Math.max(0, Math.min(1, 1 - (value - target.target) / (cap - target.target)));
}
