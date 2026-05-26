import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Impressum / Legal Notice | AlecRae",
  description:
    "Legal notice and company disclosures for AlecRae under the German TMG §5 and similar EU transparency laws.",
};

export default function ImpressumPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Impressum / Legal Notice
        </Text>
        <Text className="text-content-tertiary">
          Last Updated: April 16, 2026
        </Text>
      </Box>

      <Text className="text-content-secondary leading-relaxed">
        This page fulfils the information obligations of &sect; 5 TMG
        (Germany), Art. 14 Directive 2006/123/EC and equivalent commercial
        transparency laws in the United Kingdom, Austria, Switzerland and
        the wider European Economic Area.
      </Text>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Operator
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-1">
              <Text className="text-content"><strong>AlecRae, Inc.</strong></Text>
              <Text className="text-content">A Delaware C-Corporation (USA)</Text>
              <Text className="text-content">548 Market Street, Suite 45000</Text>
              <Text className="text-content">San Francisco, CA 94104</Text>
              <Text className="text-content">United States of America</Text>
              <Text className="text-content">Delaware File Number: (pending issuance)</Text>
              <Text className="text-content">IRS EIN: (pending issuance)</Text>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Contact
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-1">
              <Text className="text-content">General: hello@alecrae.com</Text>
              <Text className="text-content">Legal: legal@alecrae.com</Text>
              <Text className="text-content">Privacy / DPO: dpo@alecrae.com</Text>
              <Text className="text-content">Security: security@alecrae.com</Text>
              <Text className="text-content">Press: press@alecrae.com</Text>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Authorised representative
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Responsible for content under &sect; 18 Abs. 2 MStV:
          Craig Kanty-Nehls, CEO, at the address above.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. EU GDPR representative (Art. 27)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          For data subjects in the European Economic Area, our Article 27
          representative is appointed and the name, address and contact
          details will be published here and in our Privacy Policy as soon
          as the appointment is finalised. In the interim, please contact
          dpo@alecrae.com for any GDPR-related request.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. UK GDPR representative (Art. 27 UK GDPR)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          For data subjects in the United Kingdom, our Article 27 UK GDPR
          representative is appointed and the name, address and contact
          details will be published here and in our Privacy Policy as soon
          as the appointment is finalised. In the interim, please contact
          dpo@alecrae.com for any UK GDPR-related request.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. Online Dispute Resolution (EU Regulation 524/2013)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          The European Commission provides a platform for online dispute
          resolution at{" "}
          <a className="text-brand-600 hover:underline" href="https://ec.europa.eu/consumers/odr/" rel="noopener noreferrer">
            ec.europa.eu/consumers/odr
          </a>
          . AlecRae is not obliged, and is not willing, to participate in
          alternative dispute-resolution proceedings before a consumer
          arbitration board, but consumers may still use the ODR platform
          to contact us. Our contact address is legal@alecrae.com.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          7. Liability for content and links
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          As a service provider, we are responsible for our own content on
          these pages in accordance with general laws (&sect; 7 Abs. 1
          TMG). According to &sect;&sect; 8 to 10 TMG, we are not obliged
          to monitor transmitted or stored third-party information, or to
          investigate circumstances that indicate unlawful activity. Upon
          notification of specific infringements, we will remove such
          content immediately.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          8. Trademark notice
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          &quot;AlecRae&quot;, the AlecRae signature wordmark and the
          tagline &quot;Email, considered.&quot; are trademarks of AlecRae,
          Inc. Other product names are the property of their respective
          owners.
        </Text>
      </Box>
    </Box>
  );
}
