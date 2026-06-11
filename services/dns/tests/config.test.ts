/**
 * Tests for the env-driven DNS service configuration (services/dns/src/config.ts).
 *
 * Verifies that:
 *  - Production `.com` defaults are used when no env vars are set (issue #26)
 *  - Every value is overridable via env
 *  - Prefixes (include:, mailto:) are normalized
 *  - The legacy DNS_MX_PRIMARY/DNS_MX_SECONDARY and DNS_BOUNCE_DOMAIN
 *    fallbacks from .env.example are honored
 *  - Malformed input falls back to the safe defaults
 */

import { describe, it, expect } from "vitest";
import { getDnsConfig } from "../src/config";

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe("getDnsConfig — defaults", () => {
  it("uses production .com defaults with no env set (no .dev placeholders)", () => {
    const cfg = getDnsConfig(EMPTY_ENV);

    expect(cfg.mxHosts).toEqual([
      { host: "mx1.alecrae.com", priority: 10 },
      { host: "mx2.alecrae.com", priority: 20 },
    ]);
    expect(cfg.spfInclude).toBe("include:_spf.alecrae.com");
    expect(cfg.spfValue).toBe("v=spf1 include:_spf.alecrae.com ~all");
    expect(cfg.dmarcRua).toBe("mailto:dmarc@alecrae.com");
    expect(cfg.dmarcValue).toBe(
      "v=DMARC1; p=quarantine; rua=mailto:dmarc@alecrae.com; pct=100",
    );
    expect(cfg.returnPathHost).toBe("bounce.alecrae.com");
    expect(cfg.nsHosts).toEqual(["ns1.alecrae.com", "ns2.alecrae.com"]);
  });

  it("never contains an alecrae.dev placeholder anywhere", () => {
    const cfg = getDnsConfig(EMPTY_ENV);
    const flattened = JSON.stringify(cfg);
    expect(flattened).not.toContain("alecrae.dev");
  });
});

describe("getDnsConfig — env overrides", () => {
  it("parses DNS_MX_HOSTS with explicit priorities", () => {
    const cfg = getDnsConfig({
      DNS_MX_HOSTS: "mxa.example.com:5, mxb.example.com:15",
    });
    expect(cfg.mxHosts).toEqual([
      { host: "mxa.example.com", priority: 5 },
      { host: "mxb.example.com", priority: 15 },
    ]);
  });

  it("assigns positional priorities (10, 20, ...) when omitted", () => {
    const cfg = getDnsConfig({ DNS_MX_HOSTS: "mxa.example.com,mxb.example.com" });
    expect(cfg.mxHosts).toEqual([
      { host: "mxa.example.com", priority: 10 },
      { host: "mxb.example.com", priority: 20 },
    ]);
  });

  it("honors legacy DNS_MX_PRIMARY / DNS_MX_SECONDARY when DNS_MX_HOSTS is unset", () => {
    const cfg = getDnsConfig({
      DNS_MX_PRIMARY: "mx1.example.com",
      DNS_MX_SECONDARY: "mx2.example.com",
    });
    expect(cfg.mxHosts).toEqual([
      { host: "mx1.example.com", priority: 10 },
      { host: "mx2.example.com", priority: 20 },
    ]);
  });

  it("normalizes DNS_SPF_INCLUDE with or without the include: prefix", () => {
    expect(getDnsConfig({ DNS_SPF_INCLUDE: "spf.example.com" }).spfInclude).toBe(
      "include:spf.example.com",
    );
    expect(
      getDnsConfig({ DNS_SPF_INCLUDE: "include:spf.example.com" }).spfInclude,
    ).toBe("include:spf.example.com");
  });

  it("normalizes DNS_DMARC_RUA with or without mailto:", () => {
    expect(getDnsConfig({ DNS_DMARC_RUA: "dmarc@example.com" }).dmarcRua).toBe(
      "mailto:dmarc@example.com",
    );
    expect(
      getDnsConfig({ DNS_DMARC_RUA: "mailto:dmarc@example.com" }).dmarcRua,
    ).toBe("mailto:dmarc@example.com");
  });

  it("uses DNS_RETURN_PATH_HOST, falling back to DNS_BOUNCE_DOMAIN", () => {
    expect(
      getDnsConfig({ DNS_RETURN_PATH_HOST: "rp.example.com" }).returnPathHost,
    ).toBe("rp.example.com");
    expect(
      getDnsConfig({ DNS_BOUNCE_DOMAIN: "bounce.example.com" }).returnPathHost,
    ).toBe("bounce.example.com");
    expect(
      getDnsConfig({
        DNS_RETURN_PATH_HOST: "rp.example.com",
        DNS_BOUNCE_DOMAIN: "bounce.example.com",
      }).returnPathHost,
    ).toBe("rp.example.com");
  });

  it("parses DNS_NS_HOSTS as a comma list", () => {
    const cfg = getDnsConfig({ DNS_NS_HOSTS: "ns1.example.com, ns2.example.com,ns3.example.com" });
    expect(cfg.nsHosts).toEqual([
      "ns1.example.com",
      "ns2.example.com",
      "ns3.example.com",
    ]);
  });

  it("builds spfValue and dmarcValue from the overridden parts", () => {
    const cfg = getDnsConfig({
      DNS_SPF_INCLUDE: "spf.example.com",
      DNS_DMARC_RUA: "reports@example.com",
    });
    expect(cfg.spfValue).toBe("v=spf1 include:spf.example.com ~all");
    expect(cfg.dmarcValue).toBe(
      "v=DMARC1; p=quarantine; rua=mailto:reports@example.com; pct=100",
    );
  });
});

describe("getDnsConfig — malformed input falls back to defaults", () => {
  it("falls back when DNS_MX_HOSTS is empty or whitespace", () => {
    expect(getDnsConfig({ DNS_MX_HOSTS: " , ," }).mxHosts).toEqual([
      { host: "mx1.alecrae.com", priority: 10 },
      { host: "mx2.alecrae.com", priority: 20 },
    ]);
  });

  it("falls back when DNS_NS_HOSTS is empty", () => {
    expect(getDnsConfig({ DNS_NS_HOSTS: "  " }).nsHosts).toEqual([
      "ns1.alecrae.com",
      "ns2.alecrae.com",
    ]);
  });

  it("falls back when DNS_SPF_INCLUDE / DNS_DMARC_RUA are blank", () => {
    const cfg = getDnsConfig({ DNS_SPF_INCLUDE: "  ", DNS_DMARC_RUA: "" });
    expect(cfg.spfInclude).toBe("include:_spf.alecrae.com");
    expect(cfg.dmarcRua).toBe("mailto:dmarc@alecrae.com");
  });
});
