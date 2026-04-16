import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";
import {
  ROADMAP,
  computeStats,
  type RoadmapItem,
  type RoadmapStatus,
} from "../../lib/roadmap-data";

export const metadata: Metadata = {
  title: "Roadmap | alecrae.com",
  description:
    "The alecrae.com public roadmap. Everything we've shipped, everything we're working on, and what's coming next.",
};

const STATUS_META: Record<
  RoadmapStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  shipped: {
    label: "Shipped",
    badgeClass: "bg-green-500/10 text-green-600 border-green-500/30",
    dotClass: "bg-green-500",
  },
  in_progress: {
    label: "In progress",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  planned: {
    label: "Planned",
    badgeClass: "bg-slate-500/10 text-slate-600 border-slate-500/30",
    dotClass: "bg-slate-400",
  },
};

function StatusBadge({ status }: { status: RoadmapStatus }): React.JSX.Element {
  const meta = STATUS_META[status];
  return (
    <Box
      className={[
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0",
        meta.badgeClass,
      ].join(" ")}
    >
      <Box className={["w-1.5 h-1.5 rounded-full", meta.dotClass].join(" ")} aria-hidden />
      <Text as="span" className="text-xs font-medium">
        {meta.label}
      </Text>
    </Box>
  );
}

function RoadmapItemRow({ item }: { item: RoadmapItem }): React.JSX.Element {
  return (
    <Box
      id={item.id}
      className="flex items-start gap-3 py-3 border-b border-border last:border-0"
    >
      <StatusBadge status={item.status} />
      <Box className="flex-1 min-w-0">
        <Box className="flex items-baseline gap-2 flex-wrap">
          <Text as="h3" className="font-semibold text-content">
            {item.title}
          </Text>
          {item.shippedAt !== undefined && (
            <Text as="span" className="text-xs text-content-tertiary">
              {item.shippedAt}
            </Text>
          )}
        </Box>
        <Text className="text-sm text-content-secondary mt-1 leading-relaxed">
          {item.description}
        </Text>
      </Box>
    </Box>
  );
}

export default function RoadmapPage(): React.JSX.Element {
  const stats = computeStats();

  return (
    <Box className="min-h-full bg-surface">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <Box
        as="header"
        className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-50"
      >
        <Box className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Box as="a" href="/" className="flex items-center gap-2">
            <Text variant="heading-md" className="text-brand-600 font-bold">
              alecrae.com
            </Text>
          </Box>
          <Text variant="body-sm" className="text-content-secondary">
            Roadmap
          </Text>
        </Box>
      </Box>

      <Box className="max-w-5xl mx-auto px-6 py-12">
        {/* ─── Hero ──────────────────────────────────────────────────────── */}
        <Box className="mb-12">
          <Text as="h1" className="text-4xl font-bold text-content mb-3">
            Public Roadmap
          </Text>
          <Text className="text-lg text-content-secondary leading-relaxed max-w-2xl">
            Everything we&apos;ve shipped, everything we&apos;re working on, and
            what&apos;s coming next. This page is the single source of truth —
            if it&apos;s not here, it&apos;s not planned.
          </Text>
        </Box>

        {/* ─── Stats ─────────────────────────────────────────────────────── */}
        <Box className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <Card>
            <CardContent className="p-5">
              <Text className="text-xs uppercase tracking-wider text-content-tertiary font-semibold">
                Total
              </Text>
              <Text className="text-3xl font-bold text-content mt-1">
                {stats.total}
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Text className="text-xs uppercase tracking-wider text-content-tertiary font-semibold">
                Shipped
              </Text>
              <Box className="flex items-baseline gap-2 mt-1">
                <Text className="text-3xl font-bold text-green-600">
                  {stats.shipped}
                </Text>
                <Text className="text-sm text-content-tertiary">
                  ({stats.percentShipped}%)
                </Text>
              </Box>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Text className="text-xs uppercase tracking-wider text-content-tertiary font-semibold">
                In progress
              </Text>
              <Text className="text-3xl font-bold text-amber-600 mt-1">
                {stats.inProgress}
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Text className="text-xs uppercase tracking-wider text-content-tertiary font-semibold">
                Planned
              </Text>
              <Text className="text-3xl font-bold text-slate-600 mt-1">
                {stats.planned}
              </Text>
            </CardContent>
          </Card>
        </Box>

        {/* ─── Progress bar ──────────────────────────────────────────────── */}
        <Box className="mb-12">
          <Box className="flex items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-content">
              Overall progress
            </Text>
            <Text className="text-sm text-content-tertiary">
              {stats.shipped} of {stats.total} items shipped
            </Text>
          </Box>
          <Box
            className="w-full h-3 bg-surface-secondary rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={stats.percentShipped}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall roadmap progress"
          >
            <Box
              className="h-full bg-green-500 transition-all"
              style={{ width: `${stats.percentShipped}%` }}
            />
          </Box>
        </Box>

        {/* ─── Tier groups ───────────────────────────────────────────────── */}
        <Box className="space-y-12">
          {ROADMAP.map((group) => {
            const tierShipped = group.items.filter(
              (i) => i.status === "shipped",
            ).length;
            return (
              <Box key={group.tier} id={`tier-${group.tier}`}>
                <Box className="mb-5">
                  <Box className="flex items-baseline gap-3 mb-1 flex-wrap">
                    <Text as="h2" className="text-2xl font-bold text-content">
                      {group.label}
                    </Text>
                    <Text className="text-sm text-content-tertiary">
                      {tierShipped} / {group.items.length} shipped
                    </Text>
                  </Box>
                  <Text className="text-content-secondary leading-relaxed max-w-3xl">
                    {group.description}
                  </Text>
                </Box>
                <Card>
                  <CardContent className="p-5">
                    <Box className="flex flex-col">
                      {group.items.map((item) => (
                        <RoadmapItemRow key={item.id} item={item} />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            );
          })}
        </Box>

        {/* ─── Feedback CTA ──────────────────────────────────────────────── */}
        <Card className="mt-16 border-brand-500/30 bg-brand-500/5">
          <CardContent className="p-6">
            <Text as="h3" className="text-lg font-bold text-content mb-2">
              Want something that isn&apos;t here?
            </Text>
            <Text className="text-content-secondary leading-relaxed mb-4">
              We build in public and take requests seriously. If you have an
              idea, an objection, or a use case we&apos;re missing, tell us.
            </Text>
            <Box className="flex flex-wrap gap-3">
              <Box
                as="a"
                href="mailto:hello@alecrae.com?subject=Roadmap%20feedback"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
              >
                <Text className="text-white">Email us</Text>
              </Box>
              <Box
                as="a"
                href="https://github.com/ccantynz-alt/AlecRae.com/issues/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-content font-medium hover:bg-surface-hover transition-colors"
                rel="noopener noreferrer"
              >
                <Text>Open a GitHub issue</Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <Box as="footer" className="border-t border-border mt-16 py-8">
        <Box className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Text variant="caption" className="text-content-tertiary">
            &copy; 2026 alecrae.com. All rights reserved.
          </Text>
          <Box className="flex gap-6">
            <Box as="a" href="/">
              <Text variant="caption" className="text-content-tertiary hover:text-content transition-colors">
                Home
              </Text>
            </Box>
            <Box as="a" href="/changelog">
              <Text variant="caption" className="text-content-tertiary hover:text-content transition-colors">
                Changelog
              </Text>
            </Box>
            <Box as="a" href="/security">
              <Text variant="caption" className="text-content-tertiary hover:text-content transition-colors">
                Security
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
