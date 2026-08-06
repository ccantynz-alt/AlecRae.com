/**
 * Tests for the outbound spam gate (reputation protection on the send path).
 *
 * `SpamClassifier` in services/ai-engine was fully built and tested but had
 * ZERO production callers — nothing outside its own test file imported it. So
 * an authenticated account could push phishing/419 content through the API and
 * we would DKIM-sign it and relay it from our sending IP. That is how the
 * sending domain gets blocklisted.
 *
 * The two properties that matter most here are opposites, and both are easy to
 * get wrong:
 *   - obvious spam must be refused
 *   - ordinary business mail must NOT be refused (a false positive blocks a
 *     paying customer's real mail, which is its own kind of outage)
 *
 * The gate deliberately scores on the content layer only. The Bayesian layer
 * returns a flat 0.5 when untrained — and no trained model ships — and the
 * header layer scores a Received chain that an unsent message does not have.
 * Including either would put a constant false-positive floor under every send.
 */

import { describe, it, expect, afterEach } from "vitest";
import { checkOutboundSpam } from "../src/lib/outbound-spam-gate.js";

const BASE = {
  messageId: "<msg-1@alecrae.com>",
  accountId: "acct_1",
  from: "sender@alecrae.com",
  to: ["recipient@example.com"],
};

afterEach(() => {
  delete process.env["OUTBOUND_SPAM_BLOCK_SCORE"];
  delete process.env["OUTBOUND_SPAM_REVIEW_SCORE"];
});

describe("outbound spam gate — legitimate mail is not blocked", () => {
  it("allows an ordinary transactional email", async () => {
    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Your invoice for July",
      text:
        "Hi Sarah, thanks for your order. Your invoice is attached and payment " +
        "is due on the 14th. Let me know if anything looks wrong. Best, Craig",
    });

    expect(r.allowed).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.score).not.toBeNull();
  });

  it("allows a normal reply with a legitimate link", async () => {
    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Re: Tuesday's meeting",
      text: "Moved it to 3pm. Agenda is here: https://docs.alecrae.com/agenda/q3",
    });

    expect(r.allowed).toBe(true);
  });

  it("allows a plain HTML newsletter", async () => {
    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Product update — July",
      html:
        "<p>Hello,</p><p>This month we shipped scheduled send and improved " +
        "search. Full notes on our blog.</p>" +
        '<p><a href="https://alecrae.com/blog/july">Read the notes</a></p>',
    });

    expect(r.allowed).toBe(true);
  });
});

describe("outbound spam gate — abusive content is refused", () => {
  it("blocks a classic advance-fee (419) message", async () => {
    const r = await checkOutboundSpam({
      ...BASE,
      subject: "URGENT BUSINESS PROPOSAL",
      text:
        "DEAR FRIEND!!! I AM A BARRISTER AND MY CLIENT LEFT $47,500,000.00 " +
        "UNCLAIMED!!! THIS IS 100% RISK FREE AND GUARANTEED!!! ACT NOW!!! " +
        "CLICK HERE http://bit.ly/x9f2 TO CLAIM YOUR CASH BONUS!!! " +
        "SEND YOUR BANK DETAILS AND SOCIAL SECURITY NUMBER NOW!!! " +
        "THIS IS A LIMITED TIME OFFER, ORDER NOW, NO CREDIT CHECK, " +
        "EARN EXTRA CASH, MAKE MONEY FAST, WORK FROM HOME!!!",
    });

    expect(r.allowed).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.reasons.length).toBeGreaterThan(0);
    // Reasons reach the customer in the 422 body, so they must describe the
    // layer that actually scored. The header layer is weighted to 0 here, and
    // "authentication failures" is meaningless for an unsent message.
    expect(r.reasons.join(" ")).not.toMatch(/[Aa]uthentication/);
    expect(r.reasons.join(" ")).toMatch(/spam phrases/);
  });

  it("blocks when the configured threshold is lowered", async () => {
    // Proves the threshold is honoured rather than hardcoded — an operator can
    // tighten the gate during an active abuse incident without a deploy.
    process.env["OUTBOUND_SPAM_BLOCK_SCORE"] = "0.01";

    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Click here to claim your free prize",
      text: "ACT NOW!!! This is a limited time offer, click here for your free gift!!!",
    });

    expect(r.allowed).toBe(false);
  });

  it("never blocks when the threshold is set to its maximum", async () => {
    process.env["OUTBOUND_SPAM_BLOCK_SCORE"] = "1";

    const r = await checkOutboundSpam({
      ...BASE,
      subject: "URGENT!!! FREE MONEY!!!",
      text: "CLICK HERE NOW!!! http://bit.ly/abc GUARANTEED CASH!!! ACT NOW!!!",
    });

    expect(r.allowed).toBe(true);
  });
});

describe("outbound spam gate — operational behaviour", () => {
  it("flags borderline content for review without blocking it", async () => {
    process.env["OUTBOUND_SPAM_REVIEW_SCORE"] = "0.01";
    process.env["OUTBOUND_SPAM_BLOCK_SCORE"] = "0.99";

    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Special offer inside",
      text: "Act now for a limited time offer! Click here: http://bit.ly/xyz",
    });

    expect(r.allowed).toBe(true);
    expect(r.review).toBe(true);
  });

  it("ignores an out-of-range threshold and falls back to the default", async () => {
    process.env["OUTBOUND_SPAM_BLOCK_SCORE"] = "not-a-number";

    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Your invoice for July",
      text: "Hi Sarah, thanks for your order. The invoice is attached.",
    });

    expect(r.allowed).toBe(true);
    expect(r.degraded).toBe(false);
  });

  it("handles an empty body without throwing", async () => {
    const r = await checkOutboundSpam({ ...BASE, subject: "", text: "" });

    expect(r.allowed).toBe(true);
    expect(r.degraded).toBe(false);
  });

  it("scores a message with only an HTML body", async () => {
    const r = await checkOutboundSpam({
      ...BASE,
      subject: "Hello",
      html: "<p>Just checking in about the contract.</p>",
    });

    expect(r.allowed).toBe(true);
    expect(r.score).not.toBeNull();
  });
});
