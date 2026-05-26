"use client";

/**
 * LocalAIStatusIndicator -- Toolbar badge showing WebGPU AI status.
 *
 * Displays the current state of the client-side AI inference engine:
 *   - Not available: WebGPU unsupported, shown as a muted badge
 *   - Downloading: Model weights being cached, shows progress bar
 *   - Loading: Model being initialized in GPU memory
 *   - Ready: Model loaded, local inference active ($0/token)
 *   - Error: Something went wrong during init
 *
 * The badge is designed to match the FocusModeIndicator pattern --
 * a small pill in the toolbar with a pulsing dot when active.
 *
 * Per CLAUDE.md: ZERO raw HTML in app code. All elements use
 * Tailwind-styled components. Fully accessible with ARIA attributes.
 */

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAPPY, useAlecRaeReducedMotion } from "../lib/animations";
import {
  initLocalAI,
  getLocalAIState,
  getLocalAIStatus,
  onWebGPUProgress,
  type LocalAIStatus,
  type ModelDownloadProgress,
} from "../lib/local-ai";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LocalAIStatusIndicatorProps {
  className?: string;
  /** If true, auto-initialize the local AI engine on mount. Defaults to true. */
  autoInit?: boolean;
  /** If true, show a compact version (dot only, no text). */
  compact?: boolean;
}

type IndicatorPhase =
  | "unavailable"
  | "probing"
  | "downloading"
  | "loading"
  | "compiling"
  | "ready"
  | "error";

interface IndicatorState {
  phase: IndicatorPhase;
  label: string;
  detail: string;
  progress: number;
  modelLabel: string | null;
}

// ─── Phase Styling ──────────────────────────────────────────────────────────

function getPhaseStyles(phase: IndicatorPhase): {
  dotClass: string;
  badgeClass: string;
  pulse: boolean;
} {
  switch (phase) {
    case "unavailable":
      return {
        dotClass: "bg-white/30",
        badgeClass:
          "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60",
        pulse: false,
      };
    case "probing":
      return {
        dotClass: "bg-amber-400/60",
        badgeClass:
          "bg-amber-500/10 border-amber-400/20 text-amber-200/70 hover:bg-amber-500/20",
        pulse: true,
      };
    case "downloading":
      return {
        dotClass: "bg-blue-400",
        badgeClass:
          "bg-blue-500/15 border-blue-400/30 text-blue-200 hover:bg-blue-500/25",
        pulse: true,
      };
    case "loading":
      return {
        dotClass: "bg-blue-400",
        badgeClass:
          "bg-blue-500/15 border-blue-400/30 text-blue-200 hover:bg-blue-500/25",
        pulse: true,
      };
    case "compiling":
      return {
        dotClass: "bg-violet-400",
        badgeClass:
          "bg-violet-500/15 border-violet-400/30 text-violet-200 hover:bg-violet-500/25",
        pulse: true,
      };
    case "ready":
      return {
        dotClass: "bg-emerald-400",
        badgeClass:
          "bg-emerald-500/15 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25",
        pulse: false,
      };
    case "error":
      return {
        dotClass: "bg-red-400",
        badgeClass:
          "bg-red-500/15 border-red-400/30 text-red-200 hover:bg-red-500/25",
        pulse: false,
      };
  }
}

function getPhaseLabel(phase: IndicatorPhase): string {
  switch (phase) {
    case "unavailable":
      return "Cloud AI";
    case "probing":
      return "Detecting GPU...";
    case "downloading":
      return "Downloading AI";
    case "loading":
      return "Loading AI";
    case "compiling":
      return "Compiling...";
    case "ready":
      return "Local AI";
    case "error":
      return "AI Error";
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deriveState(
  status: LocalAIStatus | null,
  downloadProgress: ModelDownloadProgress | null,
): IndicatorState {
  if (!status) {
    return {
      phase: "probing",
      label: getPhaseLabel("probing"),
      detail: "Checking WebGPU support...",
      progress: 0,
      modelLabel: null,
    };
  }

  if (status.initError) {
    return {
      phase: "error",
      label: getPhaseLabel("error"),
      detail: status.initError,
      progress: 0,
      modelLabel: null,
    };
  }

  if (!status.initialized) {
    return {
      phase: "probing",
      label: getPhaseLabel("probing"),
      detail: "Detecting GPU capabilities...",
      progress: 0,
      modelLabel: null,
    };
  }

  if (!status.capabilities?.supported) {
    const reason = status.capabilities?.reason ?? "WebGPU not supported";
    return {
      phase: "unavailable",
      label: getPhaseLabel("unavailable"),
      detail: `Using cloud AI. ${reason}`,
      progress: 0,
      modelLabel: null,
    };
  }

  if (!status.selectedModel) {
    return {
      phase: "unavailable",
      label: getPhaseLabel("unavailable"),
      detail: "Not enough VRAM for local models",
      progress: 0,
      modelLabel: null,
    };
  }

  if (status.modelReady) {
    const avgLatency = status.cacheMetadata?.averageLatencyMs;
    const inferences = status.cacheMetadata?.totalInferences ?? 0;
    const latencyText = avgLatency ? ` | ~${Math.round(avgLatency)}ms avg` : "";
    const inferText = inferences > 0 ? ` | ${inferences} inferences` : "";
    return {
      phase: "ready",
      label: getPhaseLabel("ready"),
      detail: `${status.selectedModelLabel ?? status.selectedModel} on ${status.capabilities.adapter}${latencyText}${inferText} | $0/token`,
      progress: 100,
      modelLabel: status.selectedModelLabel,
    };
  }

  // Model is not loaded yet -- check download progress
  if (downloadProgress) {
    const phase = downloadProgress.phase === "compiling"
      ? "compiling"
      : downloadProgress.phase === "loading"
        ? "loading"
        : "downloading";

    let detail = downloadProgress.text;
    if (
      downloadProgress.downloadedBytes !== undefined &&
      downloadProgress.totalBytes !== undefined
    ) {
      detail = `${formatBytes(downloadProgress.downloadedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`;
    }

    return {
      phase,
      label: getPhaseLabel(phase),
      detail,
      progress: downloadProgress.percent,
      modelLabel: status.selectedModelLabel,
    };
  }

  return {
    phase: "loading",
    label: "Preparing AI...",
    detail: `${status.selectedModelLabel ?? "Model"} selected, waiting to load`,
    progress: 0,
    modelLabel: status.selectedModelLabel,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LocalAIStatusIndicator({
  className,
  autoInit = true,
  compact = false,
}: LocalAIStatusIndicatorProps): React.ReactElement {
  const [status, setStatus] = useState<LocalAIStatus | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<ModelDownloadProgress | null>(null);
  const [expanded, setExpanded] = useState(false);
  const reduced = useAlecRaeReducedMotion();
  const initStartedRef = useRef(false);

  // Subscribe to download progress events
  useEffect(() => {
    const unsubscribe = onWebGPUProgress((progress) => {
      setDownloadProgress(progress);
    });
    return unsubscribe;
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (!autoInit || initStartedRef.current) return;
    initStartedRef.current = true;

    void (async (): Promise<void> => {
      // Probe first (fast, non-blocking)
      await initLocalAI({ probeOnly: true });
      const freshStatus = await getLocalAIStatus();
      setStatus(freshStatus);

      // If WebGPU is available and a model was selected, load it
      const aiState = getLocalAIState();
      if (
        aiState.capabilities?.supported &&
        aiState.selectedModel
      ) {
        void initLocalAI().then(async () => {
          const loadedStatus = await getLocalAIStatus();
          setStatus(loadedStatus);
        });
      }
    })();
  }, [autoInit]);

  // Periodically refresh status while loading
  useEffect(() => {
    if (
      status?.modelReady ||
      status?.initError ||
      !status?.capabilities?.supported
    ) {
      return;
    }

    const interval = setInterval(() => {
      void getLocalAIStatus().then(setStatus);
    }, 2000);

    return (): void => {
      clearInterval(interval);
    };
  }, [status?.modelReady, status?.initError, status?.capabilities?.supported]);

  const handleClick = useCallback((): void => {
    setExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (event.key === "Escape" && expanded) {
        setExpanded(false);
      }
    },
    [expanded],
  );

  const indicatorState = deriveState(status, downloadProgress);
  const styles = getPhaseStyles(indicatorState.phase);
  const showProgress =
    indicatorState.phase === "downloading" ||
    indicatorState.phase === "loading" ||
    indicatorState.phase === "compiling";

  const baseClass =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium " +
    "border transition-colors select-none relative ";

  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      layout={!reduced}
    >
      <motion.button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`${baseClass}${styles.badgeClass}`}
        aria-expanded={expanded}
        aria-label={`Local AI status: ${indicatorState.label}. ${indicatorState.detail}`}
        title={indicatorState.detail}
        {...(reduced ? {} : { whileHover: { scale: 1.04 }, whileTap: { scale: 0.96 } })}
        transition={SPRING_SNAPPY}
      >
        {/* Status dot */}
        <span className="relative flex h-2 w-2" aria-hidden="true">
          {styles.pulse && !reduced && (
            <motion.span
              className={`absolute inline-flex h-full w-full rounded-full ${styles.dotClass}`}
              animate={{ opacity: [0.75, 0, 0.75], scale: [1, 1.8, 1] }}
              transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${styles.dotClass}`}
          />
        </span>

        {/* Label text */}
        {!compact && (
          <span className="tracking-wide uppercase whitespace-nowrap">
            {indicatorState.label}
          </span>
        )}

        {/* Progress percentage during download */}
        {!compact && showProgress && indicatorState.progress > 0 && (
          <span className="text-[10px] font-normal opacity-70 normal-case">
            {indicatorState.progress}%
          </span>
        )}

        {/* Model name when ready */}
        {!compact &&
          indicatorState.phase === "ready" &&
          indicatorState.modelLabel && (
            <span className="text-[10px] font-normal text-emerald-300/70 normal-case">
              {indicatorState.modelLabel}
            </span>
          )}

        {/* Inline progress bar during download */}
        {showProgress && (
          <span
            className="absolute bottom-0 left-0 h-0.5 rounded-full bg-blue-400/50 transition-all duration-300"
            style={{ width: `${indicatorState.progress}%` }}
            role="progressbar"
            aria-valuenow={indicatorState.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Model download progress: ${indicatorState.progress}%`}
          />
        )}
      </motion.button>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={SPRING_SNAPPY}
            className={
              "absolute top-full right-0 mt-2 w-72 rounded-lg border border-white/10 " +
              "bg-gray-900/95 backdrop-blur-xl shadow-xl p-3 z-50"
            }
            role="tooltip"
          >
            <LocalAIDetailPanel
              indicatorState={indicatorState}
              status={status}
              downloadProgress={downloadProgress}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

LocalAIStatusIndicator.displayName = "LocalAIStatusIndicator";

// ─── Detail Panel (shown on expand) ─────────────────────────────────────────

interface DetailPanelProps {
  indicatorState: IndicatorState;
  status: LocalAIStatus | null;
  downloadProgress: ModelDownloadProgress | null;
}

function LocalAIDetailPanel({
  indicatorState,
  status,
  downloadProgress,
}: DetailPanelProps): React.ReactElement {
  return (
    <div className="space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">
          AI Engine
        </span>
        <StatusBadge phase={indicatorState.phase} />
      </div>

      {/* GPU info */}
      {status?.capabilities?.supported && (
        <DetailRow
          label="GPU"
          value={status.capabilities.adapter}
        />
      )}

      {/* VRAM */}
      {status?.capabilities?.supported && status.capabilities.vramMB > 0 && (
        <DetailRow
          label="VRAM"
          value={`~${status.capabilities.vramMB} MB (estimated)`}
        />
      )}

      {/* Model */}
      {status?.selectedModelLabel && (
        <DetailRow label="Model" value={status.selectedModelLabel} />
      )}

      {/* Download progress bar */}
      {downloadProgress &&
        indicatorState.phase !== "ready" &&
        indicatorState.phase !== "error" &&
        indicatorState.phase !== "unavailable" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-white/50">
              <span>{downloadProgress.text}</span>
              <span>{downloadProgress.percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-blue-400/80"
                initial={{ width: 0 }}
                animate={{ width: `${downloadProgress.percent}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            {downloadProgress.downloadedBytes !== undefined &&
              downloadProgress.totalBytes !== undefined && (
                <div className="text-[10px] text-white/40 text-right">
                  {formatBytes(downloadProgress.downloadedBytes)} /{" "}
                  {formatBytes(downloadProgress.totalBytes)}
                </div>
              )}
          </div>
        )}

      {/* Cache info */}
      {status?.cacheMetadata && (
        <div className="border-t border-white/5 pt-2 space-y-1">
          <DetailRow
            label="Cache size"
            value={`${status.cacheMetadata.cacheSizeMB} MB`}
          />
          <DetailRow
            label="Inferences"
            value={String(status.cacheMetadata.totalInferences)}
          />
          {status.cacheMetadata.averageLatencyMs > 0 && (
            <DetailRow
              label="Avg latency"
              value={`${Math.round(status.cacheMetadata.averageLatencyMs)}ms`}
            />
          )}
        </div>
      )}

      {/* Error message */}
      {status?.initError && (
        <div className="border-t border-red-400/20 pt-2">
          <span className="text-[10px] text-red-300/80 break-words">
            {status.initError}
          </span>
        </div>
      )}

      {/* Cost benefit */}
      {indicatorState.phase === "ready" && (
        <div className="border-t border-emerald-400/10 pt-2">
          <span className="text-[10px] text-emerald-300/60">
            AI runs on your GPU. Private, fast, and free.
          </span>
        </div>
      )}

      {/* Unavailable reason */}
      {indicatorState.phase === "unavailable" && (
        <div className="border-t border-white/5 pt-2">
          <span className="text-[10px] text-white/40">
            {indicatorState.detail}. AlecRae uses cloud AI as a fallback.
          </span>
        </div>
      )}
    </div>
  );
}

LocalAIDetailPanel.displayName = "LocalAIDetailPanel";

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ phase }: { phase: IndicatorPhase }): React.ReactElement {
  const colorMap: Record<IndicatorPhase, string> = {
    unavailable: "bg-white/10 text-white/40",
    probing: "bg-amber-500/20 text-amber-300",
    downloading: "bg-blue-500/20 text-blue-300",
    loading: "bg-blue-500/20 text-blue-300",
    compiling: "bg-violet-500/20 text-violet-300",
    ready: "bg-emerald-500/20 text-emerald-300",
    error: "bg-red-500/20 text-red-300",
  };

  const labelMap: Record<IndicatorPhase, string> = {
    unavailable: "Cloud",
    probing: "Probing",
    downloading: "Downloading",
    loading: "Loading",
    compiling: "Compiling",
    ready: "Active",
    error: "Error",
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorMap[phase]}`}
    >
      {labelMap[phase]}
    </span>
  );
}

StatusBadge.displayName = "StatusBadge";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-white/40">{label}</span>
      <span className="text-[10px] text-white/70 text-right max-w-[180px] truncate">
        {value}
      </span>
    </div>
  );
}

DetailRow.displayName = "DetailRow";
