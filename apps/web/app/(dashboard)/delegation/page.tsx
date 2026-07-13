"use client";

/**
 * AlecRae — Email Delegation
 *
 * Dedicated delegation surface: delegate inbox handling to teammates with
 * scoped permissions, see what's been delegated to you, work the delegated
 * inbox, and run shared drafts through a review/approval workflow.
 *
 * API (all 12 endpoints in apps/api/src/routes/delegation.ts):
 *   POST   /v1/delegation                       — create delegation
 *   GET    /v1/delegation?role=&cursor=         — list delegations
 *   PUT    /v1/delegation/:id                   — update delegation
 *   DELETE /v1/delegation/:id                   — revoke delegation
 *   GET    /v1/delegation/inbox                 — delegated inbox (backend placeholder)
 *   POST   /v1/shared-drafts                    — create shared draft
 *   GET    /v1/shared-drafts?status=&cursor=    — list shared drafts
 *   GET    /v1/shared-drafts/:id                — draft detail + comments
 *   PUT    /v1/shared-drafts/:id                — update draft
 *   POST   /v1/shared-drafts/:id/comment        — add comment
 *   POST   /v1/shared-drafts/:id/submit-review  — submit for review
 *   POST   /v1/shared-drafts/:id/approve        — approve draft
 *
 * Plan gate: team+ (FEATURE_PLANS.delegation)
 */

import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  delegationApi,
  sharedDraftsApi,
  type CreateDelegationPayload,
  type DelegatedEmail,
  type DelegationInboxData,
  type DelegationPermissions,
  type DelegationScope,
  type EmailDelegation,
  type SharedDraft,
  type SharedDraftStatus,
} from "../../../lib/api-delegation";

// ─── Constants ─────────────────────────────────────────────────────────────────

type PageTab = "delegations" | "delegated-inbox" | "shared-drafts";

const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: "delegations", label: "Delegations" },
  { id: "delegated-inbox", label: "Delegated Inbox" },
  { id: "shared-drafts", label: "Shared Drafts" },
];

const DEFAULT_PERMISSIONS: DelegationPermissions = {
  canReply: true,
  canArchive: true,
  canDelete: false,
  canForward: false,
};

const PERMISSION_FIELDS: { key: keyof DelegationPermissions; label: string }[] = [
  { key: "canReply", label: "Reply" },
  { key: "canArchive", label: "Archive" },
  { key: "canForward", label: "Forward" },
  { key: "canDelete", label: "Delete" },
];

const SCOPE_OPTIONS: { value: DelegationScope; label: string }[] = [
  { value: "all", label: "All email" },
  { value: "label", label: "Specific label" },
  { value: "sender", label: "Specific sender" },
  { value: "thread", label: "Specific thread" },
];

const STATUS_FILTERS: { value: SharedDraftStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Parse a comma/space separated list into trimmed non-empty entries. */
function parseList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scopeLabel(d: Pick<EmailDelegation, "scope" | "scopeValue">): string {
  if (d.scope === "all") return "All email";
  return d.scopeValue ? `${d.scope}: ${d.scopeValue}` : d.scope;
}

function permissionLabels(perms: DelegationPermissions): string[] {
  return PERMISSION_FIELDS.filter(({ key }) => perms[key]).map(
    ({ label }) => label,
  );
}

function statusBadgeClass(status: SharedDraftStatus): string {
  switch (status) {
    case "review":
      return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "approved":
      return "bg-green-100 text-green-700 border border-green-200";
    case "sent":
      return "bg-brand-100 text-brand-700 border border-brand-200";
    case "draft":
    default:
      return "bg-surface-raised text-content-subtle border border-border";
  }
}

function statusLabel(status: SharedDraftStatus): string {
  switch (status) {
    case "review":
      return "In review";
    case "approved":
      return "Approved";
    case "sent":
      return "Sent";
    case "draft":
    default:
      return "Draft";
  }
}

// ─── Small shared components ───────────────────────────────────────────────────

function LoadingSkeleton({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-16 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <Box
      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function EmptyState({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <Box className="rounded-lg border border-dashed border-border py-12 text-center">
      <Text variant="heading-sm" className="mb-2">
        {title}
      </Text>
      <Text variant="body-sm" className="text-content-subtle">
        {body}
      </Text>
    </Box>
  );
}
EmptyState.displayName = "EmptyState";

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Text
      as="label"
      htmlFor={htmlFor}
      variant="caption"
      muted
      className="mb-1 block"
    >
      {children}
    </Text>
  );
}
FieldLabel.displayName = "FieldLabel";

function PermissionCheckboxes({
  idPrefix,
  permissions,
  onToggle,
}: {
  idPrefix: string;
  permissions: DelegationPermissions;
  onToggle: (key: keyof DelegationPermissions) => void;
}): ReactNode {
  return (
    <Box className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PERMISSION_FIELDS.map(({ key, label }) => (
        <Box
          key={key}
          as="label"
          htmlFor={`${idPrefix}-${key}`}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-surface-raised"
        >
          <Box
            as="input"
            type="checkbox"
            id={`${idPrefix}-${key}`}
            checked={permissions[key]}
            onChange={() => onToggle(key)}
            className="h-4 w-4 rounded"
            aria-label={label}
          />
          <Text variant="body-sm">{label}</Text>
        </Box>
      ))}
    </Box>
  );
}
PermissionCheckboxes.displayName = "PermissionCheckboxes";

// ─── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: PageTab;
  onChange: (tab: PageTab) => void;
}): ReactNode {
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    const idx = PAGE_TABS.findIndex((t) => t.id === active);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = PAGE_TABS[(idx + 1) % PAGE_TABS.length];
      if (next) onChange(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = PAGE_TABS[(idx - 1 + PAGE_TABS.length) % PAGE_TABS.length];
      if (prev) onChange(prev.id);
    }
  };

  return (
    <Box
      className="mb-6 flex gap-1 rounded-lg border border-border bg-surface-raised p-1 w-fit"
      role="tablist"
      aria-label="Delegation sections"
      onKeyDown={handleKeyDown}
    >
      {PAGE_TABS.map((t) => (
        <Box
          key={t.id}
          as="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
            active === t.id
              ? "bg-surface text-content shadow-sm"
              : "text-content-subtle hover:text-content"
          }`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </Box>
      ))}
    </Box>
  );
}
TabBar.displayName = "TabBar";

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — Delegations (granted + received)
// ─────────────────────────────────────────────────────────────────────────────

function DelegationsSection(): ReactNode {
  const [outbound, setOutbound] = useState<EmailDelegation[] | null>(null);
  const [outboundCursor, setOutboundCursor] = useState<string | null>(null);
  const [inbound, setInbound] = useState<EmailDelegation[] | null>(null);
  const [inboundCursor, setInboundCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loadingMore, setLoadingMore] = useState<"delegator" | "delegate" | null>(
    null,
  );

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [out, inc] = await Promise.all([
        delegationApi.list("delegator"),
        delegationApi.list("delegate"),
      ]);
      setOutbound(out.data);
      setOutboundCursor(out.hasMore ? out.cursor : null);
      setInbound(inc.data);
      setInboundCursor(inc.hasMore ? inc.cursor : null);
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(role: "delegator" | "delegate"): Promise<void> {
    const cursor = role === "delegator" ? outboundCursor : inboundCursor;
    if (!cursor) return;
    setLoadingMore(role);
    try {
      const res = await delegationApi.list(role, { cursor });
      if (role === "delegator") {
        setOutbound((prev) => [...(prev ?? []), ...res.data]);
        setOutboundCursor(res.hasMore ? res.cursor : null);
      } else {
        setInbound((prev) => [...(prev ?? []), ...res.data]);
        setInboundCursor(res.hasMore ? res.cursor : null);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(null);
    }
  }

  async function handleRevoke(id: string, role: "delegator" | "delegate"): Promise<void> {
    try {
      await delegationApi.revoke(id);
      if (role === "delegator") {
        setOutbound((prev) => (prev ?? []).filter((d) => d.id !== id));
      } else {
        setInbound((prev) => (prev ?? []).filter((d) => d.id !== id));
      }
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function handleUpdated(updated: EmailDelegation): void {
    setOutbound((prev) =>
      (prev ?? []).map((d) => (d.id === updated.id ? updated : d)),
    );
  }

  return (
    <Box className="space-y-8">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {/* Delegations I've granted */}
      <Box>
        <Box className="mb-4 flex items-center justify-between gap-4">
          <Box>
            <Text variant="heading-sm">Delegations I&apos;ve granted</Text>
            <Text variant="body-sm" className="text-content-subtle">
              Team members you&apos;ve given access to handle your email.
            </Text>
          </Box>
          <Button
            variant={showForm ? "secondary" : "primary"}
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            aria-controls="create-delegation-form"
          >
            {showForm ? "Cancel" : "New delegation"}
          </Button>
        </Box>

        {showForm && (
          <Box id="create-delegation-form" className="mb-4">
            <CreateDelegationForm
              onCreated={() => {
                setShowForm(false);
                void load();
              }}
            />
          </Box>
        )}

        {outbound === null && !error && <LoadingSkeleton rows={2} />}
        {outbound !== null && outbound.length === 0 && (
          <EmptyState
            title="No delegations yet"
            body="Delegate your inbox to a teammate so they can reply, archive, or triage on your behalf."
          />
        )}
        {outbound !== null && outbound.length > 0 && (
          <Box className="space-y-3">
            {outbound.map((d) => (
              <DelegationCard
                key={d.id}
                delegation={d}
                mode="outbound"
                onRevoke={() => handleRevoke(d.id, "delegator")}
                onUpdated={handleUpdated}
              />
            ))}
            {outboundCursor && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMore("delegator")}
                disabled={loadingMore === "delegator"}
              >
                {loadingMore === "delegator" ? "Loading…" : "Load more"}
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Delegated to me */}
      <Box>
        <Box className="mb-4">
          <Text variant="heading-sm">Delegated to me</Text>
          <Text variant="body-sm" className="text-content-subtle">
            Inboxes other people have delegated to you.
          </Text>
        </Box>

        {inbound === null && !error && <LoadingSkeleton rows={2} />}
        {inbound !== null && inbound.length === 0 && (
          <EmptyState
            title="Nothing delegated to you"
            body="When a teammate delegates their email to you, it will appear here."
          />
        )}
        {inbound !== null && inbound.length > 0 && (
          <Box className="space-y-3">
            {inbound.map((d) => (
              <DelegationCard
                key={d.id}
                delegation={d}
                mode="inbound"
                onRevoke={() => handleRevoke(d.id, "delegate")}
              />
            ))}
            {inboundCursor && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMore("delegate")}
                disabled={loadingMore === "delegate"}
              >
                {loadingMore === "delegate" ? "Loading…" : "Load more"}
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
DelegationsSection.displayName = "DelegationsSection";

// ─── Create delegation form ────────────────────────────────────────────────────

function CreateDelegationForm({
  onCreated,
}: {
  onCreated: () => void;
}): ReactNode {
  const [delegateUserId, setDelegateUserId] = useState("");
  const [scope, setScope] = useState<DelegationScope>("all");
  const [scopeValue, setScopeValue] = useState("");
  const [permissions, setPermissions] =
    useState<DelegationPermissions>(DEFAULT_PERMISSIONS);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePerm = (key: keyof DelegationPermissions): void => {
    setPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const uid = delegateUserId.trim();
    if (!uid) return;
    setBusy(true);
    setError(null);
    try {
      const payload: CreateDelegationPayload = {
        delegateUserId: uid,
        scope,
        scopeValue: scope === "all" ? null : scopeValue.trim() || null,
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      await delegationApi.create(payload);
      setDelegateUserId("");
      setScope("all");
      setScopeValue("");
      setPermissions(DEFAULT_PERMISSIONS);
      setExpiresAt("");
      onCreated();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Text variant="heading-sm" className="mb-4">
          Delegate access
        </Text>
        <Box
          as="form"
          onSubmit={(e: FormEvent) => void handleSubmit(e)}
          className="space-y-4"
          aria-label="Create delegation"
        >
          <Box>
            <FieldLabel htmlFor="delegate-user">
              Team member email or user ID
            </FieldLabel>
            <Input
              id="delegate-user"
              value={delegateUserId}
              onChange={(e) =>
                setDelegateUserId((e.target as HTMLInputElement).value)
              }
              placeholder="colleague@yourdomain.com"
              required
              aria-required="true"
            />
          </Box>

          <Box className="grid gap-4 sm:grid-cols-2">
            <Box>
              <FieldLabel htmlFor="delegation-scope">Scope</FieldLabel>
              <Box
                as="select"
                id="delegation-scope"
                value={scope}
                onChange={(e) =>
                  setScope((e.target as HTMLSelectElement).value as DelegationScope)
                }
                className="h-10 w-full px-3 rounded-lg border border-border bg-surface text-content text-sm"
                aria-label="Delegation scope"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Box>
            </Box>

            {scope !== "all" && (
              <Box>
                <FieldLabel htmlFor="delegation-scope-value">
                  {scope === "label"
                    ? "Label name"
                    : scope === "sender"
                      ? "Sender address"
                      : "Thread ID"}
                </FieldLabel>
                <Input
                  id="delegation-scope-value"
                  value={scopeValue}
                  onChange={(e) =>
                    setScopeValue((e.target as HTMLInputElement).value)
                  }
                  placeholder={
                    scope === "label"
                      ? "e.g. Support"
                      : scope === "sender"
                        ? "e.g. billing@vendor.com"
                        : "Thread identifier"
                  }
                />
              </Box>
            )}
          </Box>

          <Box>
            <Text variant="caption" muted className="mb-2 block">
              Permissions
            </Text>
            <PermissionCheckboxes
              idPrefix="create-perm"
              permissions={permissions}
              onToggle={togglePerm}
            />
          </Box>

          <Box className="max-w-xs">
            <FieldLabel htmlFor="delegation-expires">
              Expires (optional)
            </FieldLabel>
            <Input
              id="delegation-expires"
              type="date"
              value={expiresAt}
              onChange={(e) =>
                setExpiresAt((e.target as HTMLInputElement).value)
              }
              aria-label="Delegation expiry date"
            />
          </Box>

          {error && (
            <Box role="alert">
              <Text variant="body-sm" className="text-red-700">
                {error}
              </Text>
            </Box>
          )}

          <Button
            variant="primary"
            size="md"
            type="submit"
            disabled={busy || !delegateUserId.trim()}
          >
            {busy ? "Creating…" : "Create delegation"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
CreateDelegationForm.displayName = "CreateDelegationForm";

// ─── Delegation card (with inline edit) ────────────────────────────────────────

function DelegationCard({
  delegation,
  mode,
  onRevoke,
  onUpdated,
}: {
  delegation: EmailDelegation;
  mode: "outbound" | "inbound";
  onRevoke: () => Promise<void>;
  onUpdated?: (updated: EmailDelegation) => void;
}): ReactNode {
  const [revoking, setRevoking] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject =
    mode === "outbound" ? delegation.delegateUserId : delegation.delegatorUserId;
  const permLabels = permissionLabels(delegation.permissions);

  const handleRevoke = async (): Promise<void> => {
    setRevoking(true);
    setError(null);
    try {
      await onRevoke();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setRevoking(false);
    }
  };

  const handleToggleActive = async (): Promise<void> => {
    setToggling(true);
    setError(null);
    try {
      const res = await delegationApi.update(delegation.id, {
        isActive: !delegation.isActive,
      });
      onUpdated?.(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Box className="flex items-start justify-between gap-4">
          <Box className="flex-1 min-w-0 space-y-1">
            <Box className="flex items-center gap-2 flex-wrap">
              <Text variant="heading-sm" className="truncate">
                {subject}
              </Text>
              {!delegation.isActive && (
                <Box
                  as="span"
                  className="rounded-full bg-surface-raised border border-border px-2 py-0.5 text-[11px] text-content-subtle"
                >
                  Paused
                </Box>
              )}
            </Box>
            <Text variant="body-sm" className="text-content-subtle">
              {scopeLabel(delegation)}
            </Text>
            {permLabels.length > 0 && (
              <Box className="flex flex-wrap gap-1 pt-1">
                {permLabels.map((p) => (
                  <Box
                    key={p}
                    as="span"
                    className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-700"
                    aria-label={`Permission: ${p}`}
                  >
                    {p}
                  </Box>
                ))}
              </Box>
            )}
            {delegation.expiresAt && (
              <Text variant="caption" muted>
                Expires {formatDate(delegation.expiresAt)}
              </Text>
            )}
          </Box>

          <Box className="flex flex-shrink-0 items-center gap-2">
            {mode === "outbound" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing((v) => !v)}
                  aria-expanded={editing}
                  aria-controls={`edit-delegation-${delegation.id}`}
                  aria-label={`Edit delegation for ${subject}`}
                >
                  {editing ? "Close" : "Edit"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleToggleActive()}
                  disabled={toggling}
                  aria-label={
                    delegation.isActive
                      ? `Pause delegation for ${subject}`
                      : `Resume delegation for ${subject}`
                  }
                >
                  {toggling ? "…" : delegation.isActive ? "Pause" : "Resume"}
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRevoke()}
              disabled={revoking}
              aria-label={
                mode === "outbound"
                  ? `Revoke delegation for ${subject}`
                  : `Remove delegation from ${subject}`
              }
            >
              {revoking ? "Removing…" : mode === "outbound" ? "Revoke" : "Remove"}
            </Button>
          </Box>
        </Box>

        {error && (
          <Box role="alert" className="mt-3">
            <Text variant="body-sm" className="text-red-700">
              {error}
            </Text>
          </Box>
        )}

        {editing && mode === "outbound" && (
          <Box id={`edit-delegation-${delegation.id}`} className="mt-4">
            <EditDelegationForm
              delegation={delegation}
              onSaved={(updated) => {
                setEditing(false);
                onUpdated?.(updated);
              }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
DelegationCard.displayName = "DelegationCard";

function EditDelegationForm({
  delegation,
  onSaved,
}: {
  delegation: EmailDelegation;
  onSaved: (updated: EmailDelegation) => void;
}): ReactNode {
  const [scope, setScope] = useState<DelegationScope>(delegation.scope);
  const [scopeValue, setScopeValue] = useState(delegation.scopeValue ?? "");
  const [permissions, setPermissions] = useState<DelegationPermissions>(
    delegation.permissions,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePerm = (key: keyof DelegationPermissions): void => {
    setPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await delegationApi.update(delegation.id, {
        scope,
        scopeValue: scope === "all" ? null : scopeValue.trim() || null,
        permissions,
      });
      onSaved(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      as="form"
      onSubmit={(e: FormEvent) => void handleSubmit(e)}
      className="space-y-4 rounded-lg border border-border bg-surface-raised p-4"
      aria-label={`Edit delegation for ${delegation.delegateUserId}`}
    >
      <Box className="grid gap-4 sm:grid-cols-2">
        <Box>
          <FieldLabel htmlFor={`edit-scope-${delegation.id}`}>Scope</FieldLabel>
          <Box
            as="select"
            id={`edit-scope-${delegation.id}`}
            value={scope}
            onChange={(e) =>
              setScope((e.target as HTMLSelectElement).value as DelegationScope)
            }
            className="h-10 w-full px-3 rounded-lg border border-border bg-surface text-content text-sm"
            aria-label="Delegation scope"
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Box>
        </Box>

        {scope !== "all" && (
          <Box>
            <FieldLabel htmlFor={`edit-scope-value-${delegation.id}`}>
              Scope value
            </FieldLabel>
            <Input
              id={`edit-scope-value-${delegation.id}`}
              value={scopeValue}
              onChange={(e) =>
                setScopeValue((e.target as HTMLInputElement).value)
              }
            />
          </Box>
        )}
      </Box>

      <Box>
        <Text variant="caption" muted className="mb-2 block">
          Permissions
        </Text>
        <PermissionCheckboxes
          idPrefix={`edit-perm-${delegation.id}`}
          permissions={permissions}
          onToggle={togglePerm}
        />
      </Box>

      {error && (
        <Box role="alert">
          <Text variant="body-sm" className="text-red-700">
            {error}
          </Text>
        </Box>
      )}

      <Button variant="primary" size="sm" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </Box>
  );
}
EditDelegationForm.displayName = "EditDelegationForm";

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 — Delegated Inbox
// ─────────────────────────────────────────────────────────────────────────────

function DelegatedInboxSection(): ReactNode {
  const [data, setData] = useState<DelegationInboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await delegationApi.inbox();
      setData(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;
  if (!data) return null;

  const emails: DelegatedEmail[] = data.emails ?? [];

  return (
    <Box className="space-y-6">
      {/* Access granted to me */}
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Your delegated access
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            Active delegations where you are the delegate.
          </Text>
        </CardHeader>
        <CardContent>
          {data.delegations.length === 0 ? (
            <EmptyState
              title="No delegated access"
              body="No one has delegated their inbox to you yet."
            />
          ) : (
            <Box className="space-y-3">
              {data.delegations.map((d) => (
                <Box
                  key={d.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-raised px-4 py-3"
                >
                  <Box className="min-w-0 flex-1 space-y-1">
                    <Text variant="body-sm" className="font-medium text-content">
                      From {d.delegatorUserId}
                    </Text>
                    <Text variant="caption" className="text-content-subtle">
                      {scopeLabel(d)}
                    </Text>
                    <Box className="flex flex-wrap gap-1 pt-1">
                      {permissionLabels(d.permissions).map((p) => (
                        <Box
                          key={p}
                          as="span"
                          className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-700"
                          aria-label={`Permission: ${p}`}
                        >
                          {p}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  {d.expiresAt && (
                    <Text variant="caption" muted className="whitespace-nowrap">
                      Expires {formatDate(d.expiresAt)}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Delegated emails */}
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Delegated emails
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            Emails routed to you under the delegations above.
          </Text>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <Box className="py-8 text-center">
              <Text variant="body-sm" className="text-content-subtle">
                {data.delegations.length === 0
                  ? "Once someone delegates their inbox to you, their emails will show up here."
                  : "No delegated emails yet — new mail matching your delegations will appear here as it arrives."}
              </Text>
            </Box>
          ) : (
            <Box className="space-y-2">
              {emails.map((email, i) => (
                <Box
                  key={email.id ?? i}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3 hover:bg-surface-raised transition-colors"
                >
                  <Box className="min-w-0 flex-1">
                    <Text variant="body-sm" className="font-medium text-content truncate">
                      {email.subject ?? "(no subject)"}
                    </Text>
                    {email.from && (
                      <Text variant="caption" className="text-content-subtle">
                        {email.from}
                      </Text>
                    )}
                    {email.snippet && (
                      <Text variant="caption" muted className="line-clamp-1">
                        {email.snippet}
                      </Text>
                    )}
                  </Box>
                  {email.receivedAt && (
                    <Text variant="caption" muted className="whitespace-nowrap">
                      {formatDateTime(email.receivedAt)}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
DelegatedInboxSection.displayName = "DelegatedInboxSection";

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3 — Shared Drafts
// ─────────────────────────────────────────────────────────────────────────────

function SharedDraftsSection(): ReactNode {
  const [drafts, setDrafts] = useState<SharedDraft[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SharedDraftStatus | "all">(
    "all",
  );
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    setDrafts(null);
    try {
      const res = await sharedDraftsApi.list(
        statusFilter === "all" ? undefined : { status: statusFilter },
      );
      setDrafts(res.data);
      setCursor(res.hasMore ? res.cursor : null);
    } catch (err) {
      setError(errMsg(err));
      setDrafts([]);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await sharedDraftsApi.list({
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
        cursor,
      });
      setDrafts((prev) => [...(prev ?? []), ...res.data]);
      setCursor(res.hasMore ? res.cursor : null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  if (selectedId) {
    return (
      <SharedDraftDetail
        draftId={selectedId}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
      />
    );
  }

  return (
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-center justify-between gap-4">
        {/* Status filter */}
        <Box
          className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1 w-fit"
          role="group"
          aria-label="Filter drafts by status"
        >
          {STATUS_FILTERS.map((f) => (
            <Box
              key={f.value}
              as="button"
              type="button"
              aria-pressed={statusFilter === f.value}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                statusFilter === f.value
                  ? "bg-surface text-content shadow-sm"
                  : "text-content-subtle hover:text-content"
              }`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Box>
          ))}
        </Box>

        <Button
          variant={showForm ? "secondary" : "primary"}
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          aria-controls="create-shared-draft-form"
        >
          {showForm ? "Cancel" : "New shared draft"}
        </Button>
      </Box>

      {showForm && (
        <Box id="create-shared-draft-form">
          <SharedDraftForm
            mode="create"
            onDone={() => {
              setShowForm(false);
              void load();
            }}
          />
        </Box>
      )}

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {drafts === null && !error && <LoadingSkeleton rows={3} />}
      {drafts !== null && drafts.length === 0 && !error && (
        <EmptyState
          title="No shared drafts"
          body="Create a shared draft to write an email together and run it through review before it goes out."
        />
      )}
      {drafts !== null && drafts.length > 0 && (
        <Box className="space-y-3">
          {drafts.map((d) => (
            <Box
              key={d.id}
              as="button"
              type="button"
              className="block w-full rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-surface-raised transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
              onClick={() => setSelectedId(d.id)}
              aria-label={`Open shared draft: ${d.subject || "(no subject)"}`}
            >
              <Box className="flex items-start justify-between gap-4">
                <Box className="min-w-0 flex-1">
                  <Box className="flex items-center gap-2 flex-wrap">
                    <Text variant="body-sm" className="font-medium text-content truncate">
                      {d.subject || "(no subject)"}
                    </Text>
                    <Box
                      as="span"
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(d.status)}`}
                    >
                      {statusLabel(d.status)}
                    </Box>
                  </Box>
                  <Text variant="caption" className="text-content-subtle">
                    To: {d.toRecipients.length > 0 ? d.toRecipients.join(", ") : "—"}
                    {d.comments.length > 0 &&
                      ` · ${d.comments.length} comment${d.comments.length === 1 ? "" : "s"}`}
                  </Text>
                </Box>
                <Text variant="caption" muted className="whitespace-nowrap">
                  {formatDateTime(d.updatedAt)}
                </Text>
              </Box>
            </Box>
          ))}
          {cursor && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
SharedDraftsSection.displayName = "SharedDraftsSection";

// ─── Shared draft create/edit form ─────────────────────────────────────────────

function SharedDraftForm({
  mode,
  draft,
  onDone,
}: {
  mode: "create" | "edit";
  draft?: SharedDraft;
  onDone: (updated?: SharedDraft) => void;
}): ReactNode {
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [to, setTo] = useState(draft?.toRecipients.join(", ") ?? "");
  const [cc, setCc] = useState(draft?.ccRecipients.join(", ") ?? "");
  const [reviewers, setReviewers] = useState(draft?.reviewers.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idPrefix = mode === "create" ? "new-draft" : `edit-draft-${draft?.id ?? ""}`;

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!body.trim()) {
      setError("The draft body cannot be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        await sharedDraftsApi.create({
          subject: subject.trim(),
          body,
          toRecipients: parseList(to),
          ccRecipients: parseList(cc),
          reviewers: parseList(reviewers),
        });
        onDone();
      } else if (draft) {
        const res = await sharedDraftsApi.update(draft.id, {
          subject: subject.trim(),
          body,
          toRecipients: parseList(to),
          ccRecipients: parseList(cc),
          reviewers: parseList(reviewers),
        });
        onDone(res.data);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        {mode === "create" && (
          <Text variant="heading-sm" className="mb-4">
            New shared draft
          </Text>
        )}
        <Box
          as="form"
          onSubmit={(e: FormEvent) => void handleSubmit(e)}
          className="space-y-4"
          aria-label={mode === "create" ? "Create shared draft" : "Edit shared draft"}
        >
          <Box>
            <FieldLabel htmlFor={`${idPrefix}-subject`}>Subject</FieldLabel>
            <Input
              id={`${idPrefix}-subject`}
              value={subject}
              onChange={(e) => setSubject((e.target as HTMLInputElement).value)}
              placeholder="Subject"
            />
          </Box>

          <Box className="grid gap-4 sm:grid-cols-2">
            <Box>
              <FieldLabel htmlFor={`${idPrefix}-to`}>
                To (comma-separated emails)
              </FieldLabel>
              <Input
                id={`${idPrefix}-to`}
                value={to}
                onChange={(e) => setTo((e.target as HTMLInputElement).value)}
                placeholder="alice@example.com, bob@example.com"
              />
            </Box>
            <Box>
              <FieldLabel htmlFor={`${idPrefix}-cc`}>
                Cc (comma-separated emails)
              </FieldLabel>
              <Input
                id={`${idPrefix}-cc`}
                value={cc}
                onChange={(e) => setCc((e.target as HTMLInputElement).value)}
                placeholder="Optional"
              />
            </Box>
          </Box>

          <Box>
            <FieldLabel htmlFor={`${idPrefix}-reviewers`}>
              Reviewers (comma-separated user IDs or emails)
            </FieldLabel>
            <Input
              id={`${idPrefix}-reviewers`}
              value={reviewers}
              onChange={(e) =>
                setReviewers((e.target as HTMLInputElement).value)
              }
              placeholder="Who should review before sending?"
            />
          </Box>

          <Box>
            <FieldLabel htmlFor={`${idPrefix}-body`}>Body</FieldLabel>
            <Box
              as="textarea"
              id={`${idPrefix}-body`}
              value={body}
              onChange={(e) => setBody((e.target as HTMLTextAreaElement).value)}
              rows={8}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Write the email together…"
              aria-required="true"
            />
          </Box>

          {error && (
            <Box role="alert">
              <Text variant="body-sm" className="text-red-700">
                {error}
              </Text>
            </Box>
          )}

          <Button variant="primary" size="md" type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : mode === "create"
                ? "Create shared draft"
                : "Save changes"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
SharedDraftForm.displayName = "SharedDraftForm";

// ─── Shared draft detail ───────────────────────────────────────────────────────

function SharedDraftDetail({
  draftId,
  onBack,
}: {
  draftId: string;
  onBack: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<SharedDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await sharedDraftsApi.get(draftId);
      setDraft(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddComment(e: FormEvent): Promise<void> {
    e.preventDefault();
    const text = comment.trim();
    if (!text || !draft) return;
    setCommenting(true);
    setActionError(null);
    try {
      const res = await sharedDraftsApi.addComment(draft.id, text);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, res.data.comment],
              updatedAt: res.data.updatedAt,
            }
          : prev,
      );
      setComment("");
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setCommenting(false);
    }
  }

  async function handleSubmitReview(): Promise<void> {
    if (!draft) return;
    setTransitioning(true);
    setActionError(null);
    try {
      const res = await sharedDraftsApi.submitReview(draft.id);
      setDraft((prev) =>
        prev
          ? { ...prev, status: res.data.status, updatedAt: res.data.updatedAt }
          : prev,
      );
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setTransitioning(false);
    }
  }

  async function handleApprove(): Promise<void> {
    if (!draft) return;
    setTransitioning(true);
    setActionError(null);
    try {
      const res = await sharedDraftsApi.approve(draft.id);
      setDraft((prev) =>
        prev
          ? { ...prev, status: res.data.status, updatedAt: res.data.updatedAt }
          : prev,
      );
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <Box className="space-y-4">
      <Box>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to shared drafts list"
        >
          ← Back to drafts
        </Button>
      </Box>

      {loading && <LoadingSkeleton rows={3} />}
      {!loading && error && (
        <ErrorBanner message={error} onRetry={() => void load()} />
      )}

      {!loading && !error && draft && (
        <>
          <Card>
            <CardContent>
              <Box className="flex items-start justify-between gap-4">
                <Box className="min-w-0 flex-1 space-y-1">
                  <Box className="flex items-center gap-2 flex-wrap">
                    <Text variant="heading-sm" className="truncate">
                      {draft.subject || "(no subject)"}
                    </Text>
                    <Box
                      as="span"
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(draft.status)}`}
                    >
                      {statusLabel(draft.status)}
                    </Box>
                  </Box>
                  <Text variant="caption" className="text-content-subtle">
                    To: {draft.toRecipients.length > 0 ? draft.toRecipients.join(", ") : "—"}
                    {draft.ccRecipients.length > 0 &&
                      ` · Cc: ${draft.ccRecipients.join(", ")}`}
                  </Text>
                  {draft.reviewers.length > 0 && (
                    <Text variant="caption" className="text-content-subtle">
                      Reviewers: {draft.reviewers.join(", ")}
                    </Text>
                  )}
                  <Text variant="caption" muted>
                    Updated {formatDateTime(draft.updatedAt)}
                  </Text>
                </Box>

                <Box className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                  {draft.status !== "sent" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing((v) => !v)}
                      aria-expanded={editing}
                      aria-controls={`edit-draft-panel-${draft.id}`}
                    >
                      {editing ? "Close editor" : "Edit"}
                    </Button>
                  )}
                  {draft.status === "draft" && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleSubmitReview()}
                      disabled={transitioning}
                      aria-label="Submit draft for review"
                    >
                      {transitioning ? "Submitting…" : "Submit for review"}
                    </Button>
                  )}
                  {draft.status === "review" && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleApprove()}
                      disabled={transitioning}
                      aria-label="Approve draft"
                    >
                      {transitioning ? "Approving…" : "Approve"}
                    </Button>
                  )}
                </Box>
              </Box>

              {actionError && (
                <Box role="alert" className="mt-3">
                  <Text variant="body-sm" className="text-red-700">
                    {actionError}
                  </Text>
                </Box>
              )}

              {!editing && (
                <Box className="mt-4 rounded-lg border border-border bg-surface-raised px-4 py-3">
                  <Text variant="body-sm" className="whitespace-pre-wrap text-content">
                    {draft.body}
                  </Text>
                </Box>
              )}
            </CardContent>
          </Card>

          {editing && draft.status !== "sent" && (
            <Box id={`edit-draft-panel-${draft.id}`}>
              <SharedDraftForm
                mode="edit"
                draft={draft}
                onDone={(updated) => {
                  setEditing(false);
                  if (updated) setDraft(updated);
                }}
              />
            </Box>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <Text variant="heading-sm" className="font-semibold">
                Comments ({draft.comments.length})
              </Text>
            </CardHeader>
            <CardContent>
              {draft.comments.length === 0 ? (
                <Box className="py-4 text-center">
                  <Text variant="body-sm" className="text-content-subtle">
                    No comments yet — leave feedback for the team below.
                  </Text>
                </Box>
              ) : (
                <Box className="space-y-3">
                  {draft.comments.map((cm, i) => (
                    <Box
                      key={`${cm.userId}-${cm.createdAt}-${i}`}
                      className="rounded-lg border border-border bg-surface-raised px-4 py-3"
                    >
                      <Box className="mb-1 flex items-center justify-between gap-2">
                        <Text variant="caption" className="font-medium text-content">
                          {cm.userId}
                        </Text>
                        <Text variant="caption" muted>
                          {formatDateTime(cm.createdAt)}
                        </Text>
                      </Box>
                      <Text variant="body-sm" className="whitespace-pre-wrap text-content">
                        {cm.text}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}

              <Box
                as="form"
                onSubmit={(e: FormEvent) => void handleAddComment(e)}
                className="mt-4 flex items-start gap-2"
                aria-label="Add comment"
              >
                <Box className="flex-1">
                  <Input
                    id="draft-comment-input"
                    value={comment}
                    onChange={(e) =>
                      setComment((e.target as HTMLInputElement).value)
                    }
                    placeholder="Add a comment…"
                    aria-label="Comment text"
                  />
                </Box>
                <Button
                  variant="secondary"
                  size="md"
                  type="submit"
                  disabled={commenting || !comment.trim()}
                >
                  {commenting ? "Posting…" : "Comment"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
SharedDraftDetail.displayName = "SharedDraftDetail";

// ─── Page ──────────────────────────────────────────────────────────────────────

function DelegationContent(): ReactNode {
  const [tab, setTab] = useState<PageTab>("delegations");

  return (
    <>
      <TabBar active={tab} onChange={setTab} />
      <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "delegations" && <DelegationsSection />}
        {tab === "delegated-inbox" && <DelegatedInboxSection />}
        {tab === "shared-drafts" && <SharedDraftsSection />}
      </Box>
    </>
  );
}
DelegationContent.displayName = "DelegationContent";

export default function DelegationPage(): ReactNode {
  return (
    <PageLayout
      title="Delegation"
      description="Delegate email handling to teammates, work delegated inboxes, and co-write drafts with a review workflow."
    >
      <PlanGate feature="delegation" required="team">
        <DelegationContent />
      </PlanGate>
    </PageLayout>
  );
}
