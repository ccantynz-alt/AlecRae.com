"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Text, Button, Input } from "@alecrae/ui";
import {
  labelsApi,
  type LabelTreeNode,
} from "../lib/api-inbox-power";

/** Flatten the label tree into a depth-tagged list for a simple indented display. */
interface FlatLabel {
  id: string;
  name: string;
  color: string;
  depth: number;
}

function flattenTree(nodes: readonly LabelTreeNode[], depth = 0): FlatLabel[] {
  const out: FlatLabel[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, color: node.color, depth });
    if (node.children.length > 0) {
      out.push(...flattenTree(node.children, depth + 1));
    }
  }
  return out;
}

const SWATCHES: readonly string[] = [
  "#6b7280",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export interface InboxLabelsManagerProps {
  open: boolean;
  onClose: () => void;
  /** Email IDs currently selected in the inbox — enables the "apply to selection" affordance. */
  selectedEmailIds: readonly string[];
  /** Called after a label is applied so the parent can clear its selection / show a toast. */
  onApplied?: (labelName: string, count: number) => void;
}

export function InboxLabelsManager({
  open,
  onClose,
  selectedEmailIds,
  onApplied,
}: InboxLabelsManagerProps): React.ReactNode {
  const [labels, setLabels] = useState<FlatLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(SWATCHES[0] ?? "#6b7280");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await labelsApi.list();
      setLabels(flattenTree(res.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load labels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleCreate = useCallback(async (): Promise<void> => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      await labelsApi.create({ name, color: newColor });
      setNewName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create label");
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, creating, load]);

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      setBusyId(id);
      setError(null);
      // Optimistic removal with rollback.
      const prev = labels;
      setLabels((cur) => cur.filter((l) => l.id !== id));
      try {
        await labelsApi.remove(id);
      } catch (err) {
        setLabels(prev);
        setError(err instanceof Error ? err.message : "Failed to delete label");
      } finally {
        setBusyId(null);
      }
    },
    [labels],
  );

  const handleApply = useCallback(
    async (label: FlatLabel): Promise<void> => {
      if (selectedEmailIds.length === 0 || busyId) return;
      setBusyId(label.id);
      setError(null);
      try {
        await labelsApi.apply(label.id, selectedEmailIds);
        onApplied?.(label.name, selectedEmailIds.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply label");
      } finally {
        setBusyId(null);
      }
    },
    [selectedEmailIds, busyId, onApplied],
  );

  if (!open) return null;

  const hasSelection = selectedEmailIds.length > 0;

  return (
    <Box
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Manage labels"
      onClick={onClose}
    >
      <Box
        className="w-full max-w-md rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Box className="flex items-center justify-between border-b border-border px-4 py-3">
          <Text variant="heading-sm">Labels</Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close labels manager"
          >
            Close
          </Button>
        </Box>

        <Box className="max-h-[60vh] overflow-y-auto p-4">
          {hasSelection && (
            <Text variant="caption" muted className="mb-3 block">
              Click a label to apply it to {selectedEmailIds.length} selected
              {selectedEmailIds.length === 1 ? " email" : " emails"}.
            </Text>
          )}

          {/* Create */}
          <Box className="mb-4 flex items-end gap-2">
            <Box className="flex-1">
              <label htmlFor="new-label-name" className="mb-1 block">
                <Text variant="caption" muted>
                  New label
                </Text>
              </label>
              <Input
                id="new-label-name"
                inputSize="sm"
                placeholder="Label name"
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
            </Box>
            <Box className="flex items-center gap-1" role="radiogroup" aria-label="Label color">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={newColor === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setNewColor(c)}
                  className={`h-5 w-5 rounded-full border transition-transform ${
                    newColor === c
                      ? "scale-110 border-content"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </Box>
            <Button
              variant="primary"
              size="sm"
              disabled={creating || newName.trim().length === 0}
              onClick={() => void handleCreate()}
            >
              {creating ? "Adding..." : "Add"}
            </Button>
          </Box>

          {error && (
            <Box
              className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2"
              role="alert"
            >
              <Text variant="caption" className="text-red-700">
                {error}
              </Text>
            </Box>
          )}

          {/* List */}
          {loading ? (
            <Text variant="body-sm" muted>
              Loading labels...
            </Text>
          ) : labels.length === 0 ? (
            <Text variant="body-sm" muted>
              No labels yet. Create one above.
            </Text>
          ) : (
            <Box as="ul" className="flex flex-col gap-1">
              {labels.map((label) => (
                <Box
                  as="li"
                  key={label.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-secondary"
                  style={{ paddingLeft: `${8 + label.depth * 16}px` }}
                >
                  <span
                    className="h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                    aria-hidden="true"
                  />
                  {hasSelection ? (
                    <button
                      type="button"
                      onClick={() => void handleApply(label)}
                      disabled={busyId === label.id}
                      className="flex-1 truncate text-left text-body-sm text-content hover:text-brand-700 disabled:opacity-50"
                      aria-label={`Apply label ${label.name} to selection`}
                    >
                      {label.name}
                    </button>
                  ) : (
                    <Text variant="body-sm" className="flex-1 truncate">
                      {label.name}
                    </Text>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(label.id)}
                    disabled={busyId === label.id}
                    className="text-xs text-content-tertiary hover:text-red-600 disabled:opacity-50"
                    aria-label={`Delete label ${label.name}`}
                  >
                    Delete
                  </button>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
