"use client";

/**
 * SpatialControls — control panel for the 3D spatial inbox view.
 *
 * Provides UI to configure:
 *   - What each axis represents (time/priority/category/sender)
 *   - Color scheme (category/priority/sender/recency)
 *   - Filter controls (date range, category, sender)
 *   - Density slider
 *   - Toggle labels on/off
 *   - Reset view button
 *
 * Per CLAUDE.md: TypeScript strict, no `any`, accessible, keyboard-navigable.
 * Uses only the project's primitive components (Box, Text, Button, Card, Input).
 */

import React, { forwardRef, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card, CardContent } from "../primitives/card";
import type {
  SpatialAxis,
  SpatialColorScheme,
  ThreadCategory,
  SpatialFilterState,
} from "./spatial-inbox-view";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpatialControlsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Current X axis mapping. */
  xAxis: SpatialAxis;
  /** Current Y axis mapping. */
  yAxis: SpatialAxis;
  /** Current Z axis mapping. */
  zAxis: SpatialAxis;
  /** Current color scheme. */
  colorScheme: SpatialColorScheme;
  /** Current density. */
  density: number;
  /** Whether cluster labels are shown. */
  showLabels: boolean;
  /** Whether connection lines are shown. */
  showConnections: boolean;
  /** Active filters. */
  filters: SpatialFilterState;
  /** Available categories in the current data set. */
  availableCategories: readonly ThreadCategory[];
  /** Available senders in the current data set. */
  availableSenders: readonly string[];
  /** Callbacks */
  onXAxisChange: (axis: SpatialAxis) => void;
  onYAxisChange: (axis: SpatialAxis) => void;
  onZAxisChange: (axis: SpatialAxis) => void;
  onColorSchemeChange: (scheme: SpatialColorScheme) => void;
  onDensityChange: (density: number) => void;
  onShowLabelsChange: (show: boolean) => void;
  onShowConnectionsChange: (show: boolean) => void;
  onFiltersChange: (filters: SpatialFilterState) => void;
  onResetView: () => void;
  /** Extra CSS classes. */
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const AXIS_OPTIONS: readonly { value: SpatialAxis; label: string }[] = [
  { value: "time", label: "Time" },
  { value: "priority", label: "Priority" },
  { value: "category", label: "Category" },
  { value: "sender", label: "Sender" },
] as const;

const COLOR_SCHEME_OPTIONS: readonly { value: SpatialColorScheme; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "priority", label: "Priority" },
  { value: "sender", label: "Sender" },
  { value: "recency", label: "Recency" },
] as const;

const CATEGORY_LABELS: Record<ThreadCategory, string> = {
  work: "Work",
  personal: "Personal",
  newsletter: "Newsletter",
  urgent: "Urgent",
  social: "Social",
  finance: "Finance",
  travel: "Travel",
  other: "Other",
};

const CATEGORY_DOT_COLORS: Record<ThreadCategory, string> = {
  work: "bg-blue-400",
  personal: "bg-green-400",
  newsletter: "bg-gray-400",
  urgent: "bg-red-400",
  social: "bg-purple-400",
  finance: "bg-amber-400",
  travel: "bg-cyan-400",
  other: "bg-stone-400",
};

// ─── Sub-components ─────────────────────────────────────────────────────────

interface AxisDropdownProps {
  label: string;
  value: SpatialAxis;
  onChange: (axis: SpatialAxis) => void;
  id: string;
  indicatorColor: string;
}

function AxisDropdown({
  label,
  value,
  onChange,
  id,
  indicatorColor,
}: AxisDropdownProps): React.ReactElement {
  return (
    <Box className="flex items-center gap-2">
      <Box
        className={`w-2 h-2 rounded-full ${indicatorColor}`}
        aria-hidden="true"
      />
      <Text
        as="label"
        variant="body-sm"
        className="text-white/50 text-[11px] min-w-[16px] uppercase tracking-wider font-medium"
        htmlFor={id}
      >
        {label}
      </Text>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "time" || val === "priority" || val === "category" || val === "sender") {
            onChange(val);
          }
        }}
        className="flex-1 h-7 px-2 text-xs rounded-md bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-transparent cursor-pointer appearance-none"
        aria-label={`${label}-axis mapping`}
      >
        {AXIS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Box>
  );
}

AxisDropdown.displayName = "AxisDropdown";

// ─── Component ──────────────────────────────────────────────────────────────

export const SpatialControls = forwardRef<HTMLDivElement, SpatialControlsProps>(
  function SpatialControls(
    {
      xAxis,
      yAxis,
      zAxis,
      colorScheme,
      density,
      showLabels,
      showConnections,
      filters,
      availableCategories,
      availableSenders,
      onXAxisChange,
      onYAxisChange,
      onZAxisChange,
      onColorSchemeChange,
      onDensityChange,
      onShowLabelsChange,
      onShowConnectionsChange,
      onFiltersChange,
      onResetView,
      className,
      ...rest
    },
    ref,
  ) {
    // Category filter toggle
    const handleCategoryToggle = useCallback(
      (category: ThreadCategory): void => {
        const current = filters.categories
          ? new Set(filters.categories)
          : new Set<ThreadCategory>();
        if (current.has(category)) {
          current.delete(category);
        } else {
          current.add(category);
        }
        onFiltersChange({
          ...filters,
          categories: current.size > 0 ? current : null,
        });
      },
      [filters, onFiltersChange],
    );

    // Sender filter toggle
    const handleSenderToggle = useCallback(
      (sender: string): void => {
        const current = filters.senders
          ? new Set(filters.senders)
          : new Set<string>();
        if (current.has(sender)) {
          current.delete(sender);
        } else {
          current.add(sender);
        }
        onFiltersChange({
          ...filters,
          senders: current.size > 0 ? current : null,
        });
      },
      [filters, onFiltersChange],
    );

    // Clear all filters
    const handleClearFilters = useCallback((): void => {
      onFiltersChange({
        dateRange: null,
        categories: null,
        senders: null,
      });
    }, [onFiltersChange]);

    const hasActiveFilters =
      filters.dateRange !== null ||
      (filters.categories !== null && filters.categories.size > 0) ||
      (filters.senders !== null && filters.senders.size > 0);

    return (
      <Card
        ref={ref}
        className={`bg-slate-900/95 border-white/10 backdrop-blur-xl ${className ?? ""}`}
        padding="sm"
        {...rest}
      >
        <CardContent>
          <Box
            className="space-y-4"
            role="group"
            aria-label="Spatial inbox controls"
          >
            {/* Header */}
            <Box className="flex items-center justify-between">
              <Box className="flex items-center gap-2">
                <Box
                  className="w-2 h-2 rounded-full bg-violet-400"
                  aria-hidden="true"
                />
                <Text
                  variant="body-sm"
                  className="font-semibold text-violet-200 uppercase tracking-wider text-xs"
                >
                  Spatial View
                </Text>
              </Box>
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetView}
                aria-label="Reset 3D view to default position"
              >
                <Box className="flex items-center gap-1">
                  <Box className="w-3 h-3 text-white/50" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 8a6 6 0 0 1 11.2-3M14 8a6 6 0 0 1-11.2 3" strokeLinecap="round" />
                      <path d="M14 2v3h-3M2 14v-3h3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Box>
                  <Text variant="body-sm" className="text-white/50 text-[10px]">
                    Reset
                  </Text>
                </Box>
              </Button>
            </Box>

            {/* ─── Axis Configuration ──────────────────────────────────── */}
            <Box className="space-y-2">
              <Text
                variant="body-sm"
                className="text-white/30 text-[10px] uppercase tracking-wider font-medium"
              >
                Axes
              </Text>
              <Box className="space-y-1.5">
                <AxisDropdown
                  label="X"
                  value={xAxis}
                  onChange={onXAxisChange}
                  id="spatial-x-axis"
                  indicatorColor="bg-blue-400"
                />
                <AxisDropdown
                  label="Y"
                  value={yAxis}
                  onChange={onYAxisChange}
                  id="spatial-y-axis"
                  indicatorColor="bg-green-400"
                />
                <AxisDropdown
                  label="Z"
                  value={zAxis}
                  onChange={onZAxisChange}
                  id="spatial-z-axis"
                  indicatorColor="bg-purple-400"
                />
              </Box>
            </Box>

            {/* ─── Color Scheme ────────────────────────────────────────── */}
            <Box className="space-y-2">
              <Text
                as="label"
                variant="body-sm"
                className="text-white/30 text-[10px] uppercase tracking-wider font-medium"
                htmlFor="spatial-color-scheme"
              >
                Colors
              </Text>
              <select
                id="spatial-color-scheme"
                value={colorScheme}
                onChange={(e) => {
                  const val = e.target.value;
                  if (
                    val === "category" ||
                    val === "priority" ||
                    val === "sender" ||
                    val === "recency"
                  ) {
                    onColorSchemeChange(val);
                  }
                }}
                className="w-full h-7 px-2 text-xs rounded-md bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-transparent cursor-pointer appearance-none"
                aria-label="Color scheme"
              >
                {COLOR_SCHEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Box>

            {/* ─── Density Slider ──────────────────────────────────────── */}
            <Box className="space-y-2">
              <Box className="flex items-center justify-between">
                <Text
                  as="label"
                  variant="body-sm"
                  className="text-white/30 text-[10px] uppercase tracking-wider font-medium"
                  htmlFor="spatial-density"
                >
                  Density
                </Text>
                <Text
                  variant="body-sm"
                  className="text-white/40 text-[10px]"
                >
                  {density.toFixed(1)}x
                </Text>
              </Box>
              <input
                id="spatial-density"
                type="range"
                min="0.3"
                max="3"
                step="0.1"
                value={density}
                onChange={(e) => onDensityChange(parseFloat(e.target.value))}
                className="w-full h-1 rounded-full bg-white/10 appearance-none cursor-pointer accent-violet-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400"
                aria-label={`Density: ${density.toFixed(1)}x`}
                aria-valuemin={0.3}
                aria-valuemax={3}
                aria-valuenow={density}
              />
            </Box>

            {/* ─── Toggles ─────────────────────────────────────────────── */}
            <Box className="space-y-1.5">
              <ToggleRow
                id="spatial-labels"
                label="Cluster labels"
                checked={showLabels}
                onChange={onShowLabelsChange}
              />
              <ToggleRow
                id="spatial-connections"
                label="Connection lines"
                checked={showConnections}
                onChange={onShowConnectionsChange}
              />
            </Box>

            {/* ─── Category Filter ─────────────────────────────────────── */}
            {availableCategories.length > 0 && (
              <Box className="space-y-2">
                <Text
                  variant="body-sm"
                  className="text-white/30 text-[10px] uppercase tracking-wider font-medium"
                >
                  Filter by category
                </Text>
                <Box className="flex flex-wrap gap-1">
                  {availableCategories.map((cat) => {
                    const isActive =
                      !filters.categories || filters.categories.has(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryToggle(cat)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                          isActive
                            ? "bg-white/10 border-white/20 text-white/80"
                            : "bg-white/2 border-white/5 text-white/30"
                        } hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
                        aria-pressed={isActive}
                        aria-label={`Filter ${CATEGORY_LABELS[cat]}: ${isActive ? "active" : "inactive"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT_COLORS[cat]}`}
                          aria-hidden="true"
                        />
                        {CATEGORY_LABELS[cat]}
                      </button>
                    );
                  })}
                </Box>
              </Box>
            )}

            {/* ─── Sender Filter ───────────────────────────────────────── */}
            {availableSenders.length > 0 && availableSenders.length <= 15 && (
              <Box className="space-y-2">
                <Text
                  variant="body-sm"
                  className="text-white/30 text-[10px] uppercase tracking-wider font-medium"
                >
                  Filter by sender
                </Text>
                <Box className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                  {availableSenders.map((sender) => {
                    const isActive =
                      !filters.senders || filters.senders.has(sender);
                    return (
                      <button
                        key={sender}
                        type="button"
                        onClick={() => handleSenderToggle(sender)}
                        className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                          isActive
                            ? "bg-white/10 border-white/20 text-white/80"
                            : "bg-white/2 border-white/5 text-white/30"
                        } hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
                        aria-pressed={isActive}
                        aria-label={`Filter sender ${sender}: ${isActive ? "active" : "inactive"}`}
                      >
                        {sender}
                      </button>
                    );
                  })}
                </Box>
              </Box>
            )}

            {/* ─── Clear Filters ───────────────────────────────────────── */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="w-full"
                aria-label="Clear all filters"
              >
                <Text variant="body-sm" className="text-white/50 text-xs">
                  Clear all filters
                </Text>
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  },
);

SpatialControls.displayName = "SpatialControls";

// ─── Toggle Row ─────────────────────────────────────────────────────────────

interface ToggleRowProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, checked, onChange }: ToggleRowProps): React.ReactElement {
  return (
    <Box className="flex items-center justify-between">
      <Text
        as="label"
        variant="body-sm"
        className="text-white/50 text-[11px] cursor-pointer"
        htmlFor={id}
      >
        {label}
      </Text>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-4.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
          checked ? "bg-violet-500" : "bg-white/10"
        }`}
        aria-label={`${label}: ${checked ? "on" : "off"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0"
          }`}
          aria-hidden="true"
        />
      </button>
    </Box>
  );
}

ToggleRow.displayName = "ToggleRow";
