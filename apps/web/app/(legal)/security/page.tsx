import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Security & Responsible Disclosure | AlecRae",
  description:
    "AlecRae's security program, vulnerability disclosure policy, safe harbour terms, bug bounty rewards, and in-scope assets.",
};

export default function SecurityPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Security &amp; Responsible Disclosure
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent>
          <Box className="p-2 space-y-2">
            <Text as="h2" className="text-lg font-semibold text-blue-700">
              Found something? Tell us.
            </Text>
            <Text className="text-content-secondary leading-relaxed">
              Email <a className="text-brand-600 hover:underline" href="mailto:security@alecrae.com">security@alecrae.com</a>.
              We acknowledge within 2 business days. Good-faith research is
              welcome and protected by the safe-harbour terms below.
            </Text>
          </Box>
        </CardContent>
      </Card>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Scope
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          The following assets are in scope for our bug bounty and
          responsible disclosure program:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; alecrae.com and all production and public-staging subdomains.</Text>
          <Text>&bull; mail.alecrae.com (web application).</Text>
          <Text>&bull; api.alecrae.com (public API).</Text>
          <Text>&bull; admin.alecrae.com (admin console and SSO).</Text>
          <Text>&bull; mx1 / mx2 / smtp.alecrae.com (email transfer agents).</Text>
          <Text>&bull; The AlecRae mobile app (iOS + Android store builds).</Text>
          <Text>&bull; The AlecRae desktop app (signed release builds).</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Out of scope
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Denial-of-service and volumetric attacks.</Text>
          <Text>&bull; Social engineering of employees, contractors or users.</Text>
          <Text>&bull; Physical attacks against our premises or staff.</Text>
          <Text>&bull; Issues that require a privileged network position.</Text>
          <Text>&bull; Third-party services we do not operate (Stripe, Neon, Cloudflare, etc.).</Text>
          <Text>&bull; Missing best-practice headers without a demonstrated exploit.</Text>
          <Text>&bull; Self-XSS or clickjacking without security impact.</Text>
          <Text>&bull; Vulnerabilities in third-party libraries without a demonstrated exploit against AlecRae.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Safe harbour
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae authorises security research conducted in accordance with
          this policy. We will not pursue civil or criminal action under the
          Computer Fraud and Abuse Act (CFAA), the Digital Millennium
          Copyright Act (DMCA), the UK Computer Misuse Act, the EU
          Cybersecurity Directive, or any equivalent law, provided you:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Make a good-faith effort to avoid privacy violations, data destruction and service degradation.</Text>
          <Text>&bull; Only interact with accounts you own or have explicit permission to access.</Text>
          <Text>&bull; Do not exfiltrate data beyond the minimum needed to demonstrate impact.</Text>
          <Text>&bull; Give us a reasonable time to fix before public disclosure (target: 90 days).</Text>
          <Text>&bull; Do not extort, threaten, or demand payment outside this programme.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Reward scale
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Rewards are determined by CVSS 3.1 severity, exploitability, and
          user-blast radius. Indicative ranges (USD):
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-2">
              <Text className="text-content font-semibold">Critical (CVSS 9.0-10.0): $5,000 - $25,000</Text>
              <Text className="text-content font-semibold">High (CVSS 7.0-8.9): $1,500 - $5,000</Text>
              <Text className="text-content font-semibold">Medium (CVSS 4.0-6.9): $300 - $1,500</Text>
              <Text className="text-content font-semibold">Low (CVSS 0.1-3.9): $100 - $300</Text>
              <Text className="text-content text-sm mt-3">
                Exceptional reports (novel classes of bug, RCE on production,
                full account takeover without user interaction) may be
                rewarded beyond the top of this range.
              </Text>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Disclosure timeline
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Acknowledge within 2 business days.</Text>
          <Text>&bull; Triage result within 5 business days.</Text>
          <Text>&bull; Critical fix target: 30 days. High: 60 days. Medium / Low: 90 days.</Text>
          <Text>&bull; Coordinated public disclosure upon remediation or, at latest, 90 days after acknowledgment unless mutually agreed otherwise.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. Hall of fame
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          With your permission we will credit you on our Hall of Fame at
          alecrae.com/security/hall-of-fame. You may request to remain
          anonymous.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          7. PGP / encrypted reporting
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Our active PGP fingerprint is published at{" "}
          <a className="text-brand-600 hover:underline" href="/.well-known/security.txt">
            /.well-known/security.txt
          </a>
          . We also accept encrypted reports via Signal; request a session
          key by emailing security@alecrae.com.
        </Text>
      </Box>
    </Box>
  );
}
