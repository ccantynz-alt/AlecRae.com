/**
 * Regression test for issue #116(c): dunning notification email templates.
 * (Wiring of these into the billing.ts state machine is covered separately
 * in billing-dunning-notifications.test.ts.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendTransactionalEmailMock = vi.fn().mockResolvedValue({ sent: true, provider: "vapron" });

vi.mock("../src/lib/transactional-email.js", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

describe("dunning email notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendTransactionalEmailMock.mockResolvedValue({ sent: true, provider: "vapron" });
    process.env["VAPRON_DUNNING_EMAILS"] = "true";
  });

  it("sendPaymentFailedEmail is a no-op when VAPRON_DUNNING_EMAILS is not set", async () => {
    delete process.env["VAPRON_DUNNING_EMAILS"];
    const { sendPaymentFailedEmail } = await import("../src/lib/dunning-emails.js");
    await sendPaymentFailedEmail(
      { email: "a@b.com", name: "A" },
      "starter",
      new Date("2026-08-01"),
    );
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it("sendPaymentFailedEmail sends to the account's billing email when enabled", async () => {
    const { sendPaymentFailedEmail } = await import("../src/lib/dunning-emails.js");
    await sendPaymentFailedEmail(
      { email: "billing@acme.com", name: "Acme Corp" },
      "professional",
      new Date("2026-08-01"),
    );

    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const call = sendTransactionalEmailMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe("billing@acme.com");
    expect(call.subject).toMatch(/didn't go through/i);
    expect(call.html).toContain("Acme Corp");
    expect(call.html).toContain("Professional");
  });

  it("sendDowngradedEmail references the plan that was lost", async () => {
    const { sendDowngradedEmail } = await import("../src/lib/dunning-emails.js");
    await sendDowngradedEmail({ email: "billing@acme.com", name: "Acme Corp" }, "starter");

    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const call = sendTransactionalEmailMock.mock.calls[0]?.[0] as { subject: string; html: string };
    expect(call.subject).toMatch(/downgraded/i);
    expect(call.html).toContain("Starter");
  });

  it("sendPaymentRecoveredEmail mentions the restored plan when one was restored", async () => {
    const { sendPaymentRecoveredEmail } = await import("../src/lib/dunning-emails.js");
    await sendPaymentRecoveredEmail({ email: "billing@acme.com", name: "Acme Corp" }, "starter");

    const call = sendTransactionalEmailMock.mock.calls[0]?.[0] as { html: string };
    expect(call.html).toContain("restored");
    expect(call.html).toContain("Starter");
  });

  it("sendPaymentRecoveredEmail handles no restored plan (recovered before any downgrade)", async () => {
    const { sendPaymentRecoveredEmail } = await import("../src/lib/dunning-emails.js");
    await sendPaymentRecoveredEmail({ email: "billing@acme.com", name: "Acme Corp" }, null);

    const call = sendTransactionalEmailMock.mock.calls[0]?.[0] as { html: string };
    expect(call.html).toContain("good standing");
  });

  it("a send failure is swallowed, never thrown", async () => {
    sendTransactionalEmailMock.mockRejectedValueOnce(new Error("provider down"));
    const { sendPaymentFailedEmail } = await import("../src/lib/dunning-emails.js");
    await expect(
      sendPaymentFailedEmail({ email: "a@b.com", name: "A" }, "starter", new Date()),
    ).resolves.toBeUndefined();
  });
});
