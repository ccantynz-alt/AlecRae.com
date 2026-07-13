"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
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
  signaturesApi,
  type EmailSignature,
  type CreateSignaturePayload,
  type UpdateSignaturePayload,
} from "../../../../lib/api-signatures";

// ─── Small presentational helpers ────────────────────────────────────────────

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

function ErrorBanner({ message }: { message: string }): ReactNode {
  return (
    <Box
      className="mb-3 rounded border border-status-error/30 bg-status-error/10 p-2"
      role="alert"
    >
      <Text variant="body-sm" className="text-status-error">
        {message}
      </Text>
    </Box>
  );
}

ErrorBanner.displayName = "ErrorBanner";

// ─── Editor form (shared by create + edit) ───────────────────────────────────

interface SignatureFormValues {
  name: string;
  body: string;
  isDefault: boolean;
}

function SignatureForm({
  idPrefix,
  initial,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial: SignatureFormValues;
  saving: boolean;
  submitLabel: string;
  onSubmit: (values: SignatureFormValues) => void;
  onCancel: () => void;
}): ReactNode {
  const [name, setName] = useState(initial.name);
  const [body, setBody] = useState(initial.body);
  const [isDefault, setIsDefault] = useState(initial.isDefault);

  const nameId = `${idPrefix}-name`;
  const bodyId = `${idPrefix}-body`;
  const defaultId = `${idPrefix}-default`;

  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && !saving;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), body, isDefault });
  };

  return (
    <Box className="space-y-3 rounded-lg border border-border bg-surface-secondary p-4">
      <Box>
        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
        <Input
          id={nameId}
          variant="text"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setName(e.target.value)
          }
          placeholder="e.g. Work, Personal"
          disabled={saving}
        />
      </Box>

      <Box>
        <FieldLabel htmlFor={bodyId}>Signature</FieldLabel>
        <Box
          as="textarea"
          id={bodyId}
          value={body}
          onChange={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          rows={6}
          placeholder={
            "Best regards,\nJane Doe\nCEO, Acme Inc.\njane@acme.com"
          }
          disabled={saving}
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-content focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
        />
      </Box>

      <Box className="flex items-center gap-2">
        <Box
          as="input"
          type="checkbox"
          id={defaultId}
          checked={isDefault}
          onChange={(e) =>
            setIsDefault((e.target as HTMLInputElement).checked)
          }
          disabled={saving}
          className="h-4 w-4 rounded border-border text-brand-600 focus:ring-2 focus:ring-brand-500"
        />
        <Text as="label" htmlFor={defaultId} variant="body-sm">
          Set as default signature
        </Text>
      </Box>

      <Box className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {saving ? "Saving…" : submitLabel}
        </Button>
      </Box>
    </Box>
  );
}

SignatureForm.displayName = "SignatureForm";

// ─── A single signature row ──────────────────────────────────────────────────

function SignatureRow({
  signature,
  busy,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  signature: EmailSignature;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}): ReactNode {
  return (
    <Box className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <Box className="min-w-0 flex-1">
        <Box className="flex items-center gap-2">
          <Text variant="body-md" className="font-medium">
            {signature.name}
          </Text>
          {signature.isDefault && (
            <Box className="rounded bg-brand-50 px-1.5 py-0.5">
              <Text variant="caption" className="font-medium text-brand-700">
                Default
              </Text>
            </Box>
          )}
        </Box>
        <Text
          variant="body-sm"
          muted
          className="mt-1 line-clamp-2 whitespace-pre-line"
        >
          {signature.textContent}
        </Text>
      </Box>
      <Box className="flex shrink-0 items-center gap-1">
        {!signature.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetDefault}
            disabled={busy}
          >
            Set default
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy}
        >
          Delete
        </Button>
      </Box>
    </Box>
  );
}

SignatureRow.displayName = "SignatureRow";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SignaturesPage(): ReactNode {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await signaturesApi.list({ limit: 100 });
      setSignatures(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load signatures");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (values: SignatureFormValues): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const payload: CreateSignaturePayload = {
        name: values.name,
        htmlContent: values.body,
        textContent: values.body,
        isDefault: values.isDefault,
      };
      await signaturesApi.create(payload);
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create signature");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (
    id: string,
    values: SignatureFormValues,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const payload: UpdateSignaturePayload = {
        name: values.name,
        htmlContent: values.body,
        textContent: values.body,
        isDefault: values.isDefault,
      };
      await signaturesApi.update(id, payload);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update signature");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await signaturesApi.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete signature");
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await signaturesApi.setDefault(id);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set default signature",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageLayout
      title="Email Signatures"
      description="Create and manage signatures. Your default signature is auto-appended to new emails."
    >
      <Box className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <Box className="flex items-center justify-between gap-3">
              <Box>
                <Text variant="heading-sm">Signatures</Text>
                <Text variant="body-sm" muted>
                  {loading
                    ? "Loading…"
                    : `${signatures.length} signature${signatures.length === 1 ? "" : "s"}`}
                </Text>
              </Box>
              {!creating && editingId === null && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setCreating(true);
                    setError(null);
                  }}
                >
                  New signature
                </Button>
              )}
            </Box>
          </CardHeader>
          <CardContent>
            {error && <ErrorBanner message={error} />}

            {creating && (
              <Box className="mb-4">
                <SignatureForm
                  idPrefix="create"
                  initial={{
                    name: "",
                    body: "",
                    isDefault: signatures.length === 0,
                  }}
                  saving={saving}
                  submitLabel="Create"
                  onSubmit={handleCreate}
                  onCancel={() => {
                    setCreating(false);
                    setError(null);
                  }}
                />
              </Box>
            )}

            {loading ? (
              <Text variant="body-sm" muted>
                Loading signatures…
              </Text>
            ) : signatures.length === 0 && !creating ? (
              <Box className="py-6 text-center">
                <Text variant="body-md" className="mb-1 font-medium">
                  No signatures yet
                </Text>
                <Text variant="body-sm" muted>
                  Create your first signature to auto-append it to new emails.
                </Text>
              </Box>
            ) : (
              <Box className="space-y-2">
                {signatures.map((sig) =>
                  editingId === sig.id ? (
                    <SignatureForm
                      key={sig.id}
                      idPrefix={`edit-${sig.id}`}
                      initial={{
                        name: sig.name,
                        body: sig.textContent,
                        isDefault: sig.isDefault,
                      }}
                      saving={saving}
                      submitLabel="Update"
                      onSubmit={(values) => void handleUpdate(sig.id, values)}
                      onCancel={() => {
                        setEditingId(null);
                        setError(null);
                      }}
                    />
                  ) : (
                    <SignatureRow
                      key={sig.id}
                      signature={sig}
                      busy={busyId === sig.id}
                      onEdit={() => {
                        setEditingId(sig.id);
                        setCreating(false);
                        setError(null);
                      }}
                      onDelete={() => void handleDelete(sig.id)}
                      onSetDefault={() => void handleSetDefault(sig.id)}
                    />
                  ),
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </PageLayout>
  );
}

SignaturesPage.displayName = "SignaturesPage";
