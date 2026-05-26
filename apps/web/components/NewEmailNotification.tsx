"use client";

import { useEffect, useCallback, useRef } from "react";

export interface NewEmailData {
  id: string;
  from: string;
  subject: string;
  preview: string;
}

export interface NewEmailNotificationProps {
  enabled: boolean;
  onEmailClick?: (emailId: string) => void;
}

export function useNewEmailNotifications({
  enabled,
  onEmailClick,
}: NewEmailNotificationProps): {
  notifyNewEmail: (email: NewEmailData) => void;
  requestPermission: () => Promise<boolean>;
  permissionState: NotificationPermission | "unsupported";
} {
  const permissionRef = useRef<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      permissionRef.current = "unsupported";
      return;
    }
    permissionRef.current = Notification.permission;
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === "granted";
  }, []);

  const notifyNewEmail = useCallback(
    (email: NewEmailData): void => {
      if (!enabled) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (document.hasFocus()) return;

      const notification = new Notification(email.from, {
        body: `${email.subject}\n${email.preview.slice(0, 100)}`,
        icon: "/icon-192.png",
        tag: `email-${email.id}`,
        renotify: true,
        silent: false,
      });

      notification.onclick = (): void => {
        window.focus();
        onEmailClick?.(email.id);
        notification.close();
      };

      setTimeout(() => notification.close(), 8000);
    },
    [enabled, onEmailClick],
  );

  return {
    notifyNewEmail,
    requestPermission,
    permissionState: permissionRef.current,
  };
}

export function usePageTitleNotification(): {
  setUnreadCount: (count: number) => void;
  clearNotification: () => void;
} {
  const originalTitleRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      originalTitleRef.current = document.title;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (typeof document !== "undefined") {
        document.title = originalTitleRef.current;
      }
    };
  }, []);

  const setUnreadCount = useCallback((count: number): void => {
    if (typeof document === "undefined") return;
    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title.replace(/^\(\d+\)\s*/, "");
    }
    if (count > 0) {
      document.title = `(${count}) ${originalTitleRef.current}`;
    } else {
      document.title = originalTitleRef.current;
    }
  }, []);

  const clearNotification = useCallback((): void => {
    if (typeof document === "undefined") return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    document.title = originalTitleRef.current;
  }, []);

  return { setUnreadCount, clearNotification };
}

export function useFaviconBadge(): {
  showBadge: (count: number) => void;
  clearBadge: () => void;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalFaviconRef = useRef<string>("");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) originalFaviconRef.current = link.href;
  }, []);

  const showBadge = useCallback((count: number): void => {
    if (typeof document === "undefined") return;
    if (count <= 0) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link && originalFaviconRef.current) link.href = originalFaviconRef.current;
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = 32;
      canvasRef.current.height = 32;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = (): void => {
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(img, 0, 0, 32, 32);

      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(count > 99 ? "99+" : String(count), 24, 8);

      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = canvas.toDataURL("image/png");
    };
    img.src = originalFaviconRef.current || "/favicon.ico";
  }, []);

  const clearBadge = useCallback((): void => {
    if (typeof document === "undefined") return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link && originalFaviconRef.current) link.href = originalFaviconRef.current;
  }, []);

  return { showBadge, clearBadge };
}
