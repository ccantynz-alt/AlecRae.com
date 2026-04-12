# AlecRae Mobile

Native iOS and Android email client built with Expo + React Native.

## Features

- **Native performance** on iOS and Android
- **Dark mode** that follows system preference
- **Push notifications** via Expo / FCM / APNs
- **Biometric unlock** (Face ID, Touch ID, Android fingerprint)
- **Haptic feedback** on actions
- **Deep linking** (mailto:, alecrae://)
- **Offline support** via local cache
- **OTA updates** via Expo EAS Update

## Architecture

Built with Expo Router (file-based routing) for:
- Full TypeScript support
- Shared code between iOS, Android, and web
- Easy deep linking
- Built-in navigation patterns

```
app/
├── _layout.tsx           # Root layout with providers
├── index.tsx             # Coming Soon landing
├── inbox/                # Inbox list + search
├── compose.tsx           # Compose modal
├── thread/[id].tsx       # Thread detail view
├── settings/             # Settings pages
└── +not-found.tsx        # 404 handler
```

## Dev

```bash
# Install dependencies
bun install

# Start dev server (hot reload)
bun run start

# Run on iOS simulator
bun run ios

# Run on Android emulator
bun run android

# Run on web (for quick testing)
bun run web
```

## Build & Deploy

Uses [EAS Build](https://docs.expo.dev/build/introduction/) for cloud builds.

```bash
# One-time setup
npm install -g eas-cli
eas login
eas build:configure

# Preview build (for TestFlight / internal testing)
eas build --profile preview --platform all

# Production build (for App Store / Play Store)
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Requirements

- **iOS:** iOS 15.0+
- **Android:** Android 7.0 (API 24)+
- **Node:** 18.0+

## Credentials Needed

Before publishing:
- **iOS:** Apple Developer account ($99/yr)
- **Android:** Google Play Developer account ($25 one-time)
- **Push notifications:** Apple APNs key + Firebase FCM server key
