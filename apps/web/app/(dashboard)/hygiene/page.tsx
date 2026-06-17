"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { hygieneApi, type SubscriptionData } from "../../../lib/api-features";
import { PlanGate } from "../../../components/plan-gate";

function ScoreRing({ score }: { score: number }): React.ReactNode {
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-amber-500" : "text-red-500";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs work";
  return (
    <Box className="flex flex-col items-center justify-center p-6">
      <Box className={`text-6xl font-bold ${color}`}>{score}</Box>
      <Text variant="caption" className={`font-semibold mt-1 ${color}`}>{label}</Text>
      <Text variant="caption" className="text-content-subtle mt-1">Hygiene Score</Text>
    </Box>
  );
}

function StatBlock({ label, value, unit }: { label: string; value: number | string; unit?: string }): React.ReactNode {
  return (
    <Box className="p-4 rounded-xl border border-border bg-surface-raised text-center">
      <Box className="flex items-baseline justify-center gap-1">
        <Text variant="body-sm" className="text-2xl font-bold text-content">{value}</Text>
        {unit && <Text variant="caption" className="text-content-subtle">{unit}</Text>}
      </Box>
      <Text variant="caption" className="text-content-subtle mt-1">{label}</Text>
    </Box>
  );
}

function HabitBar({ date, sent, received }: { date: string; sent: number; received: number }): React.ReactNode {
  const max = Math.max(sent, received, 1);
  return (
    <Box className="flex flex-col items-center gap-1">
      <Box className="flex gap-0.5 items-end h-12">
        <Box className="w-2 bg-brand-500 rounded-t" style={{ height: `${(sent / max) * 100}%` }} title={`Sent: ${sent}`} />
        <Box className="w-2 bg-surface-tertiary rounded-t" style={{ height: `${(received / max) * 100}%` }} title={`Received: ${received}`} />
      </Box>
      <Text variant="caption" className="text-content-tertiary text-[10px]">
        {new Date(date).toLocaleDateString("en", { weekday: "short" }).slice(0, 2)}
      </Text>
    </Box>
  );
}

export default function HygienePage(): React.ReactNode {
  const [score, setScore] = useState<{ score: number; avgResponseTime: number; unreadCount: number; newslettersPerWeek: number; avgInboxSize: number } | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [habits, setHabits] = useState<{ date: string; sent: number; received: number; responseTime: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [scoreRes, subRes, habitsRes] = await Promise.allSettled([
      hygieneApi.score(),
      hygieneApi.subscriptions(),
      hygieneApi.habits(),
    ]);
    if (scoreRes.status === "fulfilled") setScore(scoreRes.value.data);
    if (subRes.status === "fulfilled") setSubscriptions(subRes.value.data);
    if (habitsRes.status === "fulfilled") setHabits(habitsRes.value.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUnsubscribe = async (id: string): Promise<void> => {
    setUnsubscribingId(id);
    try {
      await hygieneApi.unsubscribe(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setUnsubscribingId(null);
    }
  };

  return (
    <PlanGate feature="email_hygiene" required="personal">
      <PageLayout title="Email Hygiene" description="Understand your email habits and clean up your inbox.">
        {loading ? (
          <Box className="space-y-4">
            {[1, 2, 3].map((i) => <Box key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />)}
          </Box>
        ) : (
          <Box className="space-y-6">
            {/* Score + stats */}
            <Box className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <Box className="col-span-1 rounded-xl border border-border bg-surface-raised">
                <ScoreRing score={score?.score ?? 0} />
              </Box>
              <Box className="col-span-1 sm:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatBlock label="Avg Response Time" value={score?.avgResponseTime?.toFixed(1) ?? "—"} unit="hrs" />
                <StatBlock label="Unread Emails" value={score?.unreadCount ?? 0} />
                <StatBlock label="Newsletters/Week" value={score?.newslettersPerWeek ?? 0} />
                <StatBlock label="Avg Inbox Size" value={score?.avgInboxSize ?? 0} />
              </Box>
            </Box>

            {/* Habits chart */}
            {habits.length > 0 && (
              <Card>
                <CardHeader>
                  <Text variant="body-sm" className="text-sm font-semibold">Email Volume (Last 14 Days)</Text>
                </CardHeader>
                <CardContent>
                  <Box className="flex items-end gap-2 overflow-x-auto pb-2">
                    {habits.slice(-14).map((h) => (
                      <HabitBar key={h.date} date={h.date} sent={h.sent} received={h.received} />
                    ))}
                  </Box>
                  <Box className="flex gap-4 mt-3">
                    <Box className="flex items-center gap-1.5">
                      <Box className="w-3 h-3 rounded-sm bg-brand-500" />
                      <Text variant="caption" className="text-content-subtle">Sent</Text>
                    </Box>
                    <Box className="flex items-center gap-1.5">
                      <Box className="w-3 h-3 rounded-sm bg-surface-tertiary border border-border" />
                      <Text variant="caption" className="text-content-subtle">Received</Text>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Subscription tracker */}
            <Card>
              <CardHeader>
                <Box className="flex items-center justify-between">
                  <Text variant="body-sm" className="text-sm font-semibold">
                    Newsletter Subscriptions ({subscriptions.length})
                  </Text>
                  <Text variant="caption" className="text-content-subtle">AI-detected senders</Text>
                </Box>
              </CardHeader>
              <CardContent>
                {subscriptions.length === 0 ? (
                  <Box className="py-8 text-center">
                    <Text variant="body-sm" className="text-3xl mb-2">✨</Text>
                    <Text variant="body-sm" className="text-content-subtle">No newsletters detected</Text>
                  </Box>
                ) : (
                  <Box className="space-y-2">
                    {subscriptions.map((sub) => (
                      <Box key={sub.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <Box className="flex-1 min-w-0">
                          <Text variant="body-sm" className="font-medium truncate">{sub.senderName || sub.senderEmail}</Text>
                          <Text variant="caption" className="text-content-subtle truncate">{sub.senderEmail}</Text>
                          <Text variant="caption" className="text-content-tertiary">
                            {sub.emailCount} emails · last {new Date(sub.lastReceived).toLocaleDateString()}
                          </Text>
                        </Box>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleUnsubscribe(sub.id)}
                          disabled={unsubscribingId === sub.id}
                          className="flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          {unsubscribingId === sub.id ? "…" : "Unsubscribe"}
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        )}
      </PageLayout>
    </PlanGate>
  );
}
