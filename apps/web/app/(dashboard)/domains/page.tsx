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
    verificationState: (d.status === "verifying" ? "pending" : d.status) as "pending" | "verified" | "failed",
    dnsRecords: [
      { type: "TXT", name: `_alecrae-verify.${d.domain}`, value: `alecrae-verify=${d.id.slice(0, 8)}`, verified: d.spfVerified },
      { type: "TXT", name: d.domain, value: `v=spf1 include:spf.alecrae.com ~all`, verified: d.spfVerified },
      { type: "CNAME", name: `em._domainkey.${d.domain}`, value: "dkim.alecrae.com", verified: d.dkimVerified },
      { type: "TXT", name: `_dmarc.${d.domain}`, value: `v=DMARC1; p=reject; rua=mailto:dmarc@alecrae.com`, verified: d.dmarcVerified },
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
  const [viewRecordsDomain, setViewRecordsDomain] = useState<ReturnType<typeof mapDomain> | null>(null);

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
      {viewRecordsDomain && (
        <DnsRecordsModal
          domain={viewRecordsDomain}
          onClose={() => setViewRecordsDomain(null)}
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
              onViewRecords={() => setViewRecordsDomain(d)}
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

function DnsRecordsModal({
  domain,
  onClose,
}: {
  domain: ReturnType<typeof mapDomain>;
  onClose: () => void;
}) {
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback: select + copy via execCommand (Safari)
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-surface rounded-xl border border-border shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <Text variant="heading-sm">DNS Records</Text>
            <Text variant="body-sm" muted className="mt-0.5">
              Add these records to your DNS provider for{" "}
              <span className="font-mono text-content">{domain.domain}</span>
            </Text>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-content-secondary hover:text-content transition-colors text-xl leading-none"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {domain.dnsRecords.map((rec, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${rec.verified ? "border-green-200 bg-green-50" : "border-border bg-surface-secondary"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-brand-50 text-brand-700">
                      {rec.type}
                    </span>
                    {rec.verified ? (
                      <span className="text-xs text-green-700 font-medium">&#10003; Verified</span>
                    ) : (
                      <span className="text-xs text-content-secondary">Pending</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span className="text-xs font-medium text-content-secondary uppercase tracking-wide">Name / Host</span>
                      <p className="font-mono text-xs text-content break-all mt-0.5">{rec.name}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-content-secondary uppercase tracking-wide">Value</span>
                      <p className="font-mono text-xs text-content break-all mt-0.5">{rec.value}</p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(rec.value)}
                  className="flex-shrink-0 text-xs"
                >
                  Copy
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-border bg-surface-secondary">
          <Text variant="body-sm" muted>
            DNS changes can take up to 48 hours to propagate. Once added, click{" "}
            <strong>Verify</strong> on the domain card to check.
          </Text>
        </div>
      </div>
    </div>
  );
}
