"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  PageLayout,
} from "@alecrae/ui";
import {
  mailMergeApi,
  type MailMergeCampaign,
  type MailMergeCampaignDetail,
  type MailMergeRecipientStatus,
} from "../../../lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Replace {{variable}} placeholders in text with values from a map. */
function resolveTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

/** Extract unique {{variable}} names from a string. */
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  const unique = new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")));
  return Array.from(unique);
}

/**
 * Parse CSV text into an array of recipient objects.
 * First row = header. Required column: email. All other columns become variables.
 */
interface ParsedRecipient {
  email: string;
  variables: Record<string, string>;
}

function parseCsv(text: string): ParsedRecipient[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const firstLine = lines[0];
  if (!firstLine) return [];
  const headers = firstLine.split(",").map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf("email");
  if (emailIdx === -1) return [];

  const results: ParsedRecipient[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    const email = cols[emailIdx]?.trim() ?? "";
    if (!email || !email.includes("@")) continue;
    const variables: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (j !== emailIdx && header) {
        variables[header] = cols[j]?.trim() ?? "";
      }
    }
    results.push({ email, variables });
  }
  return results;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: MailMergeCampaign["status"] | MailMergeRecipientStatus["status"];
}

function StatusBadge({ status }: StatusBadgeProps): React.ReactNode {
  const map: Record<string, string> = {
    draft: "bg-surface-secondary border border-border text-content-secondary",
    sending: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-surface-secondary border border-border text-content-tertiary",
    pending: "bg-yellow-100 text-yellow-800",
    sent: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    skipped: "bg-surface-secondary border border-border text-content-tertiary",
  };
  const cls = map[status] ?? "bg-surface-secondary text-content-secondary";
  return (
    <Box as="span" className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Box>
  );
}

// ─── Campaign Row ─────────────────────────────────────────────────────────────

interface CampaignRowProps {
  campaign: MailMergeCampaign;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
  deleting: boolean;
}

function CampaignRow({
  campaign,
  onSelect,
  onDelete,
  onCancel,
  deleting,
}: CampaignRowProps): React.ReactNode {
  return (
    <Box
      className="flex items-center gap-4 py-3 px-4 rounded-lg border border-border hover:border-border-strong hover:bg-surface-secondary/50 cursor-pointer transition-colors"
      onClick={() => onSelect(campaign.id)}
    >
      <Box className="flex-1 min-w-0">
        <Box className="flex items-center gap-2 mb-0.5">
          <Text variant="body-sm" className="font-medium truncate">
            {campaign.name}
          </Text>
          <StatusBadge status={campaign.status} />
        </Box>
        <Text variant="caption" muted className="truncate">
          {campaign.subject}
        </Text>
      </Box>
      <Box className="text-right flex-shrink-0">
        <Text variant="body-sm" className="text-content-secondary">
          {campaign.totalRecipients} recipients
        </Text>
        {campaign.totalRecipients > 0 && (
          <Text variant="caption" muted>
            {campaign.sentCount} sent &middot; {campaign.failedCount} failed
          </Text>
        )}
      </Box>
      <Box className="flex-shrink-0">
        <Text variant="caption" muted>
          {formatDate(campaign.createdAt)}
        </Text>
      </Box>
      <Box
        className="flex items-center gap-1 flex-shrink-0"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {campaign.status === "sending" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(campaign.id)}
          >
            Cancel
          </Button>
        )}
        {campaign.status === "draft" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(campaign.id)}
            disabled={deleting}
          >
            Delete
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ─── Recipient Preview Table ──────────────────────────────────────────────────

interface RecipientPreviewProps {
  recipients: ParsedRecipient[];
  subject: string;
  body: string;
}

function RecipientPreview({
  recipients,
  subject,
  body,
}: RecipientPreviewProps): React.ReactNode {
  const previewCount = Math.min(3, recipients.length);
  if (previewCount === 0) return null;

  return (
    <Box className="space-y-3">
      <Text variant="body-sm" className="font-medium text-content">
        Preview — first {previewCount} of {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
      </Text>
      {recipients.slice(0, previewCount).map((r, i) => (
        <Card key={i} className="border border-border">
          <CardContent className="py-3">
            <Box className="flex items-center gap-2 mb-2">
              <Text variant="caption" className="font-medium text-content-secondary uppercase tracking-wide">
                To:
              </Text>
              <Text variant="body-sm">{r.email}</Text>
            </Box>
            <Box className="flex items-start gap-2 mb-2">
              <Text variant="caption" className="font-medium text-content-secondary uppercase tracking-wide mt-0.5">
                Subject:
              </Text>
              <Text variant="body-sm" className="flex-1">
                {resolveTemplate(subject, r.variables)}
              </Text>
            </Box>
            {body && (
              <Box className="border-t border-border pt-2 mt-2">
                <Text
                  variant="caption"
                  className="text-content-secondary whitespace-pre-wrap"
                >
                  {resolveTemplate(body, r.variables).slice(0, 300)}
                  {resolveTemplate(body, r.variables).length > 300 ? "…" : ""}
                </Text>
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

// ─── Create Campaign Form ──────────────────────────────────────────────────────

interface CreateFormState {
  name: string;
  subject: string;
  body: string;
  csvText: string;
}

interface CreateCampaignFormProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateCampaignForm({
  onClose,
  onCreated,
}: CreateCampaignFormProps): React.ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateFormState>({
    name: "",
    subject: "",
    body: "",
    csvText: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const recipients = parseCsv(form.csvText);
  const bodyVariables = extractVariables(`${form.subject} ${form.body}`);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setCsvError("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        setForm((prev) => ({ ...prev, csvText: text }));
        setCsvError(null);
      }
    };
    reader.onerror = () => setCsvError("Failed to read file");
    reader.readAsText(file);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!form.name.trim()) {
      setError("Campaign name is required");
      return;
    }
    if (!form.subject.trim()) {
      setError("Subject line is required");
      return;
    }
    if (!form.body.trim()) {
      setError("Email body is required");
      return;
    }
    if (recipients.length === 0) {
      setError("Add at least one recipient via CSV");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Step 1: Create the campaign
      const createRes = await mailMergeApi.create({
        name: form.name.trim(),
        subject: form.subject.trim(),
        textBody: form.body.trim(),
      });
      const campaignId = createRes.data.id;

      // Step 2: Add recipients
      await mailMergeApi.addRecipients(
        campaignId,
        recipients.map((r) => ({ email: r.email, variables: r.variables })),
      );

      // Step 3: Start sending
      await mailMergeApi.start(campaignId);

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="space-y-5">
        <Box className="flex items-center justify-between">
          <Text variant="heading-sm">New Mail Merge Campaign</Text>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </Box>

        {error && (
          <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
          </Box>
        )}

        {/* Campaign Name */}
        <Input
          label="Campaign name"
          variant="text"
          placeholder="e.g. June outreach — {{company}} contacts"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />

        {/* Subject */}
        <Box>
          <Input
            label="Subject line"
            variant="text"
            placeholder="e.g. Hi {{firstName}}, a quick note from AlecRae"
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
          />
          <Text variant="caption" muted className="mt-1">
            Use {`{{firstName}}`}, {`{{company}}`}, etc. — they'll be replaced per recipient.
          </Text>
        </Box>

        {/* Body */}
        <Box>
          <Text variant="body-sm" className="mb-1 font-medium text-content">
            Email body
          </Text>
          <textarea
            className="w-full rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            rows={7}
            placeholder={"Hi {{firstName}},\n\nI wanted to reach out to you about {{company}}...\n\nBest,\nYour name"}
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
          />
          <Text variant="caption" muted className="mt-1">
            Placeholders: {`{{firstName}}`}, {`{{lastName}}`}, {`{{company}}`} — or any column from your CSV.
          </Text>
        </Box>

        {/* Detected variables */}
        {bodyVariables.length > 0 && (
          <Box>
            <Text variant="caption" muted className="mb-2">
              Detected placeholders:
            </Text>
            <Box className="flex flex-wrap gap-2">
              {bodyVariables.map((v) => (
                <Box
                  key={v}
                  className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5"
                >
                  <Text variant="caption" className="text-accent font-medium">
                    {`{{${v}}}`}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Recipients — CSV */}
        <Box>
          <Text variant="body-sm" className="mb-1 font-medium text-content">
            Recipients
          </Text>
          <Text variant="caption" muted className="mb-2">
            Upload a CSV file or paste CSV text below. First row must be a header with at minimum an <strong>email</strong> column. Additional columns become template variables.
          </Text>

          {/* File upload */}
          <Box className="flex items-center gap-3 mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={handleFileUpload}
              aria-label="Upload CSV file"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload CSV
            </Button>
            {form.csvText && recipients.length > 0 && (
              <Text variant="caption" className="text-green-700">
                {recipients.length} valid recipient{recipients.length !== 1 ? "s" : ""} loaded
              </Text>
            )}
            {csvError && (
              <Text variant="caption" className="text-red-700">
                {csvError}
              </Text>
            )}
          </Box>

          {/* Paste CSV */}
          <textarea
            className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            rows={5}
            placeholder={"email,firstName,lastName,company\njane@example.com,Jane,Doe,Acme Corp\njohn@example.com,John,Smith,Beta Inc"}
            value={form.csvText}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, csvText: e.target.value }));
              setCsvError(null);
            }}
            aria-label="Paste CSV data"
          />
          {form.csvText && recipients.length === 0 && (
            <Text variant="caption" className="text-red-700 mt-1">
              No valid recipients found. Ensure first row is a header with an <strong>email</strong> column.
            </Text>
          )}
        </Box>

        {/* Preview */}
        {recipients.length > 0 && form.subject && (
          <RecipientPreview
            recipients={recipients}
            subject={form.subject}
            body={form.body}
          />
        )}

        {/* Actions */}
        <Box className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => { void handleSubmit(); }}
            disabled={saving || recipients.length === 0 || !form.name || !form.subject || !form.body}
          >
            {saving ? "Creating & Sending…" : `Send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}`}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Campaign Detail View ──────────────────────────────────────────────────────

interface CampaignDetailProps {
  campaignId: string;
  onBack: () => void;
  onCancelled: () => void;
}

function CampaignDetail({
  campaignId,
  onBack,
  onCancelled,
}: CampaignDetailProps): React.ReactNode {
  const [campaign, setCampaign] = useState<MailMergeCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await mailMergeApi.get(campaignId);
      setCampaign(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while sending
  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const id = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(id);
  }, [campaign?.status, load]);

  const handleCancel = async (): Promise<void> => {
    if (!campaign) return;
    setCancelling(true);
    try {
      await mailMergeApi.cancel(campaign.id);
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel campaign");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <Box className="p-8 text-center">
        <Text variant="body-md" muted>Loading campaign…</Text>
      </Box>
    );
  }

  if (error || !campaign) {
    return (
      <Box className="p-8">
        <Text variant="body-md" className="text-red-700">
          {error ?? "Campaign not found"}
        </Text>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-4">
          Back
        </Button>
      </Box>
    );
  }

  const sentPct =
    campaign.totalRecipients > 0
      ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100)
      : 0;

  return (
    <Box className="space-y-6">
      {/* Header */}
      <Box className="flex items-start justify-between gap-4">
        <Box>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
            ← Back to campaigns
          </Button>
          <Box className="flex items-center gap-3">
            <Text variant="heading-md">{campaign.name}</Text>
            <StatusBadge status={campaign.status} />
          </Box>
          <Text variant="body-sm" muted className="mt-1">
            {campaign.subject}
          </Text>
        </Box>
        {campaign.status === "sending" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void handleCancel(); }}
            disabled={cancelling}
          >
            {cancelling ? "Cancelling…" : "Cancel Sending"}
          </Button>
        )}
      </Box>

      {error && (
        <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">{error}</Text>
        </Box>
      )}

      {/* Stats */}
      <Box className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: campaign.totalRecipients, cls: "" },
          { label: "Sent", value: campaign.sentCount, cls: "text-green-700" },
          { label: "Failed", value: campaign.failedCount, cls: "text-red-700" },
          { label: "Progress", value: `${sentPct}%`, cls: "" },
        ].map(({ label, value, cls }) => (
          <Card key={label}>
            <CardContent className="py-3 text-center">
              <Text variant="heading-md" className={cls}>
                {value}
              </Text>
              <Text variant="caption" muted>
                {label}
              </Text>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Progress bar */}
      {campaign.totalRecipients > 0 && campaign.status === "sending" && (
        <Box>
          <Box className="h-2 bg-surface-secondary rounded-full overflow-hidden">
            <Box
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${sentPct}%` }}
            />
          </Box>
          <Text variant="caption" muted className="mt-1">
            {campaign.sentCount} of {campaign.totalRecipients} sent — auto-refreshing every 5 seconds
          </Text>
        </Box>
      )}

      {/* Recipient table */}
      <Box>
        <Text variant="heading-sm" className="mb-3">
          Recipients ({campaign.recipients.length})
        </Text>
        {campaign.recipients.length === 0 ? (
          <Card>
            <CardContent>
              <Text variant="body-sm" muted>No recipients added yet.</Text>
            </CardContent>
          </Card>
        ) : (
          <Box className="rounded-lg border border-border overflow-hidden">
            <Box className="grid grid-cols-12 gap-3 px-4 py-2 bg-surface-secondary">
              <Box className="col-span-5">
                <Text variant="caption" className="font-medium text-content-secondary uppercase tracking-wide">
                  Email
                </Text>
              </Box>
              <Box className="col-span-4">
                <Text variant="caption" className="font-medium text-content-secondary uppercase tracking-wide">
                  Variables
                </Text>
              </Box>
              <Box className="col-span-3">
                <Text variant="caption" className="font-medium text-content-secondary uppercase tracking-wide">
                  Status
                </Text>
              </Box>
            </Box>
            <Box className="divide-y divide-border">
              {campaign.recipients.map((r, i) => (
                <Box key={i} className="grid grid-cols-12 gap-3 px-4 py-2.5 hover:bg-surface-secondary/50">
                  <Box className="col-span-5 flex items-center">
                    <Text variant="body-sm" className="truncate font-mono text-xs">
                      {r.email}
                    </Text>
                  </Box>
                  <Box className="col-span-4 flex items-center">
                    <Text variant="caption" muted className="truncate">
                      {Object.entries(r.variables)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                      {Object.keys(r.variables).length > 3 ? " …" : ""}
                    </Text>
                  </Box>
                  <Box className="col-span-3 flex items-center">
                    <StatusBadge status={r.status} />
                    {r.error && (
                      <Text variant="caption" className="text-red-700 ml-2 truncate" title={r.error}>
                        {r.error.slice(0, 40)}
                      </Text>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }): React.ReactNode {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Box className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mx-auto mb-4">
          <Text as="span" variant="heading-md" className="text-content-secondary">
            ✉
          </Text>
        </Box>
        <Text variant="heading-sm" className="mb-2">
          No campaigns yet
        </Text>
        <Text variant="body-sm" muted className="max-w-sm mx-auto mb-6">
          Mail Merge lets you send personalized emails to many recipients at once. Upload a CSV with names and companies, write your email once with{" "}
          <Box as="code" className="text-accent font-mono">
            {"{{variables}}"}
          </Box>
          , and AlecRae sends a unique version to each person.
        </Text>
        <Button variant="primary" size="md" onClick={onCreate}>
          Create your first campaign
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MailMergePage(): React.ReactNode {
  const [campaigns, setCampaigns] = useState<MailMergeCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCampaigns = useCallback(async (): Promise<void> => {
    try {
      const res = await mailMergeApi.list({ limit: 50 });
      setCampaigns(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await mailMergeApi.remove(id);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancel = async (id: string): Promise<void> => {
    try {
      await mailMergeApi.cancel(id);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel campaign");
    }
  };

  // Campaign detail view
  if (selectedId) {
    return (
      <PageLayout
        title="Mail Merge"
        description="Personalized mass emails from CSV data or your contacts."
      >
        <CampaignDetail
          campaignId={selectedId}
          onBack={() => {
            setSelectedId(null);
            void loadCampaigns();
          }}
          onCancelled={() => {
            setSelectedId(null);
            void loadCampaigns();
          }}
        />
      </PageLayout>
    );
  }

  const actions = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => setShowCreateForm(true)}
    >
      New Campaign
    </Button>
  );

  return (
    <PageLayout
      title="Mail Merge"
      description="Send personalized mass emails from CSV data or your contacts."
      actions={actions}
    >
      {error && (
        <Box className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">{error}</Text>
        </Box>
      )}

      {showCreateForm && (
        <CreateCampaignForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            void loadCampaigns();
          }}
        />
      )}

      {loading ? (
        <Box className="py-8 text-center">
          <Text variant="body-md" muted>Loading campaigns…</Text>
        </Box>
      ) : campaigns.length === 0 && !showCreateForm ? (
        <EmptyState onCreate={() => setShowCreateForm(true)} />
      ) : (
        <Box className="space-y-2">
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onSelect={setSelectedId}
              onDelete={(id) => { void handleDelete(id); }}
              onCancel={(id) => { void handleCancel(id); }}
              deleting={deletingId === c.id}
            />
          ))}
        </Box>
      )}
    </PageLayout>
  );
}
