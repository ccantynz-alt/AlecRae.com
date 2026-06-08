"use client";

/**
 * AlecRae — DPA Self-Serve Signing
 *
 * Enterprise/business customers can sign the Data Processing Agreement (GDPR
 * Art. 28) themselves instead of emailing legal@ for a countersigned copy.
 *
 * Flow:
 *   1. Fetch the current DPA version + canonical text + hash from the API.
 *   2. Present the exact text the signer is agreeing to.
 *   3. Capture signer identity (name, email, title, company).
 *   4. Re-verify the document hash client-side, then POST to /v1/dpa/sign.
 *   5. Confirm the tamper-evident signature (id, version, hash, timestamp).
 *
 * The human-readable DPA lives at /dpa; this page adds the signing workflow.
 */

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Box, Text, Card, CardContent, Button, Input } from "@alecrae/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CurrentDpa {
  version: string;
  documentText: string;
  documentHash: string;
}

interface SignatureConfirmation {
  id: string;
  signerName: string;
  signerEmail: string;
  signerTitle: string;
  companyName: string;
  dpaVersion: string;
  documentHash: string;
  signedAt: string;
}

type LoadState = "loading" | "ready" | "unavailable";

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("alecrae_access_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

export default function DpaSignPage(): React.ReactElement {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [dpa, setDpa] = useState<CurrentDpa | null>(null);
  const [signerName, setSignerName] = useState<string>("");
  const [signerEmail, setSignerEmail] = useState<string>("");
  const [signerTitle, setSignerTitle] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [agreed, setAgreed] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SignatureConfirmation | null>(null);

  const loadCurrent = useCallback(async (): Promise<void> => {
    setLoadState("loading");
    try {
      const res = await fetch(`${API_BASE}/v1/dpa/current`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        setLoadState("unavailable");
        return;
      }
      const json = (await res.json()) as { data: CurrentDpa };
      setDpa(json.data);
      setLoadState("ready");
    } catch {
      setLoadState("unavailable");
    }
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      if (!dpa) return;
      setError(null);
      setSubmitting(true);
      try {
        // Re-verify the presented text hashes to what the server reported,
        // so we sign exactly what is on screen.
        const localHash = await sha256Hex(dpa.documentText);
        if (localHash !== dpa.documentHash) {
          setError("The agreement text could not be verified. Please reload and try again.");
          setSubmitting(false);
          return;
        }

        const res = await fetch(`${API_BASE}/v1/dpa/sign`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            signerName,
            signerEmail,
            signerTitle,
            companyName,
            dpaVersion: dpa.version,
            documentHash: dpa.documentHash,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (res.status === 201) {
          const json = (await res.json()) as { data: SignatureConfirmation };
          setConfirmation(json.data);
          setSubmitting(false);
          return;
        }

        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        if (res.status === 401) {
          setError("You must be signed in to your AlecRae account to sign the DPA.");
        } else if (res.status === 409) {
          setError(json?.error?.message ?? "This account has already signed the current DPA.");
        } else {
          setError(json?.error?.message ?? "Could not record your signature. Please try again.");
        }
      } catch {
        setError("Could not reach the signing service. Please try again shortly.");
      }
      setSubmitting(false);
    },
    [dpa, signerName, signerEmail, signerTitle, companyName],
  );

  const canSubmit =
    !submitting &&
    agreed &&
    signerName.trim().length > 0 &&
    signerEmail.trim().length > 0 &&
    signerTitle.trim().length > 0 &&
    companyName.trim().length > 0;

  return (
    <Box className="max-w-4xl mx-auto">
      <Box className="mb-8">
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Sign the Data Processing Agreement
        </Text>
        <Text className="text-content-tertiary">
          Self-serve, tamper-evident signing for AlecRae business customers.
        </Text>
        <Box as="a" href="/dpa" className="inline-block mt-3">
          <Text as="span" className="text-sm text-brand-600 hover:text-brand-700">
            Read the full agreement
          </Text>
        </Box>
      </Box>

      {confirmation ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-6">
            <Text as="h2" className="text-xl font-bold text-content mb-3">
              Signature recorded
            </Text>
            <Text className="text-content-secondary mb-4">
              Thank you, {confirmation.signerName}. Your acceptance of the DPA has been
              recorded as a tamper-evident audit record.
            </Text>
            <Box className="space-y-2 text-sm">
              <DetailRow label="Signature ID" value={confirmation.id} />
              <DetailRow label="Signer" value={`${confirmation.signerName} (${confirmation.signerTitle})`} />
              <DetailRow label="Email" value={confirmation.signerEmail} />
              <DetailRow label="Company" value={confirmation.companyName} />
              <DetailRow label="DPA version" value={confirmation.dpaVersion} />
              <DetailRow label="Document hash (SHA-256)" value={confirmation.documentHash} />
              <DetailRow
                label="Signed at"
                value={new Date(confirmation.signedAt).toLocaleString()}
              />
            </Box>
          </CardContent>
        </Card>
      ) : loadState === "loading" ? (
        <Card>
          <CardContent className="p-6">
            <Text className="text-content-secondary">Loading the current agreement…</Text>
          </CardContent>
        </Card>
      ) : loadState === "unavailable" ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-6">
            <Text as="h2" className="text-lg font-semibold text-content mb-2">
              Signing is temporarily unavailable
            </Text>
            <Text className="text-content-secondary mb-4">
              We could not reach the signing service. You can still review the full DPA, or
              request a countersigned copy from our legal team.
            </Text>
            <Box className="flex gap-3">
              <Button onClick={() => void loadCurrent()} variant="secondary">
                Try again
              </Button>
              <Box as="a" href="mailto:legal@alecrae.com">
                <Button variant="outline">Email legal@alecrae.com</Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ) : dpa ? (
        <Box className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <Box className="border-b border-border p-4 bg-surface-secondary flex items-center justify-between">
                <Text className="font-semibold text-content">Agreement text</Text>
                <Text as="span" className="text-xs text-content-tertiary">
                  Version {dpa.version}
                </Text>
              </Box>
              <Box
                as="pre"
                className="p-4 text-sm text-content-secondary whitespace-pre-wrap font-sans max-h-96 overflow-auto"
                tabIndex={0}
                aria-label="Data Processing Agreement text"
              >
                {dpa.documentText}
              </Box>
              <Box className="border-t border-border p-3">
                <Text as="span" className="text-xs text-content-tertiary break-all">
                  Document hash (SHA-256): {dpa.documentHash}
                </Text>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Text as="h2" className="text-lg font-semibold text-content mb-4">
                Signer details
              </Text>
              <Box
                as="form"
                onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)}
                className="space-y-4"
              >
                <Input
                  label="Full name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.currentTarget.value)}
                  required
                  autoComplete="name"
                />
                <Input
                  label="Work email"
                  variant="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.currentTarget.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  label="Job title"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.currentTarget.value)}
                  required
                  autoComplete="organization-title"
                />
                <Input
                  label="Company (legal entity)"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.currentTarget.value)}
                  required
                  autoComplete="organization"
                />

                <Box as="label" className="flex items-start gap-3 cursor-pointer">
                  <Box
                    as="input"
                    type="checkbox"
                    checked={agreed}
                    onChange={(e: FormEvent<HTMLInputElement>) =>
                      setAgreed(e.currentTarget.checked)
                    }
                    className="mt-1 h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                  />
                  <Text as="span" className="text-sm text-content-secondary">
                    I am authorized to bind the company named above, and I agree to the Data
                    Processing Agreement (version {dpa.version}) as presented above.
                  </Text>
                </Box>

                {error && (
                  <Box className="rounded-md border border-status-error/40 bg-status-error/5 p-3">
                    <Text as="span" className="text-sm text-status-error">
                      {error}
                    </Text>
                  </Box>
                )}

                <Button type="submit" disabled={!canSubmit} loading={submitting}>
                  Sign agreement
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      ) : null}
    </Box>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Box className="flex flex-col sm:flex-row sm:gap-2">
      <Text as="span" className="font-semibold text-content min-w-48">
        {label}
      </Text>
      <Text as="span" className="text-content-secondary break-all">
        {value}
      </Text>
    </Box>
  );
}
