"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@alecrae/ui";
import { domainsApi, type Domain } from "../../../lib/api";

function mapDomain(d: Domain): {
  domain: string;
  id: string;
  verificationState: "pending" | "verified" | "failed" | "expired";
  dnsRecords: DnsRecord[];
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  addedAt: string;
} {
  return {
    id: d.id,
    domain: d.domain,
    verificationState: (d.verificationStatus === "verifying" ? "pending" : d.verificationStatus) as "pending" | "verified" | "failed",
    dnsRecords: [
      { type: "TXT", name: `_alecrae-verify.${d.domain}`, value: `alecrae-verify=${d.id.slice(0, 8)}`, verified: d.spfVerified },
      { type: "TXT", name: d.domain, value: `v=spf1 include:spf.alecrae.dev ~all`, verified: d.spfVerified },
      { type: "CNAME", name: `em._domainkey.${d.domain}`, value: "dkim.alecrae.dev", verified: d.dkimVerified },
      { type: "TXT", name: `_dmarc.${d.domain}`, value: `v=DMARC1; p=reject; rua=mailto:dmarc@alecrae.dev`, verified: d.dmarcVerified },
    ],
    spfVerified: d.spfVerified,
    dkimVerified: d.dkimVerified,
    dmarcVerified: d.dmarcVerified,
    addedAt: new Date(d.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  };
}

export default function DomainsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [domains, setDomains] = useState<ReturnType<typeof mapDomain>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    try {
      const res = await domainsApi.list();
      setDomains(res.data.map(mapDomain));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const handleVerify = async (id: string) => {
    try {
      await domainsApi.verify(id);
      await loadDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await domainsApi.remove(id);
      await loadDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove domain");
    }
  };

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
      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">
          {error}
        </div>
      )}
      {showAddForm && (
        <AddDomainForm
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false);
            loadDomains();
          }}
        />
      )}
      {loading ? (
        <Text variant="body-md" muted>Loading domains...</Text>
      ) : domains.length === 0 ? (
        <Card>
          <CardContent>
            <Text variant="body-md" muted>
              No domains configured. Add a domain to start sending emails.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {domains.map((d) => (
            <DomainCard
              key={d.id}
              domain={d.domain}
              verificationState={d.verificationState}
              dnsRecords={d.dnsRecords}
              spfVerified={d.spfVerified}
              dkimVerified={d.dkimVerified}
              dmarcVerified={d.dmarcVerified}
              addedAt={d.addedAt}
              onVerify={() => handleVerify(d.id)}
              onRemove={() => handleRemove(d.id)}
              onViewRecords={() => { /* no-op */ }}
            />
          ))}
        </Box>
      )}
    </PageLayout>
  );
}

function AddDomainForm({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!domain.trim()) return;
    setAdding(true);
    setError(null);

    try {
      await domainsApi.add(domain.trim());
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent>
        <Text variant="heading-sm" className="mb-4">
          Add a New Domain
        </Text>
        {error && (
          <div className="mb-3 p-2 rounded bg-red-100 text-red-800 text-sm">
            {error}
          </div>
        )}
        <Box className="flex items-end gap-4">
          <Box className="flex-1">
            <Input
              label="Domain name"
              variant="text"
              placeholder="mail.yourdomain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Box>
          <Button
            variant="primary"
            size="md"
            onClick={handleAdd}
            disabled={adding || !domain.trim()}
          >
            {adding ? "Adding..." : "Add Domain"}
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
