"use client";

import { useState } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  PageLayout,
  DomainCard,
  type DnsRecord,
} from "@emailed/ui";

interface DomainData {
  domain: string;
  verificationState: "pending" | "verified" | "failed" | "expired";
  dnsRecords: DnsRecord[];
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  addedAt: string;
}

const sampleDomains: DomainData[] = [
  {
    domain: "emailed.dev",
    verificationState: "verified",
    dnsRecords: [
      { type: "TXT", name: "_emailed-verify.emailed.dev", value: "emailed-verify=abc123", verified: true },
      { type: "TXT", name: "emailed.dev", value: "v=spf1 include:spf.emailed.dev ~all", verified: true },
      { type: "CNAME", name: "em._domainkey.emailed.dev", value: "dkim.emailed.dev", verified: true },
      { type: "TXT", name: "_dmarc.emailed.dev", value: "v=DMARC1; p=reject; rua=mailto:dmarc@emailed.dev", verified: true },
    ],
    spfVerified: true,
    dkimVerified: true,
    dmarcVerified: true,
    addedAt: "Jan 15, 2026",
  },
  {
    domain: "notifications.acme.co",
    verificationState: "pending",
    dnsRecords: [
      { type: "TXT", name: "_emailed-verify.notifications.acme.co", value: "emailed-verify=def456", verified: true },
      { type: "TXT", name: "notifications.acme.co", value: "v=spf1 include:spf.emailed.dev ~all", verified: false },
      { type: "CNAME", name: "em._domainkey.notifications.acme.co", value: "dkim.emailed.dev", verified: false },
      { type: "TXT", name: "_dmarc.notifications.acme.co", value: "v=DMARC1; p=none;", verified: false },
    ],
    spfVerified: false,
    dkimVerified: false,
    dmarcVerified: false,
    addedAt: "Mar 28, 2026",
  },
];

export default function DomainsPage() {
  const [showAddForm, setShowAddForm] = useState(false);

  const actions = (
    <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
      Add Domain
    </Button>
  );

  return (
    <PageLayout
      title="Domains"
      description="Manage your sending domains. Configure DNS records for authentication and deliverability."
      actions={actions}
    >
      {showAddForm && (
        <AddDomainForm onClose={() => setShowAddForm(false)} />
      )}
      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sampleDomains.map((d) => (
          <DomainCard
            key={d.domain}
            domain={d.domain}
            verificationState={d.verificationState}
            dnsRecords={d.dnsRecords}
            spfVerified={d.spfVerified}
            dkimVerified={d.dkimVerified}
            dmarcVerified={d.dmarcVerified}
            addedAt={d.addedAt}
            onVerify={() => {}}
            onRemove={() => {}}
            onViewRecords={() => {}}
          />
        ))}
      </Box>
    </PageLayout>
  );
}

function AddDomainForm({ onClose }: { onClose: () => void }) {
  return (
    <Card className="mb-6">
      <CardContent>
        <Text variant="heading-sm" className="mb-4">
          Add a New Domain
        </Text>
        <Box className="flex items-end gap-4">
          <Box className="flex-1">
            <Input
              label="Domain name"
              variant="text"
              placeholder="mail.yourdomain.com"
            />
          </Box>
          <Button variant="primary" size="md">
            Add Domain
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
        </Box>
        <Text variant="body-sm" muted className="mt-3">
          After adding, you will need to configure DNS records to verify domain ownership and enable email authentication.
        </Text>
      </CardContent>
    </Card>
  );
}

AddDomainForm.displayName = "AddDomainForm";
