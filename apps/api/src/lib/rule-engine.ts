/**
 * Email rules execution engine.
 *
 * routes/ai-rules.ts turns natural language ("filter marketing emails to a
 * separate folder") into a real, well-formed row in `email_rules` — but
 * until this file, nothing ever read that table back and applied it to
 * incoming mail. A user could create a dozen rules and every one of them
 * would sit inert forever. This module is the missing other half: given a
 * newly-stored email, find the account's enabled rules, evaluate their
 * conditions, and run their actions.
 *
 * Scope: 7 of the 11 action types are implemented (move/archive/star/
 * mark_read/delete/snooze/categorize) — the ones expressible as a state
 * change on the `emails` row using the columns added for archive/delete/
 * star/snooze. `label` is skipped deliberately: the codebase has two
 * competing label systems (the email_labels join table and a tags-based
 * one) and this engine picking one would deepen that split rather than fix
 * it. `mark_important`, `forward`, and `auto_reply` are skipped because they
 * need capabilities (a starred-vs-important distinction, actually sending
 * mail) this pass doesn't add. Skipped actions are logged, not silently
 * dropped.
 *
 * Similarly, condition evaluation only covers fields available at mail-
 * ingest time (from/to/cc/subject/body). has_attachment/size/label/
 * is_newsletter/is_transactional aren't computed at this layer yet, so
 * those conditions always evaluate false rather than guessing.
 */

import { eq, and } from "drizzle-orm";
import { getDatabase, emailRules, emails } from "@alecrae/db";
import type { EmailRuleCondition, EmailRuleAction } from "@alecrae/db";

export interface RuleEvaluationInput {
  from: { address: string; name?: string | null };
  to: { address: string; name?: string | null }[];
  cc: { address: string; name?: string | null }[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
}

function fieldText(email: RuleEvaluationInput, field: EmailRuleCondition["field"]): string | null {
  switch (field) {
    case "from":
      return `${email.from.address} ${email.from.name ?? ""}`.trim();
    case "to":
      return email.to.map((a) => `${a.address} ${a.name ?? ""}`).join(" ").trim();
    case "cc":
      return email.cc.map((a) => `${a.address} ${a.name ?? ""}`).join(" ").trim();
    case "subject":
      return email.subject;
    case "body":
      return email.textBody ?? email.htmlBody ?? "";
    // Not computed at ingest time — see module doc.
    case "has_attachment":
    case "size":
    case "label":
    case "is_newsletter":
    case "is_transactional":
      return null;
    default:
      return null;
  }
}

function matchesCondition(email: RuleEvaluationInput, condition: EmailRuleCondition): boolean {
  const text = fieldText(email, condition.field);
  if (text === null) return false; // unsupported field at this layer — never matches

  const haystack = text.toLowerCase();
  const needle = condition.value.toLowerCase();

  switch (condition.operator) {
    case "contains":
      return haystack.includes(needle);
    case "not_contains":
      return !haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "starts_with":
      return haystack.startsWith(needle);
    case "ends_with":
      return haystack.endsWith(needle);
    case "matches_regex":
      try {
        return new RegExp(condition.value, "i").test(text);
      } catch {
        return false; // invalid regex saved by a rule — never matches rather than throwing
      }
    case "greater_than":
    case "less_than":
      // Only meaningful for numeric fields (size), which aren't available
      // at this layer yet.
      return false;
    case "is_true":
    case "is_false":
      // Only meaningful for boolean fields (has_attachment, is_newsletter,
      // is_transactional), which return null above and never reach here.
      return false;
    default:
      return false;
  }
}

export function matchesRule(
  email: RuleEvaluationInput,
  rule: { conditions: EmailRuleCondition[]; matchMode: "all" | "any" },
): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.matchMode === "any"
    ? rule.conditions.some((c) => matchesCondition(email, c))
    : rule.conditions.every((c) => matchesCondition(email, c));
}

const IMPLEMENTED_ACTIONS = new Set<EmailRuleAction["type"]>([
  "move",
  "archive",
  "star",
  "mark_read",
  "delete",
  "snooze",
  "categorize",
]);

async function applyActions(emailId: string, actions: EmailRuleAction[]): Promise<void> {
  const db = getDatabase();
  const updates: Record<string, unknown> = {};
  let metadataPatch: Record<string, string> | null = null;

  for (const action of actions) {
    switch (action.type) {
      case "move":
        if (action.value === "inbox" || action.value === "archive" || action.value === "trash") {
          updates["folder"] = action.value;
        }
        break;
      case "archive":
        updates["folder"] = "archive";
        break;
      case "delete":
        updates["folder"] = "trash";
        break;
      case "star":
        updates["isStarred"] = true;
        break;
      case "mark_read":
        updates["isRead"] = true;
        break;
      case "snooze": {
        const until = action.value ? new Date(action.value) : null;
        if (until && !Number.isNaN(until.getTime()) && until > new Date()) {
          updates["folder"] = "snoozed";
          metadataPatch = { ...(metadataPatch ?? {}), snoozedUntil: until.toISOString() };
        }
        break;
      }
      case "categorize":
        if (action.value) {
          metadataPatch = { ...(metadataPatch ?? {}), ai_category: action.value };
        }
        break;
      default:
        if (!IMPLEMENTED_ACTIONS.has(action.type)) {
          console.warn(`[rule-engine] Action type "${action.type}" is not yet implemented — skipped.`);
        }
    }
  }

  if (metadataPatch) {
    const [row] = await db.select({ metadata: emails.metadata }).from(emails).where(eq(emails.id, emailId)).limit(1);
    updates["metadata"] = { ...(row?.metadata ?? {}), ...metadataPatch };
  }

  if (Object.keys(updates).length === 0) return;
  updates["updatedAt"] = new Date();
  await db.update(emails).set(updates).where(eq(emails.id, emailId));
}

/**
 * Evaluate every enabled rule for `accountId` against a newly-stored email
 * and apply the actions of every rule that matches. Increments matchCount on
 * each matching rule. Call this after the email row exists (needs its id).
 */
export async function runRulesForEmail(
  accountId: string,
  emailId: string,
  email: RuleEvaluationInput,
): Promise<{ matchedRuleIds: string[] }> {
  const db = getDatabase();
  const rules = await db
    .select()
    .from(emailRules)
    .where(and(eq(emailRules.accountId, accountId), eq(emailRules.enabled, true)));

  const matched: string[] = [];

  for (const rule of rules) {
    if (!matchesRule(email, { conditions: rule.conditions, matchMode: rule.matchMode })) continue;

    matched.push(rule.id);
    await applyActions(emailId, rule.actions);
    await db
      .update(emailRules)
      .set({ matchCount: rule.matchCount + 1, updatedAt: new Date() })
      .where(eq(emailRules.id, rule.id));
  }

  return { matchedRuleIds: matched };
}
