import { describe, it, expect } from "bun:test";
import { parseComplianceFailures, type ComplianceData } from "../src/postmaster/compliance.js";

function compliantData(): ComplianceData {
  return {
    domainId: "domains/alecrae.com",
    rowData: [
      { requirement: "SPF", status: { status: "COMPLIANT" } },
      { requirement: "DKIM", status: { status: "COMPLIANT" } },
      { requirement: "DMARC_POLICY", status: { status: "COMPLIANT" } },
    ],
    oneClickUnsubscribeVerdict: { status: { status: "COMPLIANT" } },
    honorUnsubscribeVerdict: { status: { status: "COMPLIANT" } },
    deliverabilityStatusVerdict: { state: { status: "COMPLIANT" } },
  };
}

describe("parseComplianceFailures", () => {
  it("returns no failures when every row and verdict is COMPLIANT", () => {
    expect(parseComplianceFailures(compliantData())).toEqual([]);
  });

  it("flags a NEEDS_WORK row with its remediation", () => {
    const data = compliantData();
    data.rowData = [
      { requirement: "SPF", status: { status: "COMPLIANT" } },
      { requirement: "DKIM", status: { status: "NEEDS_WORK" } },
    ];
    const failures = parseComplianceFailures(data);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.requirement).toBe("DKIM");
    expect(failures[0]?.remediation).toContain("DKIM");
  });

  it("flags a failing one-click-unsubscribe verdict with its reason", () => {
    const data = compliantData();
    data.oneClickUnsubscribeVerdict = {
      status: { status: "NEEDS_WORK" },
      reason: "NO_UNSUB_GENERAL",
    };
    const failures = parseComplianceFailures(data);
    expect(failures.some((f) => f.requirement === "ONE_CLICK_UNSUBSCRIBE")).toBe(true);
    const failure = failures.find((f) => f.requirement === "ONE_CLICK_UNSUBSCRIBE");
    expect(failure?.reason).toBe("NO_UNSUB_GENERAL");
  });

  it("flags a failing deliverability verdict (uses `state` not `status`)", () => {
    const data = compliantData();
    data.deliverabilityStatusVerdict = {
      state: { status: "NEEDS_WORK" },
      reason: "SPAM_RATE_HIGH",
    };
    const failures = parseComplianceFailures(data);
    expect(failures.some((f) => f.requirement === "DELIVERABILITY")).toBe(true);
  });

  it("collects multiple simultaneous failures", () => {
    const data = compliantData();
    data.rowData = [{ requirement: "SPF", status: { status: "NEEDS_WORK" } }];
    data.honorUnsubscribeVerdict = { status: { status: "NEEDS_WORK" }, reason: "NOT_HONORING" };
    expect(parseComplianceFailures(data)).toHaveLength(2);
  });
});
