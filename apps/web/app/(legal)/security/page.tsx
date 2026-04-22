import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Security & Responsible Disclosure | alecrae.com",
  description:
    "alecrae.com security policy, responsible disclosure process, scope, bounty tiers, PGP key, and hall of fame.",
};

function Section({
  number,
  title,
  id,
  children,
}: {
  number: string;
  title: string;
  id?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box className="mb-10" {...(id !== undefined ? { id } : {})}>
      <Text as="h2" className="text-xl font-bold text-content mb-4">
        {number}. {title}
      </Text>
      <Box className="space-y-3 text-content-secondary leading-relaxed">{children}</Box>
    </Box>
  );
}

function Sub({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box className="ml-6 mb-2">
      <Text as="span" className="font-semibold text-content">
        {label}{" "}
      </Text>
      <Text as="span">{children}</Text>
    </Box>
  );
}

export default function SecurityPage(): React.JSX.Element {
  return (
    <Box className="max-w-4xl mx-auto">
      <Box className="mb-10">
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Security & Responsible Disclosure
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 10, 2026 | Last Updated: April 10, 2026
        </Text>
      </Box>

      <Card className="mb-10 border-brand-500/30 bg-brand-500/5">
        <CardContent className="p-5">
          <Text className="font-semibold text-brand-600 mb-2">
            We welcome security research.
          </Text>
          <Text className="text-sm">
            If you believe you have discovered a security vulnerability in alecrae.com,
            please report it privately to{" "}
            <Text as="span" className="font-mono font-semibold text-content">
              security@alecrae.com
            </Text>
            . We will acknowledge your report within 72 hours and work with you
            to verify and fix the issue. We do not take legal action against
            researchers who act in good faith and follow this policy.
          </Text>
        </CardContent>
      </Card>

      <Section number="1" title="Reporting a Vulnerability">
        <Text>
          Send a detailed report to{" "}
          <Text as="span" className="font-mono font-semibold text-content">
            security@alecrae.com
          </Text>
          . A good report includes:
        </Text>
        <Sub label="Summary.">A short description of the vulnerability and its impact.</Sub>
        <Sub label="Steps to reproduce.">
          Exact steps, payloads, and any scripts required to trigger the issue.
        </Sub>
        <Sub label="Affected endpoint or component.">
          URL, API route, package, or product area (web, API, MTA, mobile, desktop).
        </Sub>
        <Sub label="Proof of concept.">
          Screenshots, HTTP transcripts, or a minimal PoC. Do NOT include production
          user data.
        </Sub>
        <Sub label="Your contact.">
          Email address (and optional handle) for credit in our hall of fame.
        </Sub>
        <Text>
          For sensitive reports, encrypt with our PGP key at{" "}
          <Text as="a" href="/.well-known/pgp-key.txt" className="text-brand-600 underline">
            /.well-known/pgp-key.txt
          </Text>
          .
        </Text>
      </Section>

      <Section number="2" title="Response Timeline">
        <Sub label="Acknowledgment.">Within 72 hours of your report.</Sub>
        <Sub label="Triage and severity assessment.">Within 5 business days.</Sub>
        <Sub label="Initial remediation plan.">
          Within 10 business days for high/critical issues.
        </Sub>
        <Sub label="Fix deployed.">
          Critical: within 48 hours. High: within 7 days. Medium: within 30 days.
          Low: within 90 days.
        </Sub>
        <Sub label="Public disclosure.">
          Coordinated with the reporter, typically 30–90 days after the fix is
          deployed depending on severity and user impact.
        </Sub>
      </Section>

      <Section number="3" title="In-Scope Assets">
        <Text>The following assets are in scope for our disclosure program:</Text>
        <Sub label="Primary domains.">
          alecrae.com, mail.alecrae.com, admin.alecrae.com, api.alecrae.com
        </Sub>
        <Sub label="Mail infrastructure.">
          smtp.alecrae.com, mx1.alecrae.com, mx2.alecrae.com (SMTP, DKIM, SPF, DMARC, TLS)
        </Sub>
        <Sub label="Public API.">
          All REST, tRPC, and OpenAPI endpoints documented at docs.alecrae.com
        </Sub>
        <Sub label="Mobile and desktop apps.">
          iOS, Android, macOS, Windows, and Linux clients published under alecrae.com
        </Sub>
        <Sub label="Web app.">
          The full web experience at mail.alecrae.com including auth, inbox, compose,
          settings, and collaboration.
        </Sub>
        <Sub label="Source code.">
          Any public repository under the alecrae.com organization.
        </Sub>
      </Section>

      <Section number="4" title="Out of Scope">
        <Text>
          The following are not eligible for our disclosure program or bounties:
        </Text>
        <Sub label="Denial of service.">
          Volumetric DDoS, rate-limit exhaustion, or anything that degrades
          service for other users.
        </Sub>
        <Sub label="Social engineering.">
          Phishing our employees, vendors, or users; pretexting support staff.
        </Sub>
        <Sub label="Physical attacks.">
          Office break-ins, tailgating, or attacks on employee devices.
        </Sub>
        <Sub label="Self-XSS.">
          Vulnerabilities that require the victim to paste untrusted code into
          their own browser console or devtools.
        </Sub>
        <Sub label="Missing security headers.">
          Reports that only cite the absence of a header (CSP, HSTS, etc.) without
          a concrete exploit.
        </Sub>
        <Sub label="Third-party services.">
          Issues in Stripe, Neon, Cloudflare, Anthropic, or other sub-processors.
          Report these to the vendor directly.
        </Sub>
        <Sub label="Outdated libraries without a working exploit.">
          Version-only reports (e.g., &quot;you&apos;re using lib X v1.2, upgrade to
          v1.3&quot;) are not eligible unless you demonstrate an exploit.
        </Sub>
        <Sub label="Automated scanner output.">
          Raw output from Burp, ZAP, Nessus, or similar tools without manual
          verification and a working PoC.
        </Sub>
      </Section>

      <Section number="5" title="Safe Harbor">
        <Text>
          We will not pursue legal action against researchers who:
        </Text>
        <Sub label="Act in good faith.">
          Make every effort to avoid privacy violations, destruction of data, or
          interruption of our service.
        </Sub>
        <Sub label="Report promptly.">
          Contact us as soon as you discover a real or potential vulnerability.
        </Sub>
        <Sub label="Respect confidentiality.">
          Do not publicly disclose the issue until we have had a reasonable
          opportunity to fix it.
        </Sub>
        <Sub label="Only access your own data.">
          Do not access, modify, or exfiltrate data belonging to other users. If
          you incidentally access another user&apos;s data, stop immediately and
          report it.
        </Sub>
        <Sub label="Do not demand payment.">
          Extortion or threats of public disclosure in exchange for money void
          safe harbor protection.
        </Sub>
      </Section>

      <Section number="6" title="Bounty Tiers">
        <Text>
          Bounties are awarded at our discretion based on severity, impact, and
          report quality. Indicative ranges:
        </Text>
        <Box className="ml-6 my-4">
          <Card>
            <CardContent className="p-0">
              <Box className="grid grid-cols-3 border-b border-border p-3 bg-surface-secondary">
                <Text className="font-semibold text-content">Severity</Text>
                <Text className="font-semibold text-content">Examples</Text>
                <Text className="font-semibold text-content">Bounty</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold">Critical</Text>
                <Text className="text-sm">
                  Remote code execution, auth bypass at scale, account takeover
                  without user interaction, mass PII exposure
                </Text>
                <Text>$5,000 – $10,000</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold">High</Text>
                <Text className="text-sm">
                  Stored XSS in inbox, IDOR to other accounts, SSRF to internal
                  services, privilege escalation
                </Text>
                <Text>$1,000 – $5,000</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold">Medium</Text>
                <Text className="text-sm">
                  Reflected XSS, CSRF on sensitive actions, information disclosure,
                  broken access control on low-impact endpoints
                </Text>
                <Text>$250 – $1,000</Text>
              </Box>
              <Box className="grid grid-cols-3 p-3">
                <Text className="font-semibold">Low</Text>
                <Text className="text-sm">
                  Open redirect, minor information leaks, UI redress issues
                </Text>
                <Text>$50 – $250</Text>
              </Box>
            </CardContent>
          </Card>
        </Box>
        <Text>
          All bounties are paid in USD via bank transfer or PayPal within 30 days
          of the fix being deployed. Duplicate reports are awarded to the first
          reporter only.
        </Text>
      </Section>

      <Section number="7" title="PGP Key">
        <Text>
          For encrypted reports, fetch our PGP public key at{" "}
          <Text as="a" href="/.well-known/pgp-key.txt" className="text-brand-600 underline">
            /.well-known/pgp-key.txt
          </Text>
          . The key fingerprint is published on our Twitter account and in our
          DNS TXT records for verification.
        </Text>
      </Section>

      <Section id="hall-of-fame" number="8" title="Hall of Fame">
        <Text>
          We publicly credit researchers who have responsibly disclosed issues to
          us. To be listed, include your preferred name or handle in your report.
        </Text>
        <Card className="mt-4">
          <CardContent className="p-4">
            <Text className="text-sm text-content-tertiary italic">
              No public disclosures yet. Be the first — we would love to credit
              you here.
            </Text>
          </CardContent>
        </Card>
      </Section>

      <Section number="9" title="Contact">
        <Box className="ml-6 mt-2 space-y-1">
          <Text className="font-semibold">Security Team</Text>
          <Text>Email: security@alecrae.com</Text>
          <Text>PGP: /.well-known/pgp-key.txt</Text>
          <Text>security.txt: /.well-known/security.txt</Text>
        </Box>
      </Section>
    </Box>
  );
}
