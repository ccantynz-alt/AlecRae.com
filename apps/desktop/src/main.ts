/**
 * AlecRae Desktop — Electron Main Process
 *
 * Native desktop wrapper for mail.alecrae.com providing:
 *   - System tray + dock badge with unread count
 *   - Native notifications
 *   - Auto-updater
 *   - Keyboard shortcut registration (global)
 *   - Window state persistence
 *   - Deep-link handling (mailto:)
 *   - Secure session storage
 */

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  Notification,
  globalShortcut,
  screen,
} from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// ─── Path Resolution ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve a path relative to the app root (works in both dev and packaged) */
function resolveAppPath(...segments: string[]): string {
  const base = app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : path.join(__dirname, "..");
  return path.join(base, ...segments);
}

// ─── Configuration ──────────────────────────────────────────────────────────

const WEB_APP_URL: string =
  process.env["ALECRAE_APP_URL"] ?? "https://mail.alecrae.com";
const IS_DEV: boolean = process.env["NODE_ENV"] === "development";

// ─── Store Types ────────────────────────────────────────────────────────────

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StoreSchema {
  windowBounds: WindowBounds;
  isMaximized: boolean;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  unreadCount: number;
  lastAccount: string | undefined;
}

type StoreKey = keyof StoreSchema;

const VALID_STORE_KEYS: ReadonlySet<string> = new Set<StoreKey>([
  "windowBounds",
  "isMaximized",
  "minimizeToTray",
  "launchOnStartup",
  "unreadCount",
  "lastAccount",
]);

function isValidStoreKey(key: string): key is StoreKey {
  return VALID_STORE_KEYS.has(key);
}

// Persisted settings across launches
const store = new Store<StoreSchema>({
  defaults: {
    windowBounds: { x: 100, y: 100, width: 1400, height: 900 },
    isMaximized: false,
    minimizeToTray: true,
    launchOnStartup: false,
    unreadCount: 0,
    lastAccount: undefined,
  },
});

// ─── State ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ─── Single Instance Lock ───────────────────────────────────────────────────

const gotLock: boolean = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // If user tries to open a second instance, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
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

// ─── Window Bounds Validation ───────────────────────────────────────────────

/** Ensure saved window bounds are within a visible display area */
function getValidatedBounds(): WindowBounds {
  const saved = store.get("windowBounds");
  const displays = screen.getAllDisplays();

  // Check if any part of the saved position is visible on any display
  const isVisible = displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    return (
      saved.x < x + width &&
      saved.x + saved.width > x &&
      saved.y < y + height &&
      saved.y + saved.height > y
    );
  });

  if (isVisible) {
    return saved;
  }

  // Fall back to primary display center
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workArea;
  return {
    x: Math.round((width - 1400) / 2),
    y: Math.round((height - 900) / 2),
    width: 1400,
    height: 900,
  };
}

// ─── Main Window ────────────────────────────────────────────────────────────

function createMainWindow(): void {
  const bounds = getValidatedBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: "#0f172a", // Slate 950
    show: false, // Show after "ready-to-show" to avoid white flash
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

  // Load the web app (remote URL in prod, can be localhost in dev)
  void mainWindow.loadURL(WEB_APP_URL);

  // Show window when content is ready (prevents white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Persist window bounds on resize/move
  mainWindow.on("resize", saveWindowBounds);
  mainWindow.on("move", saveWindowBounds);
  mainWindow.on("maximize", () => {
    store.set("isMaximized", true);
  });
  mainWindow.on("unmaximize", () => {
    store.set("isMaximized", false);
  });

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
    if (
      url.startsWith("https://mail.alecrae.com") ||
      url.startsWith("https://alecrae.com")
    ) {
      return { action: "allow" as const };
    }
    void shell.openExternal(url);
    return { action: "deny" as const };
  });

  // Dev tools in development only
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isMaximized()) return;
  const bounds = mainWindow.getBounds();
  store.set("windowBounds", bounds);
}

// ─── System Tray ────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = resolveAppPath("build", "tray-icon.png");

  // Gracefully handle missing tray icon (skip tray if icon not found)
  if (!fs.existsSync(iconPath)) {
    return;
  }

  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 22, height: 22 });
  icon.setTemplateImage(true); // macOS dark mode support

  tray = new Tray(icon);
  tray.setToolTip("AlecRae");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show AlecRae",
      click: (): void => {
        mainWindow?.show();
      },
    },
    { type: "separator" },
    {
      label: "Compose New Email",
      accelerator: "CmdOrCtrl+N",
      click: (): void => {
        mainWindow?.show();
        mainWindow?.webContents.send("compose-new");
      },
    },
    {
      label: "Check Mail",
      click: (): void => {
        mainWindow?.webContents.send("sync-now");
      },
    },
    { type: "separator" },
    {
      label: "Preferences...",
      accelerator: "CmdOrCtrl+,",
      click: (): void => {
        mainWindow?.show();
        mainWindow?.webContents.send("open-preferences");
      },
    },
    { type: "separator" },
    {
      label: "Quit AlecRae",
      accelerator: "CmdOrCtrl+Q",
      click: (): void => {
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

// ─── Application Menu (AlecRae branding) ─────────────────────────────────────

function createMenu(): void {
  const isMac = process.platform === "darwin";

  const macAppMenu: Electron.MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: "AlecRae",
          submenu: [
            { role: "about" },
            { type: "separator" },
            {
              label: "Preferences...",
              accelerator: "Cmd+,",
              click: (): void => {
                mainWindow?.webContents.send("open-preferences");
              },
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ]
    : [];

  const template: Electron.MenuItemConstructorOptions[] = [
    ...macAppMenu,
    {
      label: "File",
      submenu: [
        {
          label: "New Email",
          accelerator: "CmdOrCtrl+N",
          click: (): void => {
            mainWindow?.webContents.send("compose-new");
          },
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: (): void => {
            createMainWindow();
          },
        },
        { type: "separator" },
        {
          label: "Check Mail",
          accelerator: "CmdOrCtrl+Shift+M",
          click: (): void => {
            mainWindow?.webContents.send("sync-now");
          },
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
          click: (): void => {
            mainWindow?.webContents.send("focus-search");
          },
        },
        {
          label: "Command Palette",
          accelerator: "CmdOrCtrl+K",
          click: (): void => {
            mainWindow?.webContents.send("open-command-palette");
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(IS_DEV ? [{ role: "toggleDevTools" as const }] : []),
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
          click: (): void => {
            mainWindow?.webContents.send("toggle-dark-mode");
          },
        },
      ],
    },
    {
      label: "Go",
      submenu: [
        {
          label: "Inbox",
          accelerator: "CmdOrCtrl+1",
          click: (): void => {
            mainWindow?.webContents.send("navigate", "inbox");
          },
        },
        {
          label: "Sent",
          accelerator: "CmdOrCtrl+2",
          click: (): void => {
            mainWindow?.webContents.send("navigate", "sent");
          },
        },
        {
          label: "Drafts",
          accelerator: "CmdOrCtrl+3",
          click: (): void => {
            mainWindow?.webContents.send("navigate", "drafts");
          },
        },
        {
          label: "Archive",
          accelerator: "CmdOrCtrl+4",
          click: (): void => {
            mainWindow?.webContents.send("navigate", "archive");
          },
        },
        { type: "separator" },
        {
          label: "Calendar",
          accelerator: "CmdOrCtrl+5",
          click: (): void => {
            mainWindow?.webContents.send("navigate", "calendar");
          },
        },
        {
          label: "Contacts",
          accelerator: "CmdOrCtrl+6",
          click: (): void => {
            mainWindow?.webContents.send("navigate", "contacts");
          },
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "AlecRae Documentation",
          click: (): void => {
            void shell.openExternal("https://docs.alecrae.com");
          },
        },
        {
          label: "Keyboard Shortcuts",
          accelerator: "CmdOrCtrl+/",
          click: (): void => {
            mainWindow?.webContents.send("show-shortcuts");
          },
        },
        { type: "separator" },
        {
          label: "Report an Issue",
          click: (): void => {
            void shell.openExternal(
              "https://github.com/ccantynz-alt/alecrae.com/issues",
            );
          },
        },
        {
          label: "Check for Updates",
          click: (): void => {
            void autoUpdater.checkForUpdatesAndNotify();
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Unread Badge (dock + tray) ─────────────────────────────────────────────

function updateUnreadBadge(count: number): void {
  store.set("unreadCount", count);

  // macOS dock badge
  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  }

  // Windows taskbar overlay
  if (process.platform === "win32" && mainWindow) {
    if (count > 0) {
      const overlayPath = resolveAppPath("build", "overlay-unread.png");
      if (fs.existsSync(overlayPath)) {
        mainWindow.setOverlayIcon(
          nativeImage.createFromPath(overlayPath),
          `${count} unread`,
        );
      }
    } else {
      mainWindow.setOverlayIcon(null, "");
    }
  }

  // Tray tooltip
  tray?.setToolTip(count > 0 ? `AlecRae \u2014 ${count} unread` : "AlecRae");
}

// ─── Notifications ──────────────────────────────────────────────────────────

function showNotification(
  title: string,
  body: string,
  emailId?: string,
): void {
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

ipcMain.on(
  "show-notification",
  (
    _event,
    payload: { title: string; body: string; emailId?: string },
  ) => {
    showNotification(payload.title, payload.body, payload.emailId);
  },
);

ipcMain.on("set-preference", (_event, key: string, value: unknown) => {
  if (isValidStoreKey(key)) {
    // Use type-safe setter via individual key checks
    switch (key) {
      case "windowBounds":
        store.set("windowBounds", value as WindowBounds);
        break;
      case "isMaximized":
        store.set("isMaximized", value as boolean);
        break;
      case "minimizeToTray":
        store.set("minimizeToTray", value as boolean);
        break;
      case "launchOnStartup":
        store.set("launchOnStartup", value as boolean);
        break;
      case "unreadCount":
        store.set("unreadCount", value as number);
        break;
      case "lastAccount":
        store.set("lastAccount", value as string | undefined);
        break;
    }
  }
});

ipcMain.handle("get-preference", (_event, key: string): unknown => {
  if (isValidStoreKey(key)) {
    return store.get(key);
  }
  return undefined;
});

interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  version: string;
  isPackaged: boolean;
}

ipcMain.handle("get-platform", (): PlatformInfo => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  };
});

// ─── Auto Updater ───────────────────────────────────────────────────────────

autoUpdater.on("update-available", () => {
  mainWindow?.webContents.send("update-available");
});

autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("update-downloaded");
});

// ─── App Lifecycle ──────────────────────────────────────────────────────────

void app.whenReady().then(() => {
  createMainWindow();
  createTray();
  createMenu();

  // Register global shortcut for quick compose (show app + open compose)
  globalShortcut.register("CommandOrControl+Shift+E", () => {
    mainWindow?.show();
    mainWindow?.webContents.send("compose-new");
  });

  // Check for updates in production (non-blocking)
  if (!IS_DEV) {
    void autoUpdater.checkForUpdatesAndNotify();
  }

  // macOS: re-create window when dock icon clicked and no windows open
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep running in the menu bar until explicit quit
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

// Handle mailto: protocol — makes AlecRae the default email handler
app.setAsDefaultProtocolClient("mailto");
