"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  PageLayout,
} from "@alecrae/ui";
import {
  smartFoldersApi,
  type SmartFolder,
  type SmartFolderFilter,
} from "../../../lib/api";

// ─── Filter summary helper ────────────────────────────────────────────────────

function buildFilterSummary(filters: SmartFolderFilter): string {
  const parts: string[] = [];
  if (filters.from) parts.push(`from: ${filters.from}`);
  if (filters.to) parts.push(`to: ${filters.to}`);
  if (filters.subject) parts.push(`subject: "${filters.subject}"`);
  if (filters.query) parts.push(`contains: "${filters.query}"`);
  if (filters.senderDomain) parts.push(`domain: ${filters.senderDomain}`);
  if (filters.hasAttachment === true) parts.push("has attachment");
  if (filters.isRead === false) parts.push("unread");
  if (filters.isRead === true) parts.push("read");
  if (filters.isStarred === true) parts.push("starred");
  if (filters.labels && filters.labels.length > 0)
    parts.push(`labels: ${filters.labels.join(", ")}`);
  if (filters.dateAfter) parts.push(`after: ${filters.dateAfter}`);
  if (filters.dateBefore) parts.push(`before: ${filters.dateBefore}`);
  if (filters.category) parts.push(`category: ${filters.category}`);
  return parts.length > 0 ? parts.join(" · ") : "No filters set";
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <Box className="w-14 h-14 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center text-2xl select-none">
            &#128193;
          </Box>
          <Box>
            <Text variant="heading-sm" className="mb-1">
              No smart folders yet
            </Text>
            <Text variant="body-sm" muted className="max-w-xs mx-auto">
              Smart folders auto-populate with emails that match your filter
              criteria. Create one to get started.
            </Text>
          </Box>
          <Button variant="primary" size="md" onClick={onCreate}>
            Create your first smart folder
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

EmptyState.displayName = "EmptyState";

// ─── Smart Folder card ────────────────────────────────────────────────────────

interface SmartFolderCardProps {
  folder: SmartFolder;
  onEdit: (folder: SmartFolder) => void;
  onDelete: (id: string) => void;
}

function SmartFolderCard({
  folder,
  onEdit,
  onDelete,
}: SmartFolderCardProps): React.JSX.Element {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    if (!confirm(`Delete "${folder.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(folder.id);
    } finally {
      setDeleting(false);
    }
  };

  const filterSummary = buildFilterSummary(folder.filters);
  const inboxHref = `/inbox?smartFolder=${encodeURIComponent(folder.id)}`;

  return (
    <Card className="flex flex-col gap-0">
      <CardContent>
        <Box className="flex items-start justify-between gap-3">
          <Box className="flex items-start gap-3 min-w-0 flex-1">
            <Box className="w-9 h-9 rounded-xl bg-surface-secondary border border-border flex items-center justify-center text-lg flex-shrink-0 select-none">
              {folder.icon ?? "&#128193;"}
            </Box>
            <Box className="min-w-0 flex-1">
              <Box className="flex items-center gap-2 flex-wrap">
                <Text variant="heading-sm" className="truncate">
                  {folder.name}
                </Text>
                <Box
                  as="span"
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-surface-secondary border border-border text-content-secondary"
                >
                  {folder.type === "saved_search" ? "Saved search" : "Smart"}
                </Box>
              </Box>
              <Text variant="body-sm" muted className="mt-0.5 truncate">
                {filterSummary}
              </Text>
              <Text variant="caption" className="mt-1 text-content-tertiary">
                Updated{" "}
                {new Date(folder.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </Box>
          </Box>
        </Box>

        <Box className="flex items-center gap-2 mt-4">
          <Box
            as="a"
            href={inboxHref}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-secondary transition-colors text-sm font-medium text-content"
            aria-label={`Open inbox filtered by ${folder.name}`}
          >
            Open inbox &#8594;
          </Box>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(folder)}
            aria-label={`Edit smart folder ${folder.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={deleting}
            aria-label={`Delete smart folder ${folder.name}`}
            className="text-red-600 hover:text-red-700"
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

SmartFolderCard.displayName = "SmartFolderCard";

// ─── Form (create / edit) ─────────────────────────────────────────────────────

interface FolderFormProps {
  initial: SmartFolder | undefined;
  onClose: () => void;
  onSaved: () => void;
}

function FolderForm({
  initial,
  onClose,
  onSaved,
}: FolderFormProps): React.JSX.Element {
  const isEdit = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [type, setType] = useState<"smart" | "saved_search">(
    initial?.type ?? "smart",
  );

  // Filter fields
  const [filterFrom, setFilterFrom] = useState(initial?.filters.from ?? "");
  const [filterTo, setFilterTo] = useState(initial?.filters.to ?? "");
  const [filterSubject, setFilterSubject] = useState(
    initial?.filters.subject ?? "",
  );
  const [filterQuery, setFilterQuery] = useState(
    initial?.filters.query ?? "",
  );
  const [filterSenderDomain, setFilterSenderDomain] = useState(
    initial?.filters.senderDomain ?? "",
  );
  const [filterHasAttachment, setFilterHasAttachment] = useState<
    boolean | undefined
  >(initial?.filters.hasAttachment);
  const [filterIsRead, setFilterIsRead] = useState<boolean | undefined>(
    initial?.filters.isRead,
  );
  const [filterIsStarred, setFilterIsStarred] = useState<boolean | undefined>(
    initial?.filters.isStarred,
  );
  const [filterLabels, setFilterLabels] = useState(
    (initial?.filters.labels ?? []).join(", "),
  );
  const [filterDateAfter, setFilterDateAfter] = useState(
    initial?.filters.dateAfter ?? "",
  );
  const [filterDateBefore, setFilterDateBefore] = useState(
    initial?.filters.dateBefore ?? "",
  );
  const [filterCategory, setFilterCategory] = useState(
    initial?.filters.category ?? "",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildFilters = (): SmartFolderFilter => {
    const filters: SmartFolderFilter = {};
    if (filterFrom.trim()) filters.from = filterFrom.trim();
    if (filterTo.trim()) filters.to = filterTo.trim();
    if (filterSubject.trim()) filters.subject = filterSubject.trim();
    if (filterQuery.trim()) filters.query = filterQuery.trim();
    if (filterSenderDomain.trim())
      filters.senderDomain = filterSenderDomain.trim();
    if (filterHasAttachment !== undefined)
      filters.hasAttachment = filterHasAttachment;
    if (filterIsRead !== undefined) filters.isRead = filterIsRead;
    if (filterIsStarred !== undefined) filters.isStarred = filterIsStarred;
    const labelList = filterLabels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    if (labelList.length > 0) filters.labels = labelList;
    if (filterDateAfter.trim()) filters.dateAfter = filterDateAfter.trim();
    if (filterDateBefore.trim()) filters.dateBefore = filterDateBefore.trim();
    if (filterCategory.trim()) filters.category = filterCategory.trim();
    return filters;
  };

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const filters = buildFilters();
      if (isEdit && initial) {
        const updatePayload: Parameters<typeof smartFoldersApi.update>[1] = {
          name: name.trim(),
          type,
          filters,
        };
        if (icon.trim()) updatePayload.icon = icon.trim();
        await smartFoldersApi.update(initial.id, updatePayload);
      } else {
        const createPayload: Parameters<typeof smartFoldersApi.create>[0] = {
          name: name.trim(),
          type,
          filters,
        };
        if (icon.trim()) createPayload.icon = icon.trim();
        await smartFoldersApi.create(createPayload);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save smart folder",
      );
    } finally {
      setSaving(false);
    }
  };

  const triStateLabel = (
    val: boolean | undefined,
    onChange: (v: boolean | undefined) => void,
    labelTrue: string,
    labelFalse: string,
  ): React.JSX.Element => (
    <Box className="flex items-center gap-2">
      <Button
        variant={val === true ? "primary" : "ghost"}
        size="sm"
        onClick={() => onChange(val === true ? undefined : true)}
        aria-pressed={val === true}
      >
        {labelTrue}
      </Button>
      <Button
        variant={val === false ? "primary" : "ghost"}
        size="sm"
        onClick={() => onChange(val === false ? undefined : false)}
        aria-pressed={val === false}
      >
        {labelFalse}
      </Button>
    </Box>
  );

  return (
    <Card className="mb-6">
      <CardContent>
        <Text variant="heading-sm" className="mb-4">
          {isEdit ? `Edit "${initial?.name}"` : "Create Smart Folder"}
        </Text>

        {error && (
          <Box className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <Text variant="body-sm" className="text-red-700">
              {error}
            </Text>
          </Box>
        )}

        <Box className="flex flex-col gap-4">
          {/* Basic info */}
          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Folder name"
              variant="text"
              placeholder="My smart folder"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Icon (emoji, optional)"
              variant="text"
              placeholder="📁"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
            />
          </Box>

          {/* Type */}
          <Box>
            <Text variant="body-sm" className="mb-1.5 font-medium">
              Folder type
            </Text>
            <Box className="flex items-center gap-2">
              <Button
                variant={type === "smart" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setType("smart")}
                aria-pressed={type === "smart"}
              >
                Smart
              </Button>
              <Button
                variant={type === "saved_search" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setType("saved_search")}
                aria-pressed={type === "saved_search"}
              >
                Saved search
              </Button>
            </Box>
          </Box>

          {/* Filters section */}
          <Box className="border-t border-border pt-4">
            <Text variant="heading-sm" className="mb-3">
              Filter criteria
            </Text>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="From (sender email or name)"
                variant="text"
                placeholder="boss@company.com"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
              <Input
                label="To (recipient)"
                variant="text"
                placeholder="team@company.com"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
              <Input
                label="Subject contains"
                variant="text"
                placeholder="Invoice"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              />
              <Input
                label="Body contains"
                variant="text"
                placeholder="urgent"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
              <Input
                label="Sender domain"
                variant="text"
                placeholder="github.com"
                value={filterSenderDomain}
                onChange={(e) => setFilterSenderDomain(e.target.value)}
              />
              <Input
                label="Category"
                variant="text"
                placeholder="newsletters"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              />
              <Input
                label="Labels (comma-separated)"
                variant="text"
                placeholder="work, priority"
                value={filterLabels}
                onChange={(e) => setFilterLabels(e.target.value)}
              />
              <Box>
                <Text variant="body-sm" className="mb-1.5 font-medium">
                  Date after
                </Text>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={filterDateAfter}
                  onChange={(e) => setFilterDateAfter(e.target.value)}
                  aria-label="Date after"
                />
              </Box>
              <Box>
                <Text variant="body-sm" className="mb-1.5 font-medium">
                  Date before
                </Text>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={filterDateBefore}
                  onChange={(e) => setFilterDateBefore(e.target.value)}
                  aria-label="Date before"
                />
              </Box>
            </Box>

            {/* Boolean filters */}
            <Box className="mt-4 flex flex-col gap-3">
              <Box>
                <Text variant="body-sm" className="mb-1.5 font-medium">
                  Has attachment
                </Text>
                {triStateLabel(
                  filterHasAttachment,
                  setFilterHasAttachment,
                  "Yes",
                  "No",
                )}
              </Box>
              <Box>
                <Text variant="body-sm" className="mb-1.5 font-medium">
                  Read status
                </Text>
                {triStateLabel(filterIsRead, setFilterIsRead, "Read", "Unread")}
              </Box>
              <Box>
                <Text variant="body-sm" className="mb-1.5 font-medium">
                  Starred
                </Text>
                {triStateLabel(
                  filterIsStarred,
                  setFilterIsStarred,
                  "Starred only",
                  "Not starred",
                )}
              </Box>
            </Box>
          </Box>

          {/* Actions */}
          <Box className="flex items-center gap-3 pt-2 border-t border-border">
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim()}
            >
              {saving
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create folder"}
            </Button>
            <Button variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

FolderForm.displayName = "FolderForm";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SmartFoldersPage(): React.JSX.Element {
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<SmartFolder | null>(null);

  const loadFolders = useCallback(async (): Promise<void> => {
    try {
      const res = await smartFoldersApi.list({ limit: 50 });
      setFolders(res.data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load smart folders",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await smartFoldersApi.remove(id);
      await loadFolders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete smart folder",
      );
    }
  };

  const handleEdit = (folder: SmartFolder): void => {
    setEditTarget(folder);
    setShowCreate(false);
  };

  const handleFormClose = (): void => {
    setShowCreate(false);
    setEditTarget(null);
  };

  const handleFormSaved = (): void => {
    setShowCreate(false);
    setEditTarget(null);
    void loadFolders();
  };

  const pageActions = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => {
        setEditTarget(null);
        setShowCreate(true);
      }}
      disabled={showCreate || editTarget !== null}
    >
      New smart folder
    </Button>
  );

  return (
    <PageLayout
      title="Smart Folders"
      description="Saved searches that auto-populate with matching emails. Click a folder to open a filtered inbox view."
      actions={pageActions}
    >
      {error && (
        <Box className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-700">
            {error}
          </Text>
        </Box>
      )}

      {(showCreate || editTarget) && (
        <FolderForm
          initial={editTarget !== null ? editTarget : undefined}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}

      {loading ? (
        <Text variant="body-md" muted>
          Loading smart folders…
        </Text>
      ) : folders.length === 0 && !showCreate ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {folders.map((folder) => (
            <SmartFolderCard
              key={folder.id}
              folder={folder}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}
    </PageLayout>
  );
}
