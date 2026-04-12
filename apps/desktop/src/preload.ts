/**
 * AlecRae Desktop — Preload Script
 *
 * Runs in an isolated context with access to both Node.js and the web page.
 * Exposes a safe API to the web app via contextBridge.
 *
 * Security: Only explicitly allowed IPC channels are exposed.
 * No arbitrary send/invoke — each method maps to a specific channel.
 */

import { contextBridge, ipcRenderer } from "electron";

// ─── Type-safe channel allowlists ───────────────────────────────────────────

const SEND_CHANNELS = [
  "update-badge",
  "show-notification",
  "set-preference",
] as const;

const INVOKE_CHANNELS = [
  "get-preference",
  "get-platform",
] as const;

const RECEIVE_CHANNELS = [
  "compose-new",
  "sync-now",
  "open-preferences",
  "open-email",
  "focus-search",
  "open-command-palette",
  "toggle-dark-mode",
  "show-shortcuts",
  "deep-link",
  "update-available",
  "update-downloaded",
] as const;

type ReceiveChannel = (typeof RECEIVE_CHANNELS)[number];

// ─── Exposed API ─────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("alecrae", {
  // Badge management
  updateBadge: (count: number): void => {
    ipcRenderer.send("update-badge", count);
  },

  // Notifications
  showNotification: (title: string, body: string, emailId?: string): void => {
    ipcRenderer.send("show-notification", { title, body, emailId });
  },

  // Preferences
  setPreference: (key: string, value: unknown): void => {
    ipcRenderer.send("set-preference", key, value);
  },
  getPreference: (key: string): Promise<unknown> => {
    return ipcRenderer.invoke("get-preference", key);
  },

  // Platform info
  getPlatform: (): Promise<{
    platform: string;
    arch: string;
    version: string;
    isPackaged: boolean;
  }> => {
    return ipcRenderer.invoke("get-platform");
  },

  // Event listeners (from main process)
  // Each returns an unsubscribe function for cleanup
  onComposeNew: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("compose-new", handler);
    return () => { ipcRenderer.removeListener("compose-new", handler); };
  },

  onSyncNow: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("sync-now", handler);
    return () => { ipcRenderer.removeListener("sync-now", handler); };
  },

  onOpenPreferences: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("open-preferences", handler);
    return () => { ipcRenderer.removeListener("open-preferences", handler); };
  },

  onOpenEmail: (callback: (emailId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, emailId: string): void => {
      callback(emailId);
    };
    ipcRenderer.on("open-email", handler);
    return () => { ipcRenderer.removeListener("open-email", handler); };
  },

  onFocusSearch: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("focus-search", handler);
    return () => { ipcRenderer.removeListener("focus-search", handler); };
  },

  onOpenCommandPalette: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("open-command-palette", handler);
    return () => { ipcRenderer.removeListener("open-command-palette", handler); };
  },

  onToggleDarkMode: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("toggle-dark-mode", handler);
    return () => { ipcRenderer.removeListener("toggle-dark-mode", handler); };
  },

  onShowShortcuts: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("show-shortcuts", handler);
    return () => { ipcRenderer.removeListener("show-shortcuts", handler); };
  },

  onDeepLink: (callback: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => {
      callback(url);
    };
    ipcRenderer.on("deep-link", handler);
    return () => { ipcRenderer.removeListener("deep-link", handler); };
  },

  onUpdateAvailable: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("update-available", handler);
    return () => { ipcRenderer.removeListener("update-available", handler); };
  },

  onUpdateDownloaded: (callback: () => void): (() => void) => {
    const handler = (): void => { callback(); };
    ipcRenderer.on("update-downloaded", handler);
    return () => { ipcRenderer.removeListener("update-downloaded", handler); };
  },

  // Flag for web app to detect desktop mode
  isDesktop: true as const,
});
