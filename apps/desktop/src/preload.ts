/**
 * Emailed Desktop — Preload Script
 *
 * Exposes a safe, typed API to the renderer process via
 * contextBridge. Provides notification, system info,
 * auto-update, window control, and navigation APIs.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// ── Type definitions for the exposed API ──────────────────

interface NotificationPayload {
  readonly title: string;
  readonly body: string;
}

interface SystemInfo {
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly locale: string;
}

interface UpdateCheckResult {
  readonly updateAvailable: boolean;
  readonly version?: string;
}

interface UpdateProgress {
  readonly percent: number;
  readonly bytesPerSecond: number;
  readonly transferred: number;
  readonly total: number;
}

interface UpdateAvailableInfo {
  readonly version: string;
  readonly releaseDate?: string;
}

interface UpdateDownloadedInfo {
  readonly version: string;
}

interface UpdateError {
  readonly message: string;
}

type UnsubscribeFn = () => void;

interface EmailedDesktopApi {
  readonly notification: {
    show(payload: NotificationPayload): void;
  };

  readonly system: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<NodeJS.Platform>;
    getLocale(): Promise<string>;
    getInfo(): Promise<SystemInfo>;
  };

  readonly updater: {
    check(): Promise<UpdateCheckResult>;
    install(): Promise<void>;
    onChecking(callback: () => void): UnsubscribeFn;
    onAvailable(callback: (info: UpdateAvailableInfo) => void): UnsubscribeFn;
    onNotAvailable(callback: () => void): UnsubscribeFn;
    onProgress(callback: (progress: UpdateProgress) => void): UnsubscribeFn;
    onDownloaded(callback: (info: UpdateDownloadedInfo) => void): UnsubscribeFn;
    onError(callback: (error: UpdateError) => void): UnsubscribeFn;
  };

  readonly window: {
    minimize(): void;
    maximize(): void;
    close(): void;
  };

  readonly badge: {
    set(count: number): void;
  };

  readonly navigation: {
    onNavigate(callback: (path: string) => void): UnsubscribeFn;
  };
}

// ── Helper for creating safe IPC listeners ────────────────

function createListener<T>(channel: string, callback: (data: T) => void): UnsubscribeFn {
  const handler = (_event: IpcRendererEvent, data: T): void => {
    callback(data);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// ── Build and expose the API ──────────────────────────────

const api: EmailedDesktopApi = {
  notification: {
    show(payload: NotificationPayload): void {
      ipcRenderer.send("notification:show", {
        title: payload.title,
        body: payload.body,
      });
    },
  },

  system: {
    async getVersion(): Promise<string> {
      const result = await ipcRenderer.invoke("app:get-version");
      return result as string;
    },

    async getPlatform(): Promise<NodeJS.Platform> {
      const result = await ipcRenderer.invoke("app:get-platform");
      return result as NodeJS.Platform;
    },

    async getLocale(): Promise<string> {
      const result = await ipcRenderer.invoke("app:get-locale");
      return result as string;
    },

    async getInfo(): Promise<SystemInfo> {
      const [version, platform, locale] = await Promise.all([
        ipcRenderer.invoke("app:get-version") as Promise<string>,
        ipcRenderer.invoke("app:get-platform") as Promise<NodeJS.Platform>,
        ipcRenderer.invoke("app:get-locale") as Promise<string>,
      ]);
      return { version, platform, locale };
    },
  },

  updater: {
    async check(): Promise<UpdateCheckResult> {
      const result = await ipcRenderer.invoke("updater:check");
      return result as UpdateCheckResult;
    },

    async install(): Promise<void> {
      await ipcRenderer.invoke("updater:install");
    },

    onChecking(callback: () => void): UnsubscribeFn {
      return createListener<undefined>("updater:checking", () => callback());
    },

    onAvailable(callback: (info: UpdateAvailableInfo) => void): UnsubscribeFn {
      return createListener<UpdateAvailableInfo>("updater:available", callback);
    },

    onNotAvailable(callback: () => void): UnsubscribeFn {
      return createListener<undefined>("updater:not-available", () => callback());
    },

    onProgress(callback: (progress: UpdateProgress) => void): UnsubscribeFn {
      return createListener<UpdateProgress>("updater:progress", callback);
    },

    onDownloaded(callback: (info: UpdateDownloadedInfo) => void): UnsubscribeFn {
      return createListener<UpdateDownloadedInfo>("updater:downloaded", callback);
    },

    onError(callback: (error: UpdateError) => void): UnsubscribeFn {
      return createListener<UpdateError>("updater:error", callback);
    },
  },

  window: {
    minimize(): void {
      ipcRenderer.send("window:minimize");
    },

    maximize(): void {
      ipcRenderer.send("window:maximize");
    },

    close(): void {
      ipcRenderer.send("window:close");
    },
  },

  badge: {
    set(count: number): void {
      ipcRenderer.send("badge:set", Math.max(0, Math.floor(count)));
    },
  },

  navigation: {
    onNavigate(callback: (path: string) => void): UnsubscribeFn {
      return createListener<string>("navigate", callback);
    },
  },
};

contextBridge.exposeInMainWorld("emailed", api);

// ── Type augmentation for renderer usage ──────────────────

declare global {
  interface Window {
    emailed: EmailedDesktopApi;
  }
}
