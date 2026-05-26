"use client";

import React, {
  forwardRef,
  useState,
  useCallback,
  useMemo,
  type HTMLAttributes,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Card, CardHeader, CardContent, CardFooter } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ScriptTrigger = "on_receive" | "on_send" | "manual" | "scheduled";

export type ScriptRunStatus = "success" | "error" | "timeout";

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  trigger: ScriptTrigger;
  category: string;
  code: string;
}

export interface ScriptRunEntry {
  id: string;
  status: ScriptRunStatus;
  executionTimeMs: number;
  actionsExecuted: { type: string; params: Record<string, unknown> }[];
  logs: string[];
  error?: string | null;
  createdAt: string;
}

export interface ScriptData {
  id?: string;
  name: string;
  description?: string;
  code: string;
  trigger: ScriptTrigger;
  schedule?: string | null;
  isActive: boolean;
}

export interface TestResult {
  success: boolean;
  runId: string;
  actions?: { type: string; params: Record<string, unknown> }[];
  logs?: string[];
  error?: string;
  executionTimeMs: number;
  dryRun: boolean;
}

export interface ScriptEditorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onSubmit" | "onToggle"> {
  /** Initial script data (for editing existing scripts). */
  initialData?: ScriptData;
  /** Available templates for the template selector. */
  templates?: ScriptTemplate[];
  /** Recent run history for this script. */
  runs?: ScriptRunEntry[];
  /** Whether the form is in a loading/saving state. */
  saving?: boolean;
  /** Whether the test is running. */
  testing?: boolean;
  /** Most recent test result. */
  testResult?: TestResult | null;
  /** Called when the user saves the script. */
  onSave?: (data: ScriptData) => void;
  /** Called when the user clicks Test. */
  onTest?: (data: ScriptData) => void;
  /** Called when the user toggles active state. */
  onToggle?: (isActive: boolean) => void;
  /** Called when the user clicks Cancel/Back. */
  onCancel?: () => void;
  className?: string;
}

// ─── Trigger labels ───────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: ScriptTrigger; label: string; description: string }[] = [
  {
    value: "on_receive",
    label: "On Receive",
    description: "Runs when a new email arrives",
  },
  {
    value: "on_send",
    label: "On Send",
    description: "Runs before an email is sent",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Run manually from the script manager",
  },
  {
    value: "scheduled",
    label: "Scheduled",
    description: "Runs on a cron schedule",
  },
];

// ─── Keyword highlighting (basic) ─────────────────────────────────────────────

function getLineCount(code: string): number {
  return code.split("\n").length;
}

// ─── Status icon components ───────────────────────────────────────────────────

function SuccessIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3.5 h-3.5 text-green-500 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </Box>
  );
}

SuccessIcon.displayName = "SuccessIcon";

function ErrorIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3.5 h-3.5 text-red-500 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ErrorIcon.displayName = "ErrorIcon";

function CodeIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="polyline" points="16 18 22 12 16 6" />
      <Box as="polyline" points="8 6 2 12 8 18" />
    </Box>
  );
}

CodeIcon.displayName = "CodeIcon";

// ─── Component ──────────────────────────────────────────────────────────────

export const ScriptEditor = forwardRef<HTMLDivElement, ScriptEditorProps>(
  function ScriptEditor(
    {
      initialData,
      templates = [],
      runs = [],
      saving = false,
      testing = false,
      testResult = null,
      onSave,
      onTest,
      onToggle,
      onCancel,
      className = "",
      ...props
    },
    ref,
  ) {
    const [name, setName] = useState(initialData?.name ?? "");
    const [description, setDescription] = useState(
      initialData?.description ?? "",
    );
    const [code, setCode] = useState(initialData?.code ?? "");
    const [trigger, setTrigger] = useState<ScriptTrigger>(
      initialData?.trigger ?? "on_receive",
    );
    const [schedule, setSchedule] = useState(initialData?.schedule ?? "");
    const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
    const [activeTab, setActiveTab] = useState<"editor" | "templates" | "history">(
      "editor",
    );

    const lineCount = useMemo(() => getLineCount(code), [code]);

    const currentData: ScriptData = useMemo(
      () => ({
        name,
        code,
        trigger,
        schedule: trigger === "scheduled" ? schedule : null,
        isActive,
        ...(initialData?.id !== undefined ? { id: initialData.id } : {}),
        ...(description ? { description } : {}),
      }),
      [initialData?.id, name, description, code, trigger, schedule, isActive],
    );

    const canSave = name.trim().length > 0 && code.trim().length > 0;

    const handleSave = useCallback((): void => {
      if (canSave) {
        onSave?.(currentData);
      }
    }, [canSave, currentData, onSave]);

    const handleTest = useCallback((): void => {
      onTest?.(currentData);
    }, [currentData, onTest]);

    const handleToggle = useCallback((): void => {
      const newActive = !isActive;
      setIsActive(newActive);
      onToggle?.(newActive);
    }, [isActive, onToggle]);

    const handleSelectTemplate = useCallback(
      (template: ScriptTemplate): void => {
        setName(template.name);
        setDescription(template.description);
        setCode(template.code);
        setTrigger(template.trigger);
        setActiveTab("editor");
      },
      [],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        // Handle Tab key for indentation
        if (e.key === "Tab") {
          e.preventDefault();
          const target = e.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const newCode = code.slice(0, start) + "  " + code.slice(end);
          setCode(newCode);
          // Set cursor position after React re-render
          requestAnimationFrame(() => {
            target.selectionStart = start + 2;
            target.selectionEnd = start + 2;
          });
        }
        // Cmd/Ctrl+S to save
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          handleSave();
        }
        // Cmd/Ctrl+Enter to test
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          handleTest();
        }
      },
      [code, handleSave, handleTest],
    );

    return (
      <Box
        ref={ref}
        className={`flex flex-col gap-4 ${className}`}
        {...props}
      >
        {/* Header */}
        <Box className="flex items-center justify-between">
          <Box className="flex items-center gap-2">
            <CodeIcon />
            <Text variant="heading-sm">
              {initialData?.id ? "Edit Script" : "New Script"}
            </Text>
          </Box>
          <Box className="flex items-center gap-2">
            {initialData?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggle}
                aria-label={isActive ? "Disable script" : "Enable script"}
              >
                {isActive ? "Disable" : "Enable"}
              </Button>
            )}
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </Box>
        </Box>

        {/* Name and description */}
        <Box className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Script name (e.g., Auto-Archive Newsletters)"
            aria-label="Script name"
          />
          <Input
            value={description}
            onChange={(e) => setDescription((e.target as HTMLInputElement).value)}
            placeholder="Optional description"
            aria-label="Script description"
          />
        </Box>

        {/* Trigger selector */}
        <Box className="flex flex-col gap-2">
          <Text variant="label">Trigger</Text>
          <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TRIGGER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={trigger === opt.value ? "primary" : "outline"}
                size="sm"
                onClick={() => setTrigger(opt.value)}
                aria-pressed={trigger === opt.value}
                aria-label={`Trigger: ${opt.label}`}
              >
                <Box className="flex flex-col items-start">
                  <Text
                    variant="body-sm"
                    className={
                      trigger === opt.value ? "font-semibold text-white" : "font-semibold"
                    }
                  >
                    {opt.label}
                  </Text>
                </Box>
              </Button>
            ))}
          </Box>
          {trigger === "scheduled" && (
            <Input
              value={schedule}
              onChange={(e) => setSchedule((e.target as HTMLInputElement).value)}
              placeholder="Cron expression (e.g., 0 9 * * 1-5)"
              aria-label="Schedule cron expression"
            />
          )}
        </Box>

        {/* Tab bar */}
        <Box className="flex items-center gap-1 border-b border-border" role="tablist">
          {(
            [
              { key: "editor", label: "Editor" },
              { key: "templates", label: "Templates" },
              { key: "history", label: `History (${runs.length})` },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.key}
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-b-none ${
                activeTab === tab.key
                  ? "border-b-2 border-accent-primary text-accent-primary"
                  : ""
              }`}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`tab-panel-${tab.key}`}
            >
              {tab.label}
            </Button>
          ))}
        </Box>

        {/* Tab panels */}
        {activeTab === "editor" && (
          <Box id="tab-panel-editor" role="tabpanel" className="flex flex-col gap-3">
            {/* Code editor */}
            <Card>
              <CardHeader>
                <Box className="flex items-center justify-between">
                  <Text variant="label">
                    TypeScript ({lineCount} line{lineCount !== 1 ? "s" : ""})
                  </Text>
                  <Text variant="caption" muted>
                    Tab to indent | Cmd+S save | Cmd+Enter test
                  </Text>
                </Box>
              </CardHeader>
              <CardContent className="p-0">
                <Box className="relative">
                  {/* Line numbers */}
                  <Box
                    className="absolute left-0 top-0 bottom-0 w-10 bg-surface-tertiary border-r border-border text-right select-none pointer-events-none"
                    aria-hidden="true"
                  >
                    <Box className="p-3 pr-2 font-mono text-xs leading-5 text-text-muted">
                      {Array.from({ length: lineCount }, (_, i) => (
                        <Box key={i} className="h-5">
                          {i + 1}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  {/* Textarea */}
                  <Box
                    as="textarea"
                    value={code}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setCode(e.target.value)
                    }
                    onKeyDown={handleKeyDown}
                    className="w-full min-h-[300px] p-3 pl-12 font-mono text-sm leading-5 bg-surface-primary text-text-primary resize-y border-0 focus:outline-none focus:ring-2 focus:ring-accent-primary rounded-b-lg"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-label="Script code editor"
                    placeholder={`// Write your TypeScript snippet here\n// Available: email, actions, log, matchSender, matchSubject, extractLinks, extractDates\n\nif (matchSender("newsletter")) {\n  actions.archive();\n  log("Archived newsletter");\n}`}
                  />
                </Box>
              </CardContent>
              <CardFooter>
                <Box className="flex items-center justify-between w-full">
                  <Text variant="caption" muted>
                    Available: email, actions, log, matchSender, matchSubject,
                    extractLinks, extractDates
                  </Text>
                  <Box className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTest}
                      loading={testing}
                      disabled={code.trim().length === 0}
                      aria-label="Test script with sample email"
                    >
                      Test
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      loading={saving}
                      disabled={!canSave}
                      aria-label="Save script"
                    >
                      {initialData?.id ? "Save" : "Create"}
                    </Button>
                  </Box>
                </Box>
              </CardFooter>
            </Card>

            {/* Test result */}
            {testResult && (
              <Card>
                <CardHeader>
                  <Box className="flex items-center gap-2">
                    {testResult.success ? <SuccessIcon /> : <ErrorIcon />}
                    <Text variant="label">
                      Test {testResult.success ? "Passed" : "Failed"} (
                      {testResult.executionTimeMs}ms)
                    </Text>
                  </Box>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {testResult.error && (
                    <Box className="p-2 rounded bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                      <Text variant="body-sm" className="text-red-700 dark:text-red-300 font-mono">
                        {testResult.error}
                      </Text>
                    </Box>
                  )}
                  {testResult.actions && testResult.actions.length > 0 && (
                    <Box className="flex flex-col gap-1">
                      <Text variant="caption" className="font-semibold">
                        Actions ({testResult.actions.length})
                      </Text>
                      {testResult.actions.map((action, i) => (
                        <Box
                          key={i}
                          className="flex items-center gap-2 p-1.5 rounded bg-surface-secondary font-mono text-xs"
                        >
                          <Text
                            as="span"
                            variant="caption"
                            className="px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary font-semibold"
                          >
                            {action.type}
                          </Text>
                          {Object.keys(action.params).length > 0 && (
                            <Text as="span" variant="caption" muted>
                              {JSON.stringify(action.params)}
                            </Text>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                  {testResult.logs && testResult.logs.length > 0 && (
                    <Box className="flex flex-col gap-1">
                      <Text variant="caption" className="font-semibold">
                        Logs ({testResult.logs.length})
                      </Text>
                      <Box className="p-2 rounded bg-surface-tertiary font-mono text-xs max-h-40 overflow-y-auto">
                        {testResult.logs.map((line, i) => (
                          <Box key={i} className="text-text-secondary">
                            {line}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}
          </Box>
        )}

        {activeTab === "templates" && (
          <Box
            id="tab-panel-templates"
            role="tabpanel"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {templates.length === 0 ? (
              <Text variant="body-sm" muted className="col-span-full text-center py-8">
                No templates available
              </Text>
            ) : (
              templates.map((tmpl) => (
                <Card key={tmpl.id} className="cursor-pointer hover:border-accent-primary transition-colors">
                  <CardContent
                    className="flex flex-col gap-2"
                    onClick={() => handleSelectTemplate(tmpl)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Use template: ${tmpl.name}`}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectTemplate(tmpl);
                      }
                    }}
                  >
                    <Box className="flex items-center justify-between">
                      <Text variant="body-sm" className="font-semibold">
                        {tmpl.name}
                      </Text>
                      <Text
                        as="span"
                        variant="caption"
                        className="px-1.5 py-0.5 rounded-full bg-surface-tertiary text-text-muted text-[10px]"
                      >
                        {tmpl.category}
                      </Text>
                    </Box>
                    <Text variant="caption" muted>
                      {tmpl.description}
                    </Text>
                    <Text
                      as="span"
                      variant="caption"
                      className="px-1.5 py-0.5 rounded bg-surface-secondary text-text-secondary text-[10px] w-fit"
                    >
                      {tmpl.trigger}
                    </Text>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        )}

        {activeTab === "history" && (
          <Box id="tab-panel-history" role="tabpanel" className="flex flex-col gap-2">
            {runs.length === 0 ? (
              <Text variant="body-sm" muted className="text-center py-8">
                No execution history yet. Test your script to see results here.
              </Text>
            ) : (
              runs.map((run) => (
                <Card key={run.id}>
                  <CardContent className="flex items-center gap-3">
                    {run.status === "success" ? <SuccessIcon /> : <ErrorIcon />}
                    <Box className="flex-1 min-w-0">
                      <Box className="flex items-center gap-2">
                        <Text variant="body-sm" className="font-medium">
                          {run.status === "success"
                            ? "Success"
                            : run.status === "timeout"
                              ? "Timeout"
                              : "Error"}
                        </Text>
                        <Text variant="caption" muted>
                          {run.executionTimeMs}ms
                        </Text>
                        <Text variant="caption" muted>
                          {new Date(run.createdAt).toLocaleString()}
                        </Text>
                      </Box>
                      {run.error && (
                        <Text variant="caption" className="text-red-500 truncate">
                          {run.error}
                        </Text>
                      )}
                      {run.actionsExecuted.length > 0 && (
                        <Box className="flex items-center gap-1 mt-0.5">
                          {run.actionsExecuted.map((a, i) => (
                            <Text
                              key={i}
                              as="span"
                              variant="caption"
                              className="px-1 py-0.5 rounded bg-surface-tertiary text-[10px]"
                            >
                              {a.type}
                            </Text>
                          ))}
                        </Box>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        )}
      </Box>
    );
  },
);

ScriptEditor.displayName = "ScriptEditor";
