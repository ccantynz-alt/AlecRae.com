"use client";

/**
 * SpatialInboxView — 3D thread visualization for power users.
 *
 * Uses @react-three/fiber and @react-three/drei to render email threads
 * as nodes in a 3D space. Positioning axes are configurable:
 *   X = time (default) | priority | category | sender
 *   Y = priority (default) | time | category | sender
 *   Z = category (default) | time | priority | sender
 *
 * Color coding by category. Size by thread activity. Hover for preview.
 * Click to select. Orbit controls for rotation/zoom/pan.
 * InstancedMesh used for 1000+ thread performance.
 *
 * Per CLAUDE.md: TypeScript strict, no `any`, accessible, keyboard-navigable.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Text as DreiText } from "@react-three/drei";
import {
  Color,
  InstancedMesh as ThreeInstancedMesh,
  Matrix4,
  Object3D,
  SphereGeometry,
  MeshStandardMaterial,
  Vector3,
} from "three";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThreadCategory =
  | "work"
  | "personal"
  | "newsletter"
  | "urgent"
  | "social"
  | "finance"
  | "travel"
  | "other";

export type SpatialAxis = "time" | "priority" | "category" | "sender";

export type SpatialColorScheme = "category" | "priority" | "sender" | "recency";

export interface SpatialThread {
  readonly id: string;
  readonly subject: string;
  readonly senderName: string;
  readonly senderEmail: string;
  readonly preview: string;
  readonly category: ThreadCategory;
  readonly priority: number; // 0-1, where 1 is highest
  readonly timestamp: number; // epoch ms
  readonly messageCount: number;
  readonly isUnread: boolean;
  readonly senderGroup: string; // for Z-axis grouping
}

export interface SpatialFilterState {
  readonly dateRange: readonly [number, number] | null;
  readonly categories: ReadonlySet<ThreadCategory> | null;
  readonly senders: ReadonlySet<string> | null;
}

export interface SpatialInboxViewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** Thread data to visualize. */
  threads: readonly SpatialThread[];
  /** Called when user clicks a thread node. */
  onSelectThread?: (threadId: string) => void;
  /** Currently selected thread ID. */
  selectedThreadId?: string;
  /** What the X axis represents. */
  xAxis?: SpatialAxis;
  /** What the Y axis represents. */
  yAxis?: SpatialAxis;
  /** What the Z axis represents. */
  zAxis?: SpatialAxis;
  /** Color scheme. */
  colorScheme?: SpatialColorScheme;
  /** Filter state from control panel. */
  filters?: SpatialFilterState;
  /** Density multiplier (0.5 = spread out, 2 = compressed). */
  density?: number;
  /** Whether to show text labels on clusters. */
  showLabels?: boolean;
  /** Whether to draw particle connections between related threads. */
  showConnections?: boolean;
  /** Extra CSS classes. */
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<ThreadCategory, string> = {
  work: "#3b82f6",       // blue
  personal: "#22c55e",   // green
  newsletter: "#6b7280", // gray
  urgent: "#ef4444",     // red
  social: "#a855f7",     // purple
  finance: "#f59e0b",    // amber
  travel: "#06b6d4",     // cyan
  other: "#78716c",      // stone
};

const PRIORITY_COLORS: readonly string[] = [
  "#6b7280", // low (gray)
  "#3b82f6", // medium-low (blue)
  "#22c55e", // medium (green)
  "#f59e0b", // medium-high (amber)
  "#ef4444", // high (red)
];

const SPACE_RANGE = 20; // units in each direction

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAxisValue(
  thread: SpatialThread,
  axis: SpatialAxis,
  timeRange: readonly [number, number],
  categoryIndex: Map<string, number>,
  senderIndex: Map<string, number>,
): number {
  switch (axis) {
    case "time": {
      const [min, max] = timeRange;
      const range = max - min || 1;
      return ((thread.timestamp - min) / range) * SPACE_RANGE * 2 - SPACE_RANGE;
    }
    case "priority":
      return thread.priority * SPACE_RANGE * 2 - SPACE_RANGE;
    case "category": {
      const idx = categoryIndex.get(thread.category) ?? 0;
      const total = categoryIndex.size || 1;
      return (idx / total) * SPACE_RANGE * 2 - SPACE_RANGE;
    }
    case "sender": {
      const idx = senderIndex.get(thread.senderGroup) ?? 0;
      const total = senderIndex.size || 1;
      return (idx / total) * SPACE_RANGE * 2 - SPACE_RANGE;
    }
  }
}

function getThreadColor(
  thread: SpatialThread,
  scheme: SpatialColorScheme,
  timeRange: readonly [number, number],
  senderIndex: Map<string, number>,
): string {
  switch (scheme) {
    case "category":
      return CATEGORY_COLORS[thread.category];
    case "priority": {
      const idx = Math.min(
        Math.floor(thread.priority * PRIORITY_COLORS.length),
        PRIORITY_COLORS.length - 1,
      );
      return PRIORITY_COLORS[idx] ?? "#6b7280";
    }
    case "sender": {
      const idx = senderIndex.get(thread.senderGroup) ?? 0;
      const hue = (idx * 137.508) % 360; // golden angle for distribution
      return `hsl(${hue}, 60%, 55%)`;
    }
    case "recency": {
      const [min, max] = timeRange;
      const range = max - min || 1;
      const recency = (thread.timestamp - min) / range; // 0-1
      const hue = recency * 120; // red (old) to green (new)
      return `hsl(${hue}, 70%, 50%)`;
    }
  }
}

function getThreadSize(thread: SpatialThread): number {
  // Base size 0.15, scales up with message count, capped at 0.6
  return Math.min(0.15 + thread.messageCount * 0.03, 0.6);
}

function applyFilters(
  threads: readonly SpatialThread[],
  filters: SpatialFilterState | undefined,
): readonly SpatialThread[] {
  if (!filters) return threads;

  return threads.filter((thread) => {
    if (filters.dateRange) {
      const [start, end] = filters.dateRange;
      if (thread.timestamp < start || thread.timestamp > end) return false;
    }
    if (filters.categories && filters.categories.size > 0) {
      if (!filters.categories.has(thread.category)) return false;
    }
    if (filters.senders && filters.senders.size > 0) {
      if (!filters.senders.has(thread.senderGroup)) return false;
    }
    return true;
  });
}

// ─── Instanced Thread Nodes ─────────────────────────────────────────────────

interface ThreadNodesProps {
  threads: readonly SpatialThread[];
  positions: readonly Vector3[];
  colors: readonly string[];
  sizes: readonly number[];
  selectedThreadId: string | undefined;
  focusedIndex: number;
  onSelectThread: ((threadId: string) => void) | undefined;
  onHover: (index: number | null) => void;
}

function ThreadNodes({
  threads,
  positions,
  colors: threadColors,
  sizes,
  selectedThreadId,
  focusedIndex,
  onSelectThread,
  onHover,
}: ThreadNodesProps): React.ReactElement | null {
  const meshRef = useRef<ThreeInstancedMesh>(null);
  const dummyObj = useMemo(() => new Object3D(), []);
  const colorArray = useMemo(() => {
    const arr = new Float32Array(threads.length * 3);
    for (let i = 0; i < threads.length; i++) {
      const c = new Color(threadColors[i] ?? "#888888");
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [threads.length, threadColors]);

  // Update instance matrices
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < threads.length; i++) {
      const pos = positions[i];
      if (!pos) continue;
      const size = sizes[i] ?? 0.2;

      dummyObj.position.copy(pos);

      // Pulse selected/focused nodes
      const isSelected = threads[i]?.id === selectedThreadId;
      const isFocused = i === focusedIndex;
      const scale = isSelected || isFocused ? size * 1.4 : size;
      dummyObj.scale.setScalar(scale);

      dummyObj.updateMatrix();
      mesh.setMatrixAt(i, dummyObj.matrix);

      // Color override for selected
      if (isSelected || isFocused) {
        const c = new Color("#ffffff");
        mesh.setColorAt(i, c);
      } else {
        const c = new Color(threadColors[i] ?? "#888888");
        mesh.setColorAt(i, c);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  // Set initial instance colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < threads.length; i++) {
      const c = new Color(threadColors[i] ?? "#888888");
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [threads.length, threadColors]);

  if (threads.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, threads.length]}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (typeof e.instanceId === "number") {
          onHover(e.instanceId);
          document.body.style.cursor = "pointer";
        }
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
        document.body.style.cursor = "default";
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (typeof e.instanceId === "number") {
          const thread = threads[e.instanceId];
          if (thread) {
            onSelectThread?.(thread.id);
          }
        }
      }}
    >
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial
        vertexColors
        roughness={0.4}
        metalness={0.1}
        transparent
        opacity={0.9}
      />
    </instancedMesh>
  );
}

ThreadNodes.displayName = "ThreadNodes";

// ─── Hover Tooltip ──────────────────────────────────────────────────────────

interface HoverTooltipProps {
  thread: SpatialThread;
  position: Vector3;
}

function HoverTooltip({ thread, position }: HoverTooltipProps): React.ReactElement {
  return (
    <Html position={position} center distanceFactor={15}>
      <div
        className="pointer-events-none select-none rounded-lg bg-gray-900/95 border border-white/10 backdrop-blur-xl shadow-xl p-3 max-w-[240px]"
        role="tooltip"
      >
        <div className="text-xs font-semibold text-white truncate">
          {thread.subject}
        </div>
        <div className="text-[10px] text-white/60 mt-0.5">
          {thread.senderName}
        </div>
        <div className="text-[10px] text-white/40 mt-1 line-clamp-2">
          {thread.preview}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS[thread.category] }}
          />
          <span className="text-[10px] text-white/50 capitalize">
            {thread.category}
          </span>
          <span className="text-[10px] text-white/30">
            {thread.messageCount} msg{thread.messageCount !== 1 ? "s" : ""}
          </span>
          {thread.isUnread && (
            <span className="text-[10px] text-blue-400 font-medium">Unread</span>
          )}
        </div>
      </div>
    </Html>
  );
}

HoverTooltip.displayName = "HoverTooltip";

// ─── Connection Lines ───────────────────────────────────────────────────────

interface ConnectionLinesProps {
  threads: readonly SpatialThread[];
  positions: readonly Vector3[];
}

function ConnectionLines({ threads, positions }: ConnectionLinesProps): React.ReactElement | null {
  // Connect threads from same sender
  const lines = useMemo(() => {
    const senderGroups = new Map<string, number[]>();
    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      if (!thread) continue;
      const existing = senderGroups.get(thread.senderGroup);
      if (existing) {
        existing.push(i);
      } else {
        senderGroups.set(thread.senderGroup, [i]);
      }
    }

    const result: Array<{ from: Vector3; to: Vector3 }> = [];
    for (const [, indices] of senderGroups) {
      // Connect sequential within same sender (limit to avoid clutter)
      const maxConnections = Math.min(indices.length - 1, 5);
      for (let j = 0; j < maxConnections; j++) {
        const fromIdx = indices[j];
        const toIdx = indices[j + 1];
        if (fromIdx === undefined || toIdx === undefined) continue;
        const from = positions[fromIdx];
        const to = positions[toIdx];
        if (from && to) {
          result.push({ from, to });
        }
      }
    }
    return result;
  }, [threads, positions]);

  if (lines.length === 0) return null;

  return (
    <group>
      {lines.map((line, i) => {
        const points = [line.from, line.to];
        return (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    line.from.x, line.from.y, line.from.z,
                    line.to.x, line.to.y, line.to.z,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffffff" opacity={0.08} transparent />
          </line>
        );
      })}
    </group>
  );
}

ConnectionLines.displayName = "ConnectionLines";

// ─── Cluster Labels ─────────────────────────────────────────────────────────

interface ClusterLabelsProps {
  threads: readonly SpatialThread[];
  positions: readonly Vector3[];
}

function ClusterLabels({ threads, positions }: ClusterLabelsProps): React.ReactElement {
  // Group by category and compute centroid
  const labels = useMemo(() => {
    const groups = new Map<string, Vector3[]>();
    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      const pos = positions[i];
      if (!thread || !pos) continue;
      const existing = groups.get(thread.category);
      if (existing) {
        existing.push(pos);
      } else {
        groups.set(thread.category, [pos]);
      }
    }

    const result: Array<{ label: string; position: Vector3; count: number }> = [];
    for (const [category, posArr] of groups) {
      if (posArr.length < 2) continue; // skip single-item clusters
      const centroid = new Vector3();
      for (const p of posArr) {
        centroid.add(p);
      }
      centroid.divideScalar(posArr.length);
      centroid.y += 1.2; // float above the cluster
      result.push({ label: category, position: centroid, count: posArr.length });
    }
    return result;
  }, [threads, positions]);

  return (
    <group>
      {labels.map((item) => (
        <DreiText
          key={item.label}
          position={item.position}
          fontSize={0.5}
          color="#ffffff"
          anchorX="center"
          anchorY="bottom"
          fillOpacity={0.4}
          font={undefined}
        >
          {`${item.label} (${item.count})`}
        </DreiText>
      ))}
    </group>
  );
}

ClusterLabels.displayName = "ClusterLabels";

// ─── Axis Labels ────────────────────────────────────────────────────────────

interface AxisLabelsProps {
  xAxis: SpatialAxis;
  yAxis: SpatialAxis;
  zAxis: SpatialAxis;
}

function AxisLabels({ xAxis, yAxis, zAxis }: AxisLabelsProps): React.ReactElement {
  const axisLabelMap: Record<SpatialAxis, string> = {
    time: "Time",
    priority: "Priority",
    category: "Category",
    sender: "Sender",
  };

  return (
    <group>
      {/* X axis label */}
      <DreiText
        position={[SPACE_RANGE + 2, 0, 0]}
        fontSize={0.4}
        color="#3b82f6"
        anchorX="left"
        anchorY="middle"
        fillOpacity={0.6}
        font={undefined}
      >
        {axisLabelMap[xAxis]}
      </DreiText>
      {/* Y axis label */}
      <DreiText
        position={[0, SPACE_RANGE + 2, 0]}
        fontSize={0.4}
        color="#22c55e"
        anchorX="center"
        anchorY="bottom"
        fillOpacity={0.6}
        font={undefined}
      >
        {axisLabelMap[yAxis]}
      </DreiText>
      {/* Z axis label */}
      <DreiText
        position={[0, 0, SPACE_RANGE + 2]}
        fontSize={0.4}
        color="#a855f7"
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.6}
        font={undefined}
      >
        {axisLabelMap[zAxis]}
      </DreiText>
    </group>
  );
}

AxisLabels.displayName = "AxisLabels";

// ─── Scene ──────────────────────────────────────────────────────────────────

interface SceneProps {
  threads: readonly SpatialThread[];
  xAxis: SpatialAxis;
  yAxis: SpatialAxis;
  zAxis: SpatialAxis;
  colorScheme: SpatialColorScheme;
  density: number;
  showLabels: boolean;
  showConnections: boolean;
  selectedThreadId: string | undefined;
  focusedIndex: number;
  onSelectThread: ((threadId: string) => void) | undefined;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
}

function Scene({
  threads,
  xAxis,
  yAxis,
  zAxis,
  colorScheme,
  density,
  showLabels,
  showConnections,
  selectedThreadId,
  focusedIndex,
  onSelectThread,
  hoveredIndex,
  onHover,
}: SceneProps): React.ReactElement {
  // Compute indices for categories and senders
  const categoryIndex = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const thread of threads) {
      if (!map.has(thread.category)) {
        map.set(thread.category, idx++);
      }
    }
    return map;
  }, [threads]);

  const senderIndex = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const thread of threads) {
      if (!map.has(thread.senderGroup)) {
        map.set(thread.senderGroup, idx++);
      }
    }
    return map;
  }, [threads]);

  // Time range
  const timeRange = useMemo((): readonly [number, number] => {
    if (threads.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const thread of threads) {
      if (thread.timestamp < min) min = thread.timestamp;
      if (thread.timestamp > max) max = thread.timestamp;
    }
    return [min, max] as const;
  }, [threads]);

  // Compute positions
  const positions = useMemo(() => {
    return threads.map((thread) => {
      const x = getAxisValue(thread, xAxis, timeRange, categoryIndex, senderIndex) * density;
      const y = getAxisValue(thread, yAxis, timeRange, categoryIndex, senderIndex) * density;
      const z = getAxisValue(thread, zAxis, timeRange, categoryIndex, senderIndex) * density;
      return new Vector3(x, y, z);
    });
  }, [threads, xAxis, yAxis, zAxis, timeRange, categoryIndex, senderIndex, density]);

  // Compute colors
  const threadColors = useMemo(() => {
    return threads.map((thread) =>
      getThreadColor(thread, colorScheme, timeRange, senderIndex),
    );
  }, [threads, colorScheme, timeRange, senderIndex]);

  // Compute sizes
  const threadSizes = useMemo(() => {
    return threads.map((thread) => getThreadSize(thread));
  }, [threads]);

  const hoveredThread = hoveredIndex !== null ? threads[hoveredIndex] : undefined;
  const hoveredPosition = hoveredIndex !== null ? positions[hoveredIndex] : undefined;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.6} />
      <pointLight position={[-10, -10, -5]} intensity={0.3} color="#6366f1" />

      {/* Controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.8}
        zoomSpeed={1.0}
        panSpeed={0.8}
        minDistance={5}
        maxDistance={80}
      />

      {/* Thread nodes */}
      <ThreadNodes
        threads={threads}
        positions={positions}
        colors={threadColors}
        sizes={threadSizes}
        selectedThreadId={selectedThreadId}
        focusedIndex={focusedIndex}
        onSelectThread={onSelectThread}
        onHover={onHover}
      />

      {/* Connection lines */}
      {showConnections && (
        <ConnectionLines threads={threads} positions={positions} />
      )}

      {/* Cluster labels */}
      {showLabels && (
        <ClusterLabels threads={threads} positions={positions} />
      )}

      {/* Axis labels */}
      <AxisLabels xAxis={xAxis} yAxis={yAxis} zAxis={zAxis} />

      {/* Hover tooltip */}
      {hoveredThread && hoveredPosition && (
        <HoverTooltip thread={hoveredThread} position={hoveredPosition} />
      )}

      {/* Grid helper */}
      <gridHelper args={[SPACE_RANGE * 2, 20, "#1e293b", "#0f172a"]} />
    </>
  );
}

Scene.displayName = "Scene";

// ─── Component ──────────────────────────────────────────────────────────────

export const SpatialInboxView = forwardRef<HTMLDivElement, SpatialInboxViewProps>(
  function SpatialInboxView(
    {
      threads,
      onSelectThread,
      selectedThreadId,
      xAxis = "time",
      yAxis = "priority",
      zAxis = "category",
      colorScheme = "category",
      filters,
      density = 1,
      showLabels = true,
      showConnections = false,
      className,
      ...rest
    },
    ref,
  ) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);

    // Filter threads
    const filteredThreads = useMemo(
      () => applyFilters(threads, filters),
      [threads, filters],
    );

    // Keyboard navigation handler
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>): void => {
        const count = filteredThreads.length;
        if (count === 0) return;

        switch (e.key) {
          case "Tab": {
            e.preventDefault();
            if (e.shiftKey) {
              setFocusedIndex((prev) => (prev <= 0 ? count - 1 : prev - 1));
            } else {
              setFocusedIndex((prev) => (prev >= count - 1 ? 0 : prev + 1));
            }
            break;
          }
          case "Enter":
          case " ": {
            e.preventDefault();
            if (focusedIndex >= 0 && focusedIndex < count) {
              const thread = filteredThreads[focusedIndex];
              if (thread) {
                onSelectThread?.(thread.id);
              }
            }
            break;
          }
          case "Escape": {
            setFocusedIndex(-1);
            break;
          }
        }
      },
      [filteredThreads, focusedIndex, onSelectThread],
    );

    // Announce focused thread for screen readers
    const focusedThread = focusedIndex >= 0 ? filteredThreads[focusedIndex] : undefined;

    return (
      <div
        ref={ref}
        className={`relative w-full h-full min-h-[400px] bg-slate-950 rounded-xl overflow-hidden ${className ?? ""}`}
        role="application"
        aria-label={`Spatial inbox visualization. ${filteredThreads.length} threads displayed in 3D space. Use Tab to navigate between threads, Enter to select.`}
        aria-roledescription="3D email thread visualization"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {/* Screen reader live region for focused thread */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {focusedThread
            ? `Focused: ${focusedThread.subject} from ${focusedThread.senderName}. ${focusedThread.messageCount} messages. Category: ${focusedThread.category}. ${focusedThread.isUnread ? "Unread." : "Read."} Press Enter to select.`
            : ""}
        </div>

        {/* Thread count badge */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] text-white/70 font-medium uppercase tracking-wider">
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-400"
              aria-hidden="true"
            />
            {filteredThreads.length} thread{filteredThreads.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Empty state */}
        {filteredThreads.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="text-white/20 text-sm font-medium mb-1">
                No threads to display
              </div>
              <div className="text-white/10 text-xs">
                Adjust filters or add email accounts to see your inbox in 3D
              </div>
            </div>
          </div>
        )}

        {/* R3F Canvas */}
        <Canvas
          camera={{ position: [25, 15, 25], fov: 50, near: 0.1, far: 200 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          style={{ background: "#020617" }}
        >
          <Scene
            threads={filteredThreads}
            xAxis={xAxis}
            yAxis={yAxis}
            zAxis={zAxis}
            colorScheme={colorScheme}
            density={density}
            showLabels={showLabels}
            showConnections={showConnections}
            selectedThreadId={selectedThreadId}
            focusedIndex={focusedIndex}
            onSelectThread={onSelectThread}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
        </Canvas>

        {/* Keyboard hint */}
        <div
          className="absolute bottom-3 right-3 z-10 pointer-events-none"
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-white/30">
            <span>Drag to rotate</span>
            <span className="text-white/10">|</span>
            <span>Scroll to zoom</span>
            <span className="text-white/10">|</span>
            <span>Tab to navigate</span>
          </span>
        </div>
      </div>
    );
  },
);

SpatialInboxView.displayName = "SpatialInboxView";
