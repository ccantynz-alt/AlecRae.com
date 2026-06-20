"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, PageLayout } from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import { getAccessToken, refreshSession, redirectToLogin } from "../../../lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) { redirectToLogin(); throw new Error("Session expired"); }
    res = await doFetch(newToken);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface CategoryStat {
  category: string;
  count: number;
  percentage: number;
  avgConfidence: number;
}

interface CategoryStats {
  totalCategorized: number;
  totalFeedback: number;
  distribution: CategoryStat[];
}

interface SmartRule {
  id: string;
  labelId: string;
  ruleName: string;
  conditions: Record<string, unknown>;
  aiAssisted: boolean;
  accuracy: number | null;
  totalApplied: number;
  totalCorrected: number;
  isActive: boolean;
  createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  work: "bg-brand-600",
  personal: "bg-green-500",
  important: "bg-red-500",
  newsletter: "bg-purple-500",
  social: "bg-amber-400",
  promotional: "bg-orange-400",
  spam: "bg-gray-400",
  notification: "bg-sky-500",
  receipt: "bg-emerald-600",
  travel: "bg-cyan-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  work: "Work",
  personal: "Personal",
  important: "Important",
  newsletter: "Newsletter",
  social: "Social",
  promotional: "Promotional",
  spam: "Spam",
  notification: "Notification",
  receipt: "Receipt / Finance",
  travel: "Travel",
};

export default function AiTriagePage() {
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [rules, setRules] = useState<SmartRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "rules">("overview");
  const [creatingRule, setCreatingRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleLabel, setNewRuleLabel] = useState("work");

  const loadData = useCallback(async () => {
    try {
      const [statsRes, rulesRes] = await Promise.all([
        apiFetch<{ data: CategoryStats }>("/v1/ai/categorize/stats"),
        apiFetch<{ data: SmartRule[] }>("/v1/ai/categorize/smart-rules"),
      ]);
      setStats(statsRes.data);
      setRules(rulesRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load triage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRunBatch = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      await apiFetch<unknown>("/v1/ai/categorize/batch", { method: "POST", body: JSON.stringify({ limit: 100 }) });
      setRunMessage("Categorization started — refreshing stats in 5 seconds...");
      setTimeout(() => { loadData(); setRunMessage(null); }, 5000);
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : "Failed to run categorization");
    } finally {
      setRunning(false);
    }
  };

  const handleToggleRule = async (rule: SmartRule) => {
    try {
      await apiFetch<unknown>(`/v1/ai/categorize/smart-rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
    } catch {
      // non-critical
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await apiFetch<unknown>(`/v1/ai/categorize/smart-rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // non-critical
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleName.trim()) return;
    try {
      const res = await apiFetch<{ data: SmartRule }>("/v1/ai/categorize/smart-rules", {
        method: "POST",
        body: JSON.stringify({
          labelId: newRuleLabel,
          ruleName: newRuleName.trim(),
          conditions: { aiAssisted: true },
          aiAssisted: true,
        }),
      });
      setRules((prev) => [res.data, ...prev]);
      setNewRuleName("");
      setCreatingRule(false);
    } catch {
      // non-critical
    }
  };

  return (
    <PlanGate feature="ai_categorization" required="personal">
      <PageLayout
        title="AI Triage"
        description="AlecRae automatically categorizes every email so you always know what needs attention."
        actions={
          <Button variant="primary" size="sm" onClick={handleRunBatch} loading={running} disabled={running}>
            {running ? "Categorizing..." : "Categorize Inbox Now"}
          </Button>
        }
      >
        {error && (
          <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>
        )}
        {runMessage && (
          <div className="mb-4 p-3 rounded bg-brand-50 text-brand-800 text-sm border border-brand-200">
            {runMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {(["overview", "rules"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-content-secondary hover:text-content"
              }`}
            >
              {t === "overview" ? "Category Overview" : "Smart Rules"}
            </button>
          ))}
        </div>

        {loading ? (
          <Text variant="body-md" muted>Loading...</Text>
        ) : tab === "overview" ? (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="py-4">
                  <Text variant="body-sm" muted>Emails categorized</Text>
                  <Text variant="heading-lg">{stats?.totalCategorized ?? 0}</Text>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <Text variant="body-sm" muted>Categories in use</Text>
                  <Text variant="heading-lg">{stats?.distribution.length ?? 0}</Text>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <Text variant="body-sm" muted>Corrections submitted</Text>
                  <Text variant="heading-lg">{stats?.totalFeedback ?? 0}</Text>
                </CardContent>
              </Card>
            </div>

            {/* Distribution */}
            {stats && stats.distribution.length > 0 ? (
              <Card>
                <CardContent>
                  <Text variant="heading-sm" className="mb-4">Inbox Distribution</Text>
                  <div className="space-y-3">
                    {stats.distribution.map((cat) => (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${CATEGORY_COLORS[cat.category] ?? "bg-gray-400"}`}
                            />
                            <Text variant="body-sm">
                              {CATEGORY_LABELS[cat.category] ?? cat.category}
                            </Text>
                          </div>
                          <div className="flex items-center gap-4">
                            <Text variant="body-sm" muted>
                              {cat.count} emails
                            </Text>
                            <Text variant="body-sm" className="w-12 text-right">
                              {cat.percentage}%
                            </Text>
                          </div>
                        </div>
                        <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CATEGORY_COLORS[cat.category] ?? "bg-gray-400"}`}
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                        {cat.avgConfidence > 0 && (
                          <Text variant="body-sm" muted className="mt-0.5 text-xs">
                            Avg confidence: {Math.round(cat.avgConfidence * 100)}%
                          </Text>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent>
                  <div className="text-center py-8">
                    <Text variant="heading-sm" className="mb-2">No emails categorized yet</Text>
                    <Text variant="body-md" muted className="mb-4">
                      Click &quot;Categorize Inbox Now&quot; to let AI sort your inbox automatically.
                    </Text>
                    <Button variant="primary" size="md" onClick={handleRunBatch} loading={running}>
                      Get Started
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* How it works */}
            <Card>
              <CardContent>
                <Text variant="heading-sm" className="mb-3">How AI Triage Works</Text>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { step: "1", title: "Reads every email", body: "Claude analyzes subject, sender, body, and thread context" },
                    { step: "2", title: "Assigns categories", body: "Work, Personal, Newsletter, Promotional, and 6 more — with a confidence score" },
                    { step: "3", title: "Gets smarter", body: "Each time you correct a category, the model improves for your inbox" },
                  ].map((item) => (
                    <Box key={item.step} className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-sm font-bold flex items-center justify-center">
                        {item.step}
                      </span>
                      <div>
                        <Text variant="body-sm" className="font-semibold">{item.title}</Text>
                        <Text variant="body-sm" muted>{item.body}</Text>
                      </div>
                    </Box>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Smart Rules tab */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Text variant="body-md" muted>
                Smart rules automatically apply labels based on AI-detected patterns.
              </Text>
              <Button variant="primary" size="sm" onClick={() => setCreatingRule(true)}>
                New Rule
              </Button>
            </div>

            {/* Create rule form */}
            {creatingRule && (
              <Card>
                <CardContent>
                  <Text variant="heading-sm" className="mb-3">New Smart Rule</Text>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Rule Name</label>
                      <input
                        type="text"
                        placeholder="e.g. GitHub notifications"
                        value={newRuleName}
                        onChange={(e) => setNewRuleName(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-content placeholder-content-secondary focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Category / Label</label>
                      <select
                        value={newRuleLabel}
                        onChange={(e) => setNewRuleLabel(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="primary" size="sm" onClick={handleCreateRule} disabled={!newRuleName.trim()}>
                        Create Rule
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setCreatingRule(false); setNewRuleName(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {rules.length === 0 ? (
              <Card>
                <CardContent>
                  <div className="text-center py-8">
                    <Text variant="heading-sm" className="mb-2">No smart rules yet</Text>
                    <Text variant="body-md" muted className="mb-4">
                      Create a rule to automatically label emails that match a pattern.
                    </Text>
                  </div>
                </CardContent>
              </Card>
            ) : (
              rules.map((rule) => (
                <Card key={rule.id} className={!rule.isActive ? "opacity-60" : undefined}>
                  <CardContent>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Text variant="body-md" className="font-semibold">{rule.ruleName}</Text>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            CATEGORY_COLORS[rule.labelId] ?? "bg-gray-100"
                          } text-white`}>
                            {CATEGORY_LABELS[rule.labelId] ?? rule.labelId}
                          </span>
                          {rule.aiAssisted && (
                            <span className="px-2 py-0.5 rounded text-xs bg-brand-50 text-brand-700 font-medium">
                              AI
                            </span>
                          )}
                          {!rule.isActive && (
                            <span className="px-2 py-0.5 rounded text-xs bg-surface-secondary text-content-secondary">
                              Paused
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-content-secondary">
                          <span>{rule.totalApplied} applied</span>
                          {rule.totalCorrected > 0 && <span>{rule.totalCorrected} corrected</span>}
                          {rule.accuracy !== null && rule.accuracy !== undefined && (
                            <span>{Math.round(rule.accuracy * 100)}% accuracy</span>
                          )}
                          <span>Created {new Date(rule.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleRule(rule)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border text-content-secondary hover:text-content hover:border-brand-400 transition-colors"
                        >
                          {rule.isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </PageLayout>
    </PlanGate>
  );
}
