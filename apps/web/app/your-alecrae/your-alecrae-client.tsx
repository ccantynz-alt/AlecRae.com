"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Text } from "@alecrae/ui";
import type { UserFlywheelStats } from "@alecrae/flywheel";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";
const REFRESH_MS = 90_000;

const PLACEHOLDER: UserFlywheelStats = {
  userId: "you",
  generatedAtIso: new Date().toISOString(),
  voiceProfileConfidence: 0,
  draftsAcceptedCount: 0,
  draftsAcceptedPct: 0,
  minutesSavedEstimate: 0,
  wordsLearned: 0,
  daysActive: 0,
  maturityLabel: "new",
};

const MATURITY_COPY: Record<UserFlywheelStats["maturityLabel"], { label: string; sub: string }> = {
  new: {
    label: "New",
    sub: "AlecRae is meeting you. Send a few emails — the wheel starts turning fast.",
  },
  warming: {
    label: "Warming up",
    sub: "AlecRae is learning your rhythm. Drafts are getting closer to your voice every day.",
  },
  tuned: {
    label: "Tuned",
    sub: "AlecRae sounds like you in most replies. You're saving real time now.",
  },
  expert: {
    label: "Expert",
    sub: "AlecRae is indistinguishable from your own writing. Most drafts ship unedited.",
  },
};

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatMinutes(v: number): string {
  if (v < 60) return `${Math.round(v)} min`;
  const hours = v / 60;
  return `${hours.toFixed(1)} hrs`;
}

function formatWords(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toLocaleString();
}

interface StatProps {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly progress?: number;
}

function StatCard({ label, value, hint, progress }: StatProps): React.JSX.Element {
  return (
    <Box className="rounded-2xl border border-border bg-surface-secondary p-6 flex flex-col gap-3">
      <Text variant="caption" className="text-content-tertiary uppercase tracking-wide">
        {label}
      </Text>
      <Text variant="heading-lg" className="font-bold text-content text-4xl">
        {value}
      </Text>
      {progress !== undefined && (
        <Box className="rounded-full bg-surface h-1.5 overflow-hidden">
          <Box
            className="h-full bg-gradient-to-r from-amber-400 to-green-500"
            style={{
              width: `${Math.max(0, Math.min(100, progress * 100))}%`,
              transition: "width 0.6s ease-out",
            }}
          />
        </Box>
      )}
      <Text variant="body-sm" className="text-content-secondary">
        {hint}
      </Text>
    </Box>
  );
}

export function YourAlecRaeClient(): React.JSX.Element {
  const [stats, setStats] = useState<UserFlywheelStats>(PLACEHOLDER);
  const [status, setStatus] = useState<"placeholder" | "ready" | "error">("placeholder");

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/v1/flywheel/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        setStatus("placeholder");
        return;
      }
      const data = (await res.json()) as UserFlywheelStats;
      setStats(data);
      setStatus("ready");
    } catch {
      setStatus("placeholder");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const maturity = MATURITY_COPY[stats.maturityLabel];

  return (
    <Box className="min-h-screen bg-surface">
      <Box className="max-w-5xl mx-auto px-6 py-16 sm:py-24 flex flex-col gap-12">
        {/* Hero */}
        <Box className="flex flex-col gap-4">
          <Text variant="caption" className="text-content-tertiary uppercase tracking-widest">
            Your AlecRae
          </Text>
          <Text variant="heading-lg" className="font-bold text-content text-5xl sm:text-6xl leading-tight">
            The longer you use AlecRae,
            <br />
            <Box as="span" className="text-amber-500">
              the more it sounds like you.
            </Box>
          </Text>
          <Text variant="body-md" className="text-content-secondary max-w-2xl">
            Every email you send, every draft you accept, every reply you edit teaches the
            AI something Gmail and Outlook can never copy: your voice. This page is the
            wheel turning, in real time.
          </Text>
        </Box>

        {/* Maturity badge */}
        <Box className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <Box className="rounded-xl bg-amber-500/10 px-3 py-1.5 inline-flex w-fit">
            <Text variant="body-sm" className="font-semibold text-amber-600">
              {maturity.label}
            </Text>
          </Box>
          <Text variant="body-md" className="text-content">
            {maturity.sub}
          </Text>
        </Box>

        {/* Stats grid */}
        <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Voice confidence"
            value={status === "ready" ? formatPct(stats.voiceProfileConfidence) : "—"}
            hint="How closely AI drafts match your final sent text. Climbs as the AI learns your phrasing."
            progress={status === "ready" ? stats.voiceProfileConfidence : 0}
          />
          <StatCard
            label="Drafts accepted"
            value={status === "ready" ? stats.draftsAcceptedCount.toLocaleString() : "—"}
            hint={
              status === "ready" && stats.draftsAcceptedPct > 0
                ? `${formatPct(stats.draftsAcceptedPct)} of suggestions used.`
                : "Number of AI drafts you've sent (with or without edits)."
            }
          />
          <StatCard
            label="Time saved"
            value={status === "ready" ? formatMinutes(stats.minutesSavedEstimate) : "—"}
            hint="Estimated minutes back in your day from AI compose + smart reply."
          />
          <StatCard
            label="Words learned"
            value={status === "ready" ? formatWords(stats.wordsLearned) : "—"}
            hint="Words of your writing AlecRae has analysed to sharpen your voice profile."
          />
        </Box>

        {/* The wheel explanation */}
        <Box className="rounded-2xl border border-border bg-surface-secondary p-8 flex flex-col gap-4">
          <Text variant="heading-md" className="text-content font-bold">
            Why this matters
          </Text>
          <Text variant="body-md" className="text-content-secondary">
            Most AI email tools start over with every user. AlecRae compounds. The voice
            profile, the triage rules, the relationship memory — they all sharpen as you
            use the product, and they belong to you. Switching providers later means
            losing months of accumulated value. That's the moat. This page is how you
            watch it grow.
          </Text>
          <Box as="ul" className="text-content-secondary space-y-2 pl-5 list-disc">
            <Box as="li">
              <Box as="strong" className="text-content">
                Voice confidence
              </Box>{" "}
              climbs every time you send an email — whether AI-drafted or not.
            </Box>
            <Box as="li">
              <Box as="strong" className="text-content">
                Drafts accepted
              </Box>{" "}
              tracks how often the AI gets it right on the first try.
            </Box>
            <Box as="li">
              <Box as="strong" className="text-content">
                Time saved
              </Box>{" "}
              is conservative — only counts compose and smart-reply wins, not triage.
            </Box>
            <Box as="li">
              <Box as="strong" className="text-content">
                Days active
              </Box>{" "}
              is {status === "ready" ? `${stats.daysActive}` : "—"} so far. Aim for 60 to reach Expert.
            </Box>
          </Box>
        </Box>

        {/* Footer note */}
        <Box className="text-center">
          <Text variant="caption" className="text-content-tertiary">
            Updated every 90 seconds while this tab is open.
            {status !== "ready" &&
              " Stats appear as soon as you sign in and start using AlecRae."}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
