/**
 * Vienna Desktop — Preload Script
 *
 * Runs in an isolated context with access to both Node.js and the web page.
 * Exposes a safe API to the web app via contextBridge.
 */

const { contextBridge, ipcRenderer } = require("electron");

// ─── Exposed API ─────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("vienna", {
  // Badge management
  updateBadge: (count: number) => ipcRenderer.send("update-badge", count),

  // Notifications
  showNotification: (title: string, body: string, emailId?: string) =>
    ipcRenderer.send("show-notification", { title, body, emailId }),

  // Preferences
  setPreference: (key: string, value: unknown) =>
    ipcRenderer.send("set-preference", key, value),
  getPreference: (key: string) => ipcRenderer.invoke("get-preference", key),

  // Platform info
  getPlatform: () => ipcRenderer.invoke("get-platform"),

  // Event listeners (from main process)
  onComposeNew: (callback: () => void) => {
    ipcRenderer.on("compose-new", callback);
    return () => ipcRenderer.removeListener("compose-new", callback);
  },
  onSyncNow: (callback: () => void) => {
    ipcRenderer.on("sync-now", callback);
    return () => ipcRenderer.removeListener("sync-now", callback);
  },
  onOpenPreferences: (callback: () => void) => {
    ipcRenderer.on("open-preferences", callback);
    return () => ipcRenderer.removeListener("open-preferences", callback);
  },
  onOpenEmail: (callback: (emailId: string) => void) => {
    const handler = (_event: unknown, emailId: string) => callback(emailId);
    ipcRenderer.on("open-email", handler);
    return () => ipcRenderer.removeListener("open-email", handler);
  },
  onFocusSearch: (callback: () => void) => {
    ipcRenderer.on("focus-search", callback);
    return () => ipcRenderer.removeListener("focus-search", callback);
  },
  onOpenCommandPalette: (callback: () => void) => {
    ipcRenderer.on("open-command-palette", callback);
    return () => ipcRenderer.removeListener("open-command-palette", callback);
  },
  onToggleDarkMode: (callback: () => void) => {
    ipcRenderer.on("toggle-dark-mode", callback);
    return () => ipcRenderer.removeListener("toggle-dark-mode", callback);
  },
  onShowShortcuts: (callback: () => void) => {
    ipcRenderer.on("show-shortcuts", callback);
    return () => ipcRenderer.removeListener("show-shortcuts", callback);
  },
  onDeepLink: (callback: (url: string) => void) => {
    const handler = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on("deep-link", handler);
    return () => ipcRenderer.removeListener("deep-link", handler);
  },
  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on("update-available", callback);
    return () => ipcRenderer.removeListener("update-available", callback);
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on("update-downloaded", callback);
    return () => ipcRenderer.removeListener("update-downloaded", callback);
  },

  // Flag for web app to detect desktop mode
  isDesktop: true,
});
