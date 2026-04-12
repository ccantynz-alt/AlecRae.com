/**
 * AlecRae Desktop — Global type declarations
 *
 * Extends the Window interface with the `alecrae` API
 * exposed via contextBridge in the preload script.
 */

interface AlecRaeDesktopAPI {
  /** Update the dock/taskbar badge with unread count */
  updateBadge: (count: number) => void;

  /** Show a native OS notification */
  showNotification: (title: string, body: string, emailId?: string) => void;

  /** Persist a preference to disk */
  setPreference: (key: string, value: unknown) => void;

  /** Read a persisted preference */
  getPreference: (key: string) => Promise<unknown>;

  /** Get platform information */
  getPlatform: () => Promise<{
    platform: string;
    arch: string;
    version: string;
    isPackaged: boolean;
  }>;

  /** Listen for compose-new events from the native menu */
  onComposeNew: (callback: () => void) => () => void;

  /** Listen for sync-now events from the native menu */
  onSyncNow: (callback: () => void) => () => void;

  /** Listen for open-preferences events from the native menu */
  onOpenPreferences: (callback: () => void) => () => void;

  /** Listen for open-email events (from notifications) */
  onOpenEmail: (callback: (emailId: string) => void) => () => void;

  /** Listen for focus-search events from the native menu */
  onFocusSearch: (callback: () => void) => () => void;

  /** Listen for command-palette events from the native menu */
  onOpenCommandPalette: (callback: () => void) => () => void;

  /** Listen for dark mode toggle from the native menu */
  onToggleDarkMode: (callback: () => void) => () => void;

  /** Listen for show-shortcuts events from the native menu */
  onShowShortcuts: (callback: () => void) => () => void;

  /** Listen for mailto: deep link events */
  onDeepLink: (callback: (url: string) => void) => () => void;

  /** Listen for update-available events from auto-updater */
  onUpdateAvailable: (callback: () => void) => () => void;

  /** Listen for update-downloaded events from auto-updater */
  onUpdateDownloaded: (callback: () => void) => () => void;

  /** Whether the app is running in the desktop wrapper */
  readonly isDesktop: true;
}

declare global {
  interface Window {
    alecrae?: AlecRaeDesktopAPI;
  }
}

export type { AlecRaeDesktopAPI };
