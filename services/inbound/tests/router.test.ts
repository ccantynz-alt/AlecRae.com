import { describe, it, expect, beforeEach } from "vitest";
import { MailboxRouter } from "../src/routing/router.js";

describe("MailboxRouter", () => {
  let router: MailboxRouter;

  beforeEach(() => {
    router = new MailboxRouter();

    // Register a test domain
    router.addDomain({
      domain: "example.com",
      accountId: "acct-1",
      catchAllMailbox: "catchall",
      enabled: true,
    });

    // Register mailboxes
    router.addMailbox({
      id: "mbox-alice",
      address: "alice@example.com",
      accountId: "acct-1",
      enabled: true,
    });

    router.addMailbox({
      id: "mbox-catchall",
      address: "catchall@example.com",
      accountId: "acct-1",
      enabled: true,
    });
  });

  it("resolves an exact mailbox match", async () => {
    const results = await router.resolve(["alice@example.com"]);
    const resolved = results.get("alice@example.com");

    expect(resolved).not.toBeNull();
    expect(resolved!.mailboxId).toBe("mbox-alice");
    expect(resolved!.accountId).toBe("acct-1");
    expect(resolved!.resolvedAddress).toBe("alice@example.com");
  });

  it("resolves sub-addressing (plus addressing) to the base mailbox", async () => {
    const results = await router.resolve(["alice+newsletter@example.com"]);
    const resolved = results.get("alice+newsletter@example.com");

    expect(resolved).not.toBeNull();
    expect(resolved!.mailboxId).toBe("mbox-alice");
    expect(resolved!.originalAddress).toBe("alice+newsletter@example.com");
    expect(resolved!.resolvedAddress).toBe("alice@example.com");
  });

  it("falls back to catch-all for unknown addresses on a managed domain", async () => {
    const results = await router.resolve(["unknown@example.com"]);
    const resolved = results.get("unknown@example.com");

    expect(resolved).not.toBeNull();
    expect(resolved!.mailboxId).toBe("mbox-catchall");
    expect(resolved!.rule.type).toBe("catch-all");
  });

  it("returns null for addresses on unmanaged domains", async () => {
    const results = await router.resolve(["user@other-domain.com"]);
    const resolved = results.get("user@other-domain.com");

    expect(resolved).toBeNull();
  });

  it("applies routing rules with exact match", async () => {
    router.addRule({
      id: "rule-1",
      pattern: "support@example.com",
      type: "exact",
      action: "deliver",
      destination: "alice@example.com",
      priority: 1,
    });

    const results = await router.resolve(["support@example.com"]);
    const resolved = results.get("support@example.com");

    expect(resolved).not.toBeNull();
    expect(resolved!.mailboxId).toBe("mbox-alice");
  });

  it("applies routing rules with prefix match", async () => {
    router.addRule({
      id: "rule-prefix",
      pattern: "sales*",
      type: "prefix",
      action: "deliver",
      destination: "alice@example.com",
      priority: 1,
    });

    const results = await router.resolve(["sales-team@example.com"]);
    const resolved = results.get("sales-team@example.com");

    expect(resolved).not.toBeNull();
    expect(resolved!.mailboxId).toBe("mbox-alice");
  });

  it("returns null for reject routing rules", async () => {
    router.addRule({
      id: "rule-reject",
      pattern: "noreply@example.com",
      type: "exact",
      action: "reject",
      destination: "",
      priority: 1,
    });

    const results = await router.resolve(["noreply@example.com"]);
    const resolved = results.get("noreply@example.com");

    expect(resolved).toBeNull();
  });

  it("resolves aliases to their target mailboxes", async () => {
    router.addAlias({
      address: "info@example.com",
      targets: ["alice@example.com"],
      enabled: true,
    });

    const results = await router.resolve(["info@example.com"]);
    const resolved = results.get("info@example.com");

    expect(resolved).not.toBeNull();
    expect(resolved!.mailboxId).toBe("mbox-alice");
    expect(resolved!.originalAddress).toBe("info@example.com");
  });

  it("falls back to default domain delivery when no catch-all mailbox matches", async () => {
    // Create a domain without a catch-all mailbox configured in mailboxes
    router.addDomain({
      domain: "no-catchall.com",
      accountId: "acct-2",
      enabled: true,
    });

    const results = await router.resolve(["anyone@no-catchall.com"]);
    const resolved = results.get("anyone@no-catchall.com");

    // Should fall through to default domain delivery (accountId inbox)
    expect(resolved).not.toBeNull();
    expect(resolved!.accountId).toBe("acct-2");
    expect(resolved!.mailboxId).toBe("inbox");
  });
});
