/**
 * Tests for the owner allowlist (founder / staff full-access accounts).
 *
 * Verifies:
 *  1. The built-in founder email is always an owner (zero-config)
 *  2. OWNER_EMAILS env adds owners, case/whitespace-insensitively
 *  3. Non-owners are not matched
 *  4. reconcileOwnerPlan upgrades a behind owner account and is a no-op otherwise
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn(() => ({ where: updateWhere }));
const update = vi.fn(() => ({ set: updateSet }));

vi.mock("@alecrae/db", () => ({
  getDatabase: () => ({ update }),
  accounts: { id: "accounts.id", planTier: "accounts.plan_tier" },
}));

import {
  isOwnerEmail,
  reconcileOwnerPlan,
  OWNER_PLAN_TIER,
} from "../src/lib/owner-allowlist.js";

const ORIGINAL_ENV = process.env["OWNER_EMAILS"];

beforeEach(() => {
  update.mockClear();
  updateSet.mockClear();
  updateWhere.mockClear();
  delete process.env["OWNER_EMAILS"];
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env["OWNER_EMAILS"];
  else process.env["OWNER_EMAILS"] = ORIGINAL_ENV;
});

describe("isOwnerEmail", () => {
  it("always matches the built-in founder email (zero config)", () => {
    expect(isOwnerEmail("ccantynz@gmail.com")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isOwnerEmail("  CCantyNZ@Gmail.com ")).toBe(true);
  });

  it("matches additional owners from OWNER_EMAILS", () => {
    process.env["OWNER_EMAILS"] = "staff@alecrae.com, second@alecrae.com";
    expect(isOwnerEmail("staff@alecrae.com")).toBe(true);
    expect(isOwnerEmail("second@alecrae.com")).toBe(true);
  });

  it("does not match a non-owner", () => {
    expect(isOwnerEmail("random@example.com")).toBe(false);
  });
});

describe("reconcileOwnerPlan", () => {
  it("upgrades an owner account that is behind the owner tier", async () => {
    const tier = await reconcileOwnerPlan("acc_1", "ccantynz@gmail.com", "free");
    expect(tier).toBe(OWNER_PLAN_TIER);
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({ planTier: OWNER_PLAN_TIER });
  });

  it("is a no-op when the owner is already on the owner tier", async () => {
    const tier = await reconcileOwnerPlan(
      "acc_1",
      "ccantynz@gmail.com",
      OWNER_PLAN_TIER,
    );
    expect(tier).toBe(OWNER_PLAN_TIER);
    expect(update).not.toHaveBeenCalled();
  });

  it("never writes for a non-owner and returns the current tier", async () => {
    const tier = await reconcileOwnerPlan("acc_1", "random@example.com", "free");
    expect(tier).toBe("free");
    expect(update).not.toHaveBeenCalled();
  });
});
