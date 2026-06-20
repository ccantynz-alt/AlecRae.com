"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
    "pending";

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

// ─── Provider-specific instructions ──────────────────────────────────────────

const DNS_PROVIDERS = [
  { id: "cloudflare", label: "Cloudflare" },
  { id: "godaddy", label: "GoDaddy" },
  { id: "namecheap", label: "Namecheap" },
  { id: "porkbun", label: "Porkbun" },
  { id: "google", label: "Google Domains / Squarespace" },
  { id: "other", label: "Other provider" },
] as const;

type ProviderId = typeof DNS_PROVIDERS[number]["id"];

const PROVIDER_STEPS: Record<ProviderId, string[]> = {
  cloudflare: [
    "Log in at dash.cloudflare.com",
    "Click on your domain → DNS → Records",
    'Click "Add record" for each record below',
    "Set Proxy status to DNS only (grey cloud) for all records",
  ],
  godaddy: [
    "Log in at godaddy.com → My Products → Domains",
    "Click Manage DNS next to your domain",
    'Click "Add New Record" for each record below',
    "Save changes and wait 30–60 minutes",
  ],
  namecheap: [
    "Log in at namecheap.com → Domain List",
    'Click "Manage" next to your domain → Advanced DNS',
    'Click "Add New Record" for each record below',
    "Save all changes",
  ],
  porkbun: [
    "Log in at porkbun.com → Account → Domain Management",
    "Click the DNS button next to your domain",
    "Add each record below — leave TTL at default",
    "Records take effect within a few minutes on Porkbun",
  ],
  google: [
    "Log in at domains.google.com (or squarespace.com → Domains)",
    "Select your domain → DNS → Manage custom records",
    "Add each record below",
    "Changes typically propagate within 15 minutes",
  ],
  other: [
    "Log in to your domain registrar or DNS provider",
    "Find the DNS management section for your domain",
    "Add each record below exactly as shown",
    "DNS changes can take up to 48 hours to propagate globally",
  ],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DomainsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [domains, setDomains] = useState<ReturnType<typeof mapDomain>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewRecordsDomain, setViewRecordsDomain] = useState<ReturnType<typeof mapDomain> | null>(null);
  const [setupDomain, setSetupDomain] = useState<ReturnType<typeof mapDomain> | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDomains = useCallback(async () => {
    try {
      const res = await domainsApi.list();
      const mapped = res.data.map(mapDomain);
      setDomains(mapped);
      setError(null);
      return mapped;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load domains");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  // Auto-poll pending domains every 30s so users don't have to click Verify Now
  useEffect(() => {
    const hasPending = domains.some((d) => d.verificationState !== "verified");
    if (!hasPending) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }

    if (pollRef.current) return; // already polling

    pollRef.current = setInterval(async () => {
      const fresh = await loadDomains();
      if (fresh && fresh.every((d) => d.verificationState === "verified")) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 30_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [domains, loadDomains]);

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

  const handleDomainAdded = useCallback(async () => {
    setShowAddForm(false);
    const fresh = await loadDomains();
    // Open setup wizard for the most recently added pending domain
    if (fresh) {
      const newest = fresh.find((d) => d.verificationState !== "verified");
      if (newest) setSetupDomain(newest);
    }
  }, [loadDomains]);

  const actions = (
    <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
      Add Domain
    </Button>
  );

  return (
    <PageLayout
      title="Domains"
      description="Manage your sending domains. AlecRae handles your DNS setup step by step."
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
          onAdded={handleDomainAdded}
        />
      )}
      {setupDomain && (
        <DnsSetupWizard
          domain={setupDomain}
          onClose={() => setSetupDomain(null)}
          onVerify={async () => {
            await handleVerify(setupDomain.id);
            const fresh = await loadDomains();
            if (fresh) {
              const updated = fresh.find((d) => d.id === setupDomain.id);
              if (updated) setSetupDomain(updated);
            }
          }}
          verifying={verifyingId === setupDomain.id}
        />
      )}
      {viewRecordsDomain && !setupDomain && (
        <DnsRecordsModal
          domain={viewRecordsDomain}
          onClose={() => setViewRecordsDomain(null)}
        />
      )}
      {loading ? (
        <Text variant="body-md" muted>Loading domains...</Text>
      ) : domains.length === 0 ? (
        <EmptyState onAdd={() => setShowAddForm(true)} />
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
                onViewRecords={() =>
                  d.verificationState !== "verified"
                    ? setSetupDomain(d)
                    : setViewRecordsDomain(d)
                }
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-brand-600 text-xl">@</span>
          </div>
          <Text variant="heading-sm" className="mb-2">No domains yet</Text>
          <Text variant="body-md" muted className="mb-6 max-w-sm mx-auto">
            Add a sending domain to start sending emails from your own address.
            We&apos;ll walk you through the DNS setup step by step.
          </Text>
          <Button variant="primary" size="md" onClick={onAdd}>
            Add Your First Domain
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

EmptyState.displayName = "EmptyState";

// ─── Add domain form ──────────────────────────────────────────────────────────

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
        <Text variant="heading-sm" className="mb-1">
          Add a Sending Domain
        </Text>
        <Text variant="body-sm" muted className="mb-4">
          This is the domain your emails will come from — e.g.{" "}
          <span className="font-mono">mail.yourbusiness.com</span>. We&apos;ll give you
          step-by-step DNS instructions for any provider.
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
            loading={adding}
            disabled={adding || !domain.trim()}
          >
            {adding ? "Adding..." : "Continue"}
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

AddDomainForm.displayName = "AddDomainForm";

// ─── DNS Setup Wizard ─────────────────────────────────────────────────────────

function DnsSetupWizard({
  domain,
  onClose,
  onVerify,
  verifying,
}: {
  domain: ReturnType<typeof mapDomain>;
  onClose: () => void;
  onVerify: () => Promise<void>;
  verifying: boolean;
}) {
  const [provider, setProvider] = useState<ProviderId>("cloudflare");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const steps = PROVIDER_STEPS[provider];
  const allVerified = domain.verificationState === "verified";

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("input");
      el.value = text;
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
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
      <div className="relative z-10 w-full max-w-2xl bg-surface rounded-xl border border-border shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            {allVerified ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <Text variant="heading-sm">Domain Verified!</Text>
                </div>
                <Text variant="body-sm" muted className="mt-0.5">
                  <span className="font-mono text-content">{domain.domain}</span> is ready to send email.
                </Text>
              </>
            ) : (
              <>
                <Text variant="heading-sm">Set Up DNS Records</Text>
                <Text variant="body-sm" muted className="mt-0.5">
                  Add these records to{" "}
                  <span className="font-mono text-content">{domain.domain}</span>
                  {" "}to start sending email.
                </Text>
              </>
            )}
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

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {!allVerified && (
            <>
              {/* Provider selector */}
              <div>
                <p className="text-sm font-medium text-content-secondary mb-2">Where is your domain hosted?</p>
                <div className="flex flex-wrap gap-2">
                  {DNS_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProvider(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        provider === p.id
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-surface border-border text-content-secondary hover:border-brand-400 hover:text-content"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step-by-step instructions */}
              <div className="bg-surface-secondary rounded-lg p-4">
                <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-3">
                  How to add these records on {DNS_PROVIDERS.find((p) => p.id === provider)?.label}
                </p>
                <ol className="space-y-1.5">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-content">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {/* DNS Records */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide">
              {allVerified ? "Your DNS Records" : "Records to add"}
            </p>
            {domain.dnsRecords.map((rec, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 ${
                  rec.verified
                    ? "border-green-200 bg-green-50"
                    : "border-border bg-surface-secondary"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-brand-50 text-brand-700">
                    {rec.type}
                  </span>
                  {rec.verified ? (
                    <span className="text-xs text-green-700 font-medium">&#10003; Verified</span>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">Not yet verified</span>
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

          {!allVerified && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>DNS changes take time.</strong> After saving records with your provider,
              wait a few minutes and tap <strong>Check Now</strong> below. AlecRae also
              checks automatically every 30 seconds while you have this page open.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface-secondary flex-shrink-0">
          {allVerified ? (
            <div className="flex items-center justify-between">
              <Text variant="body-sm" muted>
                All {domain.dnsRecords.length} records verified. You can now send from this domain.
              </Text>
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <Text variant="body-sm" muted>
                {domain.dnsRecords.filter((r) => r.verified).length}/{domain.dnsRecords.length} records verified
              </Text>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  I&apos;ll do this later
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onVerify}
                  loading={verifying}
                  disabled={verifying}
                >
                  {verifying ? "Checking..." : "Check Now"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

DnsSetupWizard.displayName = "DnsSetupWizard";

// ─── DNS Records Modal (for verified domains — read-only reference) ────────────

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
      const el = document.createElement("input");
      el.value = text;
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
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
            Tap any value to select it, or tap <strong>Copy</strong> to copy to clipboard. DNS changes can take up to 48 hours to propagate.
          </Text>
        </div>
      </div>
    </div>
  );
}
