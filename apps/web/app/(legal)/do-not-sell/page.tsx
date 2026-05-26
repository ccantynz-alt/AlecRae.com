import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Do Not Sell or Share My Personal Information | AlecRae",
  description:
    "Your California Consumer Privacy Act (CCPA/CPRA) right to opt out of the sale or sharing of personal information and how AlecRae honours that right.",
};

export default function DoNotSellPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Do Not Sell or Share My Personal Information
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent>
          <Box className="p-2">
            <Text as="h2" className="text-lg font-semibold text-green-700 mb-2">
              Summary: AlecRae does not sell or share your personal information.
            </Text>
            <Text className="text-content-secondary leading-relaxed">
              We are structurally a zero-data-broker business. We do not sell,
              rent, trade, or share personal information for cross-context
              behavioural advertising. This page documents your rights under
              California law and how to exercise them — even though, in our
              case, there is nothing to opt out of.
            </Text>
          </Box>
        </CardContent>
      </Card>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Your rights under the CCPA and CPRA
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          If you are a California resident, the California Consumer Privacy
          Act (&quot;CCPA&quot;), as amended by the California Privacy Rights
          Act (&quot;CPRA&quot;), gives you the following rights in relation
          to your personal information:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; The right to know what personal information we collect, use, disclose and retain.</Text>
          <Text>&bull; The right to delete personal information we have collected about you.</Text>
          <Text>&bull; The right to correct inaccurate personal information.</Text>
          <Text>&bull; The right to opt out of the &quot;sale&quot; or &quot;sharing&quot; of your personal information.</Text>
          <Text>&bull; The right to limit the use and disclosure of sensitive personal information.</Text>
          <Text>&bull; The right to non-discrimination for exercising any of these rights.</Text>
          <Text>&bull; The right to appoint an authorised agent to submit requests on your behalf.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. What we do (and do not) do with your personal information
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae does <strong>not</strong> and has never:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Sold personal information for monetary or other valuable consideration.</Text>
          <Text>&bull; Shared personal information for cross-context behavioural advertising.</Text>
          <Text>&bull; Allowed third-party advertising networks or data brokers inside the product.</Text>
          <Text>&bull; Used the content of your email to build advertising profiles.</Text>
          <Text>&bull; Trained external advertising or ad-tech AI models on your email content.</Text>
        </Box>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae <strong>does</strong>:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Use subprocessors to deliver the service (see our Subprocessor list).</Text>
          <Text>&bull; Process your data inside our own AI pipelines so we can deliver the product you asked for.</Text>
          <Text>&bull; Respond to valid legal process when required by law.</Text>
        </Box>
        <Text className="text-content-secondary leading-relaxed">
          Because of this architecture, there is nothing to &quot;opt out&quot;
          of — the default position for every user is already &quot;do not
          sell, do not share&quot;. However, you may still file a request to
          have that position recorded against your account.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Global Privacy Control (GPC)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae honours the Global Privacy Control signal as a valid
          opt-out of &quot;sale&quot; and &quot;sharing&quot; under the CPRA.
          If your browser transmits a GPC signal, we will automatically
          record your opt-out preference the first time you load the site.
          You can verify GPC is active at{" "}
          <a className="text-brand-600 hover:underline" href="https://globalprivacycontrol.org/" rel="noopener noreferrer">
            globalprivacycontrol.org
          </a>
          .
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. How to submit a request
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          To submit a &quot;Do Not Sell or Share&quot; request, a deletion
          request, a correction request or any other California rights
          request, email{" "}
          <a className="text-brand-600 hover:underline" href="mailto:privacy@alecrae.com">
            privacy@alecrae.com
          </a>{" "}
          with &quot;CCPA Request&quot; in the subject line, or use the
          in-product Privacy &gt; California rights screen. We will:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Confirm receipt within 10 business days.</Text>
          <Text>&bull; Verify your identity in a way that matches the sensitivity of the request.</Text>
          <Text>&bull; Respond within 45 calendar days (extendable once by 45 days with notice).</Text>
          <Text>&bull; Never charge a fee, unless the request is manifestly unfounded or excessive.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Authorised agents
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          You may designate an authorised agent to submit a request on your
          behalf. We will require written proof of the agent&apos;s authority
          (e.g., a signed permission or a power of attorney), plus identity
          verification of the consumer making the request.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. Non-discrimination
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We will never deny service, charge a different price, or provide a
          different level of quality because you exercised a privacy right.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          7. Contact
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-1">
              <Text className="text-content">AlecRae, Inc.</Text>
              <Text className="text-content">Attn: Privacy Team</Text>
              <Text className="text-content">548 Market Street, Suite 45000, San Francisco, CA 94104</Text>
              <Text className="text-content">privacy@alecrae.com &middot; dpo@alecrae.com</Text>
              <Text className="text-content">Toll-free: 1-888-ALECRAE (available once activated)</Text>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
