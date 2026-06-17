"use client";

/**
 * AlecRae — Shared Inboxes & Delegation
 *
 * Tab 1 — Shared Inboxes: team inboxes multiple members share.
 * Tab 2 — Delegation: delegate your inbox handling to a team member, or see
 *          inboxes others have delegated to you.
 *
 * API:
 *  GET  /v1/collaborate/shared-inboxes
 *  POST /v1/collaborate/shared-inboxes
 *  GET  /v1/delegations?role=delegator
 *  GET  /v1/delegations?role=delegate
 *  POST /v1/delegations
 *  DELETE /v1/delegations/:id
 */

import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  Input,
  PageLayout,
} from "@alecrae/ui";
import {
  sharedInboxesApi,
  delegationsApi,
  type SharedInbox,
  type EmailDelegation,
  type DelegationPermissions,
} from "../../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageTab = "shared-inboxes" | "delegations";

const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: "shared-inboxes", label: "Shared Inboxes" },
  { id: "delegations", label: "Delegations" },
];

// ─── Small shared helpers ─────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function LoadingSkeleton(): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box
          key={i}
          className="h-16 animate-pulse rounded-lg bg-surface-secondary"
        />
      ))}
    </Box>
  );
}

LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }): ReactNode {
  return (
    <Box
      className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
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
      <Text variant="body-md" muted>
        {body}
      </Text>
    </Box>
  );
}

EmptyState.displayName = "EmptyState";

// ─── Tab bar ──────────────────────────────────────────────────────────────────

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
      className="mb-6 flex gap-1 rounded-lg border border-border bg-surface-secondary p-1 w-fit"
      role="tablist"
      aria-label="Shared Inboxes sections"
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
              : "text-content-tertiary hover:text-content"
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SharedInboxesPage(): ReactNode {
  const [tab, setTab] = useState<PageTab>("shared-inboxes");

  return (
    <PageLayout
      title="Shared Inboxes"
      description="Collaborate on email as a team, and delegate inbox handling to trusted members."
    >
      <TabBar active={tab} onChange={setTab} />

      <Box
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "shared-inboxes" && <SharedInboxesSection />}
        {tab === "delegations" && <DelegationsSection />}
      </Box>
    </PageLayout>
  );
}

SharedInboxesPage.displayName = "SharedInboxesPage";

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — Shared Inboxes
// ─────────────────────────────────────────────────────────────────────────────

function SharedInboxesSection(): ReactNode {
  const [inboxes, setInboxes] = useState<SharedInbox[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback((): void => {
    setError(null);
    sharedInboxesApi
      .list()
      .then((res) => setInboxes(res.data))
      .catch((e: unknown) => setError(errMsg(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreated = (): void => {
    setShowForm(false);
    load();
  };

  if (error) {
    return <ErrorBanner message={error} onRetry={load} />;
  }

  return (
    <Box className="space-y-6">
      <Box className="flex items-center justify-between">
        <Text variant="heading-sm">Your shared inboxes</Text>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          aria-controls="create-inbox-form"
        >
          {showForm ? "Cancel" : "Create shared inbox"}
        </Button>
      </Box>

      {showForm && (
        <Box id="create-inbox-form">
          <CreateSharedInboxForm onCreated={handleCreated} />
        </Box>
      )}

      {inboxes === null ? (
        <LoadingSkeleton />
      ) : inboxes.length === 0 ? (
        <EmptyState
          title="No shared inboxes yet"
          body="Create a shared inbox so your whole team can see and respond to email together — like support@, hello@, or team@."
        />
      ) : (
        <Box className="space-y-3">
          {inboxes.map((inbox) => (
            <SharedInboxCard key={inbox.id} inbox={inbox} />
          ))}
        </Box>
      )}
    </Box>
  );
}

SharedInboxesSection.displayName = "SharedInboxesSection";

function CreateSharedInboxForm({
  onCreated,
}: {
  onCreated: () => void;
}): ReactNode {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimName = name.trim();
    const trimEmail = email.trim().toLowerCase();
    if (!trimName || !trimEmail) return;
    setBusy(true);
    setError(null);
    try {
      await sharedInboxesApi.create({ name: trimName, email: trimEmail });
      setName("");
      setEmail("");
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
          New shared inbox
        </Text>
        <Box
          as="form"
          onSubmit={(e: FormEvent) => void handleSubmit(e)}
          className="space-y-4"
          aria-label="Create shared inbox"
        >
          <Box>
            <Text
              as="label"
              htmlFor="inbox-name"
              variant="caption"
              muted
              className="mb-1 block"
            >
              Inbox name
            </Text>
            <Input
              id="inbox-name"
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="Support Team"
              required
              aria-required="true"
            />
          </Box>

          <Box>
            <Text
              as="label"
              htmlFor="inbox-email"
              variant="caption"
              muted
              className="mb-1 block"
            >
              Email address
            </Text>
            <Input
              id="inbox-email"
              type="email"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="support@yourdomain.com"
              required
              aria-required="true"
            />
          </Box>

          {error && (
            <Box role="alert">
              <Text variant="body-sm" className="text-status-error">
                {error}
              </Text>
            </Box>
          )}

          <Button
            variant="primary"
            size="md"
            type="submit"
            disabled={busy || !name.trim() || !email.trim()}
          >
            {busy ? "Creating…" : "Create inbox"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

CreateSharedInboxForm.displayName = "CreateSharedInboxForm";

function SharedInboxCard({ inbox }: { inbox: SharedInbox }): ReactNode {
  const memberCount = inbox.members.length;

  return (
    <Card>
      <CardContent>
        <Box className="flex items-start justify-between gap-4">
          <Box className="flex-1 min-w-0">
            <Text variant="heading-sm" className="truncate">
              {inbox.name}
            </Text>
            <Text variant="body-sm" muted className="mt-0.5 truncate">
              {inbox.email}
            </Text>
            <Text variant="caption" muted className="mt-1">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </Text>
          </Box>

          <Box className="flex items-center gap-2 flex-shrink-0">
            <MemberPills members={inbox.members} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

SharedInboxCard.displayName = "SharedInboxCard";

function MemberPills({
  members,
}: {
  members: SharedInbox["members"];
}): ReactNode {
  const visible = members.slice(0, 5);
  const overflow = members.length - visible.length;

  return (
    <Box className="flex items-center gap-1" aria-label={`${members.length} members`}>
      {visible.map((m) => (
        <Box
          key={m.userId}
          className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center"
          title={`${m.role}: ${m.userId}`}
          aria-label={`Member ${m.userId} — ${m.role}`}
        >
          <Text variant="caption" className="text-brand-700 font-semibold text-[10px]">
            {m.userId.slice(0, 2).toUpperCase()}
          </Text>
        </Box>
      ))}
      {overflow > 0 && (
        <Box className="h-7 w-7 rounded-full bg-surface-secondary flex items-center justify-center">
          <Text variant="caption" muted className="text-[10px]">
            +{overflow}
          </Text>
        </Box>
      )}
    </Box>
  );
}

MemberPills.displayName = "MemberPills";

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 — Delegations
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PERMISSIONS: DelegationPermissions = {
  canReply: true,
  canArchive: true,
  canDelete: false,
  canForward: true,
};

function DelegationsSection(): ReactNode {
  const [outbound, setOutbound] = useState<EmailDelegation[] | null>(null);
  const [inbound, setInbound] = useState<EmailDelegation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback((): void => {
    setError(null);
    Promise.all([
      delegationsApi.listAsOwner(),
      delegationsApi.listAsDelegate(),
    ])
      .then(([out, inn]) => {
        setOutbound(out.data);
        setInbound(inn.data);
      })
      .catch((e: unknown) => setError(errMsg(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (id: string): Promise<void> => {
    try {
      await delegationsApi.revoke(id);
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const handleCreated = (): void => {
    setShowForm(false);
    load();
  };

  if (error) {
    return <ErrorBanner message={error} onRetry={load} />;
  }

  return (
    <Box className="space-y-8">
      {/* Create delegation */}
      <Box>
        <Box className="flex items-center justify-between mb-4">
          <Box>
            <Text variant="heading-sm">Delegations I manage</Text>
            <Text variant="body-sm" muted>
              Team members you have given access to handle your email.
            </Text>
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            aria-controls="create-delegation-form"
          >
            {showForm ? "Cancel" : "Delegate to someone"}
          </Button>
        </Box>

        {showForm && (
          <Box id="create-delegation-form" className="mb-4">
            <CreateDelegationForm onCreated={handleCreated} />
          </Box>
        )}

        {outbound === null ? (
          <LoadingSkeleton />
        ) : outbound.length === 0 ? (
          <EmptyState
            title="No delegations yet"
            body="Delegate your inbox to a team member so they can reply, archive, or forward on your behalf."
          />
        ) : (
          <Box className="space-y-3">
            {outbound.map((d) => (
              <DelegationCard
                key={d.id}
                delegation={d}
                mode="outbound"
                onRevoke={() => void handleRevoke(d.id)}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Delegated to me */}
      <Box>
        <Text variant="heading-sm" className="mb-1">
          Delegated to me
        </Text>
        <Text variant="body-sm" muted className="mb-4">
          Inboxes you have been given access to manage.
        </Text>

        {inbound === null ? (
          <LoadingSkeleton />
        ) : inbound.length === 0 ? (
          <EmptyState
            title="Nothing delegated to you"
            body="When a team member delegates their inbox to you, it will appear here."
          />
        ) : (
          <Box className="space-y-3">
            {inbound.map((d) => (
              <DelegationCard
                key={d.id}
                delegation={d}
                mode="inbound"
                onRevoke={() => void handleRevoke(d.id)}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

DelegationsSection.displayName = "DelegationsSection";

interface CreateDelegationFormProps {
  readonly onCreated: () => void;
}

function CreateDelegationForm({ onCreated }: CreateDelegationFormProps): ReactNode {
  const [delegateUserId, setDelegateUserId] = useState("");
  const [scope, setScope] = useState<EmailDelegation["scope"]>("all");
  const [permissions, setPermissions] =
    useState<DelegationPermissions>(DEFAULT_PERMISSIONS);
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
      await delegationsApi.create({
        delegateUserId: uid,
        scope,
        permissions,
      });
      setDelegateUserId("");
      setScope("all");
      setPermissions(DEFAULT_PERMISSIONS);
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
          {/* Delegate user */}
          <Box>
            <Text
              as="label"
              htmlFor="delegate-user"
              variant="caption"
              muted
              className="mb-1 block"
            >
              Team member email or user ID
            </Text>
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

          {/* Scope */}
          <Box>
            <Text
              as="label"
              htmlFor="delegation-scope"
              variant="caption"
              muted
              className="mb-1 block"
            >
              Scope
            </Text>
            <Box
              as="select"
              id="delegation-scope"
              value={scope}
              onChange={(e) =>
                setScope(
                  (e.target as HTMLSelectElement).value as EmailDelegation["scope"],
                )
              }
              className="h-10 w-full px-3 rounded-lg border border-border bg-surface text-content text-body-md"
              aria-label="Delegation scope"
            >
              <option value="all">All email</option>
              <option value="label">Specific label</option>
              <option value="sender">Specific sender</option>
              <option value="thread">Specific thread</option>
            </Box>
          </Box>

          {/* Permissions */}
          <Box>
            <Text variant="caption" muted className="mb-2 block">
              Permissions
            </Text>
            <Box className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { key: "canReply", label: "Reply" },
                  { key: "canArchive", label: "Archive" },
                  { key: "canForward", label: "Forward" },
                  { key: "canDelete", label: "Delete" },
                ] as { key: keyof DelegationPermissions; label: string }[]
              ).map(({ key, label }) => (
                <Box
                  key={key}
                  as="label"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-surface-secondary"
                  htmlFor={`perm-${key}`}
                >
                  <Box
                    as="input"
                    type="checkbox"
                    id={`perm-${key}`}
                    checked={permissions[key]}
                    onChange={() => togglePerm(key)}
                    className="h-4 w-4 rounded"
                    aria-label={label}
                  />
                  <Text variant="body-sm">{label}</Text>
                </Box>
              ))}
            </Box>
          </Box>

          {error && (
            <Box role="alert">
              <Text variant="body-sm" className="text-status-error">
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

interface DelegationCardProps {
  readonly delegation: EmailDelegation;
  readonly mode: "outbound" | "inbound";
  readonly onRevoke: () => void;
}

function DelegationCard({
  delegation,
  mode,
  onRevoke,
}: DelegationCardProps): ReactNode {
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = async (): Promise<void> => {
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
    }
  };

  const perms = delegation.permissions as DelegationPermissions;
  const permLabels: string[] = [];
  if (perms.canReply) permLabels.push("Reply");
  if (perms.canArchive) permLabels.push("Archive");
  if (perms.canForward) permLabels.push("Forward");
  if (perms.canDelete) permLabels.push("Delete");

  const subject =
    mode === "outbound" ? delegation.delegateUserId : delegation.delegatorUserId;

  const scopeLabel =
    delegation.scope === "all"
      ? "All email"
      : delegation.scopeValue
        ? `${delegation.scope}: ${delegation.scopeValue}`
        : delegation.scope;

  return (
    <Card>
      <CardContent>
        <Box className="flex items-start justify-between gap-4">
          <Box className="flex-1 min-w-0 space-y-1">
            <Text variant="heading-sm" className="truncate">
              {subject}
            </Text>
            <Text variant="body-sm" muted>
              {scopeLabel}
            </Text>
            {permLabels.length > 0 && (
              <Box className="flex flex-wrap gap-1 pt-1">
                {permLabels.map((p) => (
                  <Box
                    key={p}
                    className="rounded-full bg-brand-100 px-2 py-0.5"
                    aria-label={`Permission: ${p}`}
                  >
                    <Text variant="caption" className="text-brand-700 text-[11px]">
                      {p}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
            {delegation.expiresAt && (
              <Text variant="caption" muted>
                Expires{" "}
                {new Date(delegation.expiresAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            )}
            {!delegation.isActive && (
              <Box className="rounded-full bg-surface-secondary px-2 py-0.5 w-fit">
                <Text variant="caption" muted className="text-[11px]">
                  Inactive
                </Text>
              </Box>
            )}
          </Box>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleRevoke()}
            disabled={revoking}
            aria-label={`Revoke delegation for ${subject}`}
          >
            {revoking ? "Revoking…" : "Revoke"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

DelegationCard.displayName = "DelegationCard";
