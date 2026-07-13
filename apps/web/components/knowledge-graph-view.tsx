"use client";

/**
 * KnowledgeGraphView — dependency-free inline-SVG knowledge graph renderer.
 *
 * Deterministic radial layout: the selected (center) entity sits in the
 * middle, entities directly connected to it are placed on an inner ring, and
 * any remaining nodes go on an outer ring (both rings sorted by name for a
 * stable layout). Edges are lines whose width scales with relationship
 * strength; edges touching the center carry a relationship-type label.
 *
 * Accessibility: every node is a keyboard-focusable SVG group
 * (tabIndex=0, role="button", aria-label) — Enter or Space recenters the
 * graph on that node, exactly like a click. A visible focus ring is drawn
 * around the focused node. The page hosting this view provides a list/table
 * fallback for screen-reader-first workflows.
 */

import { useMemo, useState, type ReactNode, type KeyboardEvent } from "react";
import type {
  KnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeRelationship,
} from "../lib/api-knowledge-graph";

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEW_W = 840;
const VIEW_H = 560;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const INNER_RADIUS = 168;
const OUTER_RADIUS = 248;

/** Fill / stroke colors per entity type (inline hex — SVG-safe, theme-stable). */
const TYPE_COLORS: Record<KnowledgeEntityType, { fill: string; stroke: string }> = {
  person: { fill: "#2563eb", stroke: "#1d4ed8" },
  company: { fill: "#7c3aed", stroke: "#6d28d9" },
  project: { fill: "#059669", stroke: "#047857" },
  topic: { fill: "#d97706", stroke: "#b45309" },
  product: { fill: "#dc2626", stroke: "#b91c1c" },
  event: { fill: "#0891b2", stroke: "#0e7490" },
  location: { fill: "#64748b", stroke: "#475569" },
};

const FALLBACK_COLOR = { fill: "#64748b", stroke: "#475569" };

export const KNOWLEDGE_TYPE_LEGEND: readonly {
  type: KnowledgeEntityType;
  color: string;
}[] = [
  { type: "person", color: TYPE_COLORS.person.fill },
  { type: "company", color: TYPE_COLORS.company.fill },
  { type: "project", color: TYPE_COLORS.project.fill },
  { type: "topic", color: TYPE_COLORS.topic.fill },
  { type: "product", color: TYPE_COLORS.product.fill },
  { type: "event", color: TYPE_COLORS.event.fill },
  { type: "location", color: TYPE_COLORS.location.fill },
];

// ─── Layout ──────────────────────────────────────────────────────────────────

interface PositionedNode {
  entity: KnowledgeEntity;
  x: number;
  y: number;
  r: number;
  isCenter: boolean;
}

interface PositionedEdge {
  edge: KnowledgeRelationship;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  touchesCenter: boolean;
}

function nodeRadius(mentionCount: number, isCenter: boolean): number {
  const base = 9 + Math.min(11, Math.sqrt(Math.max(0, mentionCount)) * 2);
  return isCenter ? base + 5 : base;
}

function byNameThenId(a: KnowledgeEntity, b: KnowledgeEntity): number {
  const n = a.name.localeCompare(b.name);
  return n !== 0 ? n : a.id.localeCompare(b.id);
}

function placeOnRing(
  entities: KnowledgeEntity[],
  radius: number,
  isCenterRing: boolean,
): PositionedNode[] {
  const count = entities.length;
  return entities.map((entity, i) => {
    // Start at 12 o'clock, evenly spaced. Deterministic for a sorted input.
    const angle = (2 * Math.PI * i) / Math.max(1, count) - Math.PI / 2;
    return {
      entity,
      x: CX + radius * Math.cos(angle),
      y: CY + radius * Math.sin(angle),
      r: nodeRadius(entity.mentionCount, false),
      isCenter: isCenterRing,
    };
  });
}

function computeLayout(
  nodes: KnowledgeEntity[],
  edges: KnowledgeRelationship[],
  centerId: string | null,
): { positioned: PositionedNode[]; positionedEdges: PositionedEdge[] } {
  if (nodes.length === 0) return { positioned: [], positionedEdges: [] };

  const sorted = [...nodes].sort(byNameThenId);
  // Center: the requested entity if present, otherwise the most-mentioned node.
  const center =
    (centerId ? sorted.find((n) => n.id === centerId) : undefined) ??
    [...sorted].sort((a, b) => b.mentionCount - a.mentionCount)[0];

  if (!center) return { positioned: [], positionedEdges: [] };

  const neighborIds = new Set<string>();
  for (const e of edges) {
    if (e.sourceEntityId === center.id) neighborIds.add(e.targetEntityId);
    if (e.targetEntityId === center.id) neighborIds.add(e.sourceEntityId);
  }

  const inner: KnowledgeEntity[] = [];
  const outer: KnowledgeEntity[] = [];
  for (const n of sorted) {
    if (n.id === center.id) continue;
    if (neighborIds.has(n.id)) inner.push(n);
    else outer.push(n);
  }

  const positioned: PositionedNode[] = [
    {
      entity: center,
      x: CX,
      y: CY,
      r: nodeRadius(center.mentionCount, true),
      isCenter: true,
    },
    ...placeOnRing(inner, INNER_RADIUS, false),
    // If there are no direct neighbors, spread the rest on the inner ring
    // instead so a fresh graph doesn't look artificially sparse.
    ...placeOnRing(outer, inner.length > 0 ? OUTER_RADIUS : INNER_RADIUS, false),
  ];

  const posById = new Map<string, PositionedNode>();
  for (const p of positioned) posById.set(p.entity.id, p);

  const positionedEdges: PositionedEdge[] = [];
  for (const edge of edges) {
    const a = posById.get(edge.sourceEntityId);
    const b = posById.get(edge.targetEntityId);
    // Backend can return edges whose target isn't in the node set — skip those.
    if (!a || !b || a.entity.id === b.entity.id) continue;
    positionedEdges.push({
      edge,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      touchesCenter: a.isCenter || b.isCenter,
    });
  }

  return { positioned, positionedEdges };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function humanizeRelationship(type: string): string {
  return type.replace(/_/g, " ");
}

function truncateLabel(name: string, max = 16): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface KnowledgeGraphViewProps {
  nodes: KnowledgeEntity[];
  edges: KnowledgeRelationship[];
  /** Entity to place at the center. Falls back to the most-mentioned node. */
  centerEntityId: string | null;
  /** Called when a node is clicked or activated via Enter/Space — recenter here. */
  onSelectNode: (entityId: string) => void;
}

export function KnowledgeGraphView({
  nodes,
  edges,
  centerEntityId,
  onSelectNode,
}: KnowledgeGraphViewProps): ReactNode {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { positioned, positionedEdges } = useMemo(
    () => computeLayout(nodes, edges, centerEntityId),
    [nodes, edges, centerEntityId],
  );

  function handleNodeKeyDown(
    event: KeyboardEvent<SVGGElement>,
    entityId: string,
  ): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectNode(entityId);
    }
  }

  if (positioned.length === 0) {
    return null;
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-auto select-none"
      role="group"
      aria-label={`Knowledge graph with ${positioned.length} entities and ${positionedEdges.length} relationships. Use Tab to move between entities; press Enter to center the graph on an entity.`}
    >
      {/* Edges (under nodes) */}
      <g aria-hidden="true">
        {positionedEdges.map(({ edge, x1, y1, x2, y2, touchesCenter }) => {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const strokeWidth = 1 + Math.max(0, Math.min(1, edge.strength)) * 2.5;
          return (
            <g key={edge.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={touchesCenter ? "#94a38f" : "#d5d9d2"}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              >
                <title>
                  {`${humanizeRelationship(edge.relationshipType)} (strength ${edge.strength.toFixed(2)})`}
                </title>
              </line>
              {touchesCenter && (
                <text
                  x={midX}
                  y={midY - 5}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={3}
                >
                  {humanizeRelationship(edge.relationshipType)}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Nodes */}
      {positioned.map(({ entity, x, y, r, isCenter }) => {
        const color = TYPE_COLORS[entity.entityType] ?? FALLBACK_COLOR;
        const isFocused = focusedId === entity.id;
        return (
          <g
            key={entity.id}
            role="button"
            tabIndex={0}
            aria-label={`${entity.name}, ${entity.entityType}, ${entity.mentionCount} mention${entity.mentionCount === 1 ? "" : "s"}${isCenter ? ", currently centered" : ""}. Press Enter to center the graph here.`}
            className="cursor-pointer focus:outline-none"
            onClick={() => onSelectNode(entity.id)}
            onKeyDown={(e) => handleNodeKeyDown(e, entity.id)}
            onFocus={() => setFocusedId(entity.id)}
            onBlur={() =>
              setFocusedId((prev) => (prev === entity.id ? null : prev))
            }
          >
            {/* Focus ring */}
            {isFocused && (
              <circle
                cx={x}
                cy={y}
                r={r + 4}
                fill="none"
                stroke="#1f3d2e"
                strokeWidth={2.5}
                strokeDasharray="4 3"
              />
            )}
            {/* Center highlight halo */}
            {isCenter && (
              <circle
                cx={x}
                cy={y}
                r={r + 7}
                fill={color.fill}
                opacity={0.15}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={color.fill}
              stroke={isCenter ? "#1f2937" : color.stroke}
              strokeWidth={isCenter ? 2.5 : 1.5}
            >
              <title>{`${entity.name} (${entity.entityType})`}</title>
            </circle>
            <text
              x={x}
              y={y + r + 13}
              textAnchor="middle"
              fontSize={isCenter ? 13 : 11}
              fontWeight={isCenter ? 600 : 400}
              fill="#374151"
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth={3}
            >
              {truncateLabel(entity.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
KnowledgeGraphView.displayName = "KnowledgeGraphView";
