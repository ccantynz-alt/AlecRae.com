/**
 * /security/bounty — public bug bounty programme (C6).
 *
 * Companion page to /security (RFC 9116 disclosure policy already live).
 * Sets out scope, rewards, ineligible report types, and the legal
 * safe-harbour. Designed so a researcher can read this page and submit
 * a report without contacting us first.
 */

import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bug Bounty Programme | AlecRae",
  description:
    "AlecRae's public bug bounty programme — scope, severity tiers, reward ranges, ineligible reports, and the safe-harbour terms protecting good-faith researchers.",
};

export default function BugBountyPage(): React.JSX.Element {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Bug Bounty Programme
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: May 8, 2026 &middot; Programme version 1.0
        </Text>
      </Box>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent>
          <Box className="p-2 space-y-2">
            <Text as="h2" className="text-lg font-semibold text-amber-700">
              Pre-launch programme — limited rewards, full safe harbour
            </Text>
            <Text className="text-content-secondary leading-relaxed">
              We pay for high-impact bugs starting today, even before public
              launch. Submit reports to{" "}
              <a
                className="text-brand-600 hover:underline"
                href="mailto:security@alecrae.com"
              >
                security@alecrae.com
              </a>
              . Good-faith research is protected by the safe-harbour clause
              at the bottom of this page.
            </Text>
          </Box>
        </CardContent>
      </Card>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. In scope
        </Text>
        <Box as="ul" className="list-disc pl-6 space-y-2 text-content-secondary leading-relaxed">
          <Box as="li">
            <Box as="code" className="text-content font-mono text-sm">
              alecrae.com
            </Box>{" "}
            and all subdomains under it (mail, api, admin, status, docs,
            mx1, mx2, smtp, send, bounce).
          </Box>
          <Box as="li">
            The web app, admin console, and public API documented at{" "}
            <Box as="code" className="font-mono text-sm">
              docs.alecrae.com
            </Box>
            .
          </Box>
          <Box as="li">
            The mobile apps (iOS, Android) and desktop app (Electron / Tauri)
            published under the AlecRae developer account.
          </Box>
          <Box as="li">
            The MTA — outbound deliverability, header injection, SMTP smuggling,
            DKIM bypass, DMARC alignment failures, queue manipulation.
          </Box>
          <Box as="li">
            All AI surfaces — prompt injection that exfiltrates user data,
            jailbreaks that bypass safety filters, model-output poisoning that
            persists across sessions.
          </Box>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Out of scope
        </Text>
        <Box as="ul" className="list-disc pl-6 space-y-2 text-content-secondary leading-relaxed">
          <Box as="li">Third-party services (Stripe, Cloudflare, Vercel, Neon, Upstash, AWS SES) — report to those vendors directly.</Box>
          <Box as="li">Best-practice findings without a demonstrable security impact (missing security headers on static pages, lack of HSTS preload, weak SPF on staging-only zones, etc.).</Box>
          <Box as="li">Self-XSS and clickjacking on pages without sensitive actions.</Box>
          <Box as="li">Reports from automated scanners without an explanation of impact.</Box>
          <Box as="li">Findings on the marketing site that do not affect production data or authenticated sessions.</Box>
          <Box as="li">DoS or volumetric attacks. Rate limits exist; do not test them in ways that affect other users.</Box>
          <Box as="li">Social engineering against staff, contractors, or end users.</Box>
          <Box as="li">Physical attacks against AlecRae offices, data centres, or staff.</Box>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Severity &amp; rewards
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We use the CVSS 3.1 base score plus product-specific impact to
          assign severity. Reward bands are USD and represent the typical
          range — exceptional reports can pay above the band, and reports
          that we have already received internally pay nothing.
        </Text>

        <Box className="overflow-x-auto rounded-xl border border-border bg-surface-secondary">
          <Box as="table" className="w-full text-sm">
            <Box as="thead" className="bg-surface">
              <Box as="tr">
                <Box as="th" className="px-4 py-3 text-left font-semibold text-content">
                  Severity
                </Box>
                <Box as="th" className="px-4 py-3 text-left font-semibold text-content">
                  Reward (USD)
                </Box>
                <Box as="th" className="px-4 py-3 text-left font-semibold text-content">
                  Examples
                </Box>
              </Box>
            </Box>
            <Box as="tbody" className="divide-y divide-border">
              <Box as="tr">
                <Box as="td" className="px-4 py-3 font-medium text-red-600">
                  Critical
                </Box>
                <Box as="td" className="px-4 py-3 text-content">
                  $5,000 – $20,000
                </Box>
                <Box as="td" className="px-4 py-3 text-content-secondary">
                  RCE on the API server, full DB read of production tables, account takeover without user interaction, ability to read any user's mailbox, private key extraction.
                </Box>
              </Box>
              <Box as="tr">
                <Box as="td" className="px-4 py-3 font-medium text-amber-600">
                  High
                </Box>
                <Box as="td" className="px-4 py-3 text-content">
                  $1,500 – $5,000
                </Box>
                <Box as="td" className="px-4 py-3 text-content-secondary">
                  Authenticated access to other users' data, persistent stored XSS in the inbox or compose, DKIM-signed mail injection, MTA SMTP smuggling, prompt-injection that exfiltrates a different user's data.
                </Box>
              </Box>
              <Box as="tr">
                <Box as="td" className="px-4 py-3 font-medium text-yellow-600">
                  Medium
                </Box>
                <Box as="td" className="px-4 py-3 text-content">
                  $300 – $1,500
                </Box>
                <Box as="td" className="px-4 py-3 text-content-secondary">
                  CSRF on sensitive actions, IDOR with limited blast radius, OAuth token leakage to a controlled redirect, reflected XSS gated by user interaction, header-based session fixation.
                </Box>
              </Box>
              <Box as="tr">
                <Box as="td" className="px-4 py-3 font-medium text-blue-600">
                  Low
                </Box>
                <Box as="td" className="px-4 py-3 text-content">
                  $100 – $300
                </Box>
                <Box as="td" className="px-4 py-3 text-content-secondary">
                  Information disclosure with limited impact, rate-limit gaps on non-sensitive endpoints, missing CSRF on read-only endpoints with side effects.
                </Box>
              </Box>
              <Box as="tr">
                <Box as="td" className="px-4 py-3 font-medium text-content-secondary">
                  Hall of Fame
                </Box>
                <Box as="td" className="px-4 py-3 text-content">
                  Recognition only
                </Box>
                <Box as="td" className="px-4 py-3 text-content-secondary">
                  Valid bugs that don't qualify for a paid reward but are useful — e.g. minor info disclosure, a clever theoretical attack we should mitigate.
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Reporting a bug
        </Text>
        <Box as="ol" className="list-decimal pl-6 space-y-2 text-content-secondary leading-relaxed">
          <Box as="li">
            Email{" "}
            <a className="text-brand-600 hover:underline" href="mailto:security@alecrae.com">
              security@alecrae.com
            </a>
            . PGP optional — the key is published in{" "}
            <Box as="code" className="font-mono text-sm">
              /.well-known/security.txt
            </Box>
            .
          </Box>
          <Box as="li">
            Subject line:{" "}
            <Box as="code" className="font-mono text-sm">
              [Bounty] short description
            </Box>
            .
          </Box>
          <Box as="li">
            Include: target URL or component, reproduction steps, payload(s),
            screenshots or PCAP if relevant, CVSS 3.1 vector you propose, and
            your impact analysis. Don't email video links — attach a clip if
            you must.
          </Box>
          <Box as="li">
            Do not publish, share, or discuss the report until we confirm a
            fix has shipped or 90 days have passed since acknowledgement,
            whichever comes first.
          </Box>
          <Box as="li">
            We acknowledge within 2 business days. Triage decision (in/out of
            scope, severity, reward band) within 7 calendar days. Fix and
            payout depend on severity — Critical and High get same-week
            attention.
          </Box>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Rules of engagement
        </Text>
        <Box as="ul" className="list-disc pl-6 space-y-2 text-content-secondary leading-relaxed">
          <Box as="li">
            Use only test accounts you create yourself. Never access another
            user's mailbox, contacts, or attachments. If you accidentally
            access user data, stop, delete it, and tell us.
          </Box>
          <Box as="li">
            Do not deploy malware, ransomware, or persistent backdoors. Do not
            modify or delete data you didn't write.
          </Box>
          <Box as="li">
            Do not attempt to access or test on third-party infrastructure
            (Stripe, Cloudflare, Vercel, etc.) — even if reachable from our
            stack.
          </Box>
          <Box as="li">
            Throttle automated tooling. If a script you run causes service
            degradation, you are responsible for stopping it. We reserve the
            right to disqualify reports that come from disruptive testing.
          </Box>
          <Box as="li">
            Only one researcher per finding gets paid — duplicates are paid to
            the first valid report received.
          </Box>
          <Box as="li">
            Reports must come from individuals or teams not employed by
            AlecRae and not under contract with AlecRae at the time of
            discovery.
          </Box>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. Safe harbour
        </Text>
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent>
            <Box className="p-2 space-y-3 text-content-secondary leading-relaxed">
              <Text>
                AlecRae will not pursue or support any legal action related to
                your research, provided you act in good faith and follow this
                policy. Specifically:
              </Text>
              <Box as="ul" className="list-disc pl-6 space-y-1">
                <Box as="li">
                  We consider your research authorised under the Computer Fraud
                  and Abuse Act (US), the Computer Misuse Act 1990 (UK), and
                  equivalent statutes in jurisdictions where AlecRae operates.
                </Box>
                <Box as="li">
                  We will not bring a DMCA claim against you for circumventing
                  technical measures used to protect AlecRae's services where
                  doing so was necessary for the research.
                </Box>
                <Box as="li">
                  If a third party brings legal action against you for research
                  conducted under this policy, we will make our authorisation
                  known to that party.
                </Box>
              </Box>
              <Text>
                If you are unsure whether something is permitted, ask first at{" "}
                <a className="text-brand-600 hover:underline" href="mailto:security@alecrae.com">
                  security@alecrae.com
                </a>
                . Asking does not affect your eligibility.
              </Text>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          7. Hall of Fame
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          With your permission, we credit valid reports on{" "}
          <Link
            href="/security"
            className="text-brand-600 hover:underline"
          >
            our security page
          </Link>{" "}
          with your name (or handle) and the rough class of finding. Researchers
          may also opt in to a private list shared with prospective enterprise
          customers as a trust signal.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          8. Programme changes
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We may update this policy. Material changes are announced on{" "}
          <Link href="/security" className="text-brand-600 hover:underline">
            the security page
          </Link>
          . Reports submitted under a prior version of the policy are honoured
          under the rules in effect at submission time.
        </Text>
      </Box>

      <Box className="rounded-xl border border-border bg-surface-secondary p-6">
        <Text variant="body-sm" className="text-content-secondary">
          Quick links:{" "}
          <a className="text-brand-600 hover:underline" href="/.well-known/security.txt">
            security.txt
          </a>{" "}
          ·{" "}
          <Link href="/security" className="text-brand-600 hover:underline">
            disclosure policy
          </Link>{" "}
          ·{" "}
          <a className="text-brand-600 hover:underline" href="mailto:security@alecrae.com">
            security@alecrae.com
          </a>
        </Text>
      </Box>
    </Box>
  );
}
