"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  apiKeysApi,
  webhooksApi,
  type ApiKey,
  type Webhook,
} from "../../../../lib/api";
import {
  integrationsApi,
  type IntegrationData,
  type IntegrationEventTypeData,
  type IntegrationPlatform,
} from "../../../../lib/api-features";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ErrorBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}

ErrorBanner.displayName = "ErrorBanner";

export default function DeveloperSettingsPage(): React.ReactNode {
  return (
    <PageLayout
      title="Developer Settings"
      description="API keys, webhooks, and Zapier/Make/n8n integrations."
    >
      <Box className="max-w-3xl space-y-6">
        <ApiKeysSection />
        <WebhooksSection />
        <IntegrationsSection />
      </Box>
    </PageLayout>
  );
}

// ─── API Keys ────────────────────────────────────────────────────────────────

function ApiKeysSection(): React.ReactNode {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiKeysApi.list();
      setKeys(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (): Promise<void> => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiKeysApi.create({
        name: newName.trim(),
        permissions: {
          sendEmail: true,
          readEmail: true,
          viewAnalytics: true,
          manageDomains: false,
          manageApiKeys: false,
          manageWebhooks: false,
          manageAccount: false,
          manageTeamMembers: false,
        },
        environment,
      });
      setCreatedKey(res.data.key);
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string): Promise<void> => {
    setRevokingId(id);
    try {
      await apiKeysApi.revoke(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Box>
            <Text variant="heading-sm">API Keys</Text>
            <Text variant="body-sm" muted>
              Authenticate API requests to api.alecrae.com.
            </Text>
          </Box>
          <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Close" : "New Key"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}

        {createdKey && (
          <Box className="mb-4 rounded-md border border-accent/30 bg-accent/10 p-3" role="status">
            <Text variant="body-sm" className="font-medium text-accent">
              Copy your key now — it will not be shown again:
            </Text>
            <Box className="mt-2 rounded bg-surface p-2">
              <Text variant="body-sm" className="break-all font-mono">
                {createdKey}
              </Text>
            </Box>
            <Box className="mt-2">
              <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>
                Dismiss
              </Button>
            </Box>
          </Box>
        )}

        {showCreate && (
          <Box className="mb-4 space-y-3 rounded-lg border border-border p-4">
            <Input
              label="Key name"
              variant="text"
              placeholder="e.g. Production server"
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            />
            <Box>
              <Text variant="body-sm" className="mb-1.5 font-medium text-content">
                Environment
              </Text>
              <Box className="flex gap-2" role="radiogroup" aria-label="API key environment">
                {(["live", "test"] as const).map((env) => (
                  <Button
                    key={env}
                    variant={environment === env ? "secondary" : "ghost"}
                    size="sm"
                    role="radio"
                    aria-checked={environment === env}
                    onClick={() => setEnvironment(env)}
                  >
                    {env}
                  </Button>
                ))}
              </Box>
            </Box>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? "Creating..." : "Create Key"}
            </Button>
          </Box>
        )}

        {loading ? (
          <Text variant="body-sm" muted>
            Loading API keys...
          </Text>
        ) : keys.length === 0 ? (
          <Text variant="body-sm" muted>
            No API keys yet.
          </Text>
        ) : (
          <Box className="space-y-2">
            {keys.map((key) => (
              <Box
                key={key.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-surface-secondary p-3"
              >
                <Box className="min-w-0 flex-1">
                  <Text variant="body-sm" className="font-medium">
                    {key.name}
                  </Text>
                  <Text variant="caption" muted>
                    {key.keyPrefix}… · {key.environment} · created{" "}
                    {formatDate(key.createdAt)}
                    {key.lastUsedAt ? ` · last used ${formatDate(key.lastUsedAt)}` : ""}
                  </Text>
                </Box>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRevoke(key.id)}
                  disabled={revokingId === key.id}
                >
                  {revokingId === key.id ? "Revoking..." : "Revoke"}
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

ApiKeysSection.displayName = "ApiKeysSection";

// ─── Webhooks ────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = ["delivered", "bounced", "opened", "clicked", "complained"] as const;

function WebhooksSection(): React.ReactNode {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<string>>(new Set(["delivered", "bounced"]));
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await webhooksApi.list();
      setHooks(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (event: string): void => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  };

  const handleCreate = async (): Promise<void> => {
    if (!url.trim() || events.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      await webhooksApi.create({
        url: url.trim(),
        events: Array.from(events),
      });
      setUrl("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    setRemovingId(id);
    try {
      await webhooksApi.remove(id);
      setHooks((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete webhook");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Box>
            <Text variant="heading-sm">Webhooks</Text>
            <Text variant="body-sm" muted>
              Receive delivery, open, click, bounce, and complaint events.
            </Text>
          </Box>
          <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Close" : "New Webhook"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}

        {showCreate && (
          <Box className="mb-4 space-y-3 rounded-lg border border-border p-4">
            <Input
              label="Endpoint URL"
              variant="text"
              placeholder="https://example.com/webhooks/alecrae"
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
            />
            <Box>
              <Text variant="body-sm" className="mb-1.5 font-medium text-content">
                Events
              </Text>
              <Box className="flex flex-wrap gap-2" role="group" aria-label="Webhook events">
                {WEBHOOK_EVENTS.map((event) => (
                  <Button
                    key={event}
                    variant={events.has(event) ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={events.has(event)}
                    onClick={() => toggleEvent(event)}
                  >
                    {event}
                  </Button>
                ))}
              </Box>
            </Box>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={creating || !url.trim() || events.size === 0}
            >
              {creating ? "Creating..." : "Create Webhook"}
            </Button>
          </Box>
        )}

        {loading ? (
          <Text variant="body-sm" muted>
            Loading webhooks...
          </Text>
        ) : hooks.length === 0 ? (
          <Text variant="body-sm" muted>
            No webhooks configured.
          </Text>
        ) : (
          <Box className="space-y-2">
            {hooks.map((hook) => (
              <Box
                key={hook.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-surface-secondary p-3"
              >
                <Box className="min-w-0 flex-1">
                  <Text variant="body-sm" className="font-medium truncate">
                    {hook.url}
                  </Text>
                  <Text variant="caption" muted>
                    {hook.events.join(", ")} · {hook.active ? "active" : "inactive"} ·
                    created {formatDate(hook.createdAt)}
                  </Text>
                </Box>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemove(hook.id)}
                  disabled={removingId === hook.id}
                >
                  {removingId === hook.id ? "Deleting..." : "Delete"}
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

// ─── Integrations (Zapier/Make/n8n) ─────────────────────────────────────────

const PLATFORMS: { value: IntegrationPlatform; label: string }[] = [
  { value: "zapier", label: "Zapier" },
  { value: "make", label: "Make" },
  { value: "n8n", label: "n8n" },
  { value: "custom", label: "Custom" },
];

function IntegrationsSection(): React.ReactNode {
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [eventTypes, setEventTypes] = useState<IntegrationEventTypeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [platform, setPlatform] = useState<IntegrationPlatform>("zapier");
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(
    new Set(["email.received"]),
  );
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [listRes, eventsRes] = await Promise.all([
        integrationsApi.list(),
        integrationsApi.events().catch(() => ({ data: [] as IntegrationEventTypeData[] })),
      ]);
      setIntegrations(listRes.data);
      setEventTypes(eventsRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (event: string): void => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else if (next.size < 20) {
        next.add(event);
      }
      return next;
    });
  };

  const handleCreate = async (): Promise<void> => {
    if (!name.trim() || !webhookUrl.trim() || selectedEvents.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await integrationsApi.create({
        platform,
        name: name.trim(),
        webhookUrl: webhookUrl.trim(),
        events: Array.from(selectedEvents),
      });
      setCreatedSecret(res.data.secret);
      setName("");
      setWebhookUrl("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create integration");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (integration: IntegrationData): Promise<void> => {
    setBusyId(integration.id);
    try {
      await integrationsApi.update(integration.id, { isActive: !integration.isActive });
      setIntegrations((prev) =>
        prev.map((i) =>
          i.id === integration.id ? { ...i, isActive: !i.isActive } : i,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update integration");
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (id: string): Promise<void> => {
    setBusyId(id);
    setTestResult(null);
    try {
      const res = await integrationsApi.test(id);
      setTestResult(
        res.data.success
          ? `Test delivered (HTTP ${res.data.statusCode ?? "?"}).`
          : `Test failed: ${res.data.error ?? `HTTP ${res.data.statusCode ?? "?"}`}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await integrationsApi.remove(id);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete integration");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Box>
            <Text variant="heading-sm">Integrations</Text>
            <Text variant="body-sm" muted>
              Send HMAC-signed events to Zapier, Make, n8n, or any endpoint.
            </Text>
          </Box>
          <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Close" : "New Integration"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {testResult && (
          <Box className="mb-3 rounded border border-accent/30 bg-accent/10 p-2" role="status">
            <Text variant="body-sm" className="text-accent">
              {testResult}
            </Text>
          </Box>
        )}

        {createdSecret && (
          <Box className="mb-4 rounded-md border border-accent/30 bg-accent/10 p-3" role="status">
            <Text variant="body-sm" className="font-medium text-accent">
              Signing secret — copy it now, it will not be shown again:
            </Text>
            <Box className="mt-2 rounded bg-surface p-2">
              <Text variant="body-sm" className="break-all font-mono">
                {createdSecret}
              </Text>
            </Box>
            <Box className="mt-2">
              <Button variant="ghost" size="sm" onClick={() => setCreatedSecret(null)}>
                Dismiss
              </Button>
            </Box>
          </Box>
        )}

        {showCreate && (
          <Box className="mb-4 space-y-3 rounded-lg border border-border p-4">
            <Box>
              <Text variant="body-sm" className="mb-1.5 font-medium text-content">
                Platform
              </Text>
              <Box className="flex flex-wrap gap-2" role="radiogroup" aria-label="Integration platform">
                {PLATFORMS.map((p) => (
                  <Button
                    key={p.value}
                    variant={platform === p.value ? "secondary" : "ghost"}
                    size="sm"
                    role="radio"
                    aria-checked={platform === p.value}
                    onClick={() => setPlatform(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </Box>
            </Box>
            <Input
              label="Name"
              variant="text"
              placeholder="e.g. New email → Slack"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
            <Input
              label="Webhook URL"
              variant="text"
              placeholder="https://hooks.zapier.com/..."
              value={webhookUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWebhookUrl(e.target.value)}
            />
            {eventTypes.length > 0 && (
              <Box>
                <Text variant="body-sm" className="mb-1.5 font-medium text-content">
                  Events
                </Text>
                <Box className="flex flex-wrap gap-2" role="group" aria-label="Integration events">
                  {eventTypes.map((event) => (
                    <Button
                      key={event.type}
                      variant={selectedEvents.has(event.type) ? "secondary" : "ghost"}
                      size="sm"
                      aria-pressed={selectedEvents.has(event.type)}
                      title={event.description}
                      onClick={() => toggleEvent(event.type)}
                    >
                      {event.type}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={
                creating || !name.trim() || !webhookUrl.trim() || selectedEvents.size === 0
              }
            >
              {creating ? "Creating..." : "Create Integration"}
            </Button>
          </Box>
        )}

        {loading ? (
          <Text variant="body-sm" muted>
            Loading integrations...
          </Text>
        ) : integrations.length === 0 ? (
          <Text variant="body-sm" muted>
            No integrations configured.
          </Text>
        ) : (
          <Box className="space-y-2">
            {integrations.map((integration) => (
              <Box
                key={integration.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-surface-secondary p-3"
              >
                <Box className="min-w-0 flex-1">
                  <Box className="flex items-center gap-2">
                    <Text variant="body-sm" className="font-medium truncate">
                      {integration.name}
                    </Text>
                    <Box className="rounded-full bg-surface px-2 py-0.5">
                      <Text variant="caption" muted>
                        {integration.platform}
                      </Text>
                    </Box>
                  </Box>
                  <Text variant="caption" muted className="truncate block">
                    {integration.webhookUrl} ·{" "}
                    {integration.triggerConfig.events.length} event
                    {integration.triggerConfig.events.length !== 1 ? "s" : ""} ·{" "}
                    {integration.isActive ? "active" : "paused"} · last triggered{" "}
                    {formatDate(integration.lastTriggeredAt)}
                  </Text>
                </Box>
                <Box className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTest(integration.id)}
                    disabled={busyId === integration.id}
                  >
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(integration)}
                    disabled={busyId === integration.id}
                  >
                    {integration.isActive ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(integration.id)}
                    disabled={busyId === integration.id}
                    className="text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

IntegrationsSection.displayName = "IntegrationsSection";
