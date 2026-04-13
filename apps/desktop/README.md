# AlecRae Desktop

Native desktop wrapper for AlecRae, providing:

- **Native notifications** with click-to-open
- **System tray** with quick actions
- **Dock badge** (macOS) / **taskbar overlay** (Windows) showing unread count
- **Global shortcut** (Cmd+Shift+M) for quick compose
- **Auto-updater** via GitHub releases
- **Window state persistence**
- **Single instance lock**
- **Deep-link handling** (mailto:)
- **Multi-window support**
- **Spell check**

## Architecture

The desktop app is a thin Electron wrapper around `mail.alecrae.com`. All business logic lives in the web app — the desktop wrapper adds native integration only.

```
┌─────────────────────────────────────────┐
│  Electron Main Process (main.ts)         │
│  - Window management                     │
│  - System tray + dock badge               │
│  - Native menus                           │
│  - Auto-updater                           │
│  - IPC handlers                           │
└─────────────────┬───────────────────────┘
                  │ IPC
┌─────────────────┴───────────────────────┐
│  Preload (preload.ts)                    │
│  - Exposes window.alecrae API             │
│  - contextIsolation: true                 │
└─────────────────┬───────────────────────┘
                  │ contextBridge
┌─────────────────┴───────────────────────┐
│  Renderer: https://mail.alecrae.com       │
│  - Uses window.alecrae when available     │
│  - Falls back gracefully in browser      │
└─────────────────────────────────────────┘
```

## Build

```bash
# Dev (hot reload)
bun run dev

# Production build
bun run build

# Package for current platform
bun run dist

# Platform-specific builds
bun run dist:mac     # .dmg + .zip (x64 + arm64)
bun run dist:win     # .exe NSIS installer + portable
bun run dist:linux   # .AppImage + .deb + .rpm
```

## Distribution

Builds are published via GitHub Releases and auto-updated via `electron-updater`.

Supported targets:
- **macOS:** 10.15+ (Catalina and later), universal binary (Intel + Apple Silicon)
- **Windows:** 10+ (x64 + ARM64)
- **Linux:** Any distro supporting AppImage, Debian-based, RPM-based

## Signing

- **macOS:** Apple Developer ID required for notarization
- **Windows:** Code signing certificate required to avoid SmartScreen warnings
- **Linux:** No signing required

Environment variables for signing:
```
APPLE_ID=your@apple.id
APPLE_ID_PASSWORD=app-specific-password
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=path/to/cert.p12
CSC_KEY_PASSWORD=cert_password
```
