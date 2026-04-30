import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Children's Privacy | AlecRae",
  description:
    "How AlecRae complies with COPPA, UK ICO Age-Appropriate Design Code, and our policy on accounts for minors.",
};

export default function ChildrenPrivacyPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Children&apos;s Privacy
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent>
          <Box className="p-2 space-y-2">
            <Text as="h2" className="text-lg font-semibold text-amber-700">
              AlecRae is not directed at children under 13.
            </Text>
            <Text className="text-content-secondary leading-relaxed">
              We do not knowingly collect personal information from children
              under 13 (or under 16 in the European Economic Area / United
              Kingdom). If you believe a child has created an AlecRae
              account, email{" "}
              <a className="text-brand-600 hover:underline" href="mailto:privacy@alecrae.com">privacy@alecrae.com</a>{" "}
              and we will delete the account and associated data promptly.
            </Text>
          </Box>
        </CardContent>
      </Card>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Minimum age
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae&apos;s minimum age is <strong>13</strong> (or <strong>16</strong>
          {" "}in the European Economic Area, the United Kingdom and any other
          jurisdiction where a higher digital-consent age applies). Users
          under 18 must have parental or legal-guardian consent before
          creating an account.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. How we comply with COPPA
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; We do not advertise the Service to or in properties directed at children.</Text>
          <Text>&bull; Our registration flow requires an affirmative age-gate checkbox that presents the 13+ (or 16+) minimum prominently.</Text>
          <Text>&bull; We do not knowingly collect, use or disclose personal information from children under 13 in violation of COPPA.</Text>
          <Text>&bull; If we learn that a child under the applicable age has created an account, we will delete the account, notify the parent / guardian and refund any paid subscription.</Text>
          <Text>&bull; We do not provide third-party trackers that could retarget minors.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. UK ICO Age-Appropriate Design Code (&quot;Children&apos;s Code&quot;)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          For UK users, AlecRae adheres to the ICO&apos;s 15 standards for
          services likely to be accessed by children, including: high-privacy
          defaults, no nudging toward lower-privacy options, no
          geolocation-on-by-default, and restriction of profiling.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Parental controls and rights
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          A parent or legal guardian may, at any time:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Review the personal information we hold about their child.</Text>
          <Text>&bull; Request deletion of that information.</Text>
          <Text>&bull; Refuse further collection or use.</Text>
          <Text>&bull; Terminate the account and receive a refund of any unused subscription.</Text>
        </Box>
        <Text className="text-content-secondary leading-relaxed">
          Requests should be sent to privacy@alecrae.com with &quot;Parental
          Request&quot; in the subject and include proof of guardianship.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Enterprise and education accounts
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Accounts provisioned by a school, district or employer are
          governed by the administrator&apos;s Data Processing Agreement. In
          the case of K-12 customers the administrator is responsible for
          obtaining any applicable parental consent under COPPA, FERPA and
          state student-privacy laws.
        </Text>
      </Box>
    </Box>
  );
}
