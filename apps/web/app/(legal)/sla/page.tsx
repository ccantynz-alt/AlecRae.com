import { Box, Text, Card, CardContent } from "@emailed/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Service Level Agreement - Emailed",
  description:
    "Emailed Service Level Agreement covering uptime commitments, service credits, and performance targets.",
};

export default function SLAPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text variant="heading-lg" className="font-bold mb-2">
          Service Level Agreement
        </Text>
        <Text variant="body-sm" muted>
          Effective Date: April 1, 2026 &middot; Last Updated: April 1, 2026
        </Text>
      </Box>

      <Text variant="body-md" className="text-content-secondary leading-relaxed">
        This Service Level Agreement (&quot;SLA&quot;) is a policy governing the use of
        the Emailed platform (&quot;Service&quot;) under the terms of the Emailed Terms
        of Service (the &quot;Terms&quot;) between Emailed, Inc. (&quot;Emailed,&quot;
        &quot;we,&quot; &quot;us&quot;) and users of the Service (&quot;you,&quot;
        &quot;your&quot;). This SLA applies separately to each account using the
        Service. Unless otherwise provided herein, this SLA is subject to the Terms.
      </Text>

      {/* Section 1 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          1. Service Availability Commitment
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Emailed commits to a monthly uptime percentage of 99.99% for the core
          email platform, which equates to a maximum of approximately 4.38 minutes of
          unplanned downtime per month, or approximately 52.6 minutes per year. This
          commitment applies to all production services including the email sending
          API, inbound email processing, JMAP access, web application, and the
          administrative dashboard.
        </Text>
      </Box>

      {/* Section 2 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          2. Uptime Calculation
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Monthly Uptime Percentage is calculated using the following formula:
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Text variant="body-md" className="font-mono text-center py-2">
              Uptime % = (Total Minutes - Downtime Minutes) / Total Minutes x 100
            </Text>
          </CardContent>
        </Card>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          &quot;Total Minutes&quot; means the total number of minutes in the applicable
          calendar month. &quot;Downtime Minutes&quot; means the total number of minutes
          during which the Service is unavailable, excluding Excluded Downtime as defined
          in Section 3. A minute is considered &quot;down&quot; if all continuous
          attempts to establish a connection to the Service within that minute fail.
        </Text>
      </Box>

      {/* Section 3 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          3. Excluded Downtime
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          The following categories of downtime are excluded from the uptime calculation
          and do not qualify for Service Credits:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Scheduled Maintenance.</Text>{" "}
              Planned maintenance windows for which we provide at least 72 hours
              advance notice via email and our status page. Scheduled maintenance
              windows will be limited to off-peak hours and will not exceed 4 hours
              per month.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Force Majeure.</Text>{" "}
              Events beyond our reasonable control, including but not limited to natural
              disasters, acts of war or terrorism, government actions, pandemic,
              widespread internet failures, or failures of upstream backbone providers.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Customer-Caused Issues.</Text>{" "}
              Downtime resulting from your actions or inactions, including
              misconfiguration of DNS records, exceeding agreed-upon rate limits,
              or use of the Service in violation of the Terms or documentation.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">d.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Third-Party Failures.</Text>{" "}
              Downtime attributable to third-party services, software, or hardware
              not under Emailed&apos;s control, including third-party DNS providers,
              recipient mail servers, or ISP routing issues.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">e.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Emergency Security Patches.</Text>{" "}
              Unscheduled maintenance required to address critical security
              vulnerabilities that pose an immediate threat to the platform or its
              users.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 4 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          4. Service Credits
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          If Emailed fails to meet the Monthly Uptime Percentage commitment, you may
          be eligible for Service Credits as described below. Service Credits are
          calculated as a percentage of your total monthly fees for the month in which
          the failure occurred.
        </Text>
        <Card>
          <CardContent>
            <Box className="overflow-x-auto">
              <Box className="min-w-full">
                {/* Table Header */}
                <Box className="grid grid-cols-2 border-b border-border pb-3 mb-1">
                  <Text variant="body-sm" className="font-semibold text-content">
                    Monthly Uptime Percentage
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Service Credit
                  </Text>
                </Box>
                {/* Row 1 */}
                <Box className="grid grid-cols-2 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary">
                    99.90% &ndash; 99.99%
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    10% of monthly fees
                  </Text>
                </Box>
                {/* Row 2 */}
                <Box className="grid grid-cols-2 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary">
                    99.00% &ndash; 99.90%
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    25% of monthly fees
                  </Text>
                </Box>
                {/* Row 3 */}
                <Box className="grid grid-cols-2 py-3">
                  <Text variant="body-sm" className="text-content-secondary">
                    Below 99.00%
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    50% of monthly fees
                  </Text>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Service Credits are capped at 50% of your total monthly fees for the
          affected month. Service Credits may not be transferred or applied to other
          accounts and will be applied as a credit toward future invoices.
        </Text>
      </Box>

      {/* Section 5 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          5. Email Delivery Performance SLA
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          In addition to overall platform availability, Emailed commits to the
          following email-specific performance targets:
        </Text>
        <Card>
          <CardContent>
            <Box className="space-y-3">
              <Box className="grid grid-cols-2 border-b border-border pb-3 mb-1">
                <Text variant="body-sm" className="font-semibold text-content">
                  Metric
                </Text>
                <Text variant="body-sm" className="font-semibold text-content">
                  Target
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  Email Send API Response Time (p99)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  &lt; 100ms
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  Inbound Email Processing (receipt to mailbox)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  &lt; 500ms
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  Full-Text Search Latency
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  &lt; 50ms
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2">
                <Text variant="body-sm" className="text-content-secondary">
                  JMAP Push Notification Delivery
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  &lt; 1 second
                </Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          These targets are measured at the 99th percentile over a rolling 30-day
          period. Performance degradation beyond these thresholds is considered a
          service incident for the purposes of this SLA.
        </Text>
      </Box>

      {/* Section 6 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          6. AI Service SLA
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Emailed&apos;s AI-powered features are subject to the following additional
          performance commitments:
        </Text>
        <Card>
          <CardContent>
            <Box className="space-y-3">
              <Box className="grid grid-cols-2 border-b border-border pb-3 mb-1">
                <Text variant="body-sm" className="font-semibold text-content">
                  AI Metric
                </Text>
                <Text variant="body-sm" className="font-semibold text-content">
                  Target
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  Spam/Phishing Classification Latency
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  &lt; 200ms
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  Spam Detection Accuracy
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  99.5% target
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  False Positive Rate (legitimate mail marked as spam)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  &lt; 0.05%
                </Text>
              </Box>
              <Box className="grid grid-cols-2 py-2">
                <Text variant="body-sm" className="text-content-secondary">
                  AI Feature Availability
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  99.9% uptime
                </Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          In the event AI services are unavailable, all email processing functions
          will continue to operate using rule-based fallback systems. AI service
          degradation does not affect core email sending and receiving capabilities.
        </Text>
      </Box>

      {/* Section 7 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          7. Support Response Times
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Emailed provides tiered support response commitments based on issue severity:
        </Text>
        <Card>
          <CardContent>
            <Box className="space-y-3">
              <Box className="grid grid-cols-3 border-b border-border pb-3 mb-1">
                <Text variant="body-sm" className="font-semibold text-content">
                  Severity Level
                </Text>
                <Text variant="body-sm" className="font-semibold text-content">
                  Description
                </Text>
                <Text variant="body-sm" className="font-semibold text-content">
                  Initial Response
                </Text>
              </Box>
              <Box className="grid grid-cols-3 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary font-medium">
                  Critical (P1)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  Complete service outage or data loss
                </Text>
                <Text variant="body-sm" className="text-content-secondary font-semibold">
                  15 minutes
                </Text>
              </Box>
              <Box className="grid grid-cols-3 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary font-medium">
                  High (P2)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  Major feature degradation, significant impact
                </Text>
                <Text variant="body-sm" className="text-content-secondary font-semibold">
                  1 hour
                </Text>
              </Box>
              <Box className="grid grid-cols-3 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary font-medium">
                  Medium (P3)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  Minor feature issue, workaround available
                </Text>
                <Text variant="body-sm" className="text-content-secondary font-semibold">
                  4 hours
                </Text>
              </Box>
              <Box className="grid grid-cols-3 py-2">
                <Text variant="body-sm" className="text-content-secondary font-medium">
                  Low (P4)
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  General question or feature request
                </Text>
                <Text variant="body-sm" className="text-content-secondary font-semibold">
                  1 business day
                </Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Response times represent the time from ticket submission to the first
          substantive response from our support team or AI support agent. Critical and
          High severity issues are monitored 24/7/365. Medium and Low severity issues
          are handled during business hours (Monday through Friday, 9:00 AM to 6:00 PM
          ET, excluding US federal holidays).
        </Text>
      </Box>

      {/* Section 8 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          8. Monitoring and Reporting
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Emailed provides comprehensive monitoring and transparency through the
          following mechanisms:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Real-Time Status Page.</Text>{" "}
              A publicly accessible status page at status.emailed.dev displaying
              current operational status of all services, updated in real time.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Monthly Uptime Reports.</Text>{" "}
              Detailed monthly reports available in your dashboard showing actual
              uptime percentages, incident summaries, and performance metrics for
              the preceding calendar month.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Incident Notifications.</Text>{" "}
              Proactive email and webhook notifications for all incidents affecting
              service availability, including real-time updates and post-incident
              reports.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 9 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          9. Credit Request Process
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          To receive Service Credits, you must submit a request within 30 calendar days
          of the end of the month in which the SLA failure occurred. Credit requests
          must include:
        </Text>
        <Box className="space-y-2 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(i)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Your account identifier and contact information
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(ii)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              The dates and times of each incident of unavailability
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(iii)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              A description of the affected services and the impact on your operations
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(iv)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Any relevant logs, error messages, or request IDs that document the incident
            </Text>
          </Box>
        </Box>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Requests may be submitted by emailing sla@emailed.dev or through the support
          portal. Emailed will review and respond to credit requests within 10 business
          days. If we confirm the SLA failure, credits will be applied to your next
          billing cycle.
        </Text>
      </Box>

      {/* Section 10 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          10. Sole and Exclusive Remedy
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Service Credits as described in this SLA are your sole and exclusive remedy
          for any failure by Emailed to meet the service level commitments set forth
          herein. This SLA does not entitle you to any additional remedies, including
          but not limited to damages, refunds beyond the stated credit amounts, or
          termination rights beyond those specified in the Terms of Service. The
          aggregate maximum liability under this SLA shall not exceed 50% of the fees
          paid by you for the affected month.
        </Text>
      </Box>

      {/* Section 11 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          11. SLA Modifications
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Emailed reserves the right to modify this SLA at any time. We will provide at
          least 30 days&apos; notice of material changes via email and through the
          platform. Continued use of the Service following the effective date of any
          modifications constitutes your acceptance of the updated SLA. Modifications
          will not retroactively reduce Service Credits owed for incidents that occurred
          prior to the modification effective date.
        </Text>
      </Box>

      <Box className="border-t border-border pt-6">
        <Text variant="body-sm" muted>
          Questions about this SLA? Contact us at legal@emailed.dev or visit our
          support portal.
        </Text>
      </Box>
    </Box>
  );
}
