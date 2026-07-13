"use client";

/**
 * AlecRae — Enterprise SSO / SAML 2.0 configuration
 *
 * Owner/admin-oriented, enterprise-tier surface for configuring SAML 2.0
 * single sign-on. Wired to apps/api/src/routes/sso.ts (mounted at /v1/sso):
 *   - Shows the copyable Service Provider (SP) metadata your Identity Provider
 *     needs (metadata URL, ACS URL, SLO URL, plus the full EntityDescriptor XML).
 *   - Lets an admin enter the IdP config (Entity ID, SSO URL, SLO URL, signing
 *     certificate), enable/disable SSO, and test the connection.
 *
 * Gated behind the Team plan via PlanGate (the closest enterprise-ish key in
 * the current plan tier system; SSO is sold as a Team/Enterprise capability).
 * Also role-gated: only the account owner or an admin may view/edit.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Box, Text, Button, Card, CardContent, Input } from "@alecrae/ui";
import { authApi } from "../../../../lib/api";
import { PlanGate } from "../../../../components/plan-gate";
import { ssoApi, type SsoConfigView } from "../../../../lib/api-sso";

export default function SsoSettingsPage(): ReactNode {
  const [role, setRole] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    authApi
      .me()
      .then((res) => {
        setRole(res.data.role);
        setAccountId(res.data.accountId);
      })
      .catch(() => {
        setRole(null);
        setAccountId(null);
      })
      .finally(() => setRoleChecked(true));
  }, []);

  if (!roleChecked) {
    return <CenteredNote title="Loading SSO settings…" />;
  }

  const isAdmin = role === "owner" || role === "admin";
  if (!isAdmin) {
    return (
      <CenteredNote
        title="Admin access required"
        body="Only the account owner or an admin can configure single sign-on. Contact your owner if you need access."
      />
    );
  }

  return (
    <Box className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
      <Box className="mb-6">
        <Text variant="display-sm" className="mb-1">
          Single Sign-On
        </Text>
        <Text variant="body-md" muted>
          Connect your identity provider with SAML 2.0. Owner / admin only.
        </Text>
      </Box>

      <PlanGate feature="sso" required="team">
        <SsoConfigurator accountId={accountId} />
      </PlanGate>
    </Box>
  );
}

SsoSettingsPage.displayName = "SsoSettingsPage";

// ─── Shared bits ──────────────────────────────────────────────────────────────

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

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}): ReactNode {
  const cls =
    tone === "error"
      ? "text-status-error"
      : tone === "success"
        ? "text-status-success"
        : "text-content-secondary";
  return (
    <Box role={tone === "error" ? "alert" : undefined} className="py-1">
      <Text variant="body-sm" className={cls}>
        {children}
      </Text>
    </Box>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

// ─── Copyable field ───────────────────────────────────────────────────────────

function CopyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}): ReactNode {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <Box className="mb-4">
      <Box className="flex items-center justify-between mb-1">
        <Text variant="caption" muted className="block">
          {label}
        </Text>
        <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </Box>
      {multiline ? (
        <Box
          as="pre"
          className="max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 text-content text-caption font-mono whitespace-pre-wrap break-all"
        >
          {value}
        </Box>
      ) : (
        <Box
          as="code"
          className="block rounded-lg border border-border bg-surface px-3 py-2 text-content text-body-sm font-mono break-all"
        >
          {value}
        </Box>
      )}
    </Box>
  );
}

// ─── Configurator ─────────────────────────────────────────────────────────────

function SsoConfigurator({ accountId }: { accountId: string | null }): ReactNode {
  // Config load state
  const [config, setConfig] = useState<SsoConfigView | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // SP metadata state
  const [metadataXml, setMetadataXml] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Form state
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [sloUrl, setSloUrl] = useState("");
  const [certificate, setCertificate] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Save / test state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const loadConfig = useCallback((): void => {
    setLoadError(null);
    ssoApi
      .getConfig()
      .then((res) => {
        setConfig(res.data);
        if (res.data) {
          setEntityId(res.data.entityId);
          setSsoUrl(res.data.ssoUrl);
          setSloUrl(res.data.sloUrl);
          setEnabled(res.data.enabled);
        }
      })
      .catch((e: unknown) => setLoadError(errMsg(e)))
      .finally(() => setConfigLoaded(true));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    ssoApi
      .metadata()
      .then((xml) => setMetadataXml(xml))
      .catch((e: unknown) => setMetadataError(errMsg(e)));
  }, []);

  const save = useCallback(async (): Promise<void> => {
    setSaveError(null);
    setSaveOk(null);
    setTestResult(null);

    if (!entityId.trim() || !ssoUrl.trim() || !sloUrl.trim()) {
      setSaveError("Entity ID, SSO URL and SLO URL are all required.");
      return;
    }
    // The backend keeps the existing certificate on read (never returns it), so
    // require a certificate on first setup, but allow re-saving without
    // re-pasting it once one is already configured.
    if (!certificate.trim() && !config?.certificateConfigured) {
      setSaveError("Paste your identity provider's signing certificate (PEM).");
      return;
    }

    setSaving(true);
    try {
      // If no new certificate was entered but one is already configured, the
      // server requires a non-empty certificate; there is no read-back, so we
      // cannot resend the old one. Guard the user toward re-pasting it.
      if (!certificate.trim() && config?.certificateConfigured) {
        setSaveError(
          "A certificate is already configured but cannot be shown for security. Re-paste the certificate to save other changes.",
        );
        setSaving(false);
        return;
      }

      await ssoApi.updateConfig({
        entityId: entityId.trim(),
        ssoUrl: ssoUrl.trim(),
        sloUrl: sloUrl.trim(),
        certificate: certificate.trim(),
        enabled,
      });
      setSaveOk("SSO configuration saved.");
      setCertificate("");
      loadConfig();
    } catch (e) {
      setSaveError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [entityId, ssoUrl, sloUrl, certificate, enabled, config, loadConfig]);

  const test = useCallback(async (): Promise<void> => {
    setTestResult(null);
    if (!accountId) {
      setTestResult({ tone: "error", message: "No account context available." });
      return;
    }
    setTesting(true);
    try {
      const res = await ssoApi.testConnection(accountId);
      setTestResult({
        tone: "success",
        message: res.data.redirectUrl
          ? "Connection OK — the identity provider redirect URL was built successfully."
          : "Connection OK.",
      });
    } catch (e) {
      setTestResult({ tone: "error", message: errMsg(e) });
    } finally {
      setTesting(false);
    }
  }, [accountId]);

  return (
    <Box className="space-y-6">
      {/* Service Provider metadata */}
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-1">
            Service Provider details
          </Text>
          <Text variant="body-sm" muted className="mb-4 block">
            Give these to your identity provider (Okta, Entra ID, OneLogin, etc.)
            when creating the SAML application.
          </Text>

          <CopyField label="SP metadata URL" value={ssoApi.metadataUrl()} />
          <CopyField label="Assertion Consumer Service (ACS) URL" value={ssoApi.acsUrl()} />
          <CopyField label="Single Logout (SLO) URL" value={ssoApi.sloUrl()} />

          {metadataError ? (
            <Notice tone="error">Could not load metadata XML: {metadataError}</Notice>
          ) : metadataXml ? (
            <CopyField label="SP metadata XML" value={metadataXml} multiline />
          ) : (
            <Notice tone="info">Loading metadata XML…</Notice>
          )}
        </CardContent>
      </Card>

      {/* Identity Provider configuration */}
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-1">
            Identity Provider configuration
          </Text>
          <Text variant="body-sm" muted className="mb-4 block">
            Paste the values from your identity provider&apos;s SAML application.
          </Text>

          {!configLoaded ? (
            <Notice tone="info">Loading current configuration…</Notice>
          ) : loadError ? (
            <Box>
              <Notice tone="error">{loadError}</Notice>
              <Button variant="secondary" size="sm" onClick={loadConfig}>
                Retry
              </Button>
            </Box>
          ) : (
            <Box className="space-y-4">
              {config === null && (
                <Notice tone="info">
                  SSO has not been configured yet. Fill in the fields below to enable it.
                </Notice>
              )}

              <Box>
                <Text variant="caption" muted className="mb-1 block">
                  IdP Entity ID
                </Text>
                <Input
                  value={entityId}
                  onChange={(e) => setEntityId((e.target as HTMLInputElement).value)}
                  placeholder="https://idp.example.com/entity"
                  aria-label="Identity provider entity ID"
                />
              </Box>

              <Box>
                <Text variant="caption" muted className="mb-1 block">
                  IdP SSO URL (sign-in endpoint)
                </Text>
                <Input
                  value={ssoUrl}
                  onChange={(e) => setSsoUrl((e.target as HTMLInputElement).value)}
                  placeholder="https://idp.example.com/sso/saml"
                  aria-label="Identity provider SSO URL"
                />
              </Box>

              <Box>
                <Text variant="caption" muted className="mb-1 block">
                  IdP SLO URL (sign-out endpoint)
                </Text>
                <Input
                  value={sloUrl}
                  onChange={(e) => setSloUrl((e.target as HTMLInputElement).value)}
                  placeholder="https://idp.example.com/slo/saml"
                  aria-label="Identity provider SLO URL"
                />
              </Box>

              <Box>
                <Box className="flex items-center justify-between mb-1">
                  <Text variant="caption" muted className="block">
                    Signing certificate (PEM / base64)
                  </Text>
                  {config?.certificateConfigured && (
                    <Text variant="caption" className="text-status-success">
                      Certificate on file
                    </Text>
                  )}
                </Box>
                <Box
                  as="textarea"
                  value={certificate}
                  onChange={(e) => setCertificate((e.target as HTMLTextAreaElement).value)}
                  placeholder={
                    config?.certificateConfigured
                      ? "A certificate is already configured (hidden). Re-paste to change it."
                      : "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----"
                  }
                  aria-label="Identity provider signing certificate"
                  rows={6}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-content text-body-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </Box>

              <Box className="flex items-center gap-2">
                <Box
                  as="input"
                  type="checkbox"
                  id="sso-enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
                  className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-400"
                />
                <Text as="label" htmlFor="sso-enabled" variant="body-sm">
                  Enable SSO for this workspace
                </Text>
              </Box>

              {saveError && <Notice tone="error">{saveError}</Notice>}
              {saveOk && <Notice tone="success">{saveOk}</Notice>}
              {testResult && <Notice tone={testResult.tone}>{testResult.message}</Notice>}

              <Box className="flex flex-wrap items-center gap-3 pt-2">
                <Button variant="primary" size="md" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save configuration"}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={test}
                  disabled={testing || !config?.enabled}
                >
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                {!config?.enabled && (
                  <Text variant="caption" muted>
                    Enable and save SSO before testing the connection.
                  </Text>
                )}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

SsoConfigurator.displayName = "SsoConfigurator";
