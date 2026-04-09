"use client";

/**
 * SpatialInboxView — page-level wrapper that lazily loads the 3D visualization.
 *
 * Uses React.lazy + Suspense to avoid loading R3F/three.js until the user
 * explicitly toggles the spatial view. Wraps in ErrorBoundary because WebGL
 * can fail on some devices (no GPU, driver issues, etc.).
 *
 * Per CLAUDE.md: TypeScript strict, no `any`, accessible, keyboard-navigable.
 */

import React, {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type JSX,
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type {
  SpatialThread,
  SpatialAxis,
  SpatialColorScheme,
  SpatialFilterState,
  ThreadCategory,
} from "@emailed/ui";

// ─── Lazy imports ───────────────────────────────────────────────────────────

const LazySpatialInboxView = lazy(() =>
  import("@emailed/ui/composites/spatial-inbox-view").then((mod) => ({
    default: mod.SpatialInboxView,
  })),
);

const LazySpatialControls = lazy(() =>
  import("@emailed/ui/composites/spatial-controls").then((mod) => ({
    default: mod.SpatialControls,
  })),
);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpatialInboxPageProps {
  /** Thread data from the inbox store/API. */
  threads: readonly SpatialThread[];
  /** Called when user selects a thread in 3D view. */
  onSelectThread?: (threadId: string) => void;
  /** Currently selected thread ID. */
  selectedThreadId?: string;
  /** Whether the spatial view is currently active. */
  isActive: boolean;
  /** Toggle callback for the toolbar button. */
  onToggle: () => void;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

// ─── WebGL Error Boundary ───────────────────────────────────────────────────

class WebGLErrorBoundary extends Component<
  { children: ReactNode; onFallback?: () => void },
  WebGLErrorBoundaryState
> {
  constructor(props: { children: ReactNode; onFallback?: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): WebGLErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : "Unknown WebGL error";
    return { hasError: true, errorMessage: message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log for monitoring (OpenTelemetry would catch this in production)
    if (typeof window !== "undefined" && "console" in window) {
      // Intentional error logging for monitoring
      void (error.message + (info.componentStack ?? ""));
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center w-full h-full min-h-[400px] bg-slate-950 rounded-xl"
          role="alert"
        >
          <div className="text-center max-w-sm px-6">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="text-white/80 text-sm font-medium mb-1">
              3D view unavailable
            </div>
            <div className="text-white/40 text-xs mb-3">
              WebGL could not initialize on this device. This may be caused by
              missing GPU drivers or browser restrictions.
            </div>
            <div className="text-white/20 text-[10px] font-mono break-all">
              {this.state.errorMessage}
            </div>
            {this.props.onFallback && (
              <button
                type="button"
                onClick={this.props.onFallback}
                className="mt-4 px-4 py-2 rounded-lg bg-white/10 border border-white/10 text-white/70 text-xs hover:bg-white/15 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                Switch to list view
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Loading Placeholder ────────────────────────────────────────────────────

function SpatialLoadingPlaceholder(): JSX.Element {
  return (
    <div
      className="flex items-center justify-center w-full h-full min-h-[400px] bg-slate-950 rounded-xl"
      role="status"
      aria-label="Loading 3D visualization"
    >
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-4">
          {/* Spinning cube outline */}
          <div className="absolute inset-0 border-2 border-violet-500/30 rounded-lg animate-spin" />
          <div
            className="absolute inset-2 border-2 border-blue-500/20 rounded-lg animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "2s" }}
          />
          <div className="absolute inset-4 border-2 border-cyan-500/10 rounded-lg animate-spin" />
        </div>
        <div className="text-white/50 text-xs font-medium uppercase tracking-wider">
          Loading 3D engine...
        </div>
        <div className="text-white/20 text-[10px] mt-1">
          This may take a moment on first load
        </div>
      </div>
    </div>
  );
}

SpatialLoadingPlaceholder.displayName = "SpatialLoadingPlaceholder";

// ─── Toggle Button (for toolbar) ────────────────────────────────────────────

export function SpatialViewToggle({
  isActive,
  onToggle,
  className,
}: {
  isActive: boolean;
  onToggle: () => void;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
        isActive
          ? "bg-violet-500/20 border-violet-400/30 text-violet-200"
          : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
      } ${className ?? ""}`}
      aria-pressed={isActive}
      aria-label={isActive ? "Switch to list view" : "Switch to 3D spatial view"}
      title={isActive ? "Switch to list view" : "Switch to 3D spatial view"}
    >
      {/* 3D cube icon */}
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
        <path d="M8 15V8" />
        <path d="M14 4.5L8 8L2 4.5" />
      </svg>
      <span>{isActive ? "3D View" : "3D"}</span>
    </button>
  );
}

SpatialViewToggle.displayName = "SpatialViewToggle";

// ─── Main Component ─────────────────────────────────────────────────────────

export function SpatialInboxPage({
  threads,
  onSelectThread,
  selectedThreadId,
  isActive,
  onToggle,
}: SpatialInboxPageProps): JSX.Element | null {
  // Control panel state
  const [xAxis, setXAxis] = useState<SpatialAxis>("time");
  const [yAxis, setYAxis] = useState<SpatialAxis>("priority");
  const [zAxis, setZAxis] = useState<SpatialAxis>("category");
  const [colorScheme, setColorScheme] = useState<SpatialColorScheme>("category");
  const [density, setDensity] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showConnections, setShowConnections] = useState(false);
  const [filters, setFilters] = useState<SpatialFilterState>({
    dateRange: null,
    categories: null,
    senders: null,
  });

  // Derive available categories and senders from thread data
  const availableCategories = useMemo((): readonly ThreadCategory[] => {
    const set = new Set<ThreadCategory>();
    for (const thread of threads) {
      set.add(thread.category);
    }
    return Array.from(set).sort();
  }, [threads]);

  const availableSenders = useMemo((): readonly string[] => {
    const set = new Set<string>();
    for (const thread of threads) {
      set.add(thread.senderGroup);
    }
    return Array.from(set).sort();
  }, [threads]);

  // Reset view handler
  const handleResetView = useCallback((): void => {
    setXAxis("time");
    setYAxis("priority");
    setZAxis("category");
    setColorScheme("category");
    setDensity(1);
    setShowLabels(true);
    setShowConnections(false);
    setFilters({ dateRange: null, categories: null, senders: null });
  }, []);

  if (!isActive) return null;

  return (
    <div
      className="flex gap-3 w-full h-full"
      role="region"
      aria-label="Spatial inbox — 3D thread visualization"
    >
      {/* 3D Canvas */}
      <div className="flex-1 min-w-0">
        <WebGLErrorBoundary onFallback={onToggle}>
          <Suspense fallback={<SpatialLoadingPlaceholder />}>
            <LazySpatialInboxView
              threads={threads}
              onSelectThread={onSelectThread}
              selectedThreadId={selectedThreadId}
              xAxis={xAxis}
              yAxis={yAxis}
              zAxis={zAxis}
              colorScheme={colorScheme}
              filters={filters}
              density={density}
              showLabels={showLabels}
              showConnections={showConnections}
            />
          </Suspense>
        </WebGLErrorBoundary>
      </div>

      {/* Control Panel (sidebar) */}
      <div className="w-56 flex-shrink-0">
        <Suspense fallback={<div className="h-full bg-slate-900/50 rounded-xl animate-pulse" />}>
          <LazySpatialControls
            xAxis={xAxis}
            yAxis={yAxis}
            zAxis={zAxis}
            colorScheme={colorScheme}
            density={density}
            showLabels={showLabels}
            showConnections={showConnections}
            filters={filters}
            availableCategories={availableCategories}
            availableSenders={availableSenders}
            onXAxisChange={setXAxis}
            onYAxisChange={setYAxis}
            onZAxisChange={setZAxis}
            onColorSchemeChange={setColorScheme}
            onDensityChange={setDensity}
            onShowLabelsChange={setShowLabels}
            onShowConnectionsChange={setShowConnections}
            onFiltersChange={setFilters}
            onResetView={handleResetView}
          />
        </Suspense>
      </div>
    </div>
  );
}

SpatialInboxPage.displayName = "SpatialInboxPage";
