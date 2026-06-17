"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, PageLayout } from "@alecrae/ui";
import { filesApi, type FileData, type FileStatsData } from "../../../lib/api-features";
import { PlanGate } from "../../../components/plan-gate";

const FILE_TYPES = [
  { key: "all", label: "All Files" },
  { key: "image", label: "Images" },
  { key: "document", label: "Documents" },
  { key: "spreadsheet", label: "Spreadsheets" },
  { key: "archive", label: "Archives" },
];

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📋";
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("gzip")) return "🗜️";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("audio")) return "🎵";
  if (mimeType.includes("video")) return "🎬";
  return "📎";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StorageBar({ used, total }: { used: number; total: number }): React.ReactNode {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-brand-500";
  return (
    <Box className="space-y-1">
      <Box className="flex justify-between">
        <Text variant="caption" className="text-content-subtle">{formatBytes(used)} used</Text>
        <Text variant="caption" className="text-content-subtle">{formatBytes(total)} total</Text>
      </Box>
      <Box className="h-2 rounded-full bg-surface-tertiary overflow-hidden">
        <Box className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </Box>
      <Text variant="caption" className="text-content-subtle">{pct}% used</Text>
    </Box>
  );
}

export default function FilesPage(): React.ReactNode {
  const [files, setFiles] = useState<FileData[]>([]);
  const [stats, setStats] = useState<FileStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [filesRes, statsRes] = await Promise.allSettled([
        filesApi.list({ ...(activeType !== "all" && { type: activeType }), ...(search && { search }) }),
        filesApi.stats(),
      ]);
      if (filesRes.status === "fulfilled") setFiles(filesRes.value.data);
      if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
    } catch {
      // fail silently — show empty state
    } finally {
      setLoading(false);
    }
  }, [activeType, search]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await filesApi.remove(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PlanGate feature="files" required="personal">
      <PageLayout title="Files" description="All attachments from your emails, organized in one place.">
        <Box className="space-y-6">
          {/* Storage usage */}
          {stats && (
            <Box className="p-4 rounded-xl border border-border bg-surface-raised">
              <Box className="flex items-center justify-between mb-3">
                <Text variant="body-sm" className="font-semibold">Storage</Text>
                <Text variant="caption" className="text-content-subtle">{stats.totalFiles} files</Text>
              </Box>
              <StorageBar used={stats.totalBytes} total={stats.storageLimit} />
            </Box>
          )}

          {/* Filters */}
          <Box className="flex flex-wrap items-center gap-3">
            <Box className="flex gap-1 p-1 rounded-lg bg-surface-secondary border border-border">
              {FILE_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveType(t.key)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    activeType === t.key
                      ? "bg-surface text-content shadow-sm font-medium"
                      : "text-content-subtle hover:text-content"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </Box>
            <Box className="flex-1 min-w-48">
              <input
                type="search"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-content placeholder:text-content-tertiary focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Box>
          </Box>

          {/* File grid */}
          {loading ? (
            <Box className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Box key={i} className="h-32 animate-pulse rounded-xl bg-surface-secondary" />
              ))}
            </Box>
          ) : files.length === 0 ? (
            <Box className="text-center py-16">
              <Text variant="body-sm" className="text-4xl mb-3">📎</Text>
              <Text variant="body-sm" className="text-content-subtle">No files found</Text>
            </Box>
          ) : (
            <Box className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((file) => (
                <Box
                  key={file.id}
                  className="group relative p-4 rounded-xl border border-border bg-surface-raised hover:border-brand-300 transition-colors"
                >
                  <Box className="text-3xl mb-2">{fileIcon(file.mimeType)}</Box>
                  <Text variant="body-sm" className="font-medium truncate block">{file.filename}</Text>
                  {file.emailSubject && (
                    <Text variant="caption" className="text-content-subtle truncate block mt-0.5">
                      {file.emailSubject}
                    </Text>
                  )}
                  <Text variant="caption" className="text-content-tertiary mt-1 block">
                    {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
                  </Text>
                  <Box className="absolute inset-0 rounded-xl flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-surface/90 transition-opacity">
                    {file.url && (
                      <a
                        href={file.url}
                        download
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-surface text-content hover:bg-surface-secondary transition-colors"
                      >
                        Download
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(file.id)}
                      disabled={deletingId === file.id}
                      className="text-red-600 hover:text-red-700"
                    >
                      {deletingId === file.id ? "…" : "Delete"}
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </PageLayout>
    </PlanGate>
  );
}
