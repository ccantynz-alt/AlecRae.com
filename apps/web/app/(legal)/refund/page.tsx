import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Refund Policy | AlecRae",
  description:
    "AlecRae's refund policy, including 14-day money-back, EU / UK statutory withdrawal rights and the process for requesting a refund.",
};

export default function RefundPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Refund Policy
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Text className="text-content-secondary leading-relaxed">
        AlecRae wants every customer to feel confident trying the product.
        This page sets out our refund commitments, which are in addition to
        any statutory rights you may have (for example, the EU / UK 14-day
        right of withdrawal for distance contracts).
      </Text>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. 14-day money-back guarantee (monthly and annual)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          New paid AlecRae subscriptions (Personal, Pro and Team) can be
          refunded in full for any reason within <strong>14 days</strong> of
          the first charge. There is no form to fill in — email
          billing@alecrae.com or cancel from Settings &gt; Billing &gt;
          Request refund. Refunds are processed to the original payment
          method within 5-10 business days.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Pro-rata refunds for annual plans
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          If you cancel an annual plan after the 14-day window, we will
          refund the unused months pro-rata, less any free months that came
          with the annual discount and any applicable third-party fees
          already incurred on your behalf.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. EU / UK consumer rights
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          If you are a consumer resident in the European Economic Area,
          Switzerland or the United Kingdom, you have a statutory right to
          withdraw from your subscription within 14 days of purchase
          without giving any reason. To exercise this right, make a clear
          statement to billing@alecrae.com within 14 days. These rights
          operate in parallel with, not instead of, our 14-day money-back
          guarantee.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. When refunds are not available
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Refunds beyond 14 days for monthly subscriptions where no specific statutory right applies.</Text>
          <Text>&bull; Accounts suspended or terminated for violation of the Acceptable Use Policy.</Text>
          <Text>&bull; Usage-based add-ons that have already been consumed (for example, API calls, sent email volume).</Text>
          <Text>&bull; Enterprise contracts governed by a signed master service agreement — refunds follow that contract.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Apple App Store / Google Play purchases
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Subscriptions purchased through the Apple App Store or Google
          Play must be refunded by the applicable store under their refund
          policies (we cannot issue refunds for those transactions
          ourselves). We will gladly help you navigate the process.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. How to request a refund
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-2">
              <Text className="text-content">Email: billing@alecrae.com</Text>
              <Text className="text-content">In-product: Settings &gt; Billing &gt; Request refund</Text>
              <Text className="text-content">Include: the email address on the account, and the date of the charge.</Text>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
