/**
 * Issue #166 — rule-engine reported rules as applied while silently skipping
 * unimplemented action types behind a console.warn. A rule whose only action
 * was forward/auto_reply counted as applied (matchCount++) with nothing
 * executed — a user had every reason to believe replies were being sent.
 *
 * Now runRulesForEmail returns `skippedActions` naming, per matching rule,
 * every requested action type that no executor exists for; the implemented
 * actions still run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmailRuleAction } from "@alecrae/db";

let selectResults: unknown[][] = [];
let selectCall = 0;
let updates: { table: unknown; values: Record<string, unknown> }[] = [];

function chain(result: () => unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "groupBy", "orderBy", "limit"]) {
    c[m] = vi.fn(() => c);
  }
  c["then"] = (resolve: (v: unknown) => unknown) => resolve(result());
  return c;
}

const mockDb = {
  select: vi.fn(() => {
    const idx = selectCall++;
    return chain(() => selectResults[idx] ?? []);
  }),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    }),
  })),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

import {
  partitionRuleActions,
  runRulesForEmail,
} from "../src/lib/rule-engine.js";

const EMAIL = {
  from: { address: "sender@example.com", name: "Sender" },
  to: [{ address: "me@mine.com" }],
  cc: [],
  subject: "Weekly newsletter",
  textBody: "Hello",
  htmlBody: null,
};

function rule(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "r1",
    name: "Newsletter handling",
    accountId: "acct_1",
    enabled: true,
    conditions: [{ field: "subject", operator: "contains", value: "newsletter" }],
    matchMode: "all",
    actions: [{ type: "star" }],
    matchCount: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
  updates = [];
});

describe("partitionRuleActions", () => {
  it("splits implemented from unimplemented action types", () => {
    const actions = [
      { type: "star" },
      { type: "auto_reply", value: "Thanks!" },
      { type: "archive" },
      { type: "forward", value: "boss@x.com" },
      { type: "label", value: "l1" },
      { type: "mark_important" },
    ] as EmailRuleAction[];

    const { implemented, unimplemented } = partitionRuleActions(actions);
    expect(implemented.map((a) => a.type)).toEqual(["star", "archive"]);
    expect(unimplemented).toEqual([
      "auto_reply",
      "forward",
      "label",
      "mark_important",
    ]);
  });

  it("reports nothing skipped for a fully-implemented rule", () => {
    const { unimplemented } = partitionRuleActions([
      { type: "archive" },
      { type: "mark_read" },
    ] as EmailRuleAction[]);
    expect(unimplemented).toEqual([]);
  });
});

describe("runRulesForEmail", () => {
  it("reports skipped-as-unimplemented actions for a matching rule, while still applying the rest", async () => {
    selectResults = [
      [rule({ actions: [{ type: "star" }, { type: "auto_reply", value: "hi" }] })],
    ];

    const result = await runRulesForEmail("acct_1", "em_1", EMAIL);

    expect(result.matchedRuleIds).toEqual(["r1"]);
    expect(result.skippedActions).toEqual([
      { ruleId: "r1", ruleName: "Newsletter handling", actionTypes: ["auto_reply"] },
    ]);

    // The implemented half genuinely ran: one email update (star), one
    // matchCount update.
    const emailUpdate = updates.find((u) => "isStarred" in u.values);
    expect(emailUpdate?.values).toMatchObject({ isStarred: true });
  });

  it("reports nothing skipped when every action is implemented", async () => {
    selectResults = [[rule({ actions: [{ type: "archive" }] })]];
    const result = await runRulesForEmail("acct_1", "em_1", EMAIL);
    expect(result.matchedRuleIds).toEqual(["r1"]);
    expect(result.skippedActions).toEqual([]);
  });

  it("reports nothing at all for a rule that does not match", async () => {
    selectResults = [
      [
        rule({
          conditions: [{ field: "subject", operator: "contains", value: "invoice" }],
          actions: [{ type: "auto_reply", value: "hi" }],
        }),
      ],
    ];
    const result = await runRulesForEmail("acct_1", "em_1", EMAIL);
    expect(result.matchedRuleIds).toEqual([]);
    expect(result.skippedActions).toEqual([]);
    expect(updates).toHaveLength(0);
  });
});
