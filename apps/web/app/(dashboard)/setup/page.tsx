"use client";

/**
 * Guided business-email setup — a SEQUENCER of capability that already exists,
 * not new backend. Running mail on your own domain today means knowing to visit
 * three separate pages in the right order (Workspace → Domains → Mailboxes) and
 * knowing DNS has to verify in between. This wizard walks that path in one place:
 *
 *   1. Organisation  — confirm (or create) the workspace this is for
 *   2. Add domain    — POST /v1/domains, then show the DNS records to paste
 *   3. Verify DNS    — poll POST /v1/domains/:id/verify until records go green
 *   4. Mailboxes     — POST /v1/mailboxes (gated until the domain is verified+active)
 *   5. Done          — links straight to Inbox and Compose
 *
 * Every call here is one the /workspace, /domains and /mailboxes pages already
 * make. The wizard is resumable: on load it inspects real state (domains +
 * mailboxes) and drops the operator at the first unfinished step, so returning
 * mid-setup lands where they left off rather than at step one.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  PageLayout,
} from "@alecrae/ui";
import {
  authApi,
  workspacesApi,
  domainsApi,
  mailboxesApi,
  type Domain,
  type Mailbox,
  type Workspace,
} from "../../../lib/api";

// ─── Types + helpers ──────────────────────────────────────────────────────────

interface DnsRow {
  type: string;
  name: string;
  value: string;
  priority: number | null;
  verified: boolean;
}

type StepKey = "org" | "domain" | "verify" | "mailboxes" | "done";

const STEP_ORDER: StepKey[] = ["org", "domain", "verify", "mailboxes", "done"];
const STEP_LABELS: Record<StepKey, string> = {
  org: "Organisation",
  domain: "Add domain",
  verify: "Verify DNS",
  mailboxes: "Mailboxes",
  done: "Done",
};

/** A domain can carry a mailbox only when verified AND active — the same gate
 *  the mailboxes API enforces (409 otherwise). */
function domainReady(d: Domain | null | undefined): boolean {
  return !!d && d.status === "verified" && d.isActive !== false;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Shared copy-to-clipboard with a short "copied" flag, keyed so each button
 *  reflects its own state. Falls back silently on an insecure context. */
function useCopy(): { copied: string | null; copy: (text: string, key: string) => Promise<void> } {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — no-op.
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };
  return { copied, copy };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupPage(): ReactNode {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [role, setRole] = useState<string>("");
  const [roleChecked, setRoleChecked] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [dnsByDomain, setDnsByDomain] = useState<Record<string, DnsRow[]>>({});

  const [step, setStep] = useState<StepKey>("org");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const initialisedRef = useRef(false);

  const activeWorkspace = workspaces.find((w) => w.active) ?? null;
  const selectedDomain = domains.find((d) => d.id === selectedDomainId) ?? null;
  const readyDomain = domains.find(domainReady) ?? null;
  const isAdmin = role === "owner" || role === "admin";

  // ── data loading ──────────────────────────────────────────────────────────

  const loadDns = useCallback(async (domainId: string): Promise<void> => {
    try {
      const res = await domainsApi.dnsRecords(domainId);
      setDnsByDomain((prev) => ({
        ...prev,
        [domainId]: res.data.records.map((r) => ({
          type: r.type,
          name: r.name,
          value: r.value,
          priority: r.priority,
          verified: r.verified,
        })),
      }));
    } catch {
      // Non-fatal: the step still renders, just without the record list.
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [wsRes, meRes, domRes, mbRes] = await Promise.all([
        workspacesApi.list(),
        authApi.me(),
        domainsApi.list(),
        mailboxesApi.list(),
      ]);
      setWorkspaces(wsRes.data);
      setRole(meRes.data.role);
      setDomains(domRes.data);
      setMailboxes(mbRes.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setRoleChecked(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkVerification = useCallback(
    async (domainId: string, silent = false): Promise<void> => {
      if (!silent) setChecking(true);
      try {
        const res = await domainsApi.verify(domainId);
        setDomains((prev) => prev.map((d) => (d.id === domainId ? res.data : d)));
        await loadDns(domainId);
      } catch (e) {
        if (!silent) setError(errMsg(e));
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [loadDns],
  );

  // ── resume: drop the operator at the first unfinished step (once) ───────────

  useEffect(() => {
    if (loading || initialisedRef.current) return;
    initialisedRef.current = true;

    const ready = domains.find(domainReady) ?? null;
    const pending = domains.find((d) => !domainReady(d)) ?? null;

    if (domains.length === 0) {
      setStep("domain");
    } else if (!ready) {
      setStep("verify");
      setSelectedDomainId(pending?.id ?? domains[0]?.id ?? null);
    } else if (mailboxes.length === 0) {
      setStep("mailboxes");
      setSelectedDomainId(ready.id);
    } else {
      setStep("done");
      setSelectedDomainId(ready.id);
    }
  }, [loading, domains, mailboxes]);

  // ── verify step: fetch records + auto-poll while pending ────────────────────

  useEffect(() => {
    if (step === "verify" && selectedDomainId && !dnsByDomain[selectedDomainId]) {
      void loadDns(selectedDomainId);
    }
  }, [step, selectedDomainId, dnsByDomain, loadDns]);

  useEffect(() => {
    if (step !== "verify" || !selectedDomainId) return;
    if (domainReady(domains.find((d) => d.id === selectedDomainId))) return;

    const timer = setInterval(() => {
      void checkVerification(selectedDomainId, true);
    }, 20000);
    return () => clearInterval(timer);
  }, [step, selectedDomainId, domains, checkVerification]);

  // ── step navigation ─────────────────────────────────────────────────────────

  const canGoTo = (target: StepKey): boolean => {
    if (target === "org" || target === "domain") return true;
    if (target === "verify") return domains.length > 0;
    return !!readyDomain; // mailboxes + done
  };

  const go = (target: StepKey): void => {
    if (canGoTo(target)) setStep(target);
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (!roleChecked || loading) {
    return (
      <PageLayout title="Set up business email" description="Getting things ready…">
        <Text variant="body-md" muted>
          Loading…
        </Text>
      </PageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <PageLayout
        title="Set up business email"
        description="Provision mail on your own domain."
      >
        <Card>
          <CardContent>
            <Text variant="heading-sm" className="mb-2">
              Admin access required
            </Text>
            <Text variant="body-md" muted>
              Only the account owner or an admin can set up domains and mailboxes.
              Ask your workspace owner if you need access.
            </Text>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Set up business email"
      description="Send and receive on your own domain — one guided path."
    >
      <Box className="max-w-3xl w-full mx-auto space-y-6">
        <Stepper current={step} canGoTo={canGoTo} onGo={go} />

        {error && (
          <Box role="alert" className="p-3 rounded-lg bg-status-error/10 border border-status-error/30">
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
          </Box>
        )}

        {step === "org" && (
          <OrgStep
            activeWorkspace={activeWorkspace}
            onContinue={() => go("domain")}
          />
        )}

        {step === "domain" && (
          <DomainStep
            domains={domains}
            onAdded={(d) => {
              setDomains((prev) => [d, ...prev.filter((x) => x.id !== d.id)]);
              setSelectedDomainId(d.id);
              void loadDns(d.id);
              setStep("verify");
            }}
            onSelectExisting={(d) => {
              setSelectedDomainId(d.id);
              setStep("verify");
            }}
            onError={setError}
          />
        )}

        {step === "verify" && (
          <VerifyStep
            domains={domains}
            selectedDomain={selectedDomain}
            records={selectedDomainId ? dnsByDomain[selectedDomainId] ?? null : null}
            checking={checking}
            onSelectDomain={(id) => setSelectedDomainId(id)}
            onCheck={() => selectedDomainId && void checkVerification(selectedDomainId)}
            onContinue={() => go("mailboxes")}
          />
        )}

        {step === "mailboxes" && (
          <MailboxStep
            readyDomains={domains.filter(domainReady)}
            mailboxes={mailboxes}
            onCreated={(mb) => setMailboxes((prev) => [mb, ...prev])}
            onBackToVerify={() => setStep("verify")}
            onFinish={() => setStep("done")}
            onError={setError}
          />
        )}

        {step === "done" && (
          <DoneStep
            workspaceName={activeWorkspace?.name ?? "your workspace"}
            verifiedCount={domains.filter(domainReady).length}
            mailboxCount={mailboxes.length}
            onGo={(href) => router.push(href as Route)}
          />
        )}
      </Box>
    </PageLayout>
  );
}

SetupPage.displayName = "SetupPage";

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({
  current,
  canGoTo,
  onGo,
}: {
  current: StepKey;
  canGoTo: (s: StepKey) => boolean;
  onGo: (s: StepKey) => void;
}): ReactNode {
  const currentIndex = STEP_ORDER.indexOf(current);
  return (
    <Box as="ol" className="flex flex-wrap items-center gap-2" aria-label="Setup progress">
      {STEP_ORDER.map((key, i) => {
        const isCurrent = key === current;
        const isDone = i < currentIndex;
        const reachable = canGoTo(key);
        return (
          <Box as="li" key={key} className="flex items-center gap-2">
            <Box
              as="button"
              type="button"
              onClick={() => onGo(key)}
              disabled={!reachable}
              aria-current={isCurrent ? "step" : undefined}
              className={[
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-body-sm font-medium transition-colors",
                isCurrent
                  ? "bg-brand-600 text-white"
                  : isDone
                    ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                    : reachable
                      ? "bg-surface-secondary text-content-secondary hover:text-content"
                      : "bg-surface-secondary text-content-tertiary cursor-not-allowed opacity-60",
              ].join(" ")}
            >
              <Box
                as="span"
                aria-hidden="true"
                className={[
                  "w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold",
                  isCurrent
                    ? "bg-white/20 text-white"
                    : isDone
                      ? "bg-brand-600 text-white"
                      : "bg-surface text-content-tertiary border border-border",
                ].join(" ")}
              >
                {isDone ? "✓" : i + 1}
              </Box>
              <Box as="span" className="hidden sm:inline">
                {STEP_LABELS[key]}
              </Box>
            </Box>
            {i < STEP_ORDER.length - 1 && (
              <Box as="span" aria-hidden="true" className="text-content-tertiary">
                ›
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Step 1: Organisation ─────────────────────────────────────────────────────

function OrgStep({
  activeWorkspace,
  onContinue,
}: {
  activeWorkspace: Workspace | null;
  onContinue: () => void;
}): ReactNode {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createAndSwitch = async (): Promise<void> => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await workspacesApi.create({ name: name.trim() });
      await workspacesApi.switchTo(res.data.accountId);
      // Reload so every step re-reads state for the newly active workspace.
      window.location.reload();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Text variant="heading-sm" className="mb-1">
          Organisation
        </Text>
        <Text variant="body-md" muted className="mb-4">
          Business email is set up per workspace. You&apos;re configuring:
        </Text>

        <Box className="p-4 rounded-lg border border-border bg-surface-secondary mb-4">
          <Text variant="body-md" className="font-medium">
            {activeWorkspace?.name ?? "Current workspace"}
          </Text>
          {activeWorkspace && (
            <Text variant="caption" muted className="capitalize">
              {activeWorkspace.role} · {activeWorkspace.planTier}
            </Text>
          )}
        </Box>

        {!creating ? (
          <Box className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" onClick={onContinue}>
              Continue
            </Button>
            <Button variant="ghost" size="md" onClick={() => setCreating(true)}>
              Set up a different workspace
            </Button>
          </Box>
        ) : (
          <Box className="space-y-2">
            <Text variant="body-sm" muted>
              Create a separate workspace (its own domain, mailboxes and team) and
              switch to it.
            </Text>
            <Box className="flex flex-wrap items-end gap-2">
              <Box className="flex-1 min-w-[12rem]">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. BookARide"
                  aria-label="New workspace name"
                  disabled={busy}
                />
              </Box>
              <Button
                variant="primary"
                size="md"
                onClick={() => void createAndSwitch()}
                disabled={busy || !name.trim()}
              >
                {busy ? "Creating…" : "Create & switch"}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </Button>
            </Box>
            {err && (
              <Text variant="caption" className="text-status-error">
                {err}
              </Text>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Add domain ───────────────────────────────────────────────────────

function DomainStep({
  domains,
  onAdded,
  onSelectExisting,
  onError,
}: {
  domains: Domain[];
  onAdded: (d: Domain) => void;
  onSelectExisting: (d: Domain) => void;
  onError: (msg: string | null) => void;
}): ReactNode {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    const domain = value.trim().toLowerCase();
    if (!domain) return;
    setAdding(true);
    setLocalErr(null);
    onError(null);
    try {
      const res = await domainsApi.add(domain);
      setValue("");
      onAdded(res.data);
    } catch (e) {
      setLocalErr(errMsg(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Text variant="heading-sm" className="mb-1">
          Add your sending domain
        </Text>
        <Text variant="body-md" muted className="mb-4">
          This is the domain your business email comes from — e.g.{" "}
          <Text as="span" variant="body-md" className="font-mono">
            yourbusiness.com
          </Text>
          . We&apos;ll generate the exact DNS records to add next.
        </Text>

        <Box className="flex flex-wrap items-end gap-2 mb-2">
          <Box className="flex-1 min-w-[14rem]">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="yourbusiness.com"
              aria-label="Domain name"
              disabled={adding}
            />
          </Box>
          <Button
            variant="primary"
            size="md"
            onClick={() => void add()}
            disabled={adding || !value.trim()}
          >
            {adding ? "Adding…" : "Add domain"}
          </Button>
        </Box>
        {localErr && (
          <Text variant="caption" className="text-status-error">
            {localErr}
          </Text>
        )}

        {domains.length > 0 && (
          <Box className="mt-6">
            <Text variant="caption" muted className="uppercase tracking-wide mb-2 block">
              Domains on this workspace
            </Text>
            <Box className="divide-y divide-border rounded-lg border border-border">
              {domains.map((d) => (
                <Box key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Box className="min-w-0">
                    <Text variant="body-sm" className="font-medium truncate">
                      {d.domain}
                    </Text>
                    <Text variant="caption" muted className="capitalize">
                      {domainReady(d) ? "verified · active" : d.status}
                    </Text>
                  </Box>
                  <Button variant="secondary" size="sm" onClick={() => onSelectExisting(d)}>
                    {domainReady(d) ? "Review" : "Continue"}
                  </Button>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 3: Verify DNS ───────────────────────────────────────────────────────

function VerifyStep({
  domains,
  selectedDomain,
  records,
  checking,
  onSelectDomain,
  onCheck,
  onContinue,
}: {
  domains: Domain[];
  selectedDomain: Domain | null;
  records: DnsRow[] | null;
  checking: boolean;
  onSelectDomain: (id: string) => void;
  onCheck: () => void;
  onContinue: () => void;
}): ReactNode {
  const { copied, copy } = useCopy();
  const ready = domainReady(selectedDomain);
  const verifiedCount = (records ?? []).filter((r) => r.verified).length;
  const total = records?.length ?? 0;

  return (
    <Card>
      <CardContent>
        <Box className="flex items-start justify-between gap-3 mb-1">
          <Text variant="heading-sm">Verify DNS</Text>
          {domains.length > 1 && selectedDomain && (
            <Box
              as="select"
              value={selectedDomain.id}
              onChange={(e) => onSelectDomain((e.target as HTMLSelectElement).value)}
              aria-label="Domain to verify"
              className="h-9 px-2 rounded-lg border border-border bg-surface text-content text-body-sm"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domain}
                </option>
              ))}
            </Box>
          )}
        </Box>

        {!selectedDomain ? (
          <Text variant="body-md" muted>
            Select a domain to verify.
          </Text>
        ) : (
          <>
            <Text variant="body-md" muted className="mb-4">
              Add these records at your DNS provider for{" "}
              <Text as="span" variant="body-md" className="font-mono text-content">
                {selectedDomain.domain}
              </Text>
              . AlecRae re-checks every 20 seconds; DNS can take up to 48 hours to
              propagate.
            </Text>

            {ready ? (
              <Box className="p-3 rounded-lg bg-status-success/10 border border-status-success/30 mb-4">
                <Text variant="body-sm" className="text-status-success font-medium">
                  ✓ {selectedDomain.domain} is verified and active — ready to send and receive.
                </Text>
              </Box>
            ) : (
              <Box className="p-3 rounded-lg bg-surface-secondary border border-border mb-4">
                <Text variant="body-sm" muted>
                  {total > 0
                    ? `${verifiedCount} of ${total} records verified so far.`
                    : "Waiting for DNS records to appear."}
                </Text>
              </Box>
            )}

            {records === null ? (
              <Text variant="body-sm" muted>
                Loading records…
              </Text>
            ) : records.length === 0 ? (
              <Text variant="body-sm" muted>
                No records to show yet.
              </Text>
            ) : (
              <Box className="space-y-3">
                {records.map((rec, i) => (
                  <Box
                    key={`${rec.type}-${rec.name}-${i}`}
                    className={`rounded-lg border p-3 ${
                      rec.verified
                        ? "border-status-success/40 bg-status-success/5"
                        : "border-border bg-surface-secondary"
                    }`}
                  >
                    <Box className="flex items-center gap-2 mb-2">
                      <Box
                        as="span"
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-brand-50 text-brand-700"
                      >
                        {rec.type}
                      </Box>
                      {rec.priority !== null && (
                        <Box as="span" className="text-[11px] text-content-tertiary">
                          priority {rec.priority}
                        </Box>
                      )}
                      <Box as="span" className="flex-1" />
                      {rec.verified ? (
                        <Text as="span" variant="caption" className="text-status-success font-medium">
                          ✓ Verified
                        </Text>
                      ) : (
                        <Text as="span" variant="caption" className="text-content-tertiary">
                          Pending
                        </Text>
                      )}
                    </Box>
                    <CopyField label="Name / Host" value={rec.name} k={`n-${i}`} copied={copied} onCopy={copy} />
                    <CopyField label="Value" value={rec.value} k={`v-${i}`} copied={copied} onCopy={copy} />
                  </Box>
                ))}
              </Box>
            )}

            <Box className="flex flex-wrap items-center gap-3 mt-5">
              <Button variant="secondary" size="md" onClick={onCheck} disabled={checking}>
                {checking ? "Checking…" : "Check now"}
              </Button>
              <Button variant="primary" size="md" onClick={onContinue} disabled={!ready}>
                Continue to mailboxes
              </Button>
              {!ready && (
                <Text variant="caption" muted>
                  Continues automatically once the domain verifies.
                </Text>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CopyField({
  label,
  value,
  k,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  k: string;
  copied: string | null;
  onCopy: (text: string, key: string) => Promise<void>;
}): ReactNode {
  return (
    <Box className="mb-2 last:mb-0">
      <Box className="flex items-center justify-between mb-1">
        <Text as="span" variant="caption" muted className="uppercase tracking-wide">
          {label}
        </Text>
        <Box
          as="button"
          type="button"
          onClick={() => void onCopy(value, k)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
            copied === k
              ? "bg-status-success/15 text-status-success"
              : "bg-brand-50 text-brand-700 hover:bg-brand-100"
          }`}
          aria-label={`Copy ${label}`}
        >
          {copied === k ? "✓ Copied" : "Copy"}
        </Box>
      </Box>
      <Box
        as="p"
        className="font-mono text-xs text-content break-all select-all bg-surface rounded px-2 py-1.5 border border-border"
      >
        {value}
      </Box>
    </Box>
  );
}

// ─── Step 4: Mailboxes ────────────────────────────────────────────────────────

const MAILBOX_PRESETS = ["info", "support", "sales", "hello", "billing"] as const;

function MailboxStep({
  readyDomains,
  mailboxes,
  onCreated,
  onBackToVerify,
  onFinish,
  onError,
}: {
  readyDomains: Domain[];
  mailboxes: Mailbox[];
  onCreated: (mb: Mailbox) => void;
  onBackToVerify: () => void;
  onFinish: () => void;
  onError: (msg: string | null) => void;
}): ReactNode {
  const [localPart, setLocalPart] = useState("");
  const [domainName, setDomainName] = useState(readyDomains[0]?.domain ?? "");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!domainName && readyDomains[0]) setDomainName(readyDomains[0].domain);
  }, [domainName, readyDomains]);

  if (readyDomains.length === 0) {
    return (
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-2">
            Verify a domain first
          </Text>
          <Text variant="body-md" muted className="mb-4">
            Mailboxes can only be created on a verified, active domain. Finish DNS
            verification, then come back here.
          </Text>
          <Button variant="primary" size="md" onClick={onBackToVerify}>
            Back to verification
          </Button>
        </CardContent>
      </Card>
    );
  }

  const existingAddresses = new Set(mailboxes.map((m) => m.address.toLowerCase()));

  const create = async (part: string): Promise<void> => {
    const local = part.trim().toLowerCase();
    if (!local || !domainName) return;
    setBusy(true);
    setLocalErr(null);
    onError(null);
    try {
      const created = await mailboxesApi.create({
        address: `${local}@${domainName}`,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      onCreated(created);
      setLocalPart("");
      setDisplayName("");
    } catch (e) {
      setLocalErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box className="space-y-6">
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-1">
            Create mailboxes
          </Text>
          <Text variant="body-md" muted className="mb-4">
            Addresses like <Text as="span" variant="body-md" className="font-medium">info@{domainName}</Text>.
            Mail sent to them arrives in your AlecRae inbox.
          </Text>

          <Box className="flex flex-wrap gap-2 mb-4">
            {MAILBOX_PRESETS.map((p) => {
              const addr = `${p}@${domainName}`.toLowerCase();
              const exists = existingAddresses.has(addr);
              return (
                <Box
                  as="button"
                  key={p}
                  type="button"
                  onClick={() => !exists && void create(p)}
                  disabled={busy || exists}
                  className={`px-3 py-1.5 rounded-full text-body-sm border transition-colors ${
                    exists
                      ? "border-border bg-surface-secondary text-content-tertiary cursor-not-allowed"
                      : "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                  }`}
                >
                  {exists ? `✓ ${p}@` : `+ ${p}@`}
                </Box>
              );
            })}
          </Box>

          <Box className="flex flex-wrap items-end gap-2">
            <Box className="flex-1 min-w-[10rem]">
              <Text variant="caption" muted className="mb-1 block">
                Address
              </Text>
              <Box className="flex items-center gap-2">
                <Input
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value)}
                  placeholder="info"
                  aria-label="Mailbox local part"
                  disabled={busy}
                />
                <Text as="span" variant="body-md" muted>
                  @
                </Text>
                <Box
                  as="select"
                  value={domainName}
                  onChange={(e) => setDomainName((e.target as HTMLSelectElement).value)}
                  aria-label="Domain"
                  className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-body-md"
                >
                  {readyDomains.map((d) => (
                    <option key={d.id} value={d.domain}>
                      {d.domain}
                    </option>
                  ))}
                </Box>
              </Box>
            </Box>
            <Box className="flex-1 min-w-[10rem]">
              <Text variant="caption" muted className="mb-1 block">
                Display name (optional)
              </Text>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Support Team"
                aria-label="Display name"
                disabled={busy}
              />
            </Box>
            <Button
              variant="primary"
              size="md"
              onClick={() => void create(localPart)}
              disabled={busy || !localPart.trim() || !domainName}
            >
              Create
            </Button>
          </Box>
          {localErr && (
            <Text variant="caption" className="text-status-error mt-2 block">
              {localErr}
            </Text>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-3">
            Mailboxes ({mailboxes.length})
          </Text>
          {mailboxes.length === 0 ? (
            <Text variant="body-sm" muted>
              None yet — add one above, or use a suggestion.
            </Text>
          ) : (
            <Box className="divide-y divide-border">
              {mailboxes.map((m) => (
                <Box key={m.id} className="flex items-center justify-between py-2 gap-3">
                  <Box className="min-w-0">
                    <Text variant="body-sm" className="font-medium truncate">
                      {m.address}
                    </Text>
                    {m.displayName && (
                      <Text variant="caption" muted className="truncate block">
                        {m.displayName}
                      </Text>
                    )}
                  </Box>
                  {!m.isActive && (
                    <Text as="span" variant="caption" muted>
                      Paused
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}

          <Box className="flex items-center gap-3 mt-4">
            <Button variant="primary" size="md" onClick={onFinish}>
              {mailboxes.length > 0 ? "Finish setup" : "Skip for now"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ─── Step 5: Done ─────────────────────────────────────────────────────────────

function DoneStep({
  workspaceName,
  verifiedCount,
  mailboxCount,
  onGo,
}: {
  workspaceName: string;
  verifiedCount: number;
  mailboxCount: number;
  onGo: (href: string) => void;
}): ReactNode {
  return (
    <Card>
      <CardContent>
        <Box className="text-center py-4">
          <Box className="w-12 h-12 rounded-full bg-status-success/15 flex items-center justify-center mx-auto mb-4">
            <Text as="span" variant="heading-md" className="text-status-success">
              ✓
            </Text>
          </Box>
          <Text variant="heading-md" className="mb-2">
            You&apos;re set up
          </Text>
          <Text variant="body-md" muted className="mb-6 max-w-md mx-auto">
            {workspaceName} has {verifiedCount} verified{" "}
            {verifiedCount === 1 ? "domain" : "domains"} and {mailboxCount}{" "}
            {mailboxCount === 1 ? "mailbox" : "mailboxes"}. You can send and receive
            business email now.
          </Text>
          <Box className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={() => onGo("/inbox")}>
              Go to Inbox
            </Button>
            <Button variant="secondary" size="md" onClick={() => onGo("/compose")}>
              Compose a message
            </Button>
          </Box>
          <Box className="flex flex-wrap items-center justify-center gap-4 mt-4">
            <Box
              as="button"
              type="button"
              onClick={() => onGo("/mailboxes")}
              className="text-body-sm text-content-secondary hover:text-content underline"
            >
              Manage mailboxes
            </Box>
            <Box
              as="button"
              type="button"
              onClick={() => onGo("/domains")}
              className="text-body-sm text-content-secondary hover:text-content underline"
            >
              Manage domains
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
