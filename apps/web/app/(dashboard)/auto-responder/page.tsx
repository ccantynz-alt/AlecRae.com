"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  Input,
  PageLayout,
} from "@alecrae/ui";
import {
  autoResponderApi,
  type AutoResponder,
  type AutoResponderLogEntry,
  type AutoResponderMode,
} from "../../../lib/api";

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Pacific (US)" },
  { value: "America/Denver", label: "Mountain (US)" },
  { value: "America/Chicago", label: "Central (US)" },
  { value: "America/New_York", label: "Eastern (US)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
] as const;

const MODE_OPTIONS: { value: AutoResponderMode; label: string; description: string }[] = [
  {
    value: "off",
    label: "Off",
    description: "Auto-responder is disabled.",
  },
  {
    value: "vacation",
    label: "Vacation",
    description: "You are on vacation and will reply when you return.",
  },
  {
    value: "busy",
    label: "Busy",
    description: "You are available but response may be delayed.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Send a fully custom reply message.",
  },
];

// ─── Shared helpers ──────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}

ErrorBanner.displayName = "ErrorBanner";

function SuccessBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box className="mb-4 rounded-md border border-green-200 bg-green-50 p-3" role="status">
      <Text variant="body-sm" className="text-green-800">
        {message}
      </Text>
    </Box>
  );
}

SuccessBanner.displayName = "SuccessBanner";

function LoadingSkeleton(): React.ReactNode {
  return (
    <Box className="space-y-4" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
      ))}
    </Box>
  );
}

LoadingSkeleton.displayName = "LoadingSkeleton";

function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  id: string;
}): React.ReactNode {
  return (
    <Box>
      <Text
        as="label"
        variant="body-sm"
        className="mb-1 block font-medium text-content"
        // biome-ignore lint/a11y/noLabelWithoutControl: label targets via htmlFor
        htmlFor={id}
      >
        {label}
      </Text>
      <select
        id={id}
        className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Box>
  );
}

SelectField.displayName = "SelectField";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  id,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}): React.ReactNode {
  return (
    <Box className="flex items-start justify-between gap-4 py-2">
      <Box className="min-w-0 flex-1">
        <Text as="label" variant="body-sm" className="font-medium text-content cursor-pointer" htmlFor={id}>
          {label}
        </Text>
        {description && (
          <Text variant="caption" muted className="mt-0.5 block">
            {description}
          </Text>
        )}
      </Box>
      <Box
        as="button"
        role="switch"
        id={id}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
          checked ? "bg-accent" : "bg-surface-tertiary"
        }`}
      >
        <Box
          as="span"
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </Box>
    </Box>
  );
}

ToggleRow.displayName = "ToggleRow";

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box className="rounded-md border border-border overflow-hidden">
      <Box
        as="button"
        className="flex w-full items-center justify-between p-4 text-left hover:bg-surface-secondary transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <Text variant="body-sm" className="font-semibold text-content">
          {title}
        </Text>
        <Text variant="caption" className="text-content-tertiary">
          {open ? "▲" : "▼"}
        </Text>
      </Box>
      {open && (
        <Box className="border-t border-border p-4">
          {children}
        </Box>
      )}
    </Box>
  );
}

CollapsibleSection.displayName = "CollapsibleSection";

// ─── Status Banner ───────────────────────────────────────────────────────────

function StatusBanner({
  config,
  onActivate,
  onDeactivate,
  toggling,
}: {
  config: AutoResponder | null;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
  toggling: boolean;
}): React.ReactNode {
  const isActive = config?.isActive ?? false;
  const mode = config?.mode ?? "off";

  const modeLabel = MODE_OPTIONS.find((m) => m.value === mode)?.label ?? mode;

  return (
    <Card className={isActive ? "border-green-200 bg-green-50/50" : "border-border"}>
      <CardContent>
        <Box className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Box className="flex items-center gap-3">
            <Box
              className={`h-3 w-3 rounded-full flex-shrink-0 ${
                isActive ? "bg-status-success" : "bg-surface-tertiary"
              }`}
              aria-hidden="true"
            />
            <Box>
              <Text variant="heading-sm" className={isActive ? "text-green-800" : "text-content"}>
                Auto-Responder is {isActive ? "ON" : "OFF"}
              </Text>
              {config && (
                <Text variant="body-sm" muted className="mt-0.5">
                  Mode:{" "}
                  <Box
                    as="span"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      isActive ? "bg-green-100 text-green-700" : "bg-surface-secondary text-content-tertiary"
                    }`}
                  >
                    {modeLabel}
                  </Box>
                </Text>
              )}
            </Box>
          </Box>
          {config && (
            <Button
              variant={isActive ? "ghost" : "primary"}
              size="sm"
              onClick={isActive ? onDeactivate : onActivate}
              disabled={toggling}
              className={isActive ? "text-red-600 hover:bg-red-50" : ""}
            >
              {toggling ? "Working..." : isActive ? "Deactivate" : "Activate"}
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

StatusBanner.displayName = "StatusBanner";

// ─── Send Log ────────────────────────────────────────────────────────────────

function SendLog(): React.ReactNode {
  const [log, setLog] = useState<AutoResponderLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const res = await autoResponderApi.getLog({ limit: 25 });
      setLog(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load send log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <Card>
      <CardContent>
        <Box className="mb-4 flex items-center justify-between">
          <Text variant="heading-sm">Send Log</Text>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </Box>

        {error && <ErrorBanner message={error} />}

        {loading ? (
          <Box className="space-y-2" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Box key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
            ))}
          </Box>
        ) : log.length === 0 ? (
          <Box className="py-8 text-center">
            <Text variant="body-sm" muted>
              No auto-responses sent yet.
            </Text>
          </Box>
        ) : (
          <Box
            as="table"
            className="w-full text-sm"
            role="table"
            aria-label="Auto-responder send log"
          >
            <Box as="thead">
              <Box as="tr" className="border-b border-border">
                <Box as="th" className="pb-2 text-left font-medium text-content-tertiary pr-4">
                  To
                </Box>
                <Box as="th" className="pb-2 text-left font-medium text-content-tertiary pr-4">
                  Subject
                </Box>
                <Box as="th" className="pb-2 text-left font-medium text-content-tertiary">
                  Sent
                </Box>
              </Box>
            </Box>
            <Box as="tbody">
              {log.map((entry) => (
                <Box
                  as="tr"
                  key={entry.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <Box as="td" className="py-2.5 pr-4 text-content truncate max-w-[180px]">
                    {entry.toEmail}
                  </Box>
                  <Box as="td" className="py-2.5 pr-4 text-content truncate max-w-[220px]">
                    {entry.subject}
                  </Box>
                  <Box as="td" className="py-2.5 text-content-tertiary whitespace-nowrap">
                    {formatDate(entry.sentAt)}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

SendLog.displayName = "SendLog";

// ─── AI Preview ──────────────────────────────────────────────────────────────

function AIPreview(): React.ReactNode {
  const [sampleBody, setSampleBody] = useState("");
  const [previewReply, setPreviewReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async (): Promise<void> => {
    if (!sampleBody.trim()) return;
    setLoading(true);
    setError(null);
    setPreviewReply(null);
    try {
      const res = await autoResponderApi.preview(sampleBody.trim());
      setPreviewReply(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Box className="mb-3">
          <Text variant="heading-sm">AI Reply Preview</Text>
          <Text variant="body-sm" muted className="mt-0.5">
            Paste a sample incoming email to see how AlecRae AI would respond.
          </Text>
        </Box>

        {error && <ErrorBanner message={error} />}

        <Box className="space-y-3">
          <Box>
            <Text
              as="label"
              variant="body-sm"
              className="mb-1 block font-medium text-content"
              htmlFor="preview-sample-body"
            >
              Sample incoming email body
            </Text>
            <textarea
              id="preview-sample-body"
              className="w-full rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              rows={4}
              placeholder="Hi, I was wondering if you had time to discuss the project proposal..."
              value={sampleBody}
              onChange={(e) => setSampleBody(e.target.value)}
              aria-label="Sample email body for AI preview"
            />
          </Box>

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePreview}
            disabled={loading || !sampleBody.trim()}
          >
            {loading ? "Generating..." : "Preview AI Reply"}
          </Button>

          {previewReply && (
            <Box className="rounded-md border border-accent/30 bg-accent/5 p-4">
              <Text variant="body-sm" className="mb-1 font-semibold text-content">
                AI-generated reply:
              </Text>
              <Text variant="body-sm" className="whitespace-pre-wrap text-content-secondary">
                {previewReply}
              </Text>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

AIPreview.displayName = "AIPreview";

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AutoResponderPage(): React.ReactNode {
  // Config state
  const [config, setConfig] = useState<AutoResponder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [mode, setMode] = useState<AutoResponderMode>("vacation");
  const [subject, setSubject] = useState("");
  const [textBody, setTextBody] = useState("");

  // Schedule state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  // Rules state
  const [respondToContacts, setRespondToContacts] = useState(true);
  const [respondToUnknown, setRespondToUnknown] = useState(false);
  const [aiSmartReply, setAiSmartReply] = useState(false);
  const [excludeDomains, setExcludeDomains] = useState("");
  const [maxResponses, setMaxResponses] = useState("1");

  const populateFormFromConfig = useCallback((cfg: AutoResponder): void => {
    setMode(cfg.mode);
    setSubject(cfg.subject);
    setTextBody(cfg.textBody ?? "");
    if (cfg.schedule) {
      setStartDate(cfg.schedule.startDate.slice(0, 10));
      setEndDate(cfg.schedule.endDate ? cfg.schedule.endDate.slice(0, 10) : "");
      setTimezone(cfg.schedule.timezone);
    }
    if (cfg.rules) {
      setRespondToContacts(cfg.rules.respondToContacts);
      setRespondToUnknown(cfg.rules.respondToUnknown);
      setAiSmartReply(cfg.rules.aiSmartReply);
      setExcludeDomains(cfg.rules.excludeDomains?.join(", ") ?? "");
      setMaxResponses(String(cfg.rules.maxResponsesPerSender ?? 1));
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const res = await autoResponderApi.getConfig();
      setConfig(res.data);
      if (res.data) {
        populateFormFromConfig(res.data);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load auto-responder");
    } finally {
      setLoading(false);
    }
  }, [populateFormFromConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (): Promise<void> => {
    if (!subject.trim()) {
      setError("Reply subject is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const excludeDomainsArr = excludeDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      await autoResponderApi.upsert({
        mode,
        subject: subject.trim(),
        ...(textBody.trim() ? { textBody: textBody.trim() } : {}),
        ...(startDate
          ? {
              schedule: {
                startDate,
                ...(endDate ? { endDate } : {}),
                timezone,
              },
            }
          : {}),
        rules: {
          respondToContacts,
          respondToUnknown,
          aiSmartReply,
          ...(excludeDomainsArr.length > 0 ? { excludeDomains: excludeDomainsArr } : {}),
          maxResponsesPerSender: Number(maxResponses) || 1,
        },
      });
      setSuccess("Settings saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (): Promise<void> => {
    setToggling(true);
    setError(null);
    setSuccess(null);
    try {
      await autoResponderApi.activate();
      setSuccess("Auto-Responder activated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate auto-responder");
    } finally {
      setToggling(false);
    }
  };

  const handleDeactivate = async (): Promise<void> => {
    setToggling(true);
    setError(null);
    setSuccess(null);
    try {
      await autoResponderApi.deactivate();
      setSuccess("Auto-Responder deactivated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate auto-responder");
    } finally {
      setToggling(false);
    }
  };

  const selectedMode = MODE_OPTIONS.find((m) => m.value === mode);
  const bodyCharCount = textBody.length;

  return (
    <PageLayout
      title="Auto-Responder"
      description="Automatically reply to incoming email while you are away or busy."
    >
      <Box className="max-w-2xl space-y-6">
        {error && <ErrorBanner message={error} />}
        {success && <SuccessBanner message={success} />}

        {/* Status Banner */}
        <StatusBanner
          config={config}
          onActivate={handleActivate}
          onDeactivate={handleDeactivate}
          toggling={toggling}
        />

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Configuration Form */}
            <Card>
              <CardContent>
                <Text variant="heading-sm" className="mb-4">
                  Configuration
                </Text>

                <Box className="space-y-5">
                  {/* Mode selector */}
                  <Box>
                    <Text variant="body-sm" className="mb-2 font-medium text-content">
                      Mode
                    </Text>
                    <Box
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label="Auto-responder mode"
                    >
                      {MODE_OPTIONS.map((opt) => (
                        <Button
                          key={opt.value}
                          variant={mode === opt.value ? "secondary" : "ghost"}
                          size="sm"
                          role="radio"
                          aria-checked={mode === opt.value}
                          onClick={() => setMode(opt.value)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </Box>
                    {selectedMode && (
                      <Text variant="caption" muted className="mt-1.5 block">
                        {selectedMode.description}
                      </Text>
                    )}
                  </Box>

                  {/* Subject */}
                  <Input
                    label="Reply subject"
                    variant="text"
                    placeholder="e.g. Out of office until July 1"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />

                  {/* Message body */}
                  <Box>
                    <Box className="mb-1 flex items-center justify-between">
                      <Text variant="body-sm" className="font-medium text-content">
                        Message body
                      </Text>
                      <Text variant="caption" muted>
                        {bodyCharCount} chars
                      </Text>
                    </Box>
                    <textarea
                      id="auto-responder-body"
                      className="w-full rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      rows={5}
                      placeholder="I'm away until July 1 and will get back to you as soon as possible."
                      value={textBody}
                      onChange={(e) => setTextBody(e.target.value)}
                      aria-label="Auto-responder message body"
                    />
                  </Box>

                  {/* Schedule (collapsible) */}
                  <CollapsibleSection title="Schedule (optional)">
                    <Box className="space-y-4">
                      <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                          label="Start date"
                          variant="text"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                        <Input
                          label="End date (optional)"
                          variant="text"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </Box>
                      <SelectField
                        id="schedule-timezone"
                        label="Timezone"
                        value={timezone}
                        onChange={setTimezone}
                        options={TIMEZONES}
                      />
                    </Box>
                  </CollapsibleSection>

                  {/* Rules (collapsible) */}
                  <CollapsibleSection title="Reply rules">
                    <Box className="space-y-1 divide-y divide-border/50">
                      <ToggleRow
                        id="rule-respond-contacts"
                        label="Reply to contacts"
                        description="Send auto-replies to people in your contacts."
                        checked={respondToContacts}
                        onChange={setRespondToContacts}
                      />
                      <ToggleRow
                        id="rule-respond-unknown"
                        label="Reply to unknown senders"
                        description="Also send auto-replies to people not in your contacts."
                        checked={respondToUnknown}
                        onChange={setRespondToUnknown}
                      />
                      <ToggleRow
                        id="rule-ai-smart-reply"
                        label="AI smart reply"
                        description="Auto-generate contextual responses with AI based on the incoming email."
                        checked={aiSmartReply}
                        onChange={setAiSmartReply}
                      />
                      <Box className="pt-4 space-y-4">
                        <Input
                          label="Exclude domains (comma-separated)"
                          variant="text"
                          placeholder="noreply.com, marketing.example.com"
                          value={excludeDomains}
                          onChange={(e) => setExcludeDomains(e.target.value)}
                        />
                        <Input
                          label="Max responses per sender"
                          variant="text"
                          type="number"
                          value={maxResponses}
                          onChange={(e) => setMaxResponses(e.target.value)}
                        />
                      </Box>
                    </Box>
                  </CollapsibleSection>
                </Box>

                {/* Save button */}
                <Box className="mt-6 flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !subject.trim()}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  {!config && (
                    <Text variant="caption" muted>
                      Save first to enable activation.
                    </Text>
                  )}
                </Box>
              </CardContent>
            </Card>

            {/* AI Preview — only shown when AI smart reply is enabled */}
            {aiSmartReply && <AIPreview />}

            {/* Send Log */}
            <SendLog />
          </>
        )}
      </Box>
    </PageLayout>
  );
}
