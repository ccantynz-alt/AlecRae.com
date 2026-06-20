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
  const rawStatus = d.status;
  const verificationState: "pending" | "verified" | "failed" | "expired" =
    rawStatus === "verified" ? "verified" :
    rawStatus === "failed"   ? "failed"   :
    rawStatus === "expired"  ? "expired"  :
    "pending"; // covers "verifying", "pending", null, undefined, unknown

  return {
    id: d.id,
    domain: d.domain,
    verificationState,
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
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

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
    setVerifyingId(id);
    setVerifyResult(null);
    try {
      const res = await domainsApi.verify(id);
      await loadDomains();
      const isVerified = res.data.status === "verified";
      setVerifyResult({
        id,
        success: isVerified,
        message: isVerified
          ? "All DNS records verified — domain is active."
          : "Some records are still pending. DNS changes can take up to 48 hours to propagate.",
      });
    } catch (err) {
      setVerifyResult({
        id,
        success: false,
        message: err instanceof Error ? err.message : "Verification check failed",
      });
    } finally {
      setVerifyingId(null);
      setTimeout(() => setVerifyResult(null), 6000);
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
            <div key={d.id}>
              <DomainCard
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
                verifying={verifyingId === d.id}
              />
              {verifyResult?.id === d.id && (
                <div className={`mt-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
                  verifyResult.success
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}>
                  {verifyResult.success ? "✓ " : "⚠ "}
                  {verifyResult.message}
                </div>
              )}
            </div>
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDomain(e.target.value)}
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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // iOS Safari fallback — create a temporary input, select it, trigger copy
      const el = document.createElement("input");
      el.value = text;
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "0";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      el.setSelectionRange(0, text.length);
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl bg-surface rounded-xl border border-border shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <Text variant="heading-sm">DNS Records</Text>
            <Text variant="body-sm" muted className="mt-0.5">
              Add these to your DNS provider for{" "}
              <span className="font-mono text-content">{domain.domain}</span>
            </Text>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-content-secondary hover:text-content hover:bg-surface-secondary transition-colors text-xl"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {domain.dnsRecords.map((rec, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${rec.verified ? "border-green-200 bg-green-50" : "border-border bg-surface-secondary"}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-brand-50 text-brand-700">
                  {rec.type}
                </span>
                {rec.verified ? (
                  <span className="text-xs text-green-700 font-medium">&#10003; Verified</span>
                ) : (
                  <span className="text-xs text-content-secondary">Pending</span>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-content-secondary uppercase tracking-wide mb-1">Name / Host</p>
                  <p className="font-mono text-xs text-content break-all select-all bg-surface rounded px-2 py-1.5 border border-border">
                    {rec.name}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-content-secondary uppercase tracking-wide">Value</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(rec.value, i)}
                      className={`text-xs font-medium px-3 py-1 rounded-md transition-colors min-w-[70px] text-center ${
                        copiedIndex === i
                          ? "bg-green-100 text-green-700"
                          : "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200"
                      }`}
                    >
                      {copiedIndex === i ? "✓ Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="font-mono text-xs text-content break-all select-all bg-surface rounded px-2 py-1.5 border border-border">
                    {rec.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-border bg-surface-secondary">
          <Text variant="body-sm" muted>
            Tap any value to select it, or tap <strong>Copy</strong> to copy to clipboard. DNS changes can take up to 48 hours to propagate — then tap <strong>Verify</strong> on the domain card.
          </Text>
        </div>
      </div>
    </div>
  );
}
