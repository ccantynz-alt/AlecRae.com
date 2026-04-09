/**
 * Emailed Desktop — System Tray Manager
 *
 * Manages the system tray icon, context menu, and unread
 * badge overlay. Supports macOS, Windows, and Linux with
 * platform-specific behavior.
 */

import {
  Tray,
  Menu,
  nativeImage,
  app,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import * as path from "node:path";

// ── Types ─────────────────────────────────────────────────

interface TrayCallbacks {
  readonly onShowInbox: () => void;
  readonly onCompose: () => void;
  readonly onQuit: () => void;
}

// ── Constants ─────────────────────────────────────────────

const IS_MAC = process.platform === "darwin";
const TRAY_ICON_SIZE = IS_MAC ? 22 : 24;

// ── TrayManager ───────────────────────────────────────────

export class TrayManager {
  private tray: Tray;
  private readonly callbacks: TrayCallbacks;
  private unreadCount: number;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
    this.unreadCount = 0;

    const icon = this.createTrayIcon(0);
    this.tray = new Tray(icon);
    this.tray.setToolTip("Emailed");

    this.buildContextMenu();

    this.tray.on("click", () => {
      this.callbacks.onShowInbox();
    });

    this.tray.on("double-click", () => {
      this.callbacks.onShowInbox();
    });
  }

  /**
   * Update the unread message count displayed on the tray icon.
   * Rebuilds the tray icon with the badge overlay and updates
   * the context menu to reflect the current count.
   */
  updateUnreadCount(count: number): void {
    this.unreadCount = Math.max(0, count);
    const icon = this.createTrayIcon(this.unreadCount);
    this.tray.setImage(icon);
    this.tray.setToolTip(
      this.unreadCount > 0
        ? `Emailed — ${this.unreadCount} unread`
        : "Emailed",
    );
    this.buildContextMenu();
  }

  /**
   * Clean up the tray icon and associated resources.
   */
  destroy(): void {
    this.tray.destroy();
  }

  // ── Context Menu ────────────────────────────────────────

  private buildContextMenu(): void {
    const unreadLabel = this.unreadCount > 0
      ? `Inbox (${this.unreadCount} unread)`
      : "Inbox";

    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: unreadLabel,
        click: () => this.callbacks.onShowInbox(),
      },
      {
        label: "Compose New Email",
        accelerator: "CommandOrControl+Shift+N",
        click: () => this.callbacks.onCompose(),
      },
      { type: "separator" },
      {
        label: `Emailed v${app.getVersion()}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Quit Emailed",
        accelerator: IS_MAC ? "Command+Q" : "Alt+F4",
        click: () => this.callbacks.onQuit(),
      },
    ];

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    this.tray.setContextMenu(contextMenu);
  }

  // ── Icon Rendering ──────────────────────────────────────

  private createTrayIcon(badgeCount: number): NativeImage {
    const size = TRAY_ICON_SIZE;
    const scaleFactor = IS_MAC ? 2 : 1;
    const renderSize = size * scaleFactor;

    const envelopeColor = IS_MAC ? "#1e293b" : "#e2e8f0";
    const badgeFill = "#ef4444";
    const badgeText = "#ffffff";

    const envelope = this.renderEnvelopeSvg(renderSize, envelopeColor);

    let svg: string;
    if (badgeCount > 0) {
      const badgeRadius = Math.round(renderSize * 0.25);
      const badgeCx = renderSize - badgeRadius;
      const badgeCy = badgeRadius;
      const displayCount = badgeCount > 99 ? "99+" : String(badgeCount);
      const fontSize = badgeCount > 99 ? Math.round(badgeRadius * 0.8) : Math.round(badgeRadius * 1.1);

      svg = `
        <svg width="${renderSize}" height="${renderSize}" xmlns="http://www.w3.org/2000/svg">
          ${envelope}
          <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeRadius}" fill="${badgeFill}"/>
          <text x="${badgeCx}" y="${badgeCy}" font-size="${fontSize}" fill="${badgeText}"
            text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="bold">
            ${displayCount}
          </text>
        </svg>
      `;
    } else {
      svg = `
        <svg width="${renderSize}" height="${renderSize}" xmlns="http://www.w3.org/2000/svg">
          ${envelope}
        </svg>
      `;
    }

    const image = nativeImage.createFromBuffer(Buffer.from(svg));

    if (IS_MAC) {
      image.setTemplateImage(badgeCount === 0);
    }

    return image;
  }

  private renderEnvelopeSvg(size: number, color: string): string {
    const margin = Math.round(size * 0.15);
    const width = size - margin * 2;
    const height = Math.round(width * 0.7);
    const top = Math.round((size - height) / 2);
    const left = margin;

    const midX = left + width / 2;
    const flapY = top + height * 0.4;

    return `
      <rect x="${left}" y="${top}" width="${width}" height="${height}"
        rx="${Math.round(size * 0.06)}" ry="${Math.round(size * 0.06)}"
        fill="none" stroke="${color}" stroke-width="${Math.max(1, Math.round(size * 0.06))}"/>
      <polyline points="${left},${top} ${midX},${flapY} ${left + width},${top}"
        fill="none" stroke="${color}" stroke-width="${Math.max(1, Math.round(size * 0.06))}"
        stroke-linejoin="round"/>
    `;
  }
}
