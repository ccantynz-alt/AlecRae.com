"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, Input, PageLayout } from "@alecrae/ui";
import { integrationsApi, type IntegrationData, type IntegrationPlatform } from "../../../lib/api-features";
import { webhooksApi, apiKeysApi, type Webhook, type ApiKey } from "../../../lib/api";
import { PlanGate } from "../../../components/plan-gate";

const PLATFORM_LOGOS: Record<IntegrationPlatform, string> = {
  zapier: "⚡",
  make: "🔄",
  n8n: "🔁",
  custom: "🔗",
};

const PLATFORM_DESCRIPTIONS: Record<IntegrationPlatform, string> = {
  zapier: "Connect AlecRae to 5,000+ apps via Zapier automation workflows",
  make: "Build advanced multi-step automations with Make (formerly Integromat)",
  n8n: "Self-hosted workflow automation with n8n's visual editor",
  custom: "Connect any tool via custom webhook integration",
};

type WebhookData = Webhook;
type ApiKeyData = ApiKey;

function SectionDivider({ title }: { title: string }): React.ReactNode {
  return (
    <Box className="flex items-center gap-3 my-6">
      <Box className="h-px flex-1 bg-border" />
      <Text variant="caption" className="text-content-subtle font-medium uppercase tracking-wider">{title}</Text>
      <Box className="h-px flex-1 bg-border" />
    </Box>
  );
}

export default function IntegrationsPage(): React.ReactNode {
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [intRes, whRes, keyRes] = await Promise.allSettled([
      integrationsApi.list(),
      webhooksApi.list(),
      apiKeysApi.list(),
    ]);
    if (intRes.status === "fulfilled") setIntegrations(intRes.value.data);
    if (whRes.status === "fulfilled") setWebhooks(whRes.value.data as WebhookData[]);
    if (keyRes.status === "fulfilled") setApiKeys(keyRes.value.data as ApiKeyData[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createWebhook = async (): Promise<void> => {
    if (!newWebhookUrl) return;
    setSaving(true);
    try {
      await webhooksApi.create({ url: newWebhookUrl, events: ["email.received", "email.sent"] });
      setNewWebhookUrl("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteWebhook = async (id: string): Promise<void> => {
    await webhooksApi.remove(id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const createApiKey = async (): Promise<void> => {
    if (!newKeyName) return;
    setSaving(true);
    try {
      await apiKeysApi.create({ name: newKeyName, permissions: { "messages:read": true, "messages:write": true } });
      setNewKeyName("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const revokeApiKey = async (id: string): Promise<void> => {
    await apiKeysApi.revoke(id);
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const connectedIds = new Set(integrations.map((i) => i.platform));
  const platforms: IntegrationPlatform[] = ["zapier", "make", "n8n", "custom"];

  return (
    <PlanGate feature="ai_agent" required="pro">
      <PageLayout title="Integrations" description="Connect AlecRae to your tools and automate your workflows.">
        {loading ? (
          <Box className="space-y-4">
            {[1, 2, 3].map((i) => <Box key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />)}
          </Box>
        ) : (
          <Box className="space-y-6">
            {/* Platform cards */}
            <Box>
              <Text variant="body-sm" className="text-sm font-semibold mb-4">Connected Platforms</Text>
              <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {platforms.map((platform) => {
                  const integration = integrations.find((i) => i.platform === platform);
                  const connected = connectedIds.has(platform);
                  return (
                    <Box
                      key={platform}
                      className="p-4 rounded-xl border border-border bg-surface-raised flex items-start gap-3"
                    >
                      <Box className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-surface-secondary flex-shrink-0">
                        {PLATFORM_LOGOS[platform]}
                      </Box>
                      <Box className="flex-1 min-w-0">
                        <Box className="flex items-center gap-2 mb-0.5">
                          <Text variant="body-sm" className="font-semibold capitalize">{platform}</Text>
                          {connected && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                              Connected
                            </span>
                          )}
                        </Box>
                        <Text variant="caption" className="text-content-subtle line-clamp-2">
                          {PLATFORM_DESCRIPTIONS[platform]}
                        </Text>
                        {integration && (
                          <Text variant="caption" className="text-content-tertiary mt-1">
                            {integration.webhookUrl ? `${integration.webhookUrl.substring(0, 30)}…` : ""}
                          </Text>
                        )}
                      </Box>
                      <Button
                        variant={connected ? "outline" : "primary"}
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => {
                          if (connected && integration) {
                            void integrationsApi.remove(integration.id).then(load);
                          } else {
                            void integrationsApi.create({ platform, name: platform, webhookUrl: "", events: [] }).then(load);
                          }
                        }}
                      >
                        {connected ? "Disconnect" : "Connect"}
                      </Button>
                    </Box>
                  );
                })}
              </Box>
            </Box>

            <SectionDivider title="Webhooks" />

            {/* Webhooks */}
            <Card>
              <CardHeader>
                <Box className="flex items-center justify-between">
                  <Text variant="body-sm" className="text-sm font-semibold">Webhooks ({webhooks.length})</Text>
                </Box>
              </CardHeader>
              <CardContent>
                <Box className="flex gap-2 mb-4">
                  <Input
                    placeholder="https://your-endpoint.com/hook"
                    value={newWebhookUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhookUrl(e.target.value)}
                  />
                  <Button variant="primary" size="sm" onClick={() => void createWebhook()} disabled={saving || !newWebhookUrl}>
                    Add
                  </Button>
                </Box>
                {webhooks.length === 0 ? (
                  <Text variant="caption" className="text-content-subtle text-center py-4 block">
                    No webhooks configured yet
                  </Text>
                ) : (
                  <Box className="space-y-2">
                    {webhooks.map((wh) => (
                      <Box key={wh.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <Box className="flex-1 min-w-0">
                          <Text variant="body-sm" className="font-mono text-xs truncate">{wh.url}</Text>
                          <Text variant="caption" className="text-content-subtle">
                            {wh.events.slice(0, 3).join(", ")}{wh.events.length > 3 ? ` +${wh.events.length - 3}` : ""}
                          </Text>
                        </Box>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${wh.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {wh.active ? "Active" : "Inactive"}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => void deleteWebhook(wh.id)} className="text-red-600 flex-shrink-0">
                          Remove
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>

            <SectionDivider title="API Access" />

            {/* API Keys */}
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">API Keys</Text>
              </CardHeader>
              <CardContent>
                <Box className="flex gap-2 mb-4">
                  <Input
                    placeholder="Key name (e.g. Production, Zapier)"
                    value={newKeyName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKeyName(e.target.value)}
                  />
                  <Button variant="primary" size="sm" onClick={() => void createApiKey()} disabled={saving || !newKeyName}>
                    Create
                  </Button>
                </Box>
                {apiKeys.length === 0 ? (
                  <Text variant="caption" className="text-content-subtle text-center py-4 block">
                    No API keys yet. Create one to access the AlecRae API.
                  </Text>
                ) : (
                  <Box className="space-y-2">
                    {apiKeys.map((key) => (
                      <Box key={key.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <Box className="flex-1 min-w-0">
                          <Text variant="body-sm" className="font-medium">{key.name}</Text>
                          <Text variant="caption" className="font-mono text-content-subtle">{key.keyPrefix}</Text>
                          {key.lastUsedAt && (
                            <Text variant="caption" className="text-content-tertiary">
                              Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                            </Text>
                          )}
                        </Box>
                        <Button variant="ghost" size="sm" onClick={() => void revokeApiKey(key.id)} className="text-red-600 flex-shrink-0">
                          Revoke
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
                <Box className="mt-4 pt-4 border-t border-border">
                  <Text variant="caption" className="text-content-subtle">
                    View the{" "}
                    <a href="https://docs.alecrae.com/api" className="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">
                      API documentation
                    </a>
                    {" "}for endpoints, authentication, and code examples.
                  </Text>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </PageLayout>
    </PlanGate>
  );
}
