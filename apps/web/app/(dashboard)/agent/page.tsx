"use client";

/**
 * AI Inbox Agent — morning briefing + draft approval surface.
 *
 * The agent runs overnight (or on demand): reads new email, triages by category
 * + priority, drafts replies in the user's voice, and produces a markdown
 * briefing for the morning. This page is the human-in-the-loop control panel.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import {
  agentApi,
  type AgentBriefing,
  type AgentDraft,
} from "../../../lib/api";

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${min}m ${remSec}s`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function priorityColor(priority: string | null): string {
  switch (priority) {
    case "now":
      return "text-status-error";
    case "today":
      return "text-status-warning";
    case "this_week":
      return "text-content";
    case "whenever":
      return "text-content-tertiary";
    default:
      return "text-content-tertiary";
  }
}

export default function AgentPage(): React.ReactNode {
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null);
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [briefingRes, draftsRes] = await Promise.all([
        agentApi.getBriefing().catch(() => null),
        agentApi.getDrafts({ status: "pending", limit: 50 }),
      ]);
      setBriefing(briefingRes?.data ?? null);
      setDrafts(draftsRes.data.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const triggerRun = async (): Promise<void> => {
    setRunning(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await agentApi.run();
      setStatusMsg(`Agent started (${res.data.runId.slice(0, 8)}). Refreshing in 5s...`);
      setTimeout(() => {
        void refresh();
        setStatusMsg(null);
      }, 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start agent");
    } finally {
      setRunning(false);
    }
  };

  const approveDraft = async (id: string): Promise<void> => {
    try {
      await agentApi.approveDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setStatusMsg("Approved.");
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  };

  const rejectDraft = async (id: string): Promise<void> => {
    try {
      await agentApi.rejectDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setStatusMsg("Rejected.");
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    }
  };

  const startEdit = (draft: AgentDraft): void => {
    setEditingId(draft.id);
    setEditText(draft.editedBody ?? draft.body);
  };

  const saveEdit = async (id: string): Promise<void> => {
    try {
      await agentApi.editDraft(id, editText);
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, editedBody: editText, status: "edited" as const } : d,
        ),
      );
      setEditingId(null);
      setStatusMsg("Saved.");
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed");
    }
  };

  const actions = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => void triggerRun()}
      disabled={running}
    >
      {running ? "Starting..." : "Run agent now"}
    </Button>
  );

  return (
    <PageLayout
      title="AI Inbox Agent"
      description="Triages new email, drafts replies in your voice, and produces a morning briefing. You approve every reply before it sends."
      actions={actions}
    >
      <Box className="space-y-6 max-w-4xl">
        {error && (
          <Box className="rounded-md border border-status-error/30 bg-status-error/5 p-3">
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
          </Box>
        )}
        {statusMsg && (
          <Box className="rounded-md border border-accent/30 bg-accent/5 p-3">
            <Text variant="body-sm" className="text-accent">
              {statusMsg}
            </Text>
          </Box>
        )}

        <Card>
          <CardHeader>
            <Box className="flex items-center justify-between">
              <Text variant="heading-sm">Morning briefing</Text>
              {briefing?.finishedAt && (
                <Text variant="caption" muted>
                  Last run · {formatTimestamp(briefing.finishedAt)}
                </Text>
              )}
            </Box>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Text variant="body-sm" muted>Loading...</Text>
            ) : briefing?.briefingMarkdown ? (
              <Box className="space-y-3">
                <Box className="grid grid-cols-3 gap-3 mb-4">
                  <Box className="rounded-md border border-border p-3">
                    <Text variant="caption" muted className="block">Processed</Text>
                    <Text variant="heading-md" className="font-semibold">
                      {briefing.totalProcessed}
                    </Text>
                  </Box>
                  <Box className="rounded-md border border-border p-3">
                    <Text variant="caption" muted className="block">Duration</Text>
                    <Text variant="heading-md" className="font-semibold">
                      {formatDuration(briefing.durationMs)}
                    </Text>
                  </Box>
                  <Box className="rounded-md border border-border p-3">
                    <Text variant="caption" muted className="block">Pending drafts</Text>
                    <Text variant="heading-md" className="font-semibold">
                      {drafts.length}
                    </Text>
                  </Box>
                </Box>
                <Box
                  as="pre"
                  className="whitespace-pre-wrap text-sm font-sans text-content leading-relaxed"
                >
                  {briefing.briefingMarkdown}
                </Box>
              </Box>
            ) : (
              <Text variant="body-sm" muted>
                No briefing yet. Run the agent to produce one.
              </Text>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Text variant="heading-sm">
              Pending drafts {drafts.length > 0 && `(${drafts.length})`}
            </Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Text variant="body-sm" muted>Loading...</Text>
            ) : drafts.length === 0 ? (
              <Text variant="body-sm" muted>
                No drafts waiting for approval. The agent only auto-drafts when it&apos;s confident — destructive actions always require your tap.
              </Text>
            ) : (
              <Box className="space-y-4">
                {drafts.map((draft) => {
                  const isEditing = editingId === draft.id;
                  const bodyText = draft.editedBody ?? draft.body;
                  return (
                    <Box
                      key={draft.id}
                      className="border border-border rounded-md p-4 space-y-2"
                    >
                      <Box className="flex items-start justify-between flex-wrap gap-2">
                        <Box className="flex-1 min-w-0">
                          <Text variant="body-sm" className="font-medium truncate">
                            To: {draft.to.join(", ")}
                          </Text>
                          <Text variant="body-md" className="font-semibold mt-1">
                            {draft.subject}
                          </Text>
                        </Box>
                        <Box className="flex items-center gap-3 text-xs">
                          {draft.priority && (
                            <Text
                              variant="caption"
                              className={priorityColor(draft.priority)}
                            >
                              {draft.priority}
                            </Text>
                          )}
                          {draft.category && (
                            <Text variant="caption" muted>
                              {draft.category}
                            </Text>
                          )}
                          <Text variant="caption" muted>
                            {Math.round(draft.confidence * 100)}% confident
                          </Text>
                        </Box>
                      </Box>

                      {draft.reasoning && (
                        <Text variant="caption" muted className="block">
                          Reasoning: {draft.reasoning}
                        </Text>
                      )}

                      {isEditing ? (
                        <Box
                          as="textarea"
                          value={editText}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setEditText(e.target.value)
                          }
                          className="w-full min-h-[160px] p-3 bg-surface-secondary rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                        />
                      ) : (
                        <Box className="rounded-md bg-surface-secondary p-3">
                          <Text
                            as="pre"
                            variant="body-sm"
                            className="whitespace-pre-wrap font-sans"
                          >
                            {bodyText}
                          </Text>
                        </Box>
                      )}

                      <Box className="flex gap-2 pt-1">
                        {isEditing ? (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => void saveEdit(draft.id)}
                            >
                              Save edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => void approveDraft(draft.id)}
                            >
                              Approve & send
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => startEdit(draft)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void rejectDraft(draft.id)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </PageLayout>
  );
}
