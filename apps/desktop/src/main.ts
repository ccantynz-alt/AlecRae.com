/**
 * Vienna Desktop — Electron Main Process
 *
 * Native desktop wrapper for mail.vienna.com providing:
 *   - System tray + dock badge with unread count
 *   - Native notifications
 *   - Auto-updater
 *   - Keyboard shortcut registration (global)
 *   - Window state persistence
 *   - Multi-window support (per account)
 *   - Deep-link handling (mailto:)
 *   - Secure session storage
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification, globalShortcut } from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ───────────────────────────────────────────────────────────

const WEB_APP_URL = process.env.VIENNA_APP_URL ?? "https://mail.vienna.com";
const IS_DEV = process.env.NODE_ENV === "development";

// Persisted settings across launches
const store = new Store<{
  windowBounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  unreadCount: number;
  lastAccount?: string;
}>({
  defaults: {
    windowBounds: { x: 100, y: 100, width: 1400, height: 900 },
    isMaximized: false,
    minimizeToTray: true,
    launchOnStartup: false,
    unreadCount: 0,
  },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ─── Single Instance Lock ───────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // If user tries to open a second instance, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }

    // Handle mailto: deep link from command line
    const mailtoArg = commandLine.find((arg) => arg.startsWith("mailto:"));
    if (mailtoArg && mainWindow) {
      mainWindow.webContents.send("deep-link", mailtoArg);
    }
  });
}

// ─── Main Window ─────────────────────────────────────────────────────────────

function createMainWindow(): void {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: "#0f172a", // Slate 950
    show: false, // Show after 'ready-to-show' to avoid flash
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !IS_DEV,
      spellcheck: true,
    },
  });

  // Restore maximized state
  if (store.get("isMaximized")) {
    mainWindow.maximize();
  }

  // Load the web app
  mainWindow.loadURL(WEB_APP_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Persist window bounds
  mainWindow.on("resize", saveWindowBounds);
  mainWindow.on("move", saveWindowBounds);
  mainWindow.on("maximize", () => store.set("isMaximized", true));
  mainWindow.on("unmaximize", () => store.set("isMaximized", false));

  // Minimize to tray instead of quitting on close (configurable)
  mainWindow.on("close", (event) => {
    if (!isQuitting && store.get("minimizeToTray")) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://mail.vienna.com") || url.startsWith("https://vienna.com")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isMaximized()) return;
  const bounds = mainWindow.getBounds();
  store.set("windowBounds", bounds);
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, "../build/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
  icon.setTemplateImage(true); // macOS dark mode support

  tray = new Tray(icon);
  tray.setToolTip("Vienna");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Vienna", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "Compose New Email",
      accelerator: "CmdOrCtrl+N",
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send("compose-new");
      },
    },
    {
      label: "Check Mail",
      click: () => mainWindow?.webContents.send("sync-now"),
    },
    { type: "separator" },
    {
      label: "Preferences...",
      accelerator: "CmdOrCtrl+,",
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send("open-preferences");
      },
    },
    { type: "separator" },
    {
      label: "Quit Vienna",
      accelerator: "CmdOrCtrl+Q",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

// ─── Application Menu ────────────────────────────────────────────────────────

function createMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "Vienna",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Preferences...",
                accelerator: "Cmd+,",
                click: () => mainWindow?.webContents.send("open-preferences"),
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Email",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("compose-new"),
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => createMainWindow(),
        },
        { type: "separator" },
        {
          label: "Check Mail",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => mainWindow?.webContents.send("sync-now"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find in Mailbox",
          accelerator: "CmdOrCtrl+F",
          click: () => mainWindow?.webContents.send("focus-search"),
        },
        {
          label: "Command Palette",
          accelerator: "CmdOrCtrl+K",
          click: () => mainWindow?.webContents.send("open-command-palette"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Toggle Dark Mode",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => mainWindow?.webContents.send("toggle-dark-mode"),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }, { type: "separator" as const }, { role: "window" as const }]
          : [{ role: "close" as const }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Vienna Documentation",
          click: () => shell.openExternal("https://docs.vienna.com"),
        },
        {
          label: "Keyboard Shortcuts",
          accelerator: "CmdOrCtrl+?",
          click: () => mainWindow?.webContents.send("show-shortcuts"),
        },
        { type: "separator" },
        {
          label: "Report an Issue",
          click: () => shell.openExternal("https://github.com/ccantynz-alt/emailed/issues"),
        },
        {
          label: "Check for Updates",
          click: () => autoUpdater.checkForUpdatesAndNotify(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Unread Badge (dock + tray) ──────────────────────────────────────────────

function updateUnreadBadge(count: number): void {
  store.set("unreadCount", count);

  // macOS dock badge
  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  }

  // Windows taskbar overlay
  if (process.platform === "win32" && mainWindow) {
    if (count > 0) {
      mainWindow.setOverlayIcon(
        nativeImage.createFromPath(path.join(__dirname, "../build/overlay-unread.png")),
        `${count} unread`,
      );
    } else {
      mainWindow.setOverlayIcon(null, "");
    }
  }

  // Tray tooltip
  tray?.setToolTip(count > 0 ? `Vienna — ${count} unread` : "Vienna");
}

// ─── Notifications ───────────────────────────────────────────────────────────

function showNotification(title: string, body: string, emailId?: string): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: false,
    timeoutType: "default",
  });

  notification.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (emailId) {
      mainWindow?.webContents.send("open-email", emailId);
    }
  });

  notification.show();
}

// ─── IPC Handlers (from renderer/web app) ───────────────────────────────────

ipcMain.on("update-badge", (_event, count: number) => {
  updateUnreadBadge(count);
});

ipcMain.on("show-notification", (_event, { title, body, emailId }: { title: string; body: string; emailId?: string }) => {
  showNotification(title, body, emailId);
});

ipcMain.on("set-preference", (_event, key: string, value: unknown) => {
  store.set(key as any, value);
});

ipcMain.handle("get-preference", (_event, key: string) => {
  return store.get(key as any);
});

ipcMain.handle("get-platform", () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  };
});

// ─── Auto Updater ────────────────────────────────────────────────────────────

autoUpdater.on("update-available", () => {
  mainWindow?.webContents.send("update-available");
});

autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("update-downloaded");
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  createMenu();

  // Register global shortcut for quick compose
  globalShortcut.register("CommandOrControl+Shift+M", () => {
    mainWindow?.show();
    mainWindow?.webContents.send("compose-new");
  });

  // Check for updates in production
  if (!IS_DEV) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Handle mailto: protocol
app.setAsDefaultProtocolClient("mailto");
