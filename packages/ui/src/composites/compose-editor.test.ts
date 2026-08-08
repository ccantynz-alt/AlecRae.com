import { describe, it, expect } from "vitest";
import { resolveInitialFrom, type ComposeMailboxOption } from "./compose-editor";

/**
 * The "send as" default-selection logic. This is what decides which address a
 * business-email compose starts on, so its precedence is load-bearing:
 * default mailbox > first mailbox > the login-email fallback.
 */
describe("resolveInitialFrom", () => {
  const options: ComposeMailboxOption[] = [
    { address: "info@gluecron.com" },
    { address: "support@gluecron.com", isDefault: true },
    { address: "sales@gluecron.com" },
  ];

  it("returns the login value unchanged when there are no mailbox options", () => {
    expect(resolveInitialFrom("craig@gmail.com", undefined)).toBe("craig@gmail.com");
    expect(resolveInitialFrom("craig@gmail.com", [])).toBe("craig@gmail.com");
  });

  it("prefers the default mailbox over the first when options exist", () => {
    // The login email is not one of the real mailboxes, so it must not win.
    expect(resolveInitialFrom("craig@gmail.com", options)).toBe("support@gluecron.com");
  });

  it("falls back to the first mailbox when none is marked default", () => {
    const noDefault: ComposeMailboxOption[] = [
      { address: "info@gluecron.com" },
      { address: "sales@gluecron.com" },
    ];
    expect(resolveInitialFrom("", noDefault)).toBe("info@gluecron.com");
  });

  it("keeps an explicit initial address when it matches a real mailbox", () => {
    // e.g. a reply/draft that already named a specific mailbox — don't override it.
    expect(resolveInitialFrom("sales@gluecron.com", options)).toBe("sales@gluecron.com");
  });
});
