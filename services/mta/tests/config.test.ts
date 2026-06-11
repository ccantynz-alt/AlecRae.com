/**
 * Tests for the MTA hostname configuration (services/mta/src/config.ts).
 *
 * The public SMTP hostname must default to the production `.com` host —
 * never the old `mail.alecrae.dev` placeholder (CLAUDE.md issue #26) —
 * with MTA_HOSTNAME taking precedence over the legacy SMTP_HOSTNAME.
 */

import { describe, it, expect } from "bun:test";
import { getMtaHostname } from "../src/config.js";

describe("getMtaHostname", () => {
  it("defaults to mail.alecrae.com with no env set", () => {
    expect(getMtaHostname({})).toBe("mail.alecrae.com");
  });

  it("never defaults to a .dev placeholder", () => {
    expect(getMtaHostname({})).not.toContain(".dev");
  });

  it("prefers MTA_HOSTNAME over SMTP_HOSTNAME", () => {
    expect(
      getMtaHostname({
        MTA_HOSTNAME: "mx1.alecrae.com",
        SMTP_HOSTNAME: "legacy.example.com",
      }),
    ).toBe("mx1.alecrae.com");
  });

  it("falls back to SMTP_HOSTNAME when MTA_HOSTNAME is unset", () => {
    expect(getMtaHostname({ SMTP_HOSTNAME: "smtp.example.com" })).toBe(
      "smtp.example.com",
    );
  });

  it("ignores blank values and falls through", () => {
    expect(
      getMtaHostname({ MTA_HOSTNAME: "  ", SMTP_HOSTNAME: "" }),
    ).toBe("mail.alecrae.com");
  });
});
