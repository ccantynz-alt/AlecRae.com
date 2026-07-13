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
import { PlanGate } from "../../../components/plan-gate";
import {
  programsApi,
  type Program,
  type ProgramRun,
  type ProgramRunAction,
  type ProgramTrigger,
  type ProgramTestResponse,
} from "../../../lib/api-programs";

// ─── Constants ───────────────────────────────────────────────────────────────

const STARTER_CODE = `export default (email, actions) => {
  // Auto-file receipts from Stripe.
  if (email.from.email.endsWith("@stripe.com")) {
    actions.label("Receipts");
    actions.archive();
  }
};
`;

const TRIGGER_OPTIONS: { value: ProgramTrigger; label: string }[] = [
  { value: "email.received", label: "Email received" },
  { value: "email.sent", label: "Email sent" },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Describe a captured action defensively — only `type` is guaranteed. */
function describeAction(action: ProgramRunAction): string {
  const detail =
    typeof action["name"] === "string"
      ? ` "${action["name"]}"`
      : typeof action["to"] === "string"
        ? ` → ${action["to"]}`
        : typeof action["until"] === "string"
          ? ` until ${action["until"]}`
          : "";
  return `${action.type}${detail}`;
}

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

function LoadingSkeleton(): React.ReactNode {
  return (
    <Box className="space-y-4" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="h-24 animate-pulse rounded-lg bg-surface-secondary" />
      ))}
    </Box>
  );
}

LoadingSkeleton.displayName = "LoadingSkeleton";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProgramsPage(): React.ReactNode {
  return (
    <PageLayout
      title="Programs"
      description="Programmable email — TypeScript snippets that run in a secure sandbox on every message. Apps Script, but type-safe."
    >
      <PlanGate feature="programs" required="pro">
        <ProgramsManager />
      </PlanGate>
    </PageLayout>
  );
}

function ProgramsManager(): React.ReactNode {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await programsApi.list();
      setPrograms(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load programs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = (program: Program): void => {
    setPrograms((prev) => [program, ...prev]);
    setCreating(false);
    setSelectedId(program.id);
  };

  const handleUpdated = (program: Program): void => {
    setPrograms((prev) => prev.map((p) => (p.id === program.id ? program : p)));
  };

  const handleDeleted = (id: string): void => {
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  if (loading) return <LoadingSkeleton />;

  const selected = programs.find((p) => p.id === selectedId) ?? null;

  if (selected) {
    return (
      <ProgramDetail
        program={selected}
        onBack={() => setSelectedId(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    );
  }

  return (
    <Box className="space-y-6">
      {error && <ErrorBanner message={error} />}

      <Box className="flex items-center justify-between">
        <Text variant="body-sm" muted>
          {programs.length} program{programs.length !== 1 ? "s" : ""}
        </Text>
        {!creating && (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            New Program
          </Button>
        )}
      </Box>

      {creating && (
        <CreateProgramForm
          onCreated={handleCreated}
          onCancel={() => setCreating(false)}
        />
      )}

      {programs.length === 0 && !creating ? (
        <Card>
          <CardContent>
            <Box className="py-10 text-center">
              <Text variant="heading-sm" muted className="mb-2">
                No programs yet
              </Text>
              <Text variant="body-sm" muted className="mx-auto mb-4 max-w-md block">
                Write a TypeScript snippet that runs on every email — auto-file
                receipts, label newsletters, or trigger AI triage. Fully
                sandboxed: no network, no filesystem.
              </Text>
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                Create your first program
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box className="space-y-3">
          {programs.map((program) => (
            <ProgramRow
              key={program.id}
              program={program}
              onOpen={() => setSelectedId(program.id)}
              onUpdated={handleUpdated}
              onError={setError}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

ProgramsManager.displayName = "ProgramsManager";

// ─── Program row ─────────────────────────────────────────────────────────────

function ProgramRow({
  program,
  onOpen,
  onUpdated,
  onError,
}: {
  program: Program;
  onOpen: () => void;
  onUpdated: (p: Program) => void;
  onError: (message: string) => void;
}): React.ReactNode {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (): Promise<void> => {
    setToggling(true);
    try {
      const res = await programsApi.toggle(program.id);
      onUpdated(res.data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to toggle program");
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card className="border-border">
      <CardContent>
        <Box className="flex items-start justify-between gap-4">
          <Box
            as="button"
            className="min-w-0 flex-1 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-accent"
            onClick={onOpen}
            aria-label={`Open program ${program.name}`}
          >
            <Box className="flex items-center gap-2">
              <Text variant="body-md" className="font-semibold truncate">
                {program.name}
              </Text>
              <Box
                className={`rounded-full px-2 py-0.5 ${
                  program.enabled ? "bg-status-success/10" : "bg-surface-secondary"
                }`}
              >
                <Text
                  variant="caption"
                  className={program.enabled ? "text-status-success" : "text-content-tertiary"}
                >
                  {program.enabled ? "Enabled" : "Disabled"}
                </Text>
              </Box>
            </Box>
            {program.description && (
              <Text variant="body-sm" muted className="mt-0.5 truncate">
                {program.description}
              </Text>
            )}
            <Text variant="caption" muted className="mt-1 block">
              {program.triggers.map((t) => t.replace("email.", "on ")).join(", ")}
              {" · "}
              {program.runCount} run{program.runCount !== 1 ? "s" : ""}
              {program.errorCount > 0 ? ` · ${program.errorCount} error${program.errorCount !== 1 ? "s" : ""}` : ""}
            </Text>
          </Box>
          <Box className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggle}
              disabled={toggling}
            >
              {toggling ? "…" : program.enabled ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpen}>
              Open
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

ProgramRow.displayName = "ProgramRow";

// ─── Create form ─────────────────────────────────────────────────────────────

function CreateProgramForm({
  onCreated,
  onCancel,
}: {
  onCreated: (p: Program) => void;
  onCancel: () => void;
}): React.ReactNode {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState(STARTER_CODE);
  const [trigger, setTrigger] = useState<ProgramTrigger>("email.received");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!code.trim()) {
      setFormError("Code is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await programsApi.create({
        name: name.trim(),
        description: description.trim(),
        code,
        triggers: [trigger],
        enabled: true,
      });
      onCreated(res.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create program");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <Text variant="heading-sm">Create program</Text>
        <Text variant="body-sm" muted>
          Your snippet receives a read-only <code>email</code> and an{" "}
          <code>actions</code> API. Actions are captured and applied after the
          run.
        </Text>
      </CardHeader>
      <CardContent>
        {formError && <ErrorBanner message={formError} />}
        <Box className="space-y-4">
          <Box className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Program name"
              variant="text"
              placeholder="e.g. File Stripe receipts"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content" as="label" htmlFor="program-trigger">
                Trigger
              </Text>
              <Box
                as="select"
                id="program-trigger"
                className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={trigger}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTrigger(e.target.value as ProgramTrigger)
                }
                aria-label="Trigger type"
              >
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Box>
            </Box>
          </Box>
          <Input
            label="Description (optional)"
            variant="text"
            placeholder="What does this program do?"
            value={description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
          />
          <Box>
            <Text variant="body-sm" className="mb-1 font-medium text-content" as="label" htmlFor="program-code">
              Code
            </Text>
            <Box
              as="textarea"
              id="program-code"
              className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              rows={12}
              spellCheck={false}
              value={code}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCode(e.target.value)}
              aria-label="Program code"
            />
          </Box>
          <Box className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !code.trim()}
            >
              {saving ? "Creating..." : "Create Program"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

CreateProgramForm.displayName = "CreateProgramForm";

// ─── Program detail (edit + test + runs) ─────────────────────────────────────

function ProgramDetail({
  program,
  onBack,
  onUpdated,
  onDeleted,
}: {
  program: Program;
  onBack: () => void;
  onUpdated: (p: Program) => void;
  onDeleted: (id: string) => void;
}): React.ReactNode {
  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description);
  const [code, setCode] = useState(program.code);
  const [trigger, setTrigger] = useState<ProgramTrigger>(
    program.triggers[0] ?? "email.received",
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const dirty =
    name !== program.name ||
    description !== program.description ||
    code !== program.code ||
    trigger !== (program.triggers[0] ?? "email.received");

  const handleSave = async (): Promise<void> => {
    if (!name.trim() || !code.trim()) {
      setError("Name and code are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await programsApi.update(program.id, {
        name: name.trim(),
        description: description.trim(),
        code,
        triggers: [trigger],
      });
      onUpdated(res.data);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save program");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (): Promise<void> => {
    setError(null);
    try {
      const res = await programsApi.toggle(program.id);
      onUpdated(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle program");
    }
  };

  const handleDelete = async (): Promise<void> => {
    setError(null);
    try {
      await programsApi.remove(program.id);
      onDeleted(program.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete program");
      setDeleteConfirm(false);
    }
  };

  return (
    <Box className="space-y-6">
      <Box className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to programs
        </Button>
        <Box className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleToggle}>
            {program.enabled ? "Disable" : "Enable"}
          </Button>
          {deleteConfirm ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-red-600 hover:bg-red-50"
              >
                Confirm delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteConfirm(true)}
              className="text-red-600 hover:bg-red-50"
            >
              Delete
            </Button>
          )}
        </Box>
      </Box>

      {error && <ErrorBanner message={error} />}

      <Card>
        <CardHeader>
          <Text variant="heading-sm">Edit program</Text>
        </CardHeader>
        <CardContent>
          <Box className="space-y-4">
            <Box className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Program name"
                variant="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
              <Box>
                <Text variant="body-sm" className="mb-1 font-medium text-content" as="label" htmlFor="edit-trigger">
                  Trigger
                </Text>
                <Box
                  as="select"
                  id="edit-trigger"
                  className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  value={trigger}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setTrigger(e.target.value as ProgramTrigger)
                  }
                  aria-label="Trigger type"
                >
                  {TRIGGER_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Box>
              </Box>
            </Box>
            <Input
              label="Description"
              variant="text"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
            />
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content" as="label" htmlFor="edit-code">
                Code
              </Text>
              <Box
                as="textarea"
                id="edit-code"
                className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                rows={14}
                spellCheck={false}
                value={code}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCode(e.target.value)}
                aria-label="Program code"
              />
            </Box>
            <Box className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || !dirty || !name.trim() || !code.trim()}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              {savedAt && !dirty && (
                <Text variant="body-sm" className="text-status-success">
                  Saved
                </Text>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      <TestPanel programId={program.id} code={code} />
      <RunsPanel programId={program.id} />
    </Box>
  );
}

ProgramDetail.displayName = "ProgramDetail";

// ─── Test panel ──────────────────────────────────────────────────────────────

function TestPanel({
  programId,
  code,
}: {
  programId: string;
  code: string;
}): React.ReactNode {
  const [fromEmail, setFromEmail] = useState("receipts@stripe.com");
  const [subject, setSubject] = useState("Your receipt from Stripe");
  const [body, setBody] = useState("Thanks for your payment.");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProgramTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async (): Promise<void> => {
    if (!fromEmail.trim()) {
      setError("A sender email is required.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await programsApi.test(programId, {
        // Send the (possibly unsaved) editor code so the preview matches.
        code,
        email: {
          from: { email: fromEmail.trim(), name: null },
          subject: subject.trim(),
          body: body.trim(),
        },
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run test");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Dry run</Text>
        <Text variant="body-sm" muted>
          Test the current code against a sample email. Actions are captured,
          not applied.
        </Text>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        <Box className="space-y-4">
          <Box className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label="From"
              variant="text"
              placeholder="sender@example.com"
              value={fromEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromEmail(e.target.value)}
            />
            <Input
              label="Subject"
              variant="text"
              value={subject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            />
            <Input
              label="Body"
              variant="text"
              value={body}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBody(e.target.value)}
            />
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={handleTest}
            disabled={running || !fromEmail.trim()}
          >
            {running ? "Running..." : "Run test"}
          </Button>

          {result && (
            <Box
              className="rounded-md border border-border bg-surface-secondary p-4"
              role="status"
            >
              {result.result.error ? (
                <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2">
                  <Text variant="body-sm" className="font-mono text-red-800">
                    {result.result.error}
                  </Text>
                </Box>
              ) : (
                <Text variant="body-sm" className="mb-3 text-status-success">
                  Ran in {result.result.durationMs}ms with no errors.
                </Text>
              )}

              <Text variant="caption" muted className="mb-1 block font-medium">
                Actions ({result.result.actions.length})
              </Text>
              {result.result.actions.length === 0 ? (
                <Text variant="body-sm" muted>
                  No actions were triggered for this sample.
                </Text>
              ) : (
                <Box className="mb-3 flex flex-wrap gap-1.5">
                  {result.result.actions.map((a, i) => (
                    <Box
                      key={i}
                      className="rounded bg-accent/10 px-2 py-0.5"
                    >
                      <Text variant="caption" className="font-mono text-accent">
                        {describeAction(a)}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}

              {result.result.logs.length > 0 && (
                <>
                  <Text variant="caption" muted className="mb-1 block font-medium">
                    Logs
                  </Text>
                  <Box
                    as="pre"
                    className="overflow-x-auto rounded bg-surface p-2 font-mono text-xs text-content"
                  >
                    {result.result.logs.join("\n")}
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

TestPanel.displayName = "TestPanel";

// ─── Runs panel ──────────────────────────────────────────────────────────────

function RunsPanel({ programId }: { programId: string }): React.ReactNode {
  const [runs, setRuns] = useState<ProgramRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await programsApi.runs(programId, 20);
      setRuns(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between">
          <Box>
            <Text variant="heading-sm">Run history</Text>
            <Text variant="body-sm" muted>
              Recent executions, including dry runs.
            </Text>
          </Box>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading ? (
          <Box className="space-y-2" aria-busy="true" aria-label="Loading runs">
            {[1, 2, 3].map((i) => (
              <Box key={i} className="h-12 animate-pulse rounded bg-surface-secondary" />
            ))}
          </Box>
        ) : runs.length === 0 ? (
          <Box className="py-6 text-center">
            <Text variant="body-sm" muted>
              No runs yet. Run a dry test above to see execution history.
            </Text>
          </Box>
        ) : (
          <Box className="space-y-2">
            {runs.map((run) => (
              <Box
                key={run.id}
                className="flex items-start justify-between gap-4 rounded-lg bg-surface-secondary p-3"
              >
                <Box className="min-w-0 flex-1">
                  <Box className="flex items-center gap-2">
                    <Text variant="body-sm" className="font-medium">
                      {formatDateTime(run.startedAt)}
                    </Text>
                    {run.error ? (
                      <Box className="rounded-full bg-red-100 px-2 py-0.5">
                        <Text variant="caption" className="text-red-700">
                          Error
                        </Text>
                      </Box>
                    ) : (
                      <Box className="rounded-full bg-status-success/10 px-2 py-0.5">
                        <Text variant="caption" className="text-status-success">
                          OK
                        </Text>
                      </Box>
                    )}
                  </Box>
                  <Text variant="caption" muted className="mt-0.5 block truncate">
                    {run.durationMs}ms ·{" "}
                    {run.actions.length === 0
                      ? "no actions"
                      : run.actions.map((a) => describeAction(a)).join(", ")}
                  </Text>
                  {run.error && (
                    <Text variant="caption" className="mt-0.5 block font-mono text-red-700">
                      {run.error}
                    </Text>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

RunsPanel.displayName = "RunsPanel";
