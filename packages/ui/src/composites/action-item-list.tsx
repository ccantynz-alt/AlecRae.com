"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card, CardContent } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface ExtractedActionItem {
  readonly title: string;
  readonly description: string;
  readonly dueDate: string | null;
  readonly assignee: string | null;
  readonly priority: TaskPriority;
  readonly confidence: number;
  readonly sourceEmailId: string;
}

export interface TaskProvider {
  readonly name: string;
  readonly displayName: string;
  readonly connected: boolean;
  readonly isDefault: boolean;
}

export type ExtractionState = "idle" | "extracting" | "extracted" | "error";
export type CreateState = "idle" | "creating" | "created" | "error";

export interface ActionItemListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Current extraction state. */
  state: ExtractionState;
  /** Extracted action items. */
  items: readonly ExtractedActionItem[];
  /** Available providers. */
  providers: readonly TaskProvider[];
  /** Currently selected provider name. */
  selectedProvider: string;
  /** Error message (when state="error"). */
  errorMessage?: string;
  /** State of task creation. */
  createState: CreateState;
  /** Number of tasks successfully created. */
  createdCount?: number;
  /** Called when user changes the selected provider. */
  onProviderChange: (providerName: string) => void;
  /** Called when user toggles an item's selection. */
  onToggleItem: (index: number) => void;
  /** Which items are selected (by index). */
  selectedItems: ReadonlySet<number>;
  /** Called when user clicks "Create Tasks". */
  onCreateTasks: () => void;
  /** Called when user clicks "Extract" to start/retry extraction. */
  onExtract: () => void;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── Priority styling ───────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<TaskPriority, { dot: string; label: string; bg: string }> = {
  urgent: { dot: "bg-red-400", label: "Urgent", bg: "bg-red-500/10" },
  high: { dot: "bg-orange-400", label: "High", bg: "bg-orange-500/10" },
  normal: { dot: "bg-blue-400", label: "Normal", bg: "bg-blue-500/10" },
  low: { dot: "bg-slate-400", label: "Low", bg: "bg-slate-500/10" },
};

// ─── Confidence badge ───────────────────────────────────────────────────────

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 0.8) return { text: "High confidence", color: "text-emerald-400" };
  if (score >= 0.5) return { text: "Medium confidence", color: "text-amber-400" };
  return { text: "Low confidence", color: "text-slate-400" };
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ActionItemList = forwardRef<HTMLDivElement, ActionItemListProps>(
  function ActionItemList(
    {
      state,
      items,
      providers,
      selectedProvider,
      errorMessage,
      createState,
      createdCount,
      onProviderChange,
      onToggleItem,
      selectedItems,
      onCreateTasks,
      onExtract,
      className,
      ...rest
    },
    ref,
  ) {
    const selectedCount = selectedItems.size;
    const hasSelection = selectedCount > 0;

    return (
      <Box
        ref={ref}
        className={`space-y-4 ${className ?? ""}`}
        role="region"
        aria-label="Action items extracted from email thread"
        {...rest}
      >
        {/* Header */}
        <Box className="flex items-center justify-between">
          <Box className="flex items-center gap-2">
            <Box className="w-2 h-2 rounded-full bg-violet-400" role="presentation" />
            <Text
              variant="body-sm"
              className="font-semibold text-violet-200 uppercase tracking-wider text-xs"
            >
              Action Items
            </Text>
            {state === "extracted" && (
              <Text variant="body-sm" className="text-white/40 text-xs">
                {items.length} found
              </Text>
            )}
          </Box>
          {state === "idle" && (
            <Button variant="primary" size="sm" onClick={onExtract}>
              Extract Tasks
            </Button>
          )}
          {state === "error" && (
            <Button variant="ghost" size="sm" onClick={onExtract}>
              Retry
            </Button>
          )}
        </Box>

        {/* Loading state */}
        {state === "extracting" && (
          <Card className="bg-white/5 border-white/10" padding="md">
            <CardContent>
              <Box className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Box key={i} className="space-y-2">
                    <Box
                      className="h-3 rounded bg-white/5 animate-pulse"
                      style={{ width: `${50 + i * 10}%` }}
                    />
                    <Box
                      className="h-2 rounded bg-white/5 animate-pulse"
                      style={{ width: `${30 + i * 5}%` }}
                    />
                  </Box>
                ))}
              </Box>
              <Text variant="body-sm" className="text-white/40 text-xs mt-3">
                Analyzing thread for action items...
              </Text>
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {state === "error" && (
          <Card className="bg-red-950/30 border-red-500/20" padding="sm">
            <CardContent>
              <Text variant="body-sm" className="text-red-300">
                {errorMessage ?? "Failed to extract action items"}
              </Text>
            </CardContent>
          </Card>
        )}

        {/* Extracted items */}
        {state === "extracted" && items.length === 0 && (
          <Card className="bg-white/5 border-white/10" padding="md">
            <CardContent>
              <Text variant="body-sm" className="text-white/50">
                No action items found in this thread.
              </Text>
            </CardContent>
          </Card>
        )}

        {state === "extracted" && items.length > 0 && (
          <Box className="space-y-3">
            {/* Provider selector + create button */}
            <Box className="flex items-center gap-3">
              <ProviderDropdown
                providers={providers}
                selected={selectedProvider}
                onChange={onProviderChange}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={onCreateTasks}
                disabled={!hasSelection || createState === "creating"}
                aria-label={`Create ${selectedCount} tasks in ${selectedProvider}`}
              >
                {createState === "creating"
                  ? "Creating..."
                  : createState === "created"
                    ? `Created ${createdCount ?? 0} tasks`
                    : `Create ${selectedCount} task${selectedCount !== 1 ? "s" : ""}`}
              </Button>
            </Box>

            {/* Task creation error */}
            {createState === "error" && (
              <Card className="bg-red-950/30 border-red-500/20" padding="sm">
                <CardContent>
                  <Text variant="body-sm" className="text-red-300 text-xs">
                    Some tasks failed to create. Check provider connection.
                  </Text>
                </CardContent>
              </Card>
            )}

            {/* Item list */}
            <Box className="space-y-2" role="list" aria-label="Extracted action items">
              {items.map((item, idx) => {
                const isSelected = selectedItems.has(idx);
                const priority = PRIORITY_STYLES[item.priority];
                const conf = confidenceLabel(item.confidence);

                return (
                  <Card
                    key={idx}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-violet-500/10 border-violet-500/30"
                        : "bg-white/5 border-white/10 hover:bg-white/8"
                    }`}
                    padding="sm"
                    onClick={() => onToggleItem(idx)}
                    hoverable
                  >
                    <Box className="flex items-start gap-3" role="listitem">
                      {/* Checkbox */}
                      <Box
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-violet-500 border-violet-500"
                            : "border-white/20 hover:border-white/40"
                        }`}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Select: ${item.title}`}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleItem(idx);
                          }
                        }}
                      >
                        {isSelected && (
                          <Box className="w-2.5 h-2.5 text-white" role="presentation">
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          </Box>
                        )}
                      </Box>

                      {/* Content */}
                      <Box className="flex-1 min-w-0">
                        <Box className="flex items-center gap-2 flex-wrap">
                          <Text variant="body-sm" className="font-medium text-white truncate">
                            {item.title}
                          </Text>
                          {/* Priority badge */}
                          <Box className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${priority.bg}`}>
                            <Box className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                            <Text variant="body-sm" className="text-[10px] text-white/70 uppercase tracking-wider">
                              {priority.label}
                            </Text>
                          </Box>
                        </Box>

                        {item.description.length > 0 && (
                          <Text variant="body-sm" className="text-white/50 text-xs mt-1 line-clamp-2">
                            {item.description}
                          </Text>
                        )}

                        <Box className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {item.assignee !== null && (
                            <Text variant="body-sm" className="text-white/40 text-[10px]">
                              Assignee: {item.assignee}
                            </Text>
                          )}
                          {item.dueDate !== null && (
                            <Text variant="body-sm" className="text-white/40 text-[10px]">
                              Due: {new Date(item.dueDate).toLocaleDateString()}
                            </Text>
                          )}
                          <Text variant="body-sm" className={`text-[10px] ${conf.color}`}>
                            {conf.text} ({Math.round(item.confidence * 100)}%)
                          </Text>
                        </Box>
                      </Box>
                    </Box>
                  </Card>
                );
              })}
            </Box>

            {/* Select all / deselect all */}
            <Box className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  for (let i = 0; i < items.length; i++) {
                    if (!selectedItems.has(i)) onToggleItem(i);
                  }
                }}
                aria-label="Select all items"
              >
                Select all
              </Button>
              {hasSelection && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    for (const i of selectedItems) {
                      onToggleItem(i);
                    }
                  }}
                  aria-label="Deselect all items"
                >
                  Deselect all
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  },
);

// ─── Provider Dropdown ──────────────────────────────────────────────────────

interface ProviderDropdownProps {
  providers: readonly TaskProvider[];
  selected: string;
  onChange: (name: string) => void;
}

function ProviderDropdown({
  providers,
  selected,
  onChange,
}: ProviderDropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    (name: string): void => {
      onChange(name);
      setIsOpen(false);
    },
    [onChange],
  );

  const selectedDisplay = providers.find((p) => p.name === selected)?.displayName ?? selected;

  return (
    <Box className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Send to: ${selectedDisplay}`}
      >
        <Box className="flex items-center gap-1.5">
          <Text variant="body-sm" className="text-xs text-white/70">
            Send to:
          </Text>
          <Text variant="body-sm" className="text-xs font-medium text-white">
            {selectedDisplay}
          </Text>
          <Box className="w-3 h-3 text-white/40" role="presentation">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5l3 3 3-3" />
            </svg>
          </Box>
        </Box>
      </Button>

      {isOpen && (
        <Box
          className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-lg bg-slate-900 border border-white/10 shadow-xl py-1"
          role="listbox"
          aria-label="Choose task provider"
        >
          {providers.map((provider) => (
            <Box
              key={provider.name}
              className={`px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors ${
                provider.name === selected ? "bg-violet-500/10" : ""
              }`}
              role="option"
              aria-selected={provider.name === selected}
              onClick={() => handleSelect(provider.name)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(provider.name);
                }
              }}
            >
              <Box className="flex items-center justify-between">
                <Text variant="body-sm" className="text-xs text-white">
                  {provider.displayName}
                </Text>
                {!provider.connected && provider.name !== "builtin" && (
                  <Text variant="body-sm" className="text-[10px] text-white/30">
                    Not connected
                  </Text>
                )}
                {provider.isDefault && (
                  <Text variant="body-sm" className="text-[10px] text-violet-300">
                    Default
                  </Text>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
