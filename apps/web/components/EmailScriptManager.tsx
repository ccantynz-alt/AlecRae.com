"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  ScriptEditor,
} from "@emailed/ui";
import type { ScriptData, ScriptTemplate, ScriptRunEntry, TestResult } from "@emailed/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

type ScriptTrigger = "on_receive" | "on_send" | "manual" | "scheduled";

interface Script {
  id: string;
  name: string;
  description: string | null;
  code: string;
  trigger: ScriptTrigger;
  schedule: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  runCount: number;
  errorCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScriptListResponse {
  data: Script[];
  pagination: { total: number; limit: number; offset: number };
}

type ManagerView = "list" | "create" | "edit";

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = "/api/v1/scripts";

async function apiCall<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) {
    const errorMsg = json.error?.message ?? `Request failed: ${res.status}`;
    throw new Error(errorMsg);
  }
  return json;
}

// ─── Trigger badge colors ─────────────────────────────────────────────────────

function triggerColor(trigger: ScriptTrigger): string {
  switch (trigger) {
    case "on_receive":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "on_send":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "manual":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    case "scheduled":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  }
}

function triggerLabel(trigger: ScriptTrigger): string {
  switch (trigger) {
    case "on_receive":
      return "On Receive";
    case "on_send":
      return "On Send";
    case "manual":
      return "Manual";
    case "scheduled":
      return "Scheduled";
  }
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }): React.ReactElement {
  return (
    <Box
      className={`w-2 h-2 rounded-full flex-shrink-0 ${
        active ? "bg-green-500" : "bg-gray-400"
      }`}
      aria-label={active ? "Active" : "Inactive"}
      role="img"
    />
  );
}

StatusDot.displayName = "StatusDot";

// ─── Component ──────────────────────────────────────────────────────────────

export default function EmailScriptManager(): React.ReactElement {
  const [view, setView] = useState<ManagerView>("list");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [runs, setRuns] = useState<ScriptRunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Fetch scripts ────────────────────────────────────────────────────

  const fetchScripts = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall<ScriptListResponse>("");
      setScripts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scripts");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch templates ──────────────────────────────────────────────────

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const res = await apiCall<{ data: ScriptTemplate[] }>("/templates");
      setTemplates(res.data);
    } catch {
      // Templates are nice-to-have; don't block the UI
    }
  }, []);

  // ─── Fetch runs for a script ──────────────────────────────────────────

  const fetchRuns = useCallback(async (scriptId: string): Promise<void> => {
    try {
      const res = await apiCall<{ data: ScriptRunEntry[] }>(
        `/${scriptId}/runs`,
      );
      setRuns(res.data);
    } catch {
      setRuns([]);
    }
  }, []);

  // ─── Load on mount ────────────────────────────────────────────────────

  useEffect(() => {
    void fetchScripts();
    void fetchTemplates();
  }, [fetchScripts, fetchTemplates]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleCreate = useCallback((): void => {
    setSelectedScript(null);
    setTestResult(null);
    setRuns([]);
    setView("create");
  }, []);

  const handleEdit = useCallback(
    (script: Script): void => {
      setSelectedScript(script);
      setTestResult(null);
      void fetchRuns(script.id);
      setView("edit");
    },
    [fetchRuns],
  );

  const handleBack = useCallback((): void => {
    setView("list");
    setSelectedScript(null);
    setTestResult(null);
    setRuns([]);
    void fetchScripts();
  }, [fetchScripts]);

  const handleSave = useCallback(
    async (data: ScriptData): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        if (data.id) {
          // Update existing
          await apiCall(`/${data.id}`, {
            method: "PUT",
            body: JSON.stringify({
              name: data.name,
              description: data.description,
              code: data.code,
              trigger: data.trigger,
              schedule: data.schedule,
            }),
          });
        } else {
          // Create new
          await apiCall("", {
            method: "POST",
            body: JSON.stringify({
              name: data.name,
              description: data.description,
              code: data.code,
              trigger: data.trigger,
              schedule: data.schedule,
              isActive: data.isActive,
            }),
          });
        }
        handleBack();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save script");
      } finally {
        setSaving(false);
      }
    },
    [handleBack],
  );

  const handleTest = useCallback(
    async (data: ScriptData): Promise<void> => {
      if (!data.id) {
        setError("Save the script first before testing");
        return;
      }
      setTesting(true);
      setTestResult(null);
      try {
        const res = await apiCall<{ data: TestResult }>(
          `/${data.id}/test`,
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        );
        setTestResult(res.data);
      } catch (err) {
        setTestResult({
          success: false,
          runId: "",
          error: err instanceof Error ? err.message : "Test failed",
          executionTimeMs: 0,
          dryRun: true,
        });
      } finally {
        setTesting(false);
      }
    },
    [],
  );

  const handleToggle = useCallback(
    async (scriptId: string): Promise<void> => {
      try {
        await apiCall(`/${scriptId}/toggle`, { method: "POST" });
        // Refresh list
        setScripts((prev) =>
          prev.map((s) =>
            s.id === scriptId ? { ...s, isActive: !s.isActive } : s,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to toggle script");
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (scriptId: string): Promise<void> => {
      try {
        await apiCall(`/${scriptId}`, { method: "DELETE" });
        setScripts((prev) => prev.filter((s) => s.id !== scriptId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete script");
      }
    },
    [],
  );

  // ─── Render: List View ────────────────────────────────────────────────

  if (view === "list") {
    return (
      <Box className="flex flex-col gap-4 max-w-4xl mx-auto p-4">
        {/* Header */}
        <Box className="flex items-center justify-between">
          <Box className="flex flex-col">
            <Text variant="heading">Programmable Email</Text>
            <Text variant="body-sm" muted>
              TypeScript snippets that automate your email workflow
            </Text>
          </Box>
          <Button variant="primary" size="md" onClick={handleCreate}>
            New Script
          </Button>
        </Box>

        {/* Error banner */}
        {error && (
          <Box className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
            <Text variant="body-sm" className="text-red-700 dark:text-red-300">
              {error}
            </Text>
          </Box>
        )}

        {/* Loading state */}
        {loading && (
          <Box className="flex items-center justify-center py-12">
            <Text variant="body-sm" muted>
              Loading scripts...
            </Text>
          </Box>
        )}

        {/* Empty state */}
        {!loading && scripts.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <Box
                as="svg"
                className="w-12 h-12 text-text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <Box as="polyline" points="16 18 22 12 16 6" />
                <Box as="polyline" points="8 6 2 12 8 18" />
              </Box>
              <Box className="flex flex-col items-center gap-1">
                <Text variant="body-sm" className="font-semibold">
                  No scripts yet
                </Text>
                <Text variant="caption" muted>
                  Create your first email automation script or start from a template
                </Text>
              </Box>
              <Button variant="primary" size="sm" onClick={handleCreate}>
                Create Script
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Script list */}
        {!loading &&
          scripts.map((script) => (
            <Card key={script.id} className="hover:border-accent-primary transition-colors">
              <CardContent className="flex items-center gap-4">
                <StatusDot active={script.isActive} />
                <Box
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => handleEdit(script)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit script: ${script.name}`}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleEdit(script);
                    }
                  }}
                >
                  <Box className="flex items-center gap-2">
                    <Text variant="body-sm" className="font-semibold truncate">
                      {script.name}
                    </Text>
                    <Text
                      as="span"
                      variant="caption"
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${triggerColor(script.trigger)}`}
                    >
                      {triggerLabel(script.trigger)}
                    </Text>
                  </Box>
                  {script.description && (
                    <Text variant="caption" muted className="truncate">
                      {script.description}
                    </Text>
                  )}
                  <Box className="flex items-center gap-3 mt-1">
                    <Text variant="caption" muted>
                      {script.runCount} run{script.runCount !== 1 ? "s" : ""}
                    </Text>
                    {script.errorCount > 0 && (
                      <Text variant="caption" className="text-red-500">
                        {script.errorCount} error{script.errorCount !== 1 ? "s" : ""}
                      </Text>
                    )}
                    {script.lastRunAt && (
                      <Text variant="caption" muted>
                        Last run: {new Date(script.lastRunAt).toLocaleDateString()}
                      </Text>
                    )}
                  </Box>
                </Box>
                <Box className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleToggle(script.id)}
                    aria-label={script.isActive ? "Disable script" : "Enable script"}
                  >
                    {script.isActive ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(script.id)}
                    aria-label={`Delete script: ${script.name}`}
                    className="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ))}
      </Box>
    );
  }

  // ─── Render: Create/Edit View ─────────────────────────────────────────

  return (
    <Box className="max-w-4xl mx-auto p-4">
      {/* Error banner */}
      {error && (
        <Box className="p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
          <Text variant="body-sm" className="text-red-700 dark:text-red-300">
            {error}
          </Text>
        </Box>
      )}

      <ScriptEditor
        initialData={
          selectedScript
            ? {
                id: selectedScript.id,
                name: selectedScript.name,
                description: selectedScript.description ?? undefined,
                code: selectedScript.code,
                trigger: selectedScript.trigger,
                schedule: selectedScript.schedule,
                isActive: selectedScript.isActive,
              }
            : undefined
        }
        templates={templates}
        runs={runs}
        saving={saving}
        testing={testing}
        testResult={testResult}
        onSave={(data) => void handleSave(data)}
        onTest={(data) => void handleTest(data)}
        onToggle={(active) => {
          if (selectedScript) {
            void handleToggle(selectedScript.id);
          }
        }}
        onCancel={handleBack}
      />
    </Box>
  );
}

EmailScriptManager.displayName = "EmailScriptManager";
