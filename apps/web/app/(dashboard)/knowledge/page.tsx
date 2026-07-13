"use client";

/**
 * AlecRae — Knowledge Graph
 *
 * AI-built graph of people, companies, projects, and topics extracted from
 * your email. Interactive SVG graph view (radial layout, keyboard-navigable)
 * with an accessible list/table fallback, entity detail panel, stats, and
 * AI-suggested connections.
 *
 * API (mounted at /v1/knowledge — see lib/api-knowledge-graph.ts):
 *   GET    /v1/knowledge/stats
 *   GET    /v1/knowledge/graph?centerEntityId=&maxNodes=
 *   GET    /v1/knowledge/entities?type=&search=&sortBy=&cursor=
 *   GET    /v1/knowledge/entities/:id            (entity + relationships)
 *   PUT    /v1/knowledge/entities/:id            (edit description)
 *   DELETE /v1/knowledge/entities/:id
 *   GET    /v1/knowledge/suggestions
 *
 * Plan gate: pro+ (FEATURE_PLANS.knowledge_graph)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  KnowledgeGraphView,
  KNOWLEDGE_TYPE_LEGEND,
} from "../../../components/knowledge-graph-view";
import {
  knowledgeGraphApi,
  KNOWLEDGE_ENTITY_TYPES,
  type EntitySortBy,
  type GraphData,
  type KnowledgeEntity,
  type KnowledgeEntityType,
  type KnowledgeEntityWithRelationships,
  type KnowledgeStats,
  type KnowledgeSuggestion,
} from "../../../lib/api-knowledge-graph";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function humanizeRelationship(type: string): string {
  return type.replace(/_/g, " ");
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function LoadingSkeleton({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-14 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <Box
      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function EntityTypeBadge({ type }: { type: string }): ReactNode {
  const classes: Record<KnowledgeEntityType, string> = {
    person: "bg-blue-100 text-blue-700",
    company: "bg-purple-100 text-purple-700",
    project: "bg-emerald-100 text-emerald-700",
    topic: "bg-amber-100 text-amber-700",
    product: "bg-red-100 text-red-700",
    event: "bg-cyan-100 text-cyan-700",
    location: "bg-slate-100 text-slate-700",
  };
  const cls =
    classes[type as KnowledgeEntityType] ?? "bg-slate-100 text-slate-700";
  return (
    <Box
      as="span"
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {type}
    </Box>
  );
}
EntityTypeBadge.displayName = "EntityTypeBadge";

// ─── Stats row ─────────────────────────────────────────────────────────────────

function StatsRow({ stats }: { stats: KnowledgeStats }): ReactNode {
  const totalEntities = stats.entitiesByType.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const topType = [...stats.entitiesByType].sort((a, b) => b.count - a.count)[0];

  const cells: { label: string; value: string }[] = [
    { label: "Entities", value: totalEntities.toLocaleString() },
    { label: "Relationships", value: stats.totalRelationships.toLocaleString() },
    { label: "Emails analyzed", value: stats.totalExtractions.toLocaleString() },
    {
      label: "Most common type",
      value: topType ? `${capitalize(topType.entityType)} (${topType.count})` : "—",
    },
  ];

  return (
    <Box className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cells.map(({ label, value }) => (
        <Box
          key={label}
          className="flex flex-col rounded-lg border border-border bg-surface-raised px-4 py-3"
        >
          <Text variant="heading-md" className="font-bold text-content">
            {value}
          </Text>
          <Text variant="caption" className="text-content-subtle mt-0.5">
            {label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
StatsRow.displayName = "StatsRow";

// ─── Graph card ────────────────────────────────────────────────────────────────

function GraphLegend(): ReactNode {
  return (
    <Box
      className="flex flex-wrap items-center gap-x-4 gap-y-1"
      aria-label="Entity type legend"
    >
      {KNOWLEDGE_TYPE_LEGEND.map(({ type, color }) => (
        <Box key={type} className="flex items-center gap-1.5">
          <Box
            as="span"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <Text variant="caption" className="text-content-subtle capitalize">
            {type}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
GraphLegend.displayName = "GraphLegend";

interface GraphCardProps {
  graph: GraphData | null;
  loading: boolean;
  error: string | null;
  centerEntityId: string | null;
  onSelectNode: (id: string) => void;
  onRetry: () => void;
  onResetCenter: () => void;
}

function GraphCard({
  graph,
  loading,
  error,
  centerEntityId,
  onSelectNode,
  onRetry,
  onResetCenter,
}: GraphCardProps): ReactNode {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-2">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Graph
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Click a node (or focus it and press Enter) to center the graph on
              that entity.
            </Text>
          </Box>
          {centerEntityId && (
            <Button variant="ghost" size="sm" onClick={onResetCenter}>
              Reset view
            </Button>
          )}
        </Box>
      </CardHeader>
      <CardContent>
        {loading && (
          <Box
            className="h-96 animate-pulse rounded-lg bg-surface-raised border border-border"
            aria-busy="true"
            aria-label="Loading graph"
          />
        )}
        {!loading && error && <ErrorBanner message={error} onRetry={onRetry} />}
        {!loading && !error && nodes.length === 0 && (
          <Box className="py-12 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No entities in your knowledge graph yet. AlecRae builds it
              automatically as your emails are analyzed.
            </Text>
          </Box>
        )}
        {!loading && !error && nodes.length > 0 && (
          <Box className="space-y-3">
            <Box className="rounded-lg border border-border bg-surface overflow-hidden">
              <KnowledgeGraphView
                nodes={nodes}
                edges={edges}
                centerEntityId={centerEntityId}
                onSelectNode={onSelectNode}
              />
            </Box>
            <GraphLegend />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
GraphCard.displayName = "GraphCard";

// ─── Entity table (list fallback view) ─────────────────────────────────────────

interface EntityTableProps {
  entities: KnowledgeEntity[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  selectedId: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
}

function EntityTable({
  entities,
  loading,
  error,
  hasMore,
  loadingMore,
  selectedId,
  onRetry,
  onLoadMore,
  onSelect,
}: EntityTableProps): ReactNode {
  if (loading) return <LoadingSkeleton rows={5} />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (entities.length === 0) {
    return (
      <Box className="py-12 text-center">
        <Text variant="body-sm" className="text-content-subtle">
          No entities found. Try a different search or type filter — or wait
          for AlecRae to analyze more of your email.
        </Text>
      </Box>
    );
  }

  return (
    <Box className="space-y-3">
      <Box className="overflow-x-auto">
        <Box
          as="table"
          className="w-full text-sm border-collapse"
          aria-label="Knowledge graph entities"
        >
          <Box as="thead">
            <Box as="tr" className="border-b border-border">
              {["Name", "Type", "Mentions", "First seen", "Last seen", ""].map(
                (h, i) => (
                  <Box
                    key={`${h}-${i}`}
                    as="th"
                    className="py-2 pr-4 text-left text-content-subtle font-medium text-xs uppercase tracking-wide"
                  >
                    {h}
                  </Box>
                ),
              )}
            </Box>
          </Box>
          <Box as="tbody">
            {entities.map((entity) => (
              <Box
                key={entity.id}
                as="tr"
                className={`border-b border-border last:border-0 transition-colors ${
                  selectedId === entity.id
                    ? "bg-brand-100/40"
                    : "hover:bg-surface-raised"
                }`}
              >
                <Box as="td" className="py-2.5 pr-4">
                  <Text variant="body-sm" className="font-medium text-content">
                    {entity.name}
                  </Text>
                  {entity.description && (
                    <Text variant="caption" className="text-content-subtle">
                      {entity.description}
                    </Text>
                  )}
                </Box>
                <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                  <EntityTypeBadge type={entity.entityType} />
                </Box>
                <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                  <Text variant="body-sm" className="text-content-subtle">
                    {entity.mentionCount.toLocaleString()}
                  </Text>
                </Box>
                <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                  <Text variant="body-sm" className="text-content-subtle">
                    {formatDate(entity.firstSeenAt)}
                  </Text>
                </Box>
                <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                  <Text variant="body-sm" className="text-content-subtle">
                    {formatDate(entity.lastSeenAt)}
                  </Text>
                </Box>
                <Box as="td" className="py-2.5 whitespace-nowrap text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(entity.id)}
                    aria-label={`View details for ${entity.name}`}
                  >
                    Details
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      {hasMore && (
        <Box className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
EntityTable.displayName = "EntityTable";

// ─── Entity detail panel ───────────────────────────────────────────────────────

interface EntityDetailPanelProps {
  detail: KnowledgeEntityWithRelationships | null;
  loading: boolean;
  error: string | null;
  entityNames: Map<string, string>;
  onRetry: () => void;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveDescription: (id: string, description: string) => Promise<void>;
  deleting: boolean;
}

function EntityDetailPanel({
  detail,
  loading,
  error,
  entityNames,
  onRetry,
  onClose,
  onNavigate,
  onDelete,
  onSaveDescription,
  deleting,
}: EntityDetailPanelProps): ReactNode {
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDescriptionDraft(detail?.description ?? "");
    setEditingDescription(false);
    setSaveError(null);
  }, [detail]);

  async function handleSave(): Promise<void> {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveDescription(detail.id, descriptionDraft);
      setEditingDescription(false);
    } catch (err) {
      setSaveError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-2">
          <Text variant="heading-sm" className="font-semibold">
            Entity details
          </Text>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details">
            Close
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && error && <ErrorBanner message={error} onRetry={onRetry} />}
        {!loading && !error && detail && (
          <Box className="space-y-5">
            {/* Header */}
            <Box className="space-y-1.5">
              <Box className="flex items-center gap-2 flex-wrap">
                <Text variant="heading-md" className="font-bold text-content">
                  {detail.name}
                </Text>
                <EntityTypeBadge type={detail.entityType} />
              </Box>
              <Text variant="caption" className="text-content-subtle">
                {detail.mentionCount.toLocaleString()} mention
                {detail.mentionCount === 1 ? "" : "s"} · first seen{" "}
                {formatDate(detail.firstSeenAt)} · last seen{" "}
                {formatDate(detail.lastSeenAt)}
              </Text>
            </Box>

            {/* Description */}
            <Box className="space-y-2">
              <Text
                variant="caption"
                className="text-content-subtle uppercase tracking-wide"
              >
                Description
              </Text>
              {editingDescription ? (
                <Box className="space-y-2">
                  <Input
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Add a description…"
                    inputSize="sm"
                    aria-label={`Description for ${detail.name}`}
                  />
                  {saveError && (
                    <Text variant="caption" className="text-red-700" role="alert">
                      {saveError}
                    </Text>
                  )}
                  <Box className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleSave()}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingDescription(false);
                        setDescriptionDraft(detail.description ?? "");
                        setSaveError(null);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box className="flex items-start justify-between gap-2">
                  <Text variant="body-sm" className="text-content">
                    {detail.description ?? (
                      <Box as="span" className="text-content-subtle italic">
                        No description yet.
                      </Box>
                    )}
                  </Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingDescription(true)}
                    aria-label={`Edit description for ${detail.name}`}
                  >
                    Edit
                  </Button>
                </Box>
              )}
            </Box>

            {/* Relationships */}
            <Box className="space-y-2">
              <Text
                variant="caption"
                className="text-content-subtle uppercase tracking-wide"
              >
                Relationships ({detail.relationships.length})
              </Text>
              {detail.relationships.length === 0 ? (
                <Text variant="body-sm" className="text-content-subtle">
                  No relationships recorded yet.
                </Text>
              ) : (
                <Box as="ul" className="space-y-1.5" aria-label="Relationships">
                  {detail.relationships.map((rel) => {
                    const otherId =
                      rel.sourceEntityId === detail.id
                        ? rel.targetEntityId
                        : rel.sourceEntityId;
                    const otherName =
                      entityNames.get(otherId) ?? "Unknown entity";
                    return (
                      <Box
                        as="li"
                        key={rel.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2"
                      >
                        <Box className="min-w-0">
                          <Text
                            variant="body-sm"
                            className="font-medium text-content truncate"
                          >
                            {otherName}
                          </Text>
                          <Text variant="caption" className="text-content-subtle">
                            {humanizeRelationship(rel.relationshipType)} ·
                            strength {Math.round(rel.strength * 100)}% ·{" "}
                            {rel.evidence.length} email
                            {rel.evidence.length === 1 ? "" : "s"}
                          </Text>
                        </Box>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigate(otherId)}
                          aria-label={`Center graph on ${otherName}`}
                          className="flex-shrink-0"
                        >
                          View
                        </Button>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>

            {/* Danger zone */}
            <Box className="pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(detail.id)}
                disabled={deleting}
                className="text-red-600 hover:text-red-700"
                aria-label={`Delete ${detail.name} from the knowledge graph`}
              >
                {deleting ? "Deleting…" : "Delete entity"}
              </Button>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
EntityDetailPanel.displayName = "EntityDetailPanel";

// ─── Suggestions card ──────────────────────────────────────────────────────────

interface SuggestionsCardProps {
  suggestions: KnowledgeSuggestion[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onExplore: (entityId: string) => void;
}

function SuggestionsCard({
  suggestions,
  loading,
  error,
  onRetry,
  onExplore,
}: SuggestionsCardProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Suggested connections
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Entities that appear together often but have no recorded relationship.
        </Text>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={2} />}
        {!loading && error && <ErrorBanner message={error} onRetry={onRetry} />}
        {!loading && !error && suggestions.length === 0 && (
          <Box className="py-6 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No suggestions right now.
            </Text>
          </Box>
        )}
        {!loading && !error && suggestions.length > 0 && (
          <Box className="space-y-2">
            {suggestions.map((sug, i) => {
              const firstEntity = sug.entities[0];
              return (
                <Box
                  key={`${sug.type}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3"
                >
                  <Text variant="body-sm" className="text-content">
                    {sug.message}
                  </Text>
                  {firstEntity && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onExplore(firstEntity)}
                      className="flex-shrink-0"
                    >
                      Explore
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
SuggestionsCard.displayName = "SuggestionsCard";

// ─── Inner page (inside plan gate) ─────────────────────────────────────────────

type ViewMode = "graph" | "list";

function KnowledgeContent(): ReactNode {
  // View toggle
  const [view, setView] = useState<ViewMode>("graph");

  // Stats
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Graph
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [centerEntityId, setCenterEntityId] = useState<string | null>(null);

  // Entity list
  const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<KnowledgeEntityType | "all">("all");
  const [sortBy, setSortBy] = useState<EntitySortBy>("mentions");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Detail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeEntityWithRelationships | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(true);
  const [sugError, setSugError] = useState<string | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadStats = useCallback(async (): Promise<void> => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await knowledgeGraphApi.stats();
      setStats({
        entitiesByType: Array.isArray(res.data?.entitiesByType)
          ? res.data.entitiesByType
          : [],
        totalRelationships: res.data?.totalRelationships ?? 0,
        totalExtractions: res.data?.totalExtractions ?? 0,
      });
    } catch (err) {
      setStatsError(errMsg(err));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadGraph = useCallback(
    async (center: string | null): Promise<void> => {
      setGraphLoading(true);
      setGraphError(null);
      try {
        const res = await knowledgeGraphApi.graph({
          maxNodes: 60,
          ...(center ? { centerEntityId: center } : {}),
        });
        setGraph({
          nodes: Array.isArray(res.data?.nodes) ? res.data.nodes : [],
          edges: Array.isArray(res.data?.edges) ? res.data.edges : [],
        });
      } catch (err) {
        setGraphError(errMsg(err));
      } finally {
        setGraphLoading(false);
      }
    },
    [],
  );

  const loadEntities = useCallback(
    async (options: {
      type: KnowledgeEntityType | "all";
      sortBy: EntitySortBy;
      search: string;
      cursor?: string;
    }): Promise<void> => {
      const isLoadMore = options.cursor !== undefined;
      if (isLoadMore) setLoadingMore(true);
      else {
        setListLoading(true);
        setListError(null);
      }
      try {
        const res = await knowledgeGraphApi.listEntities({
          limit: 50,
          sortBy: options.sortBy,
          ...(options.type !== "all" ? { type: options.type } : {}),
          ...(options.search ? { search: options.search } : {}),
          ...(options.cursor ? { cursor: options.cursor } : {}),
        });
        const rows = Array.isArray(res.data) ? res.data : [];
        setEntities((prev) => (isLoadMore ? [...prev, ...rows] : rows));
        setNextCursor(
          res.pagination?.hasMore && res.pagination.nextCursor
            ? res.pagination.nextCursor
            : null,
        );
      } catch (err) {
        setListError(errMsg(err));
      } finally {
        if (isLoadMore) setLoadingMore(false);
        else setListLoading(false);
      }
    },
    [],
  );

  const loadDetail = useCallback(async (id: string): Promise<void> => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await knowledgeGraphApi.getEntity(id);
      setDetail({
        ...res.data,
        relationships: Array.isArray(res.data?.relationships)
          ? res.data.relationships
          : [],
      });
    } catch (err) {
      setDetailError(errMsg(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(async (): Promise<void> => {
    setSugLoading(true);
    setSugError(null);
    try {
      const res = await knowledgeGraphApi.suggestions();
      setSuggestions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setSugError(errMsg(err));
    } finally {
      setSugLoading(false);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    void loadStats();
    void loadGraph(null);
    void loadEntities({ type: "all", sortBy: "mentions", search: "" });
    void loadSuggestions();
  }, [loadStats, loadGraph, loadEntities, loadSuggestions]);

  // ── Derived ──────────────────────────────────────────────────────────────

  /** id → name lookup across everything we've loaded (for relationship rows). */
  const entityNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graph?.nodes ?? []) map.set(n.id, n.name);
    for (const e of entities) map.set(e.id, e.name);
    if (detail) map.set(detail.id, detail.name);
    return map;
  }, [graph, entities, detail]);

  const graphIsEmpty =
    !statsLoading &&
    !statsError &&
    stats !== null &&
    stats.entitiesByType.length === 0 &&
    stats.totalRelationships === 0;

  // ── Actions ──────────────────────────────────────────────────────────────

  function handleSelectEntity(id: string): void {
    setSelectedId(id);
    setCenterEntityId(id);
    void loadGraph(id);
    void loadDetail(id);
  }

  function handleResetCenter(): void {
    setCenterEntityId(null);
    void loadGraph(null);
  }

  function handleCloseDetail(): void {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }

  async function handleDelete(id: string): Promise<void> {
    const name = entityNames.get(id) ?? "this entity";
    if (
      !confirm(
        `Delete "${name}" from your knowledge graph? Its relationships will be removed too.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await knowledgeGraphApi.deleteEntity(id);
      handleCloseDetail();
      if (centerEntityId === id) setCenterEntityId(null);
      void loadGraph(centerEntityId === id ? null : centerEntityId);
      void loadEntities({ type: typeFilter, sortBy, search: searchTerm });
      void loadStats();
    } catch (err) {
      setDetailError(errMsg(err));
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveDescription(
    id: string,
    description: string,
  ): Promise<void> {
    const res = await knowledgeGraphApi.updateEntity(id, { description });
    setDetail((prev) =>
      prev && prev.id === id
        ? { ...prev, description: res.data?.description ?? description }
        : prev,
    );
    setEntities((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, description: res.data?.description ?? description } : e,
      ),
    );
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const term = searchInput.trim();
    setSearchTerm(term);
    void loadEntities({ type: typeFilter, sortBy, search: term });
  }

  function handleTypeFilterChange(value: string): void {
    const next = (KNOWLEDGE_ENTITY_TYPES as readonly string[]).includes(value)
      ? (value as KnowledgeEntityType)
      : "all";
    setTypeFilter(next);
    void loadEntities({ type: next, sortBy, search: searchTerm });
  }

  function handleSortChange(value: string): void {
    const next: EntitySortBy = value === "recent" ? "recent" : "mentions";
    setSortBy(next);
    void loadEntities({ type: typeFilter, sortBy: next, search: searchTerm });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Box className="space-y-6">
      {/* Stats */}
      {statsLoading && (
        <Box className="h-20 animate-pulse rounded-xl bg-surface-raised border border-border" />
      )}
      {!statsLoading && statsError && (
        <ErrorBanner message={statsError} onRetry={() => void loadStats()} />
      )}
      {!statsLoading && !statsError && stats && <StatsRow stats={stats} />}

      {/* First-run empty state */}
      {graphIsEmpty && (
        <Box className="rounded-xl border border-border bg-surface-raised px-6 py-10 text-center">
          <Text variant="heading-sm" className="font-semibold text-content">
            Your knowledge graph is empty
          </Text>
          <Text variant="body-sm" className="text-content-subtle mt-2 max-w-md mx-auto">
            AlecRae extracts people, companies, projects, and topics from your
            email automatically as messages are analyzed. Check back once your
            accounts have synced some mail.
          </Text>
        </Box>
      )}

      {/* View toggle */}
      <Box
        className="flex items-center gap-2"
        role="tablist"
        aria-label="Knowledge graph view mode"
      >
        <Button
          variant={view === "graph" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setView("graph")}
          role="tab"
          aria-selected={view === "graph"}
        >
          Graph view
        </Button>
        <Button
          variant={view === "list" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setView("list")}
          role="tab"
          aria-selected={view === "list"}
        >
          List view
        </Button>
      </Box>

      <Box className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Main column */}
        <Box className={selectedId ? "xl:col-span-2 space-y-6" : "xl:col-span-3 space-y-6"}>
          {view === "graph" && (
            <GraphCard
              graph={graph}
              loading={graphLoading}
              error={graphError}
              centerEntityId={centerEntityId}
              onSelectNode={handleSelectEntity}
              onRetry={() => void loadGraph(centerEntityId)}
              onResetCenter={handleResetCenter}
            />
          )}

          {view === "list" && (
            <Card>
              <CardHeader>
                <Text variant="heading-sm" className="font-semibold">
                  Entities
                </Text>
                <Text variant="body-sm" className="text-content-subtle">
                  Everything AlecRae has learned from your email, as a table.
                </Text>
              </CardHeader>
              <CardContent>
                <Box className="space-y-4">
                  {/* Filters */}
                  <Box className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <Box
                      as="form"
                      onSubmit={handleSearchSubmit}
                      className="flex-1 flex gap-2 items-end"
                      aria-label="Search entities"
                    >
                      <Box className="flex-1">
                        <Input
                          label="Search"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          placeholder="Search entities by name…"
                          inputSize="sm"
                        />
                      </Box>
                      <Button variant="secondary" size="sm" type="submit">
                        Search
                      </Button>
                    </Box>
                    <Box className="flex gap-3">
                      <Box className="flex flex-col gap-1.5">
                        <Text as="label" variant="label" htmlFor="kg-type-filter">
                          Type
                        </Text>
                        <Box
                          as="select"
                          id="kg-type-filter"
                          value={typeFilter}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            handleTypeFilterChange(e.target.value)
                          }
                          className="h-8 px-2 text-sm rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="all">All types</option>
                          {KNOWLEDGE_ENTITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {capitalize(t)}
                            </option>
                          ))}
                        </Box>
                      </Box>
                      <Box className="flex flex-col gap-1.5">
                        <Text as="label" variant="label" htmlFor="kg-sort">
                          Sort by
                        </Text>
                        <Box
                          as="select"
                          id="kg-sort"
                          value={sortBy}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            handleSortChange(e.target.value)
                          }
                          className="h-8 px-2 text-sm rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="mentions">Most mentioned</option>
                          <option value="recent">Recently seen</option>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  <EntityTable
                    entities={entities}
                    loading={listLoading}
                    error={listError}
                    hasMore={nextCursor !== null}
                    loadingMore={loadingMore}
                    selectedId={selectedId}
                    onRetry={() =>
                      void loadEntities({
                        type: typeFilter,
                        sortBy,
                        search: searchTerm,
                      })
                    }
                    onLoadMore={() =>
                      void loadEntities({
                        type: typeFilter,
                        sortBy,
                        search: searchTerm,
                        ...(nextCursor ? { cursor: nextCursor } : {}),
                      })
                    }
                    onSelect={handleSelectEntity}
                  />
                </Box>
              </CardContent>
            </Card>
          )}

          <SuggestionsCard
            suggestions={suggestions}
            loading={sugLoading}
            error={sugError}
            onRetry={() => void loadSuggestions()}
            onExplore={(id) => {
              setView("graph");
              handleSelectEntity(id);
            }}
          />
        </Box>

        {/* Detail column */}
        {selectedId && (
          <Box className="xl:col-span-1">
            <EntityDetailPanel
              detail={detail}
              loading={detailLoading}
              error={detailError}
              entityNames={entityNames}
              onRetry={() => void loadDetail(selectedId)}
              onClose={handleCloseDetail}
              onNavigate={handleSelectEntity}
              onDelete={(id) => void handleDelete(id)}
              onSaveDescription={handleSaveDescription}
              deleting={deleting}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
KnowledgeContent.displayName = "KnowledgeContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function KnowledgePage(): ReactNode {
  return (
    <PageLayout
      title="Knowledge Graph"
      description="People, companies, projects, and topics AlecRae has learned from your email — and how they connect."
    >
      <PlanGate feature="knowledge_graph" required="pro">
        <KnowledgeContent />
      </PlanGate>
    </PageLayout>
  );
}
