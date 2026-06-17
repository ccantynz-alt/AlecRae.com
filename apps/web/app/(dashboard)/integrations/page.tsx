"use client";

/**
 * AlecRae — Integrations Hub
 *
 * Integration cards (Zapier, Make, n8n, Notion, Linear, Things, Todoist),
 * webhook management, and API key access.
 *
 * API:
 *   GET    /v1/integrations               → integration[]
 *   POST   /v1/integrations/:id/connect
 *   DELETE /v1/integrations/:id/connect
 *   GET    /v1/webhooks                   → webhook[]
 *   POST   /v1/webhooks                   → create webhook
 *   DELETE /v1/webhooks/:id
 *   GET    /v1/api-keys                   → apiKey[]
 */

import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import { getAccessToken } from "../../../lib/auth-token";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Integration {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  icon?: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 8)}...`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// All supported webhook event types
const WEBHOOK_EVENTS = [
  "email.received",
  "email.sent",
  "email.read",
  "email.deleted",
  "email.starred",
  "email.snoozed",
  "contact.created",
  "contact.updated",
  "thread.archived",
  "thread.labeled",
  "task.created",
] as const;

type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// ─── Sub-components ────────────────────────────────────────────────────────────

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

function LoadingGrid(): ReactNode {
  return (
    <Box
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      aria-busy="true"
      aria-label="Loading integrations"
    >
      {[1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          className="h-36 animate-pulse rounded-xl bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingGrid.displayName = "LoadingGrid";

// ─── Integration Card ──────────────────────────────────────────────────────────

function IntegrationCard({
  integration,
  onToggle,
  toggling,
}: {
  integration: Integration;
  onToggle: (id: string, connected: boolean) => void;
  toggling: boolean;
}): ReactNode {
  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col gap-3 h-full">
          {/* Icon + name */}
          <Box className="flex items-center gap-3">
            {integration.icon ? (
              <Box
                as="img"
                src={integration.icon}
                alt={`${integration.name} logo`}
                className="w-9 h-9 rounded-lg object-contain"
              />
            ) : (
              <Box className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                <Text variant="caption" className="font-bold text-brand-700 text-xs">
                  {integration.name.slice(0, 2).toUpperCase()}
                </Text>
              </Box>
            )}
            <Box className="flex-1 min-w-0">
              <Text variant="body-sm" className="font-semibold text-content truncate">
                {integration.name}
              </Text>
              <Box
                as="span"
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  integration.connected
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-surface-raised text-content-subtle border border-border"
                }`}
              >
                {integration.connected ? "Connected" : "Not connected"}
              </Box>
            </Box>
          </Box>

          <Text variant="body-sm" className="text-content-subtle flex-1">
            {integration.description}
          </Text>

          <Button
            variant={integration.connected ? "ghost" : "primary"}
            size="sm"
            disabled={toggling}
            onClick={() => onToggle(integration.id, integration.connected)}
            aria-label={
              integration.connected
                ? `Disconnect ${integration.name}`
                : `Connect ${integration.name}`
            }
          >
            {toggling ? "…" : integration.connected ? "Disconnect" : "Connect"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
IntegrationCard.displayName = "IntegrationCard";

// ─── Integrations Grid ─────────────────────────────────────────────────────────

function IntegrationsGrid(): ReactNode {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Integration[]>("/v1/integrations");
      setIntegrations(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(id: string, connected: boolean): Promise<void> {
    setTogglingId(id);
    try {
      if (connected) {
        await apiFetch<unknown>(`/v1/integrations/${id}/connect`, { method: "DELETE" });
      } else {
        await apiFetch<unknown>(`/v1/integrations/${id}/connect`, { method: "POST" });
      }
      setIntegrations((prev) =>
        prev.map((intg) => (intg.id === id ? { ...intg, connected: !connected } : intg)),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <LoadingGrid />;
  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;

  if (integrations.length === 0) {
    return (
      <Box className="py-8 text-center">
        <Text variant="body-sm" className="text-content-subtle">
          No integrations available.
        </Text>
      </Box>
    );
  }

  return (
    <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {integrations.map((intg) => (
        <IntegrationCard
          key={intg.id}
          integration={intg}
          onToggle={(id, connected) => void handleToggle(id, connected)}
          toggling={togglingId === intg.id}
        />
      ))}
    </Box>
  );
}
IntegrationsGrid.displayName = "IntegrationsGrid";

// ─── Webhooks Section ──────────────────────────────────────────────────────────

function WebhooksSection(): ReactNode {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<WebhookEvent>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Webhook[]>("/v1/webhooks");
      setWebhooks(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleEvent(event: WebhookEvent): void {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newUrl.trim() || selectedEvents.size === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await apiFetch<Webhook>("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: newUrl.trim(), events: Array.from(selectedEvents) }),
      });
      setWebhooks((prev) => [created, ...prev]);
      setNewUrl("");
      setSelectedEvents(new Set());
      setShowForm(false);
    } catch (err) {
      setCreateError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Delete this webhook?")) return;
    setDeletingId(id);
    try {
      await apiFetch<unknown>(`/v1/webhooks/${id}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Webhooks
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Receive real-time events from AlecRae in your own systems.
            </Text>
          </Box>
          <Button
            variant={showForm ? "ghost" : "primary"}
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
          >
            {showForm ? "Cancel" : "+ Add Webhook"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {/* Add form */}
        {showForm && (
          <Box
            as="form"
            className="mb-5 space-y-4 rounded-lg border border-border bg-surface-raised p-4"
            onSubmit={(e: FormEvent) => void handleCreate(e)}
            aria-label="Add webhook"
          >
            <Box>
              <Text
                as="label"
                variant="caption"
                className="block font-medium text-content mb-1"
                htmlFor="webhook-url"
              >
                Endpoint URL
              </Text>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://your-app.com/webhooks/alecrae"
                value={newUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUrl(e.target.value)}
                required
                aria-label="Webhook URL"
              />
            </Box>

            <Box>
              <Text variant="caption" className="block font-medium text-content mb-2">
                Events to subscribe
              </Text>
              <Box className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-label="Event checkboxes">
                {WEBHOOK_EVENTS.map((ev) => (
                  <Box key={ev} as="label" className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded border-border accent-brand-600"
                      aria-label={ev}
                    />
                    <Text variant="caption" className="text-content">
                      {ev}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>

            {createError && (
              <Text variant="caption" className="text-red-600">
                {createError}
              </Text>
            )}
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={creating || !newUrl.trim() || selectedEvents.size === 0}
            >
              {creating ? "Creating…" : "Create Webhook"}
            </Button>
          </Box>
        )}

        {loading && (
          <Box className="space-y-2" aria-busy="true">
            {[1, 2].map((i) => (
              <Box key={i} className="h-14 animate-pulse rounded-lg bg-surface-raised border border-border" />
            ))}
          </Box>
        )}
        {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {!loading && !error && webhooks.length === 0 && (
          <Box className="py-6 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No webhooks yet. Add one to start receiving events.
            </Text>
          </Box>
        )}
        {!loading && !error && webhooks.length > 0 && (
          <Box className="divide-y divide-border" aria-label="Webhook list">
            {webhooks.map((wh) => (
              <Box key={wh.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <Box className="flex-1 min-w-0 space-y-0.5">
                  <Text variant="body-sm" className="font-medium text-content truncate">
                    {wh.url}
                  </Text>
                  <Text variant="caption" className="text-content-subtle">
                    {wh.events.join(", ")} · Added {formatDate(wh.createdAt)}
                  </Text>
                  <Box
                    as="span"
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      wh.active
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-surface-raised text-content-subtle border border-border"
                    }`}
                  >
                    {wh.active ? "Active" : "Inactive"}
                  </Box>
                </Box>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(wh.id)}
                  disabled={deletingId === wh.id}
                  aria-label={`Delete webhook ${wh.url}`}
                  className="text-red-600 hover:text-red-700 flex-shrink-0"
                >
                  {deletingId === wh.id ? "Deleting…" : "Delete"}
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
WebhooksSection.displayName = "WebhooksSection";

// ─── API Access Section ────────────────────────────────────────────────────────

function ApiAccessSection(): ReactNode {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ApiKey[]>("/v1/api-keys");
      setApiKeys(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate(): Promise<void> {
    if (!confirm("Generate a new API key? Existing keys will remain valid.")) return;
    setGenerating(true);
    try {
      const created = await apiFetch<ApiKey>("/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Default" }),
      });
      setApiKeys((prev) => [created, ...prev]);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setGenerating(false);
    }
  }

  async function copyKey(key: ApiKey): Promise<void> {
    try {
      await navigator.clipboard.writeText(key.key);
      setCopiedId(key.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard not available
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              API Access
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Use API keys to access AlecRae programmatically.{" "}
              <Box
                as="a"
                href="https://docs.alecrae.com/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline hover:no-underline"
              >
                View docs
              </Box>
            </Text>
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate New Key"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && (
          <Box className="space-y-2" aria-busy="true">
            {[1, 2].map((i) => (
              <Box key={i} className="h-14 animate-pulse rounded-lg bg-surface-raised border border-border" />
            ))}
          </Box>
        )}
        {!loading && error && <ErrorBanner message={error} onRetry={() => void load()} />}
        {!loading && !error && apiKeys.length === 0 && (
          <Box className="py-6 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No API keys yet. Generate one to get started.
            </Text>
          </Box>
        )}
        {!loading && !error && apiKeys.length > 0 && (
          <Box className="divide-y divide-border" aria-label="API keys">
            {apiKeys.map((key) => (
              <Box key={key.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <Box className="flex-1 min-w-0 space-y-0.5">
                  <Text variant="body-sm" className="font-medium text-content">
                    {key.name}
                  </Text>
                  <Box className="flex items-center gap-2">
                    <Box
                      as="code"
                      className="rounded bg-surface-raised border border-border px-2 py-0.5 text-xs font-mono text-content"
                    >
                      {maskKey(key.key)}
                    </Box>
                  </Box>
                  <Text variant="caption" className="text-content-subtle">
                    Created {formatDate(key.createdAt)}
                    {key.lastUsed ? ` · Last used ${formatDate(key.lastUsed)}` : " · Never used"}
                  </Text>
                </Box>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyKey(key)}
                  aria-label={`Copy API key ${key.name}`}
                >
                  {copiedId === key.id ? "Copied!" : "Copy"}
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ApiAccessSection.displayName = "ApiAccessSection";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationsPage(): ReactNode {
  return (
    <PageLayout
      title="Integrations"
      description="Connect AlecRae to the tools you already use."
    >
      <Box className="space-y-8">
        {/* Integration cards — available to all plans */}
        <Box>
          <Text variant="heading-sm" className="font-semibold mb-1">
            Connected Apps
          </Text>
          <Text variant="body-sm" className="text-content-subtle mb-4">
            Connect your favourite automation and productivity tools.
          </Text>
          <IntegrationsGrid />
        </Box>

        {/* Webhooks + API Access — Pro plan and above */}
        <PlanGate feature="ai_agent" required="pro" showUpgrade={false}>
          <Box className="space-y-6">
            <WebhooksSection />
            <ApiAccessSection />
          </Box>
        </PlanGate>
      </Box>
    </PageLayout>
  );
}
