"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  PageLayout,
} from "@emailed/ui";
import { bouncesApi, type Bounce, type BounceStats } from "../../../lib/api";

export default function BouncesPage() {
  const [bounces, setBounces] = useState<Bounce[]>([]);
  const [stats, setStats] = useState<BounceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadData = useCallback(async (append = false) => {
    try {
      setError(null);
      if (!append) setLoading(true);

      const params = {
        type: typeFilter || undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
        cursor: append ? cursor ?? undefined : undefined,
        limit: 25,
      };

      const [bouncesRes, statsRes] = await Promise.all([
        bouncesApi.list(params),
        !append ? bouncesApi.stats({ from: dateRange.from || undefined, to: dateRange.to || undefined }) : Promise.resolve(null),
      ]);

      if (append) {
        setBounces((prev) => [...prev, ...bouncesRes.data]);
      } else {
        setBounces(bouncesRes.data);
      }
      setCursor(bouncesRes.cursor);
      setHasMore(bouncesRes.hasMore);

      if (statsRes) {
        setStats(statsRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bounces");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateRange, cursor]);

  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, dateRange]);

  return (
    <PageLayout
      title="Bounces"
      description="Monitor email bounces and complaint rates. Identify delivery issues and maintain sender reputation."
    >
      {error && (
        <Box className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">
          {error}
        </Box>
      )}

      {/* Stats cards */}
      {stats && <StatsCards stats={stats} />}

      {/* Bounce rate trending */}
      {stats && stats.trending.length > 0 && (
        <Box className="mb-6">
          <Text variant="heading-sm" className="mb-4">
            Bounce Trend
          </Text>
          <Card>
            <CardContent>
              <TrendChart data={stats.trending} />
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Filters */}
      <Box className="flex flex-col sm:flex-row gap-3 mb-6">
        <Box>
          <Box
            as="select"
            className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={typeFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}
          >
            <Box as="option" value="">All types</Box>
            <Box as="option" value="hard">Hard bounces</Box>
            <Box as="option" value="soft">Soft bounces</Box>
          </Box>
        </Box>
        <Box className="flex items-center gap-2">
          <Box
            as="input"
            type="date"
            className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={dateRange.from}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDateRange((prev) => ({ ...prev, from: e.target.value }))
            }
          />
          <Text variant="body-sm" muted>
            to
          </Text>
          <Box
            as="input"
            type="date"
            className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={dateRange.to}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDateRange((prev) => ({ ...prev, to: e.target.value }))
            }
          />
        </Box>
      </Box>

      {/* Bounces list */}
      <Text variant="heading-sm" className="mb-4">
        Recent Bounces
      </Text>

      {loading ? (
        <Text variant="body-md" muted>
          Loading bounces...
        </Text>
      ) : bounces.length === 0 ? (
        <Card>
          <CardContent>
            <Box className="text-center py-8">
              <Text variant="heading-sm" className="mb-2">
                No bounces found
              </Text>
              <Text variant="body-sm" muted>
                {typeFilter || dateRange.from || dateRange.to
                  ? "No bounces match your current filters. Try adjusting the criteria."
                  : "Great news -- no bounces recorded yet. Keep your lists clean to maintain this status."}
              </Text>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box className="space-y-2">
          {/* Table header */}
          <Box className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2">
            <Text variant="caption" muted className="col-span-4 font-semibold uppercase tracking-wider">
              Recipient
            </Text>
            <Text variant="caption" muted className="col-span-1 font-semibold uppercase tracking-wider">
              Type
            </Text>
            <Text variant="caption" muted className="col-span-2 font-semibold uppercase tracking-wider">
              Category
            </Text>
            <Text variant="caption" muted className="col-span-3 font-semibold uppercase tracking-wider">
              Diagnostic
            </Text>
            <Text variant="caption" muted className="col-span-2 font-semibold uppercase tracking-wider">
              Date
            </Text>
          </Box>

          {bounces.map((bounce) => (
            <BounceRow key={bounce.id} bounce={bounce} />
          ))}

          {hasMore && (
            <Box className="text-center pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadData(true)}
              >
                Load more
              </Button>
            </Box>
          )}
        </Box>
      )}
    </PageLayout>
  );
}

function StatsCards({ stats }: { stats: BounceStats }) {
  const cards = [
    {
      label: "Total Bounces",
      value: stats.total.toLocaleString(),
      color: "text-content",
    },
    {
      label: "Hard Bounces",
      value: stats.hard.toLocaleString(),
      color: "text-red-600",
    },
    {
      label: "Soft Bounces",
      value: stats.soft.toLocaleString(),
      color: "text-orange-600",
    },
    {
      label: "Bounce Rate",
      value: `${(stats.bounceRate * 100).toFixed(2)}%`,
      color: stats.bounceRate > 0.05 ? "text-red-600" : "text-green-600",
    },
    {
      label: "Complaint Rate",
      value: `${(stats.complaintRate * 100).toFixed(3)}%`,
      color: stats.complaintRate > 0.001 ? "text-red-600" : "text-green-600",
    },
  ];

  return (
    <Box className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent>
            <Text variant="caption" muted className="uppercase tracking-wider font-semibold">
              {card.label}
            </Text>
            <Text variant="heading-md" className={`mt-1 ${card.color}`}>
              {card.value}
            </Text>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

StatsCards.displayName = "StatsCards";

function TrendChart({
  data,
}: {
  data: Array<{ date: string; hard: number; soft: number }>;
}) {
  const maxValue = Math.max(...data.map((d) => d.hard + d.soft), 1);

  return (
    <Box>
      <Box className="flex items-center gap-4 mb-3">
        <Box className="flex items-center gap-1.5">
          <Box className="w-3 h-3 rounded-sm bg-red-500" />
          <Text variant="caption">Hard</Text>
        </Box>
        <Box className="flex items-center gap-1.5">
          <Box className="w-3 h-3 rounded-sm bg-orange-400" />
          <Text variant="caption">Soft</Text>
        </Box>
      </Box>
      <Box className="flex items-end gap-1 h-40">
        {data.map((point, i) => {
          const hardHeight = (point.hard / maxValue) * 100;
          const softHeight = (point.soft / maxValue) * 100;
          const dateLabel = new Date(point.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <Box
              key={i}
              className="flex-1 flex flex-col items-center gap-0"
              title={`${dateLabel}: ${point.hard} hard, ${point.soft} soft`}
            >
              <Box className="w-full flex flex-col justify-end" style={{ height: "128px" }}>
                <Box
                  className="w-full bg-orange-400 rounded-t-sm"
                  style={{ height: `${softHeight}%`, minHeight: point.soft > 0 ? "2px" : "0" }}
                />
                <Box
                  className="w-full bg-red-500"
                  style={{ height: `${hardHeight}%`, minHeight: point.hard > 0 ? "2px" : "0" }}
                />
              </Box>
              {data.length <= 14 && (
                <Text variant="caption" muted className="mt-1 text-center whitespace-nowrap" style={{ fontSize: "10px" }}>
                  {dateLabel}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

TrendChart.displayName = "TrendChart";

function BounceRow({ bounce }: { bounce: Bounce }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent>
        <Box
          className="sm:grid grid-cols-12 gap-4 items-center cursor-pointer"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <Box className="col-span-4">
            <Text variant="body-sm" className="font-medium truncate font-mono">
              {bounce.recipient}
            </Text>
          </Box>
          <Box className="col-span-1">
            <Box
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                bounce.type === "hard"
                  ? "bg-red-100 text-red-700"
                  : "bg-orange-100 text-orange-700"
              }`}
            >
              {bounce.type}
            </Box>
          </Box>
          <Box className="col-span-2">
            <Text variant="body-sm" muted>
              {bounce.category}
            </Text>
          </Box>
          <Box className="col-span-3">
            <Text variant="body-sm" muted className="truncate">
              {bounce.diagnosticCode || "--"}
            </Text>
          </Box>
          <Box className="col-span-2">
            <Text variant="caption" muted>
              {new Date(bounce.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </Box>
        </Box>
        {expanded && (
          <Box className="mt-3 pt-3 border-t border-border space-y-2">
            {bounce.mxHost && (
              <Box className="flex gap-2">
                <Text variant="caption" className="font-semibold min-w-[80px]">
                  MX Host:
                </Text>
                <Text variant="caption" muted className="font-mono">
                  {bounce.mxHost}
                </Text>
              </Box>
            )}
            {bounce.diagnosticCode && (
              <Box className="flex gap-2">
                <Text variant="caption" className="font-semibold min-w-[80px]">
                  Diagnostic:
                </Text>
                <Text variant="caption" muted className="font-mono break-all">
                  {bounce.diagnosticCode}
                </Text>
              </Box>
            )}
            {bounce.messageId && (
              <Box className="flex gap-2">
                <Text variant="caption" className="font-semibold min-w-[80px]">
                  Message ID:
                </Text>
                <Text variant="caption" muted className="font-mono break-all">
                  {bounce.messageId}
                </Text>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

BounceRow.displayName = "BounceRow";
