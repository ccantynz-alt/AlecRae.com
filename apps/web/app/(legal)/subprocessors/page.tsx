import { Box, Text, Card, CardContent } from "@emailed/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subprocessors - Emailed",
  description:
    "List of Emailed subprocessors, including data processing details, locations, and change notification procedures.",
};

export default function SubprocessorsPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text variant="heading-lg" className="font-bold mb-2">
          Subprocessor List
        </Text>
        <Text variant="body-sm" muted>
          Last Updated: March 15, 2026
        </Text>
      </Box>

      <Text variant="body-md" className="text-content-secondary leading-relaxed">
        Emailed, Inc. (&quot;Emailed&quot;) uses certain third-party service providers
        (&quot;Subprocessors&quot;) to assist in providing the Emailed platform. These
        Subprocessors may process personal data on behalf of our customers in
        accordance with our{" "}
        <Text as="span" className="text-brand-600 font-medium">
          Data Processing Agreement
        </Text>{" "}
        and applicable data protection laws. This page lists all current
        Subprocessors, the nature of their services, and the data they process.
      </Text>

      {/* Section 1 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          1. Current Subprocessors
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          The following Subprocessors are currently authorized to process personal
          data on behalf of Emailed customers:
        </Text>

        <Card>
          <CardContent>
            <Box className="overflow-x-auto">
              <Box className="min-w-full">
                {/* Header */}
                <Box className="grid grid-cols-4 border-b border-border pb-3 mb-1">
                  <Text variant="body-sm" className="font-semibold text-content">
                    Subprocessor
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Purpose
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Location
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Data Processed
                  </Text>
                </Box>

                {/* AWS */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Box>
                    <Text variant="body-sm" className="text-content font-medium">
                      Amazon Web Services (AWS)
                    </Text>
                  </Box>
                  <Text variant="body-sm" className="text-content-secondary">
                    Primary cloud infrastructure, compute, storage, and networking
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    United States (us-east-1, us-west-2), European Union (eu-west-1)
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    All customer data including email content, metadata, attachments, account information
                  </Text>
                </Box>

                {/* Hetzner */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Box>
                    <Text variant="body-sm" className="text-content font-medium">
                      Hetzner Online GmbH
                    </Text>
                  </Box>
                  <Text variant="body-sm" className="text-content-secondary">
                    European infrastructure, dedicated servers for EU data residency
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Germany (Falkenstein, Nuremberg)
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    EU customer data including email content, metadata, attachments for EU-resident accounts
                  </Text>
                </Box>

                {/* Cloudflare */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Box>
                    <Text variant="body-sm" className="text-content font-medium">
                      Cloudflare, Inc.
                    </Text>
                  </Box>
                  <Text variant="body-sm" className="text-content-secondary">
                    CDN, DDoS protection, DNS resolution, edge caching
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Global (275+ data centers worldwide)
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    IP addresses, HTTP request metadata, cached static assets
                  </Text>
                </Box>

                {/* Stripe */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Box>
                    <Text variant="body-sm" className="text-content font-medium">
                      Stripe, Inc.
                    </Text>
                  </Box>
                  <Text variant="body-sm" className="text-content-secondary">
                    Payment processing, billing, subscription management, fraud prevention
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    United States
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Billing name, email address, payment method details, transaction history, IP address
                  </Text>
                </Box>

                {/* Anthropic */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Box>
                    <Text variant="body-sm" className="text-content font-medium">
                      Anthropic, PBC
                    </Text>
                  </Box>
                  <Text variant="body-sm" className="text-content-secondary">
                    AI/ML processing for spam detection, content classification, writing assistance
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    United States
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Anonymized email content snippets, classification metadata (no raw email content or PII)
                  </Text>
                </Box>

                {/* Grafana */}
                <Box className="grid grid-cols-4 py-3">
                  <Box>
                    <Text variant="body-sm" className="text-content font-medium">
                      Grafana Labs
                    </Text>
                  </Box>
                  <Text variant="body-sm" className="text-content-secondary">
                    Monitoring, observability, log aggregation, alerting
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    United States
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    System logs, performance metrics, anonymized error traces (no customer email content)
                  </Text>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Section 2 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          2. Change Notification Process
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Emailed is committed to transparency regarding its use of Subprocessors.
          When we engage a new Subprocessor or make material changes to an existing
          Subprocessor&apos;s scope of data processing, we will notify customers
          through the following mechanisms:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Email Notification.</Text>{" "}
              We will send an email notification to the account owner and designated
              data protection contact (if configured) at least 30 days before the new
              Subprocessor begins processing customer data.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">This Page.</Text>{" "}
              This Subprocessor List page will be updated with the new or modified
              Subprocessor details. The &quot;Last Updated&quot; date will reflect
              the most recent change.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">RSS/Webhook Feed.</Text>{" "}
              Customers may subscribe to an RSS feed or configure a webhook endpoint
              in their account settings to receive automated notifications of
              Subprocessor changes.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 3 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          3. Objection Procedure
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          If you have a legitimate objection to our use of a new or modified
          Subprocessor, you may exercise your right to object as follows:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Objection Window.</Text>{" "}
              You must submit your objection in writing within 30 calendar days of
              receiving the change notification. Objections must be sent to
              dpa@emailed.dev and must include a detailed explanation of the specific,
              reasonable grounds for the objection based on data protection concerns.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Resolution Process.</Text>{" "}
              Upon receiving a valid objection, Emailed will work in good faith to
              address your concerns. This may include: (i) providing additional
              information about the Subprocessor&apos;s data protection measures;
              (ii) implementing additional safeguards or restrictions on the
              Subprocessor&apos;s processing activities; or (iii) offering a
              commercially reasonable alternative configuration that avoids the use
              of the objected-to Subprocessor for your data.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Escalation.</Text>{" "}
              If the parties are unable to resolve the objection within 30 days of
              the objection being raised, either party may escalate the matter in
              accordance with the dispute resolution provisions of the Data Processing
              Agreement. In certain circumstances, if resolution is not possible, you
              may have the right to terminate the affected services without penalty,
              subject to the terms of the DPA.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 4 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          4. Data Protection Measures
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          All Subprocessors listed above are bound by contractual obligations that
          include:
        </Text>
        <Box className="space-y-2 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(i)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Processing personal data only on documented instructions from Emailed
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(ii)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Implementing appropriate technical and organizational security measures
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(iii)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Maintaining confidentiality obligations for all personnel with access to
              personal data
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(iv)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Assisting Emailed in responding to data subject rights requests
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(v)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Deleting or returning all personal data upon termination of services
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(vi)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Submitting to audits and inspections as required by applicable data
              protection laws
            </Text>
          </Box>
        </Box>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          For Subprocessors located outside the European Economic Area, appropriate
          transfer mechanisms are in place, including Standard Contractual Clauses
          (SCCs) approved by the European Commission and, where applicable,
          supplementary measures as recommended by the EDPB.
        </Text>
      </Box>

      <Box className="border-t border-border pt-6 space-y-3">
        <Text variant="body-sm" muted>
          To receive notifications of Subprocessor changes, configure your
          notification preferences in your Account Settings or subscribe to our
          Subprocessor RSS feed.
        </Text>
        <Text variant="body-sm" muted>
          For questions about our Subprocessors or data processing practices,
          contact our Data Protection Officer at dpo@emailed.dev.
        </Text>
      </Box>
    </Box>
  );
}
