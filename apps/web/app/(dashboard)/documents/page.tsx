"use client";

/**
 * AlecRae Documents — Replaces Google Docs / Sheets / Slides / Forms.
 *
 * Two-panel layout:
 *   Left sidebar: folder tree + "New Folder" action.
 *   Main area   : document grid with create, search/filter, and detail view.
 *
 * API: /v1/documents  (GET, POST, PUT, DELETE)
 *      /v1/documents/:id/ai-assist
 *      /v1/documents/:id/export
 *      /v1/documents/:id/versions
 *      /v1/documents/folders  (GET, POST, DELETE)
 */

import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import {
  documentsApi,
  type AlecRaeDocument,
  type DocumentFolder,
  type DocumentType,
  type AiAssistAction,
  type ExportFormat,
  type DocumentVersion,
  type AiAssistResult,
} from "../../../lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES: { value: DocumentType; label: string; icon: string }[] = [
  { value: "doc", label: "Document", icon: "📄" },
  { value: "spreadsheet", label: "Spreadsheet", icon: "📊" },
  { value: "presentation", label: "Presentation", icon: "📽️" },
  { value: "form", label: "Form", icon: "📋" },
];

const AI_ACTIONS: { value: AiAssistAction; label: string }[] = [
  { value: "summarize", label: "Summarize" },
  { value: "expand", label: "Expand" },
  { value: "rewrite", label: "Rewrite" },
  { value: "proofread", label: "Proofread" },
  { value: "translate", label: "Translate" },
];

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "html", label: "HTML" },
  { value: "markdown", label: "Markdown" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function typeIcon(type: DocumentType): string {
  return DOC_TYPES.find((d) => d.value === type)?.icon ?? "📄";
}

function typeLabel(type: DocumentType): string {
  return DOC_TYPES.find((d) => d.value === type)?.label ?? type;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton(): ReactNode {
  return (
    <Box className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading documents">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Box key={i} className="h-32 animate-pulse rounded-lg bg-surface-secondary" />
      ))}
    </Box>
  );
}

// ─── Document Card ────────────────────────────────────────────────────────────

interface DocumentCardProps {
  doc: AlecRaeDocument;
  onSelect: (doc: AlecRaeDocument) => void;
  onDelete: (id: string) => void;
}

function DocumentCard({ doc, onSelect, onDelete }: DocumentCardProps): ReactNode {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (!confirm(`Archive "${doc.title}"?`)) return;
    setDeleting(true);
    try {
      await documentsApi.remove(doc.id);
      onDelete(doc.id);
    } catch {
      // error is surfaced via the parent
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card
      className="cursor-pointer hover:border-brand-300 transition-colors"
      onClick={() => onSelect(doc)}
      role="button"
      aria-label={`Open document: ${doc.title}`}
    >
      <CardContent>
        <Box className="flex items-start justify-between gap-2">
          <Box className="flex items-center gap-2 min-w-0">
            <Text as="span" variant="body-md" aria-hidden="true">
              {typeIcon(doc.type)}
            </Text>
            <Text variant="body-md" className="font-semibold truncate">
              {doc.title}
            </Text>
          </Box>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Archive ${doc.title}`}
          >
            <Text as="span" variant="caption" className="text-content-tertiary">
              {deleting ? "…" : "✕"}
            </Text>
          </Button>
        </Box>

        <Box className="mt-2 flex items-center gap-2 flex-wrap">
          <Box className="rounded-full px-2 py-0.5 bg-surface-secondary">
            <Text as="span" variant="caption" className="text-content-secondary">
              {typeLabel(doc.type)}
            </Text>
          </Box>
          {doc.tags.slice(0, 2).map((tag) => (
            <Box key={tag} className="rounded-full px-2 py-0.5 bg-brand-50">
              <Text as="span" variant="caption" className="text-brand-700">
                {tag}
              </Text>
            </Box>
          ))}
          {doc.tags.length > 2 && (
            <Text as="span" variant="caption" className="text-content-tertiary">
              +{doc.tags.length - 2} more
            </Text>
          )}
        </Box>

        <Text variant="caption" muted className="mt-2 block">
          {doc.wordCount} words · Updated {formatDate(doc.updatedAt)}
        </Text>
      </CardContent>
    </Card>
  );
}

DocumentCard.displayName = "DocumentCard";

// ─── Create Document Modal ────────────────────────────────────────────────────

interface CreateDocModalProps {
  folders: DocumentFolder[];
  onClose: () => void;
  onCreate: (doc: AlecRaeDocument) => void;
}

function CreateDocModal({ folders, onClose, onCreate }: CreateDocModalProps): ReactNode {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("doc");
  const [folderId, setFolderId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await documentsApi.create({
        title: title.trim(),
        type,
        ...(folderId ? { folderId } : {}),
      });
      onCreate(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Create new document"
    >
      <Box
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <Box className="relative z-10 w-full max-w-md mx-4 bg-surface rounded-xl border border-border shadow-xl">
        <Box className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Text variant="heading-sm">New Document</Text>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Text as="span" variant="body-md">✕</Text>
          </Button>
        </Box>

        <Box as="form" onSubmit={handleCreate} className="p-6 space-y-4">
          {error && (
            <Box className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
              <Text variant="body-sm" className="text-red-800">{error}</Text>
            </Box>
          )}

          <Input
            label="Title"
            variant="text"
            placeholder="Untitled Document"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />

          <Box>
            <Text variant="body-sm" className="mb-2 font-medium text-content">
              Type
            </Text>
            <Box className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Document type">
              {DOC_TYPES.map((dt) => (
                <Box
                  key={dt.value}
                  as="button"
                  type="button"
                  onClick={() => setType(dt.value)}
                  role="radio"
                  aria-checked={type === dt.value}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                    type === dt.value
                      ? "border-brand-500 bg-brand-50"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <Text as="span" variant="body-md" aria-hidden="true">{dt.icon}</Text>
                  <Text variant="body-sm" className={type === dt.value ? "text-brand-700 font-medium" : ""}>
                    {dt.label}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>

          {folders.length > 0 && (
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content">
                Folder (optional)
              </Text>
              <Box
                as="select"
                value={folderId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFolderId(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-content focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                aria-label="Select folder"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Box>
            </Box>
          )}

          <Box className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={creating || !title.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

CreateDocModal.displayName = "CreateDocModal";

// ─── Document Detail ──────────────────────────────────────────────────────────

interface DocumentDetailProps {
  doc: AlecRaeDocument;
  onClose: () => void;
  onUpdated: (doc: AlecRaeDocument) => void;
}

function DocumentDetail({ doc, onClose, onUpdated }: DocumentDetailProps): ReactNode {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI Assist state
  const [aiAction, setAiAction] = useState<AiAssistAction>("summarize");
  const [translateLang, setTranslateLang] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiAssistResult | null>(null);

  // Version history state
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await documentsApi.update(doc.id, {
        title: title.trim() || doc.title,
        content,
      });
      onUpdated(res.data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAiAssist = async (): Promise<void> => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await documentsApi.aiAssist(
        doc.id,
        aiAction,
        aiAction === "translate" && translateLang.trim() ? translateLang.trim() : undefined,
      );
      setAiResult(res.data);
    } catch (err) {
      setAiError(errMsg(err));
    } finally {
      setAiLoading(false);
    }
  };

  const handleExport = async (format: ExportFormat): Promise<void> => {
    try {
      const res = await documentsApi.exportDoc(doc.id, format);
      const blob = new Blob([res.data.content], { type: res.data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore — user still sees the doc
    }
  };

  const loadVersions = async (): Promise<void> => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const res = await documentsApi.listVersions(doc.id);
      setVersions(res.data);
    } catch (err) {
      setVersionsError(errMsg(err));
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleToggleVersions = (): void => {
    const next = !showVersions;
    setShowVersions(next);
    if (next && versions.length === 0) {
      void loadVersions();
    }
  };

  return (
    <Box className="flex flex-col h-full bg-surface border-l border-border" aria-label={`Document: ${doc.title}`}>
      {/* Header */}
      <Box className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
        <Box className="flex items-center gap-2 min-w-0">
          <Text as="span" variant="body-md" aria-hidden="true">{typeIcon(doc.type)}</Text>
          <Box
            as="input"
            type="text"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-base font-semibold text-content border-0 outline-none focus:ring-0 p-0 truncate"
            aria-label="Document title"
          />
        </Box>
        <Box className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-label="Save document"
          >
            {saving ? "Saving…" : saveSuccess ? "Saved ✓" : "Save"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close document">
            <Text as="span" variant="body-md">✕</Text>
          </Button>
        </Box>
      </Box>

      {saveError && (
        <Box className="mx-5 mt-3 rounded-md border border-red-200 bg-red-50 p-2" role="alert">
          <Text variant="body-sm" className="text-red-800">{saveError}</Text>
        </Box>
      )}

      {/* Body — scrollable */}
      <Box className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Tags */}
        {doc.tags.length > 0 && (
          <Box className="flex flex-wrap gap-1.5" aria-label="Document tags">
            {doc.tags.map((tag) => (
              <Box key={tag} className="rounded-full px-2.5 py-0.5 bg-brand-50">
                <Text as="span" variant="caption" className="text-brand-700">{tag}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Content editor */}
        <Box>
          <Text variant="body-sm" className="mb-1 font-medium text-content">
            Content
          </Text>
          <Box
            as="textarea"
            value={content}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
            className="w-full min-h-[240px] rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-tertiary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
            placeholder="Start writing your document…"
            aria-label="Document content"
          />
        </Box>

        {/* Export */}
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Export</Text>
          </CardHeader>
          <CardContent>
            <Box className="flex gap-2 flex-wrap">
              {EXPORT_FORMATS.map((fmt) => (
                <Button
                  key={fmt.value}
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleExport(fmt.value)}
                  aria-label={`Export as ${fmt.label}`}
                >
                  {fmt.label}
                </Button>
              ))}
            </Box>
          </CardContent>
        </Card>

        {/* AI Assist */}
        <Card>
          <CardHeader>
            <Text variant="heading-sm">AI Assist</Text>
            <Text variant="body-sm" muted>
              Let Claude help with your document.
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-3">
              <Box className="flex flex-wrap gap-2" role="group" aria-label="AI action">
                {AI_ACTIONS.map((a) => (
                  <Button
                    key={a.value}
                    variant={aiAction === a.value ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setAiAction(a.value)}
                    aria-pressed={aiAction === a.value}
                  >
                    {a.label}
                  </Button>
                ))}
              </Box>

              {aiAction === "translate" && (
                <Input
                  label="Target language"
                  variant="text"
                  placeholder="e.g. Spanish, French, Japanese"
                  value={translateLang}
                  onChange={(e) => setTranslateLang(e.target.value)}
                />
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleAiAssist()}
                disabled={aiLoading}
                aria-busy={aiLoading}
              >
                {aiLoading ? "Working…" : "Run"}
              </Button>

              {aiError && (
                <Box className="rounded-md border border-red-200 bg-red-50 p-2" role="alert">
                  <Text variant="body-sm" className="text-red-800">{aiError}</Text>
                </Box>
              )}

              {aiResult && (
                <Box className="rounded-md border border-border bg-surface-secondary p-3">
                  <Text variant="caption" muted className="mb-1 uppercase tracking-wide block">
                    {aiResult.action} result
                  </Text>
                  <Text variant="body-sm" className="whitespace-pre-wrap">{aiResult.result}</Text>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Version History */}
        <Card>
          <CardHeader>
            <Box className="flex items-center justify-between">
              <Text variant="heading-sm">Version History</Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleVersions}
                aria-expanded={showVersions}
              >
                {showVersions ? "Hide" : "Show"}
              </Button>
            </Box>
          </CardHeader>

          {showVersions && (
            <CardContent>
              {versionsLoading ? (
                <Box aria-busy="true" aria-label="Loading versions">
                  <Box className="h-8 animate-pulse rounded bg-surface-secondary" />
                </Box>
              ) : versionsError ? (
                <Box className="rounded-md border border-red-200 bg-red-50 p-2" role="alert">
                  <Text variant="body-sm" className="text-red-800">{versionsError}</Text>
                </Box>
              ) : versions.length === 0 ? (
                <Text variant="body-sm" muted>No saved versions yet. Save to create one.</Text>
              ) : (
                <Box className="space-y-2" role="list" aria-label="Document versions">
                  {versions.map((v) => (
                    <Box
                      key={v.id}
                      className="flex items-center justify-between rounded-md border border-border bg-surface-secondary px-3 py-2"
                      role="listitem"
                    >
                      <Box>
                        <Text variant="body-sm" className="font-medium">
                          v{v.versionNumber} — {v.title}
                        </Text>
                        <Text variant="caption" muted>
                          {v.wordCount} words · {formatDate(v.createdAt)}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          )}
        </Card>

        {/* Metadata */}
        <Box>
          <Text variant="caption" muted>
            Created {formatDate(doc.createdAt)} · Last updated {formatDate(doc.updatedAt)} ·{" "}
            {doc.isPublic ? "Public" : "Private"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

DocumentDetail.displayName = "DocumentDetail";

// ─── Folder Sidebar ───────────────────────────────────────────────────────────

interface FolderSidebarProps {
  folders: DocumentFolder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onFolderCreated: (f: DocumentFolder) => void;
  onFolderDeleted: (id: string) => void;
}

function FolderSidebar({
  folders,
  activeFolderId,
  onSelectFolder,
  onFolderCreated,
  onFolderDeleted,
}: FolderSidebarProps): ReactNode {
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await documentsApi.createFolder(newFolderName.trim());
      onFolderCreated(res.data);
      setNewFolderName("");
      setShowInput(false);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFolder = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete folder "${name}"? Documents inside will move to All Documents.`)) return;
    try {
      await documentsApi.deleteFolder(id);
      onFolderDeleted(id);
      if (activeFolderId === id) onSelectFolder(null);
    } catch {
      // silently ignored — folder list will reflect reality on next load
    }
  };

  return (
    <Box className="w-48 flex-shrink-0 flex flex-col border-r border-border bg-surface-secondary h-full" aria-label="Folders">
      <Box className="px-4 py-3 border-b border-border flex items-center justify-between">
        <Text variant="body-sm" className="font-semibold text-content">
          Folders
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowInput((v) => !v)}
          aria-label="New folder"
          title="New folder"
        >
          <Text as="span" variant="caption">+</Text>
        </Button>
      </Box>

      {showInput && (
        <Box as="form" onSubmit={handleCreate} className="px-3 py-2 border-b border-border space-y-1">
          <Input
            label=""
            variant="text"
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            autoFocus
          />
          {error && (
            <Text variant="caption" className="text-red-600">{error}</Text>
          )}
          <Box className="flex gap-1">
            <Button variant="primary" size="sm" type="submit" disabled={creating || !newFolderName.trim()}>
              {creating ? "…" : "Add"}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setShowInput(false)}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      <Box className="flex-1 overflow-y-auto py-1" role="list" aria-label="Folder list">
        {/* All Documents */}
        <Box
          as="button"
          onClick={() => onSelectFolder(null)}
          role="listitem"
          aria-current={activeFolderId === null ? "page" : undefined}
          className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
            activeFolderId === null
              ? "bg-brand-50 text-brand-700 font-medium"
              : "text-content hover:bg-surface"
          }`}
        >
          <Text as="span" variant="caption" aria-hidden="true">📂</Text>
          <Text as="span" variant="body-sm">All Documents</Text>
        </Box>

        {folders.map((f) => (
          <Box
            key={f.id}
            role="listitem"
            className="group flex items-center"
          >
            <Box
              as="button"
              onClick={() => onSelectFolder(f.id)}
              aria-current={activeFolderId === f.id ? "page" : undefined}
              className={`flex-1 flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors min-w-0 ${
                activeFolderId === f.id
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-content hover:bg-surface"
              }`}
            >
              <Text as="span" variant="caption" aria-hidden="true">
                {f.color ? "📁" : "📁"}
              </Text>
              <Text as="span" variant="body-sm" className="truncate">{f.name}</Text>
            </Box>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDeleteFolder(f.id, f.name)}
              aria-label={`Delete folder ${f.name}`}
              className="opacity-0 group-hover:opacity-100 px-2 flex-shrink-0"
            >
              <Text as="span" variant="caption" className="text-content-tertiary">✕</Text>
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

FolderSidebar.displayName = "FolderSidebar";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentsPage(): ReactNode {
  const [docs, setDocs] = useState<AlecRaeDocument[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<AlecRaeDocument | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadDocs = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof documentsApi.list>[0] = { limit: 50 };
      if (activeFolderId) params.folderId = activeFolderId;
      if (typeFilter !== "all") params.type = typeFilter;
      const res = await documentsApi.list(params);
      setDocs(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, typeFilter]);

  const loadFolders = useCallback(async (): Promise<void> => {
    try {
      const res = await documentsApi.listFolders();
      setFolders(res.data);
    } catch {
      // non-fatal — sidebar just won't show folders
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const filteredDocs = search.trim()
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : docs;

  const handleDocCreated = (doc: AlecRaeDocument): void => {
    setDocs((prev) => [doc, ...prev]);
    setShowCreateModal(false);
    setSelectedDoc(doc);
  };

  const handleDocUpdated = (updated: AlecRaeDocument): void => {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setSelectedDoc(updated);
  };

  const handleDocDeleted = (id: string): void => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
  };

  const handleFolderCreated = (folder: DocumentFolder): void => {
    setFolders((prev) => [...prev, folder]);
  };

  const handleFolderDeleted = (id: string): void => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
  };

  const actions = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => setShowCreateModal(true)}
      aria-label="Create new document"
    >
      New Document
    </Button>
  );

  return (
    <PageLayout
      title="Documents"
      description="Create, edit, and organize your documents. Powered by AI."
      actions={actions}
      fullWidth
    >
      {showCreateModal && (
        <CreateDocModal
          folders={folders}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleDocCreated}
        />
      )}

      <Box className="flex h-full min-h-0">
        {/* Folder sidebar */}
        <FolderSidebar
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={(id) => {
            setActiveFolderId(id);
            setSelectedDoc(null);
          }}
          onFolderCreated={handleFolderCreated}
          onFolderDeleted={handleFolderDeleted}
        />

        {/* Main content */}
        <Box className="flex-1 flex min-w-0 h-full">
          {/* Document grid */}
          <Box className={`flex flex-col flex-shrink-0 overflow-y-auto ${selectedDoc ? "w-80 xl:w-96" : "flex-1"}`}>
            {/* Search + filter bar */}
            <Box className="flex flex-col gap-3 px-5 py-4 border-b border-border bg-surface flex-shrink-0">
              <Input
                label=""
                variant="search"
                placeholder="Search documents…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search documents"
              />
              <Box className="flex gap-2 flex-wrap" role="group" aria-label="Filter by type">
                <Button
                  variant={typeFilter === "all" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTypeFilter("all")}
                  aria-pressed={typeFilter === "all"}
                >
                  All
                </Button>
                {DOC_TYPES.map((dt) => (
                  <Button
                    key={dt.value}
                    variant={typeFilter === dt.value ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setTypeFilter(dt.value)}
                    aria-pressed={typeFilter === dt.value}
                  >
                    {dt.icon} {dt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* Error */}
            {error && (
              <Box className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                <Text variant="body-sm" className="text-red-800">{error}</Text>
              </Box>
            )}

            {/* Doc grid */}
            <Box className="flex-1 p-5">
              {loading ? (
                <LoadingSkeleton />
              ) : filteredDocs.length === 0 ? (
                <Card>
                  <CardContent>
                    <Box className="py-12 text-center">
                      <Text variant="heading-sm" muted className="mb-2">
                        {search.trim() ? "No documents match your search" : "No documents yet"}
                      </Text>
                      <Text variant="body-sm" muted className="mb-4">
                        {search.trim()
                          ? "Try a different search term or clear the filter."
                          : "Create your first document to get started."}
                      </Text>
                      {!search.trim() && (
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => setShowCreateModal(true)}
                        >
                          New Document
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ) : (
                <Box>
                  <Text variant="caption" muted className="mb-3 block">
                    {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
                  </Text>
                  <Box className={`grid gap-4 ${selectedDoc ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
                    {filteredDocs.map((doc) => (
                      <DocumentCard
                        key={doc.id}
                        doc={doc}
                        onSelect={setSelectedDoc}
                        onDelete={handleDocDeleted}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>

          {/* Document detail panel */}
          {selectedDoc && (
            <Box className="flex-1 min-w-0 overflow-hidden">
              <DocumentDetail
                key={selectedDoc.id}
                doc={selectedDoc}
                onClose={() => setSelectedDoc(null)}
                onUpdated={handleDocUpdated}
              />
            </Box>
          )}
        </Box>
      </Box>
    </PageLayout>
  );
}
