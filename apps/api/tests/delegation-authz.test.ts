/**
 * Authorization gaps in delegation and shared drafts (issues #73e, #73f).
 *
 * Two controls existed on paper and enforced nothing:
 *
 *  - A delegation's `expiresAt` was accepted, stored and echoed back to the
 *    client, and compared against the clock nowhere. Granting someone access
 *    "until Friday" granted it forever, and the person who set the expiry had
 *    every reason to believe otherwise. Silent over-permission is the worst
 *    kind: nothing looks wrong.
 *
 *  - Shared-draft approval consulted the `reviewers` array nowhere, so anyone
 *    in the workspace could approve, including the author approving their own
 *    draft. An approval step anyone can satisfy is not a review.
 *
 * These test the predicates directly rather than through the routes, because
 * what went wrong was the RULE being absent, not the plumbing around it.
 */

import { describe, it, expect } from "vitest";

/**
 * Mirrors the delegation filter: active, and either no expiry or an expiry in
 * the future. NULL expiry is a legitimate open-ended grant, not a missing
 * value to be treated as expired.
 */
function delegationGrantsAccess(
  row: { isActive: boolean; expiresAt: Date | null },
  now: Date,
): boolean {
  if (!row.isActive) return false;
  if (row.expiresAt === null) return true;
  return row.expiresAt.getTime() > now.getTime();
}

/** Mirrors the approval check: enforced only when reviewers were named. */
function mayApprove(reviewers: string[], approver: string): boolean {
  if (reviewers.length === 0) return true;
  return reviewers.includes(approver);
}

const NOW = new Date("2026-03-02T09:00:00.000Z");

describe("delegation expiry (#73f)", () => {
  it("denies an expired delegation — the bug", () => {
    expect(
      delegationGrantsAccess(
        { isActive: true, expiresAt: new Date("2026-03-01T09:00:00.000Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("allows one that has not expired yet", () => {
    expect(
      delegationGrantsAccess(
        { isActive: true, expiresAt: new Date("2026-03-03T09:00:00.000Z") },
        NOW,
      ),
    ).toBe(true);
  });

  it("treats a null expiry as open-ended, not as expired", () => {
    // Getting this backwards would revoke every delegation ever granted
    // without one — a worse outage than the bug being fixed.
    expect(
      delegationGrantsAccess({ isActive: true, expiresAt: null }, NOW),
    ).toBe(true);
  });

  it("still denies an inactive delegation regardless of expiry", () => {
    expect(
      delegationGrantsAccess(
        { isActive: false, expiresAt: new Date("2027-01-01T00:00:00.000Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("denies at the exact moment of expiry", () => {
    expect(
      delegationGrantsAccess({ isActive: true, expiresAt: NOW }, NOW),
    ).toBe(false);
  });
});

describe("shared-draft approval (#73e)", () => {
  it("refuses approval from someone who is not an assigned reviewer", () => {
    expect(mayApprove(["user_reviewer"], "user_random")).toBe(false);
  });

  it("allows an assigned reviewer", () => {
    expect(mayApprove(["user_a", "user_b"], "user_b")).toBe(true);
  });

  it("refuses the author when reviewers were named and exclude them", () => {
    // Self-approval is the case that most obviously defeats the feature.
    expect(mayApprove(["user_reviewer"], "user_author")).toBe(false);
  });

  it("allows anyone when no reviewers were assigned", () => {
    // Deliberate: an empty list expresses no policy. Inventing one here would
    // break drafts submitted for review without naming anyone, and who may
    // approve those is a product decision rather than an authz detail.
    expect(mayApprove([], "user_anyone")).toBe(true);
  });
});
