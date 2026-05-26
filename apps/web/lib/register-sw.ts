'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Service Worker Registration ────────────────────────────────────────────

type UpdateCallback = (registration: ServiceWorkerRegistration) => void;

/**
 * Register the AlecRae service worker and listen for updates.
 *
 * Returns a cleanup function that removes the listener when the calling
 * component unmounts.
 */
function registerServiceWorker(
  onUpdate?: UpdateCallback,
): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  let cancelled = false;

  navigator.serviceWorker
    .register('/sw.js')
    .then((registration: ServiceWorkerRegistration) => {
      if (cancelled) return;

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // A new version is available and waiting to activate.
            onUpdate?.(registration);
          }
        });
      });
    })
    .catch((error: unknown) => {
      if (!cancelled) {
        console.error('[AlecRae] Service worker registration failed:', error);
      }
    });

  return (): void => {
    cancelled = true;
  };
}

// ─── Notification Permission ────────────────────────────────────────────────

/**
 * Request notification permission from the user.
 *
 * Resolves to `true` when permission is granted, `false` otherwise.
 */
async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── usePWA Hook ────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface UsePWAReturn {
  /** Whether the app is running in standalone / installed PWA mode. */
  isInstalled: boolean;
  /** Whether the browser has offered the A2HS install prompt. */
  canInstall: boolean;
  /** Trigger the native install prompt. */
  promptInstall: () => Promise<void>;
  /** Whether a new service worker is waiting to activate. */
  hasUpdate: boolean;
  /** Send `skipWaiting` to the waiting service worker and reload. */
  applyUpdate: () => void;
  /** Whether the user has granted notification permission. */
  notificationsEnabled: boolean;
  /** Request notification permission. Returns `true` if granted. */
  enableNotifications: () => Promise<boolean>;
}

function usePWA(): UsePWAReturn {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [canInstall, setCanInstall] = useState<boolean>(false);
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  // ── Detect standalone mode ──
  useEffect((): (() => void) | undefined => {
    if (typeof window === 'undefined') return undefined;

    const mql = window.matchMedia('(display-mode: standalone)');
    setIsInstalled(mql.matches);

    const handler = (e: MediaQueryListEvent): void => {
      setIsInstalled(e.matches);
    };

    mql.addEventListener('change', handler);
    return (): void => {
      mql.removeEventListener('change', handler);
    };
  }, []);

  // ── Capture beforeinstallprompt ──
  useEffect((): (() => void) | undefined => {
    if (typeof window === 'undefined') return undefined;

    const handler = (e: Event): void => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return (): void => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // ── Register service worker + listen for updates ──
  useEffect((): (() => void) | undefined => {
    if (typeof window === 'undefined') return undefined;

    const cleanup = registerServiceWorker(
      (registration: ServiceWorkerRegistration): void => {
        waitingWorkerRef.current = registration.waiting;
        setHasUpdate(true);
      },
    );

    return cleanup;
  }, []);

  // ── Check existing notification permission ──
  useEffect((): undefined => {
    if (typeof window === 'undefined' || !('Notification' in window)) return undefined;
    setNotificationsEnabled(Notification.permission === 'granted');
    return undefined;
  }, []);

  // ── Listen for controlling SW change to auto-reload ──
  useEffect((): (() => void) | undefined => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }

    let refreshing = false;

    const handler = (): void => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handler);
    return (): void => {
      navigator.serviceWorker.removeEventListener('controllerchange', handler);
    };
  }, []);

  // ── Actions ──

  const promptInstall = useCallback(async (): Promise<void> => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    await prompt.prompt();
    const choice = await prompt.userChoice;

    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }

    deferredPromptRef.current = null;
    setCanInstall(false);
  }, []);

  const applyUpdate = useCallback((): void => {
    const waiting = waitingWorkerRef.current;
    if (!waiting) return;

    waiting.postMessage({ type: 'SKIP_WAITING' });
    // The `controllerchange` listener above handles the reload.
  }, []);

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    return granted;
  }, []);

  return {
    isInstalled,
    canInstall,
    promptInstall,
    hasUpdate,
    applyUpdate,
    notificationsEnabled,
    enableNotifications,
  };
}

export {
  registerServiceWorker,
  requestNotificationPermission,
  usePWA,
};

export type { UsePWAReturn, BeforeInstallPromptEvent };
