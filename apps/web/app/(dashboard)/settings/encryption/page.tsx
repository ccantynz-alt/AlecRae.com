"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../../components/plan-gate";
import {
  encryptionApi,
  generateClientKeypair,
  hasStoredPrivateKey,
  storePrivateKey,
  type EncryptionStatus,
} from "../../../../lib/api-encryption";

// The private key is per-origin in IndexedDB (one browser profile = one user
// device), so a stable key is sufficient and keeps the key off the wire.
const LOCAL_KEY = "primary";

// The server schema requires a passphrase (min 8). In the zero-knowledge flow
// the browser-held key is the real one, so we hand the endpoint a throwaway.
function generateThrowawayPassphrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type LoadState = "loading" | "ready" | "error";

export default function EncryptionSettingsPage(): React.ReactNode {
  return (
    <PageLayout
      title="End-to-End Encryption"
      description="Zero-knowledge encryption for your email. Your private key never leaves this device."
    >
      <Box className="max-w-3xl">
        <PlanGate feature="e2e_encryption" required="personal">
          <EncryptionPanel />
        </PlanGate>
      </Box>
    </PageLayout>
  );
}

function EncryptionPanel(): React.ReactNode {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [hasLocalKey, setHasLocalKey] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");

  const [generating, setGenerating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>("");
  const [justEnabled, setJustEnabled] = useState<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadState("loading");
    setLoadError("");
    try {
      const [statusRes, localKey] = await Promise.all([
        encryptionApi.status(),
        hasStoredPrivateKey(LOCAL_KEY).catch(() => false),
      ]);
      setStatus(statusRes.data);
      setHasLocalKey(localKey);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load encryption status.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEnable = useCallback(async (): Promise<void> => {
    setGenerating(true);
    setActionError("");
    setJustEnabled(false);
    try {
      // 1. Generate the RSA-OAEP-4096 keypair client-side.
      const keypair = await generateClientKeypair();
      // 2. Persist the private key locally FIRST (never uploaded).
      await storePrivateKey(LOCAL_KEY, keypair.privateKey);
      // 3. Publish the public key (+ throwaway passphrase to satisfy schema).
      await encryptionApi.generateKeys(generateThrowawayPassphrase());
      setHasLocalKey(true);
      setJustEnabled(true);
      // 4. Refresh server-reported status.
      const statusRes = await encryptionApi.status();
      setStatus(statusRes.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to enable encryption.");
    } finally {
      setGenerating(false);
    }
  }, []);

  if (loadState === "loading") {
    return (
      <Card>
        <CardContent>
          <Box className="py-8 text-center" role="status" aria-live="polite">
            <Text variant="body-sm" muted>
              Loading encryption status…
            </Text>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card>
        <CardHeader>
          <Text variant="heading-sm">End-to-End Encryption</Text>
        </CardHeader>
        <CardContent>
          <Box
            className="rounded-lg border border-status-error/30 bg-status-error/5 p-4"
            role="alert"
          >
            <Text variant="body-sm" className="text-status-error">
              {loadError}
            </Text>
          </Box>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const serverEnabled = status?.enabled ?? false;
  const fullyEnabled = serverEnabled && hasLocalKey;

  return (
    <Box className="space-y-6">
      <StatusCard
        status={status}
        hasLocalKey={hasLocalKey}
        fullyEnabled={fullyEnabled}
      />

      <Card>
        <CardHeader>
          <Text variant="heading-sm">
            {fullyEnabled ? "Encryption is active" : "Enable encryption"}
          </Text>
          <Text variant="body-sm" muted>
            {status?.algorithm ?? "RSA-OAEP-4096 + AES-256-GCM"}
          </Text>
        </CardHeader>
        <CardContent>
          {fullyEnabled ? (
            <Box className="space-y-2">
              <Text variant="body-sm">
                Emails you send to other AlecRae users who have keys are encrypted
                automatically. Your private key is stored only in this browser and
                never touches our servers.
              </Text>
            </Box>
          ) : (
            <Box className="space-y-3">
              {serverEnabled && !hasLocalKey && (
                <Box
                  className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-4"
                  role="alert"
                >
                  <Text variant="body-sm" className="font-medium">
                    A public key is published for your account, but this browser
                    has no matching private key.
                  </Text>
                  <Text variant="body-sm" muted>
                    Generating new keys here will replace the published public key.
                    Emails encrypted to your old key will no longer be readable.
                  </Text>
                </Box>
              )}
              <Text variant="body-sm">
                Generate an encryption keypair to turn on zero-knowledge email
                encryption. The keypair is created inside your browser: the public
                key is published so others can encrypt to you, and the private key
                is stored securely on this device and never uploaded.
              </Text>
            </Box>
          )}

          {actionError && (
            <Box className="mt-4 rounded-lg border border-status-error/30 bg-status-error/5 p-4" role="alert">
              <Text variant="body-sm" className="text-status-error">
                {actionError}
              </Text>
            </Box>
          )}
          {justEnabled && (
            <Box className="mt-4 rounded-lg border border-status-success/30 bg-status-success/5 p-4" role="status" aria-live="polite">
              <Text variant="body-sm" className="text-status-success">
                Encryption enabled. Your private key is stored on this device.
              </Text>
            </Box>
          )}
        </CardContent>
        {!fullyEnabled && (
          <CardFooter>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleEnable()}
              loading={generating}
              disabled={generating}
            >
              {generating
                ? "Generating keys…"
                : serverEnabled
                  ? "Regenerate keys on this device"
                  : "Generate encryption keys"}
            </Button>
          </CardFooter>
        )}
      </Card>

      <HowItWorksCard />

      <Box>
        <Link
          href={"/settings" as Route}
          className="text-brand-600 hover:text-brand-700 text-sm font-medium"
        >
          ← Back to Settings
        </Link>
      </Box>
    </Box>
  );
}

function StatusCard({
  status,
  hasLocalKey,
  fullyEnabled,
}: {
  status: EncryptionStatus | null;
  hasLocalKey: boolean;
  fullyEnabled: boolean;
}): React.ReactNode {
  const label = fullyEnabled
    ? "Active"
    : status?.enabled
      ? "Key mismatch"
      : "Not set up";
  const tone = fullyEnabled
    ? "text-status-success"
    : status?.enabled
      ? "text-status-warning"
      : "text-content-tertiary";
  const dot = fullyEnabled
    ? "bg-status-success"
    : status?.enabled
      ? "bg-status-warning"
      : "bg-content-tertiary";

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Status</Text>
      </CardHeader>
      <CardContent>
        <Box className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Box>
            <Text variant="body-sm" muted>
              Encryption
            </Text>
            <Box className="mt-1 flex items-center gap-2">
              <Box
                as="span"
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${dot}`}
              />
              <Text variant="body-md" className={`font-medium ${tone}`}>
                {label}
              </Text>
            </Box>
          </Box>
          <Box>
            <Text variant="body-sm" muted>
              Private key (this device)
            </Text>
            <Text variant="body-md" className="mt-1 font-medium">
              {hasLocalKey ? "Present" : "Not on this device"}
            </Text>
          </Box>
          <Box>
            <Text variant="body-sm" muted>
              Keys created
            </Text>
            <Text variant="body-md" className="mt-1 font-medium">
              {status?.keyCreatedAt
                ? new Date(status.keyCreatedAt).toLocaleDateString()
                : "—"}
            </Text>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function HowItWorksCard(): React.ReactNode {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">How zero-knowledge encryption works</Text>
      </CardHeader>
      <CardContent>
        <Box as="ul" className="space-y-3 pl-0">
          <HowItWorksItem>
            Your keypair is generated inside your browser with the Web Crypto API
            (RSA-OAEP-4096). No key material is ever generated on our servers.
          </HowItWorksItem>
          <HowItWorksItem>
            Only your public key is uploaded. Anyone can use it to encrypt email
            to you, but it cannot decrypt anything.
          </HowItWorksItem>
          <HowItWorksItem>
            Your private key stays on this device, stored in the browser&apos;s
            IndexedDB. We never see it, so we can never read your encrypted mail.
          </HowItWorksItem>
          <HowItWorksItem>
            Because the private key is device-local, you will need to enable
            encryption again on each browser or device you use.
          </HowItWorksItem>
        </Box>
      </CardContent>
    </Card>
  );
}

function HowItWorksItem({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <Box as="li" className="flex gap-3">
      <Box
        as="span"
        aria-hidden="true"
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
      />
      <Text variant="body-sm" muted>
        {children}
      </Text>
    </Box>
  );
}
