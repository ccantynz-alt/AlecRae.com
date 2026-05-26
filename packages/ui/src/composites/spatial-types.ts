/**
 * Type definitions for the spatial inbox view (3D visualization).
 *
 * These types live in a separate file from spatial-inbox-view.tsx because
 * that file imports @react-three/fiber which extends JSX.IntrinsicElements
 * in a way that is incompatible with React 19's JSX namespace at typecheck
 * time. By keeping types here we can barrel-export them from the package
 * index without pulling the R3F file into the typecheck program.
 */

import type { HTMLAttributes } from "react";

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

export type SpatialColorScheme =
  | "category"
  | "priority"
  | "sender"
  | "recency";

export interface SpatialThread {
  readonly id: string;
  readonly subject: string;
  readonly senderName: string;
  readonly senderEmail: string;
  readonly preview: string;
  readonly category: ThreadCategory;
  /** 0–1, where 1 is highest. */
  readonly priority: number;
  /** epoch ms */
  readonly timestamp: number;
  readonly messageCount: number;
  readonly isUnread: boolean;
  /** For Z-axis grouping. */
  readonly senderGroup: string;
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

export interface SpatialControlsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  xAxis: SpatialAxis;
  yAxis: SpatialAxis;
  zAxis: SpatialAxis;
  colorScheme: SpatialColorScheme;
  filters: SpatialFilterState;
  density: number;
  showLabels: boolean;
  showConnections: boolean;
  onAxisChange: (dimension: "x" | "y" | "z", axis: SpatialAxis) => void;
  onColorSchemeChange: (scheme: SpatialColorScheme) => void;
  onFiltersChange: (filters: SpatialFilterState) => void;
  onDensityChange: (density: number) => void;
  onShowLabelsChange: (show: boolean) => void;
  onShowConnectionsChange: (show: boolean) => void;
  className?: string;
}
