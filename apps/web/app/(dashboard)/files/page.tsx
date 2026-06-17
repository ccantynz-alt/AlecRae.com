"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  PageLayout,
} from "@alecrae/ui";
import { getAccessToken } from "../../../lib/auth-token";
import { PlanGate } from "../../../components/plan-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachmentFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  emailSubject: string;
  createdAt: string;
  downloadUrl: string;
}

interface FileStats {
  totalFiles: number;
  totalSize: number;
  maxSize: number;
}

type FileFilterTab = "all" | "images" | "documents" | "spreadsheets" | "archives";

// ─── API helper ───────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mimeToCategory(mimeType: string): FileFilterTab {
  if (mimeType.startsWith("image/")) return "images";
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  )
    return "documents";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  )
    return "spreadsheets";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-rar-compressed"
  )
    return "archives";
  return "all";
}

function FileIcon({ mimeType }: { mimeType: string }): React.ReactNode {
  const category = mimeToCategory(mimeType);

  const iconMap: Record<FileFilterTab, { path: string; color: string }> = {
    images: {
      path: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
      color: "text-purple-500",
    },
    documents: {
      path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      color: "text-blue-500",
    },
    spreadsheets: {
      path: "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
      color: "text-green-500",
    },
    archives: {
      path: "M5 8H19M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
      color: "text-amber-500",
    },
    all: {
      path: "M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13",
      color: "text-gray-400",
    },
  };

  const { path, color } = iconMap[category] ?? iconMap.all;

  return (
    <Box
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised ${color}`}
      aria-hidden="true"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </Box>
  );
}
FileIcon.displayName = "FileIcon";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function LoadingSkeleton(): React.ReactNode {
  return (
    <Box
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading files"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Box key={i} className="h-32 animate-pulse rounded-xl bg-surface-raised" />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

// ─── Storage progress bar ─────────────────────────────────────────────────────

function StorageBar({ stats }: { stats: FileStats }): React.ReactNode {
  const pct = stats.maxSize > 0 ? Math.min((stats.totalSize / stats.maxSize) * 100, 100) : 0;
  const isNearFull = pct >= 80;

  return (
    <Card className="mb-6">
      <CardContent>
        <Box className="flex items-center justify-between gap-4">
          <Box className="min-w-0 flex-1">
            <Box className="mb-2 flex items-center justify-between">
              <Text variant="body-sm" className="font-medium text-content">
                Storage used
              </Text>
              <Text
                variant="body-sm"
                className={`font-medium ${isNearFull ? "text-red-600" : "text-content-subtle"}`}
              >
                {formatBytes(stats.totalSize)} of {formatBytes(stats.maxSize)}
              </Text>
            </Box>
            <Box
              className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Storage: ${Math.round(pct)}% used`}
            >
              <Box
                className={`h-full rounded-full transition-all ${
                  isNearFull ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-brand-600"
                }`}
                style={{ width: `${pct}%` }}
              />
            </Box>
          </Box>
          <Box className="shrink-0 text-right">
            <Text variant="heading-md" className="font-semibold text-content">
              {stats.totalFiles}
            </Text>
            <Text variant="caption" className="text-content-subtle">
              file{stats.totalFiles !== 1 ? "s" : ""}
            </Text>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
StorageBar.displayName = "StorageBar";

// ─── File card ────────────────────────────────────────────────────────────────

interface FileCardProps {
  file: AttachmentFile;
  onDelete: (id: string) => void;
  deleting: boolean;
  confirmDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
}

function FileCard({
  file,
  onDelete,
  deleting,
  confirmDeleteId,
  onRequestDelete,
  onCancelDelete,
}: FileCardProps): React.ReactNode {
  const isConfirming = confirmDeleteId === file.id;
  const isDeleting = deleting && isConfirming;

  return (
    <Card className="group border-border transition-shadow hover:shadow-sm">
      <CardContent>
        <Box className="flex items-start gap-3">
          <FileIcon mimeType={file.mimeType} />
          <Box className="min-w-0 flex-1">
            <Text
              variant="body-sm"
              className="truncate font-medium text-content"
              title={file.filename}
            >
              {file.filename}
            </Text>
            <Text
              variant="caption"
              className="truncate text-content-subtle"
              title={file.emailSubject}
            >
              {file.emailSubject}
            </Text>
            <Box className="mt-1.5 flex items-center gap-2">
              <Text variant="caption" className="text-content-subtle">
                {formatBytes(file.size)}
              </Text>
              <Box className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
              <Text variant="caption" className="text-content-subtle">
                {formatDate(file.createdAt)}
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Actions */}
        <Box className="mt-3 flex items-center gap-2">
          <Box
            as="a"
            href={file.downloadUrl}
            download={file.filename}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content transition-colors hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-1"
            aria-label={`Download ${file.filename}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </Box>

          {isConfirming ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => onDelete(file.id)}
                disabled={isDeleting}
                aria-label={`Confirm delete ${file.filename}`}
              >
                {isDeleting ? "Deleting…" : "Confirm"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelDelete}
                disabled={isDeleting}
                aria-label="Cancel delete"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => onRequestDelete(file.id)}
              aria-label={`Delete ${file.filename}`}
            >
              Delete
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
FileCard.displayName = "FileCard";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { id: FileFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "documents", label: "Documents" },
  { id: "spreadsheets", label: "Spreadsheets" },
  { id: "archives", label: "Archives" },
];

const FILTER_QUERY_MAP: Record<FileFilterTab, string> = {
  all: "",
  images: "image",
  documents: "document",
  spreadsheets: "spreadsheet",
  archives: "archive",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FilesPage(): React.ReactNode {
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [stats, setStats] = useState<FileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<FileFilterTab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadFiles = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const typeParam = FILTER_QUERY_MAP[activeTab];
      const params = new URLSearchParams();
      if (typeParam) params.set("type", typeParam);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const qs = params.toString();
      const [filesData, statsData] = await Promise.all([
        apiFetch<AttachmentFile[]>(`/v1/files${qs ? `?${qs}` : ""}`),
        apiFetch<FileStats>("/v1/files/stats").catch(() => null),
      ]);
      setFiles(filesData);
      if (statsData) setStats(statsData);
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await apiFetch<unknown>(`/v1/files/${id}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== id));
      // Update stats optimistically
      const deleted = files.find((f) => f.id === id);
      if (deleted && stats) {
        setStats((prev) =>
          prev
            ? {
                ...prev,
                totalFiles: prev.totalFiles - 1,
                totalSize: prev.totalSize - deleted.size,
              }
            : prev,
        );
      }
      setConfirmDeleteId(null);
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setDeletingId(null);
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent): void => {
    const idx = FILTER_TABS.findIndex((t) => t.id === activeTab);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = FILTER_TABS[(idx + 1) % FILTER_TABS.length];
      if (next) setActiveTab(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = FILTER_TABS[(idx - 1 + FILTER_TABS.length) % FILTER_TABS.length];
      if (prev) setActiveTab(prev.id);
    }
  };

  return (
    <PlanGate feature="files" required="personal">
      <PageLayout
        title="Files"
        description="All attachments from your emails, organised in one place."
      >
        {error && <ErrorBanner message={error} />}

        {/* Storage bar */}
        {stats && <StorageBar stats={stats} />}

        {/* Toolbar: filter tabs + search */}
        <Box className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Filter tabs */}
          <Box
            className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1 w-fit"
            role="tablist"
            aria-label="File type filter"
            onKeyDown={handleTabKeyDown}
          >
            {FILTER_TABS.map((tab) => (
              <Box
                key={tab.id}
                as="button"
                role="tab"
                id={`files-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls="files-grid"
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 ${
                  activeTab === tab.id
                    ? "bg-surface text-content shadow-sm"
                    : "text-content-subtle hover:text-content"
                }`}
              >
                {tab.label}
              </Box>
            ))}
          </Box>

          {/* Search */}
          <Box className="relative sm:w-64">
            <Box
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
              aria-hidden="true"
            >
              <svg className="h-4 w-4 text-content-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Box>
            <input
              type="search"
              placeholder="Search files…"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-content placeholder:text-content-subtle focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              aria-label="Search files"
            />
          </Box>
        </Box>

        {/* Files grid */}
        {loading ? (
          <LoadingSkeleton />
        ) : files.length === 0 ? (
          <Card>
            <CardContent>
              <Box className="py-14 text-center">
                <Box
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised"
                  aria-hidden="true"
                >
                  <svg className="h-7 w-7 text-content-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </Box>
                <Text variant="heading-sm" className="text-content">
                  No files found
                </Text>
                <Text variant="body-sm" className="mt-1 text-content-subtle">
                  {debouncedSearch
                    ? `No files match "${debouncedSearch}". Try a different search.`
                    : activeTab !== "all"
                      ? "No files in this category yet."
                      : "Attachments from your emails will appear here."}
                </Text>
                {(debouncedSearch || activeTab !== "all") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setSearch("");
                      setActiveTab("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Box
            id="files-grid"
            role="tabpanel"
            aria-labelledby={`files-tab-${activeTab}`}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {files.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onDelete={handleDelete}
                deleting={deletingId === file.id}
                confirmDeleteId={confirmDeleteId}
                onRequestDelete={(id) => setConfirmDeleteId(id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
          </Box>
        )}

        {/* Footer summary */}
        {!loading && files.length > 0 && stats && (
          <Box className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <Text variant="body-sm" className="text-content-subtle">
              Showing {files.length} file{files.length !== 1 ? "s" : ""}
              {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              {formatBytes(stats.totalSize)} total · {formatBytes(stats.maxSize - stats.totalSize)} free
            </Text>
          </Box>
        )}
      </PageLayout>
    </PlanGate>
  );
}
