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
  CardFooter,
  PageLayout,
} from "@emailed/ui";
import { apiKeysApi, type ApiKey } from "../../../lib/api";

const PERMISSION_LABELS: Record<string, string> = {
  sendEmail: "Send Email",
  readEmail: "Read Email",
  manageDomains: "Manage Domains",
  manageApiKeys: "Manage API Keys",
  manageWebhooks: "Manage Webhooks",
  viewAnalytics: "View Analytics",
  manageAccount: "Manage Account",
  manageTeamMembers: "Manage Team",
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setError(null);
      const res = await apiKeysApi.list();
      setKeys(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleRevoke = async (id: string) => {
    try {
      await apiKeysApi.revoke(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  const actions = (
    <Button variant="primary" size="sm" onClick={() => setShowCreateForm(true)}>
      Create API Key
    </Button>
  );

  return (
    <PageLayout
      title="API Keys"
      description="Create and manage API keys for programmatic access to the Emailed platform."
      actions={actions}
    >
      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">
          {error}
        </div>
      )}

      {newlyCreatedKey && (
        <Card className="mb-6 border-green-300 bg-green-50">
          <CardContent>
            <Text variant="heading-sm" className="mb-2 text-green-800">
              API Key Created
            </Text>
            <Text variant="body-sm" className="mb-3 text-green-700">
              Copy this key now. It will not be shown again.
            </Text>
            <Box className="flex items-center gap-3">
              <Box className="flex-1 bg-white rounded border border-green-200 px-3 py-2 font-mono text-sm break-all select-all">
                {newlyCreatedKey}
              </Box>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(newlyCreatedKey);
                }}
              >
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewlyCreatedKey(null)}
              >
                Dismiss
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {showCreateForm && (
        <CreateApiKeyForm
          onClose={() => setShowCreateForm(false)}
          onCreated={(key: string) => {
            setShowCreateForm(false);
            setNewlyCreatedKey(key);
            loadKeys();
          }}
        />
      )}

      {loading ? (
        <Text variant="body-md" muted>
          Loading API keys...
        </Text>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent>
            <Box className="text-center py-8">
              <Text variant="heading-sm" className="mb-2">
                No API keys
              </Text>
              <Text variant="body-sm" muted className="mb-4">
                Create an API key to integrate Emailed into your applications.
              </Text>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateForm(true)}
              >
                Create Your First API Key
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box className="space-y-4">
          {keys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              onRevoke={() => handleRevoke(key.id)}
            />
          ))}
        </Box>
      )}
    </PageLayout>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const enabledPerms = Object.entries(apiKey.permissions)
    .filter(([, v]) => v === true)
    .map(([k]) => PERMISSION_LABELS[k] ?? k);

  return (
    <Card>
      <CardContent>
        <Box className="flex items-start justify-between gap-4">
          <Box className="flex-1 min-w-0">
            <Box className="flex items-center gap-2 mb-1">
              <Box
                className={`w-2 h-2 rounded-full ${
                  apiKey.isActive ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <Text variant="body-md" className="font-medium">
                {apiKey.name}
              </Text>
              <Box
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  apiKey.environment === "live"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {apiKey.environment}
              </Box>
            </Box>
            <Text variant="body-sm" className="font-mono text-content-secondary mb-2">
              {apiKey.keyPrefix}...
            </Text>
            <Box className="flex flex-wrap gap-1.5">
              {enabledPerms.map((perm) => (
                <Box
                  key={perm}
                  className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium"
                >
                  {perm}
                </Box>
              ))}
            </Box>
            <Box className="flex items-center gap-4 mt-2">
              <Text variant="caption" muted>
                Created{" "}
                {new Date(apiKey.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              {apiKey.lastUsedAt && (
                <Text variant="caption" muted>
                  Last used{" "}
                  {new Date(apiKey.lastUsedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              )}
              {apiKey.expiresAt && (
                <Text variant="caption" muted>
                  Expires{" "}
                  {new Date(apiKey.expiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              )}
            </Box>
          </Box>
          <Box className="flex items-center gap-2 flex-shrink-0">
            {apiKey.isActive ? (
              confirmRevoke ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRevoke(false)}
                  >
                    Cancel
                  </Button>
                  <Button variant="destructive" size="sm" onClick={onRevoke}>
                    Confirm Revoke
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRevoke(true)}
                >
                  Revoke
                </Button>
              )
            ) : (
              <Text variant="caption" className="text-red-600 font-medium">
                Revoked
              </Text>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

ApiKeyRow.displayName = "ApiKeyRow";

function CreateApiKeyForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    sendEmail: true,
    readEmail: true,
    manageDomains: false,
    manageApiKeys: false,
    manageWebhooks: false,
    viewAnalytics: true,
    manageAccount: false,
    manageTeamMembers: false,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePerm = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await apiKeysApi.create({
        name: name.trim(),
        permissions,
        environment,
      });
      onCreated(res.data.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <Text variant="heading-sm">Create API Key</Text>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 p-2 rounded bg-red-100 text-red-800 text-sm">
            {error}
          </div>
        )}
        <Box className="space-y-4">
          <Input
            label="Key Name"
            variant="text"
            placeholder="My App Production Key"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Box>
            <Text variant="label" className="mb-2">
              Environment
            </Text>
            <Box className="flex items-center gap-3">
              <Box
                as="button"
                type="button"
                className={`px-4 py-2 rounded text-sm font-medium border transition-colors ${
                  environment === "live"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-surface border-border text-content-secondary hover:border-green-300"
                }`}
                onClick={() => setEnvironment("live")}
              >
                Live
              </Box>
              <Box
                as="button"
                type="button"
                className={`px-4 py-2 rounded text-sm font-medium border transition-colors ${
                  environment === "test"
                    ? "bg-yellow-500 text-white border-yellow-500"
                    : "bg-surface border-border text-content-secondary hover:border-yellow-300"
                }`}
                onClick={() => setEnvironment("test")}
              >
                Test
              </Box>
            </Box>
          </Box>
          <Box>
            <Text variant="label" className="mb-2">
              Permissions
            </Text>
            <Box className="grid grid-cols-2 gap-2">
              {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                <Box
                  key={key}
                  as="button"
                  type="button"
                  className={`px-3 py-2 rounded text-sm font-medium border text-left transition-colors ${
                    permissions[key]
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-surface border-border text-content-secondary hover:border-brand-300"
                  }`}
                  onClick={() => togglePerm(key)}
                >
                  {label}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
          >
            {creating ? "Creating..." : "Create Key"}
          </Button>
        </Box>
      </CardFooter>
    </Card>
  );
}

CreateApiKeyForm.displayName = "CreateApiKeyForm";
