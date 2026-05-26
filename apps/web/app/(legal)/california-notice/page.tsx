import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "California Notice at Collection | AlecRae",
  description:
    "AlecRae's California Notice at Collection describing the categories of personal information we collect, purposes, retention and your CPRA rights.",
};

export default function CaliforniaNoticePage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          California Notice at Collection
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Text className="text-content-secondary leading-relaxed">
        This Notice at Collection is provided to California residents under
        the California Consumer Privacy Act (&quot;CCPA&quot;), as amended
        by the California Privacy Rights Act (&quot;CPRA&quot;), Cal. Civ.
        Code &sect;&sect; 1798.100 et seq. It describes the categories of
        personal information we collect, the purposes, retention, and your
        rights. For the full description of our privacy practices, see our{" "}
        <a className="text-brand-600 hover:underline" href="/privacy">Privacy Policy</a>.
      </Text>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Categories of personal information we collect
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-2 text-sm">
              <Text className="text-content"><strong>Identifiers</strong> — name, email address, user ID, IP address, device identifiers.</Text>
              <Text className="text-content"><strong>Customer records</strong> — billing address, telephone number, employer.</Text>
              <Text className="text-content"><strong>Commercial information</strong> — subscription tier, invoice history, promo codes redeemed.</Text>
              <Text className="text-content"><strong>Internet / network activity</strong> — log-in events, pages viewed, API calls, feature usage.</Text>
              <Text className="text-content"><strong>Geolocation</strong> — approximate city-level location derived from IP address.</Text>
              <Text className="text-content"><strong>Professional information</strong> — job title, organisation, role (if volunteered).</Text>
              <Text className="text-content"><strong>Communications content</strong> — email headers, body and attachments transmitted through the service.</Text>
              <Text className="text-content"><strong>Inferences</strong> — AI-derived priority scores, sentiment, relationship strength, writing-style signals.</Text>
              <Text className="text-content"><strong>Sensitive PI</strong> — account login credentials, contents of email, recovery keys, passkey public credentials.</Text>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Business or commercial purposes
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Delivering the AlecRae Service (sending, receiving, storing and organising email).</Text>
          <Text>&bull; Account authentication and security, including passkey ceremonies and fraud detection.</Text>
          <Text>&bull; Providing AI-assisted features that you have enabled or that are essential to the service (spam / phishing protection).</Text>
          <Text>&bull; Billing and subscription management through Stripe.</Text>
          <Text>&bull; Providing support when you contact us.</Text>
          <Text>&bull; Complying with legal and regulatory obligations.</Text>
          <Text>&bull; Protecting the rights, property, or safety of AlecRae, our users, or the public.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Sensitive personal information
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We use sensitive personal information <strong>only</strong> for
          the purposes listed in CPRA &sect; 1798.121(a) — to perform the
          services you requested, to prevent fraud and security incidents,
          to protect the physical safety of users, and to comply with law.
          We do <strong>not</strong> use sensitive personal information to
          infer characteristics about you.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Sale, sharing, and cross-context behavioural advertising
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We do not sell or share personal information and we never target
          advertising on the basis of your email or product usage. See our{" "}
          <a className="text-brand-600 hover:underline" href="/do-not-sell">Do Not Sell or Share</a> page for details.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Retention
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We retain personal information for as long as needed to provide
          the Service plus a limited grace period for account recovery,
          legal compliance and fraud prevention:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Account and billing records: life of subscription + 7 years (tax / financial law).</Text>
          <Text>&bull; Email content: while the account is active; 30-day soft-delete after termination; then secure deletion.</Text>
          <Text>&bull; Server and security logs: up to 13 months, then aggregated.</Text>
          <Text>&bull; Customer-support records: up to 3 years from last contact.</Text>
          <Text>&bull; AI-derived data: deleted within 30 days of account closure.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. California rights
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          California residents have the right to know, delete, correct,
          opt-out of sale or sharing, limit the use of sensitive PI, and
          non-discrimination. Submit a request to{" "}
          <a className="text-brand-600 hover:underline" href="mailto:privacy@alecrae.com">privacy@alecrae.com</a>{" "}
          or in the app under Settings &gt; Privacy &gt; California rights.
          A full description of these rights is at{" "}
          <a className="text-brand-600 hover:underline" href="/do-not-sell">/do-not-sell</a>.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          7. Shine the Light (Cal. Civ. Code &sect; 1798.83)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          California residents may request once per calendar year a list of
          the categories of personal information disclosed to third parties
          for direct marketing purposes. AlecRae does not disclose personal
          information to third parties for direct marketing purposes, but
          you may still request confirmation by emailing
          privacy@alecrae.com.
        </Text>
      </Box>
    </Box>
  );
}
