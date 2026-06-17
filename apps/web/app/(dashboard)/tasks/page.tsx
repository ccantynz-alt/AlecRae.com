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
import { taskApi, type TaskListItem } from "../../../lib/api";
import { TaskProviderSelector } from "../../../components/TaskProviderSelector";
import {
  ActionItemExtractor,
  type ThreadEmail,
} from "../../../components/ActionItemExtractor";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-600",
  high: "bg-orange-500/10 text-orange-600",
  normal: "bg-surface-secondary text-content-tertiary",
  low: "bg-surface-secondary text-content-tertiary",
};

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TasksPage(): React.ReactNode {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedProvider, setSelectedProvider] = useState("builtin");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await taskApi.listTasks(
        statusFilter === "all" ? { limit: 50 } : { status: statusFilter, limit: 50 },
      );
      setTasks(res.data.tasks);
      setTotal(res.data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageLayout
      title="Tasks"
      description="Action items extracted from your email, synced to your todo apps."
    >
      {error && (
        <Box className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}

      <Box className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Box className="space-y-6 lg:col-span-2">
          <Box
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter tasks by status"
          >
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </Box>

          {loading ? (
            <Box className="space-y-3" aria-busy="true" aria-label="Loading tasks">
              {[1, 2, 3].map((i) => (
                <Box key={i} className="h-16 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </Box>
          ) : tasks.length === 0 ? (
            <Card>
              <CardContent>
                <Box className="py-8 text-center">
                  <Text variant="heading-sm" muted className="mb-2">
                    No tasks yet
                  </Text>
                  <Text variant="body-sm" muted>
                    Extract action items from an email on the right, or create
                    tasks from any thread in your inbox.
                  </Text>
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Box className="space-y-3">
              <Text variant="caption" muted>
                {total} task{total !== 1 ? "s" : ""}
              </Text>
              {tasks.map((task) => (
                <Card key={task.id} className="border-border">
                  <CardContent>
                    <Box className="flex items-start justify-between gap-4">
                      <Box className="min-w-0 flex-1">
                        <Box className="flex items-center gap-2">
                          <Text variant="body-md" className="font-semibold truncate">
                            {task.title}
                          </Text>
                          <Box
                            className={`rounded-full px-2 py-0.5 ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES["normal"]}`}
                          >
                            <Text as="span" variant="caption">
                              {task.priority}
                            </Text>
                          </Box>
                        </Box>
                        {task.description && (
                          <Text variant="body-sm" muted className="mt-0.5 truncate">
                            {task.description}
                          </Text>
                        )}
                        <Text variant="caption" muted className="mt-1 block">
                          {formatDue(task.dueDate)} · {task.status.replace(/_/g, " ")} ·{" "}
                          {task.provider}
                          {task.source ? ` · from "${task.source.emailSubject}"` : ""}
                        </Text>
                      </Box>
                      {task.externalTaskUrl && (
                        <Box
                          as="a"
                          href={task.externalTaskUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          <Text as="span" variant="body-sm" className="text-brand-600">
                            Open
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Box>

        <Box className="space-y-6">
          <Card>
            <CardHeader>
              <Text variant="heading-sm">Task providers</Text>
              <Text variant="body-sm" muted>
                Choose where extracted tasks are created.
              </Text>
            </CardHeader>
            <CardContent>
              <TaskProviderSelector
                selected={selectedProvider}
                onSelect={setSelectedProvider}
                showConfig
              />
            </CardContent>
          </Card>

          <ExtractFromEmailCard onTasksCreated={() => void load()} />
        </Box>
      </Box>
    </PageLayout>
  );
}

// ─── Extract from pasted email ───────────────────────────────────────────────

function ExtractFromEmailCard({
  onTasksCreated,
}: {
  onTasksCreated: () => void;
}): React.ReactNode {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [thread, setThread] = useState<{
    threadId: string;
    emails: ThreadEmail[];
  } | null>(null);

  const handleExtract = (): void => {
    if (!body.trim()) return;
    setThread({
      threadId: `manual-${Date.now().toString(36)}`,
      emails: [
        {
          emailId: `pasted-${Date.now().toString(36)}`,
          from: from.trim() || "unknown@sender.com",
          subject: subject.trim() || "(no subject)",
          body: body.trim(),
          receivedAt: new Date().toISOString(),
        },
      ],
    });
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Extract action items</Text>
        <Text variant="body-sm" muted>
          Paste an email and let AI pull out the tasks.
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-3">
          <Input
            label="From (optional)"
            variant="text"
            placeholder="sender@example.com"
            value={from}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
          />
          <Input
            label="Subject (optional)"
            variant="text"
            placeholder="e.g. Project kickoff follow-ups"
            value={subject}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
          />
          <Box>
            <Text variant="body-sm" className="mb-1 font-medium text-content">
              Email body
            </Text>
            <textarea
              className="w-full rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              rows={5}
              placeholder="Paste the email content here..."
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              aria-label="Email body to extract tasks from"
            />
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExtract}
            disabled={!body.trim()}
          >
            Extract tasks
          </Button>

          {thread && (
            <Box className="pt-2">
              <ActionItemExtractor
                key={thread.threadId}
                threadId={thread.threadId}
                emails={thread.emails}
                autoExtract
                onTasksCreated={onTasksCreated}
              />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

ExtractFromEmailCard.displayName = "ExtractFromEmailCard";
