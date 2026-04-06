/**
 * Emailed Desktop — Main Process
 *
 * Creates the main BrowserWindow pointing to the Emailed web app,
 * manages system tray, native notifications, deep link handling,
 * auto-updates, dock badge, and global keyboard shortcuts.
 */

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeImage,
  Notification,
  protocol,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "node:path";
import { TrayManager } from "./tray";

// ── Constants ─────────────────────────────────────────────

const APP_URL = process.env["EMAILED_APP_URL"] ?? "https://app.emailed.com";
const PROTOCOL_SCHEME = "emailed";
const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";
const IS_LINUX = process.platform === "linux";
const IS_DEV = process.env["NODE_ENV"] === "development";

// ── State ─────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let trayManager: TrayManager | null = null;
let unreadCount = 0;

// ── Window Creation ───────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: "Emailed",
    show: false,
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    trafficLightPosition: IS_MAC ? { x: 16, y: 16 } : undefined,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webviewTag: false,
    },
  };

  const window = new BrowserWindow(windowOptions);

  window.loadURL(APP_URL).catch((err: unknown) => {
    console.error("Failed to load app URL:", err);
    window.loadURL(`data:text/html,<h1>Failed to connect to Emailed</h1><p>Check your internet connection.</p>`);
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("close", (event) => {
    if (IS_MAC && !app.isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`Page load failed: ${errorCode} - ${errorDescription}`);
  });

  return window;
}

// ── Deep Link Handling ────────────────────────────────────

function setupDeepLinks(): void {
  if (IS_MAC || IS_WIN) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  }

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  if (IS_WIN || IS_LINUX) {
    const gotSingleLock = app.requestSingleInstanceLock();
    if (!gotSingleLock) {
      app.quit();
      return;
    }

    app.on("second-instance", (_event, argv) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      const deepLinkUrl = argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (deepLinkUrl) {
        handleDeepLink(deepLinkUrl);
      }
    });
  }
}

function handleDeepLink(url: string): void {
  if (!mainWindow) return;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return;

    const appPath = buildAppPath(parsed);
    mainWindow.loadURL(`${APP_URL}${appPath}`);

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } catch (err: unknown) {
    console.error("Invalid deep link URL:", url, err);
  }
}

function buildAppPath(parsed: URL): string {
  const host = parsed.hostname;
  const pathname = parsed.pathname;

  switch (host) {
    case "compose":
      return `/compose${pathname}`;
    case "inbox":
      return `/inbox${pathname}`;
    case "message":
      return `/message${pathname}`;
    case "settings":
      return `/settings${pathname}`;
    default:
      return `/${host}${pathname}`;
  }
}

// ── Keyboard Shortcuts ────────────────────────────────────

function registerGlobalShortcuts(): void {
  globalShortcut.register("CommandOrControl+Shift+E", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });

  globalShortcut.register("CommandOrControl+Shift+N", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("navigate", "/compose");
    }
  });

  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("navigate", "/inbox");
    }
  });
}

// ── Auto-Updater ──────────────────────────────────────────

function setupAutoUpdater(): void {
  if (IS_DEV) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("updater:checking", undefined);
  });

  autoUpdater.on("update-available", (info) => {
    sendToRenderer("updater:available", {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("updater:not-available", undefined);
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("updater:progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer("updater:downloaded", {
      version: info.version,
    });
    showNativeNotification(
      "Update Ready",
      `Version ${info.version} has been downloaded. Restart to apply.`,
    );
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
    sendToRenderer("updater:error", { message: err.message });
  });

  autoUpdater.checkForUpdatesAndNotify();

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);
}

// ── Native Notifications ──────────────────────────────────

function showNativeNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: false,
  });

  notification.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  notification.show();
}

// ── IPC Handlers ──────────────────────────────────────────

function setupIpcHandlers(): void {
  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:get-platform", () => {
    return process.platform;
  });

  ipcMain.handle("app:get-locale", () => {
    return app.getLocale();
  });

  ipcMain.on("notification:show", (_event, data: { title: string; body: string }) => {
    showNativeNotification(data.title, data.body);
  });

  ipcMain.on("badge:set", (_event, count: number) => {
    unreadCount = count;
    updateBadge(count);
    trayManager?.updateUnreadCount(count);
  });

  ipcMain.handle("updater:check", async () => {
    if (IS_DEV) return { updateAvailable: false };
    const result = await autoUpdater.checkForUpdates();
    return {
      updateAvailable: result?.updateInfo !== undefined,
      version: result?.updateInfo.version,
    };
  });

  ipcMain.handle("updater:install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.on("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    mainWindow?.close();
  });
}

// ── Badge Management ──────────────────────────────────────

function updateBadge(count: number): void {
  if (IS_MAC) {
    app.dock.setBadge(count > 0 ? String(count) : "");
  }

  if (IS_WIN && mainWindow) {
    if (count > 0) {
      mainWindow.setOverlayIcon(
        createBadgeIcon(count),
        `${count} unread messages`,
      );
    } else {
      mainWindow.setOverlayIcon(null, "");
    }
  }

  if (IS_LINUX && mainWindow) {
    app.setBadgeCount(count);
  }
}

function createBadgeIcon(count: number): Electron.NativeImage {
  const size = 16;
  const canvas = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ef4444"/>
      <text x="${size / 2}" y="${size / 2 + 1}" font-size="10" fill="white"
        text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">
        ${count > 99 ? "99+" : count}
      </text>
    </svg>
  `;
  return nativeImage.createFromBuffer(Buffer.from(canvas));
}

// ── Utility ───────────────────────────────────────────────

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ── App Extensions ────────────────────────────────────────

declare module "electron" {
  interface App {
    isQuitting?: boolean;
  }
}

// ── App Lifecycle ─────────────────────────────────────────

setupDeepLinks();

app.whenReady().then(() => {
  setupIpcHandlers();
  registerGlobalShortcuts();

  mainWindow = createMainWindow();

  trayManager = new TrayManager({
    onShowInbox: () => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send("navigate", "/inbox");
    },
    onCompose: () => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send("navigate", "/compose");
    },
    onQuit: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  setupAutoUpdater();

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!IS_MAC) {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
