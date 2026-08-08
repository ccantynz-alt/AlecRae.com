"use client";

/**
 * Workspace switcher — one login, several separate businesses. Lists every
 * workspace the caller belongs to, lets them switch (mints a fresh token
 * pair for that workspace, apps/web/lib/api.ts `workspacesApi.switchTo`)
 * or spin up a brand-new one.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Box, Text, Button, Input } from "@alecrae/ui";
import { workspacesApi, type Workspace } from "../lib/api";
import { getWorkspaceUnreadCounts } from "../lib/api-workspaces";

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Never throws; degrades to {} (no badges) when counts are unavailable.
  const refreshUnread = useCallback((list: Workspace[]) => {
    getWorkspaceUnreadCounts(list)
      .then(setUnread)
      .catch(() => setUnread({}));
  }, []);

  const load = useCallback(() => {
    workspacesApi
      .list()
      .then((res) => {
        setWorkspaces(res.data);
        refreshUnread(res.data);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load workspaces"));
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    if (workspaces === null) {
      load();
    } else {
      // Re-check counts each time the switcher opens — mail arrives between opens.
      refreshUnread(workspaces);
    }
  }, [open, workspaces, load, refreshUnread]);

  const active = workspaces?.find((w) => w.active);
  // Unread in OTHER workspaces — the signal the collapsed dot represents ("mail
  // is waiting somewhere you're not"). The active workspace's own unread lives
  // in the inbox, not here.
  const otherUnread = (workspaces ?? []).some(
    (w) => !w.active && (unread[w.accountId] ?? 0) > 0,
  );

  const switchTo = async (accountId: string): Promise<void> => {
    setBusy(true);
    try {
      await workspacesApi.switchTo(accountId);
      window.location.href = "/inbox";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch workspace");
      setBusy(false);
    }
  };

  const createWorkspace = async (): Promise<void> => {
    if (!newName.trim()) return;
    setBusy(true);
    setCreateError(null);
    try {
      const res = await workspacesApi.create({ name: newName.trim() });
      await workspacesApi.switchTo(res.data.accountId);
      // Land a brand-new workspace on the guided business-email setup flow
      // rather than the bare workspace admin page — this IS the entry point
      // "on the workspace-create landing".
      window.location.href = "/setup";
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create workspace");
      setBusy(false);
    }
  };

  if (collapsed) {
    return (
      <Box
        as="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          otherUnread
            ? "Switch workspace — unread mail in another workspace"
            : "Switch workspace"
        }
        title={active?.name ?? "Switch workspace"}
        className="relative w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-body-sm"
      >
        {(active?.name ?? "W").slice(0, 1).toUpperCase()}
        {otherUnread && (
          <Box
            as="span"
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-600 ring-2 ring-surface"
          />
        )}
      </Box>
    );
  }

  return (
    <Box className="relative">
      <Box
        as="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-secondary transition-colors text-left"
      >
        <Text variant="body-sm" className="font-medium truncate">
          {active?.name ?? "Workspace"}
        </Text>
        <Text as="span" variant="caption" muted>
          {open ? "▲" : "▼"}
        </Text>
      </Box>

      {open && (
        <Box
          role="listbox"
          aria-label="Your workspaces"
          className="absolute left-0 right-0 mt-1 z-20 rounded-lg border border-border bg-surface shadow-lg overflow-hidden"
        >
          {error && (
            <Box className="px-3 py-2">
              <Text variant="caption" className="text-status-error">
                {error}
              </Text>
            </Box>
          )}

          {workspaces === null && !error && (
            <Box className="px-3 py-2">
              <Text variant="caption" muted>
                Loading…
              </Text>
            </Box>
          )}

          {workspaces?.map((w) => (
            <Box
              key={w.accountId}
              as="button"
              role="option"
              aria-selected={w.active}
              disabled={busy || w.active}
              onClick={() => void switchTo(w.accountId)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-secondary transition-colors ${
                w.active ? "bg-surface-secondary" : ""
              }`}
            >
              <Box className="min-w-0">
                <Text variant="body-sm" className="truncate font-medium">
                  {w.name}
                </Text>
                <Text as="span" variant="caption" muted className="capitalize">
                  {w.role}
                </Text>
              </Box>
              <Box className="flex items-center gap-2 flex-shrink-0">
                {(unread[w.accountId] ?? 0) > 0 && (
                  <Box
                    as="span"
                    aria-label={`${unread[w.accountId]} unread`}
                    className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums"
                  >
                    {(unread[w.accountId] ?? 0) > 99 ? "99+" : unread[w.accountId]}
                  </Box>
                )}
                {w.active && (
                  <Text as="span" variant="caption" className="text-brand-700">
                    Active
                  </Text>
                )}
              </Box>
            </Box>
          ))}

          <Box className="border-t border-border p-2">
            {!creating ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreating(true)}
                className="w-full justify-start"
              >
                + New workspace
              </Button>
            ) : (
              <Box className="space-y-2">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName((e.target as HTMLInputElement).value)}
                  placeholder="Workspace name"
                  aria-label="New workspace name"
                />
                {createError && (
                  <Text variant="caption" className="text-status-error">
                    {createError}
                  </Text>
                )}
                <Box className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || !newName.trim()}
                    onClick={() => void createWorkspace()}
                  >
                    Create
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

WorkspaceSwitcher.displayName = "WorkspaceSwitcher";
