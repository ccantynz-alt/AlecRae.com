"use client";

/**
 * AlecRae — Admin Console
 *
 * Role-gated platform administration surface, wired to the real /v1/admin/*
 * endpoints (stats, users, domains, messages, events, dead-letter queue).
 * Only owner/admin roles may view it; everyone else gets an honest
 * "not authorized" state. When the API isn't reachable it degrades to a
 * clear offline message rather than a blank screen.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Box, Text, Button, Card, CardContent, StatCard } from "@alecrae/ui";
import {
  adminApi,
  authApi,
  type AdminStats,
  type AdminUser,
  type AdminDomain,
  type AdminMessage,
  type AdminEvent,
  type AdminDlq,
} from "../../../lib/api";

type Tab = "overview" | "users" | "domains" | "messages" | "events" | "queue";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "domains", label: "Domains" },
  { id: "messages", label: "Messages" },
  { id: "events", label: "Events" },
  { id: "queue", label: "Queue" },
];

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number): string {
  return n.toLocaleString();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminPage(): ReactNode {
  const [role, setRole] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    authApi
      .me()
      .then((res) => setRole(res.data.role))
      .catch(() => setRole(null))
      .finally(() => setRoleChecked(true));
  }, []);

  if (!roleChecked) {
    return <CenteredNote title="Loading admin console…" />;
  }

  const isAdmin = role === "owner" || role === "admin";
  if (!isAdmin) {
    return (
      <CenteredNote
        title="Admin access required"
        body="Your account doesn't have platform admin privileges. If you believe this is a mistake, contact the account owner."
      />
    );
  }

  return (
    <Box className="flex-1 overflow-y-auto p-6 max-w-6xl w-full mx-auto">
      <Box className="mb-6">
        <Text variant="display-sm" className="mb-1">
          Admin Console
        </Text>
        <Text variant="body-md" muted>
          Platform-wide operations across every account.
        </Text>
      </Box>

      <Box
        role="tablist"
        aria-label="Admin sections"
        className="flex gap-1 mb-6 border-b border-border overflow-x-auto"
      >
        {TABS.map((t) => (
          <Box
            key={t.id}
            as="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-body-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-brand-600 text-content"
                : "border-transparent text-content-tertiary hover:text-content"
            }`}
          >
            {t.label}
          </Box>
        ))}
      </Box>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "domains" && <DomainsTab />}
      {tab === "messages" && <MessagesTab />}
      {tab === "events" && <EventsTab />}
      {tab === "queue" && <QueueTab />}
    </Box>
  );
}

AdminPage.displayName = "AdminPage";

// ─── Shared states ────────────────────────────────────────────────────────────

function CenteredNote({ title, body }: { title: string; body?: string }): ReactNode {
  return (
    <Box className="flex-1 flex items-center justify-center p-8">
      <Box className="text-center max-w-md">
        <Text variant="heading-md" className="mb-2">
          {title}
        </Text>
        {body && (
          <Text variant="body-md" muted>
            {body}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function useAdminResource<T>(
  loader: () => Promise<{ data: T }>,
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    loader()
      .then((res) => setData(res.data))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Couldn't reach the API"),
      )
      .finally(() => setLoading(false));
    // `loader` is stable for a given tab; deliberately run once on mount.
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

function Panel({ children }: { children: ReactNode }): ReactNode {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StateRow({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  onRetry: () => void;
}): ReactNode {
  if (loading) {
    return (
      <Text variant="body-sm" muted>
        Loading…
      </Text>
    );
  }
  if (error) {
    return (
      <Box className="flex items-center gap-3 py-2">
        <Text variant="body-sm" className="text-status-error">
          {error}
        </Text>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </Box>
    );
  }
  if (empty) {
    return (
      <Text variant="body-sm" muted>
        Nothing here yet.
      </Text>
    );
  }
  return null;
}

// ─── Table primitives (components only — no raw HTML tables in app code) ───────

function Row({
  children,
  cols,
  header,
}: {
  children: ReactNode;
  cols: string;
  header?: boolean;
}): ReactNode {
  return (
    <Box
      className={`grid items-center gap-3 px-3 py-2 ${
        header
          ? "text-caption uppercase tracking-wide text-content-tertiary"
          : "text-body-sm border-t border-border"
      }`}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </Box>
  );
}

function Cell({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <Box className={`min-w-0 truncate ${className ?? ""}`}>
      <Text as="span" variant="body-sm" className="truncate">
        {children}
      </Text>
    </Box>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }): ReactNode {
  return (
    <Text
      as="span"
      variant="caption"
      className={`px-1.5 py-0.5 rounded font-medium ${
        ok
          ? "bg-status-success/15 text-status-success"
          : "bg-surface-tertiary text-content-tertiary"
      }`}
    >
      {label}
    </Text>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab(): ReactNode {
  const { data, loading, error, reload } = useAdminResource<AdminStats>(() => adminApi.stats());

  if (loading || error) {
    return (
      <Panel>
        <StateRow loading={loading} error={error} onRetry={reload} />
      </Panel>
    );
  }
  if (!data) return null;

  return (
    <Box className="space-y-6">
      <Box className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Accounts" value={num(data.platform.totalAccounts)} />
        <StatCard label="Users" value={num(data.platform.totalUsers)} />
        <StatCard label="Domains" value={num(data.platform.totalDomains)} />
      </Box>

      <Box>
        <Text variant="heading-sm" className="mb-3">
          Deliverability (all time)
        </Text>
        <Box className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Sent" value={num(data.totals.sent)} />
          <StatCard label="Delivered" value={num(data.totals.delivered)} description={pct(data.totals.deliveryRate)} />
          <StatCard
            label="Bounced"
            value={num(data.totals.bounced)}
            description={pct(data.totals.bounceRate)}
            trend={data.totals.bounceRate > 0.05 ? "down" : "neutral"}
          />
          <StatCard label="Complaints" value={num(data.totals.complained)} />
          <StatCard label="Opened" value={num(data.totals.opened)} description={pct(data.totals.openRate)} />
          <StatCard label="Clicked" value={num(data.totals.clicked)} description={pct(data.totals.clickRate)} />
          <StatCard label="Queued" value={num(data.totals.queued)} />
          <StatCard
            label="Failed"
            value={num(data.totals.failed)}
            trend={data.totals.failed > 0 ? "down" : "neutral"}
          />
        </Box>
      </Box>

      <Box>
        <Text variant="heading-sm" className="mb-3">
          Last 24 hours
        </Text>
        <Box className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Sent" value={num(data.last24h.sent)} />
          <StatCard label="Delivered" value={num(data.last24h.delivered)} />
          <StatCard label="Bounced" value={num(data.last24h.bounced)} />
          <StatCard label="Queued" value={num(data.last24h.queued)} />
        </Box>
      </Box>
    </Box>
  );
}

// ─── Users ──────────────────────────────────────────────────────────────────

function UsersTab(): ReactNode {
  const { data, loading, error, reload } = useAdminResource<AdminUser[]>(() => adminApi.users());
  const cols = "2fr 1fr 1fr 1fr 0.8fr";

  return (
    <Panel>
      <Row cols={cols} header>
        <Cell>User</Cell>
        <Cell>Role</Cell>
        <Cell>Plan</Cell>
        <Cell>Account</Cell>
        <Cell>Last seen</Cell>
      </Row>
      <StateRow loading={loading} error={error} empty={!!data && data.length === 0} onRetry={reload} />
      {data?.map((u) => (
        <Row key={u.id} cols={cols}>
          <Box className="min-w-0">
            <Text variant="body-sm" className="truncate font-medium">
              {u.name || u.email}
            </Text>
            <Text variant="caption" muted className="truncate block">
              {u.email}
            </Text>
          </Box>
          <Cell className="capitalize">{u.role}</Cell>
          <Cell className="capitalize">{u.plan}</Cell>
          <Cell>{u.accountName ?? "—"}</Cell>
          <Cell>{timeAgo(u.lastLoginAt)}</Cell>
        </Row>
      ))}
    </Panel>
  );
}

// ─── Domains ──────────────────────────────────────────────────────────────────

function DomainsTab(): ReactNode {
  const { data, loading, error, reload } = useAdminResource<AdminDomain[]>(() => adminApi.domains());
  const cols = "1.6fr 1fr 1.4fr 0.8fr 0.8fr";

  return (
    <Panel>
      <Row cols={cols} header>
        <Cell>Domain</Cell>
        <Cell>Status</Cell>
        <Cell>Auth</Cell>
        <Cell>24h sent</Cell>
        <Cell>Active</Cell>
      </Row>
      <StateRow loading={loading} error={error} empty={!!data && data.length === 0} onRetry={reload} />
      {data?.map((d) => (
        <Row key={d.id} cols={cols}>
          <Cell className="font-medium">{d.domain}</Cell>
          <Cell className="capitalize">{d.status}</Cell>
          <Box className="flex gap-1 flex-wrap">
            <Pill ok={d.spfVerified} label="SPF" />
            <Pill ok={d.dkimVerified} label="DKIM" />
            <Pill ok={d.dmarcVerified} label="DMARC" />
          </Box>
          <Cell>{num(d.messagesSent24h)}</Cell>
          <Cell>{d.isActive ? "Yes" : "No"}</Cell>
        </Row>
      ))}
    </Panel>
  );
}

// ─── Messages ──────────────────────────────────────────────────────────────────

function MessagesTab(): ReactNode {
  const { data, loading, error, reload } = useAdminResource<AdminMessage[]>(() =>
    adminApi.messages({ limit: 100 }),
  );
  const cols = "1.4fr 2fr 1fr 0.8fr";

  return (
    <Panel>
      <Row cols={cols} header>
        <Cell>From</Cell>
        <Cell>Subject</Cell>
        <Cell>Status</Cell>
        <Cell>When</Cell>
      </Row>
      <StateRow loading={loading} error={error} empty={!!data && data.length === 0} onRetry={reload} />
      {data?.map((m) => (
        <Row key={m.id} cols={cols}>
          <Cell>{m.from.name || m.from.email}</Cell>
          <Cell>{m.subject || "(no subject)"}</Cell>
          <Cell className="capitalize">{m.status}</Cell>
          <Cell>{timeAgo(m.createdAt)}</Cell>
        </Row>
      ))}
    </Panel>
  );
}

// ─── Events ──────────────────────────────────────────────────────────────────

function EventsTab(): ReactNode {
  const { data, loading, error, reload } = useAdminResource<AdminEvent[]>(() =>
    adminApi.events({ limit: 100 }),
  );
  const cols = "1.4fr 2fr 1fr";

  return (
    <Panel>
      <Row cols={cols} header>
        <Cell>Type</Cell>
        <Cell>Recipient</Cell>
        <Cell>When</Cell>
      </Row>
      <StateRow loading={loading} error={error} empty={!!data && data.length === 0} onRetry={reload} />
      {data?.map((ev) => (
        <Row key={ev.id} cols={cols}>
          <Cell>{ev.type.replace(/^email\./, "")}</Cell>
          <Cell>{ev.recipient ?? "—"}</Cell>
          <Cell>{timeAgo(ev.timestamp)}</Cell>
        </Row>
      ))}
    </Panel>
  );
}

// ─── Queue (dead-letter) ─────────────────────────────────────────────────────

function QueueTab(): ReactNode {
  const { data, loading, error, reload } = useAdminResource<AdminDlq>(() => adminApi.dlq());
  const [busy, setBusy] = useState(false);
  const cols = "1.5fr 2fr 0.6fr 0.9fr 0.7fr";

  const clearOne = async (jobId: string): Promise<void> => {
    setBusy(true);
    try {
      await adminApi.clearDlqRecord(jobId);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const clearFailed = async (): Promise<void> => {
    setBusy(true);
    try {
      await adminApi.clearFailedDlq();
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box className="space-y-4">
      {data && (
        <Box className="grid grid-cols-3 gap-4">
          <StatCard label="In queue" value={num(data.stats.total)} />
          <StatCard label="Pending retry" value={num(data.stats.pendingRetry)} />
          <StatCard
            label="Permanently failed"
            value={num(data.stats.permanentlyFailed)}
            trend={data.stats.permanentlyFailed > 0 ? "down" : "neutral"}
          />
        </Box>
      )}

      <Panel>
        <Box className="flex items-center justify-between mb-3">
          <Text variant="heading-sm">Dead-letter queue</Text>
          {data && data.stats.permanentlyFailed > 0 && (
            <Button variant="secondary" size="sm" onClick={() => void clearFailed()} disabled={busy}>
              Clear all failed
            </Button>
          )}
        </Box>
        <Row cols={cols} header>
          <Cell>Job</Cell>
          <Cell>Reason</Cell>
          <Cell>Tries</Cell>
          <Cell>Status</Cell>
          <Cell> </Cell>
        </Row>
        <StateRow loading={loading} error={error} empty={!!data && data.records.length === 0} onRetry={reload} />
        {data?.records.map((r) => (
          <Row key={r.jobId} cols={cols}>
            <Cell className="font-medium">{r.jobName}</Cell>
            <Cell>{r.failedReason}</Cell>
            <Cell>{r.attemptsMade}</Cell>
            <Cell className="capitalize">{r.status.replace(/_/g, " ")}</Cell>
            <Box className="text-right">
              <Button variant="ghost" size="sm" onClick={() => void clearOne(r.jobId)} disabled={busy}>
                Clear
              </Button>
            </Box>
          </Row>
        ))}
      </Panel>
    </Box>
  );
}
