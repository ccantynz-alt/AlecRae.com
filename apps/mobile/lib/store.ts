/**
 * AlecRae Mobile — Global State (Zustand)
 *
 * Manages auth state and user preferences. Token is persisted in
 * expo-secure-store (not AsyncStorage or localStorage) for security.
 */

import { create } from "zustand";
import type { AuthUser } from "./api";
import { authApi, clearToken, hasToken } from "./api";

// ─── Auth Store ───────────────────────────────────────────────────────────

interface AuthState {
  readonly user: AuthUser | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface AuthActions {
  readonly checkAuth: () => Promise<void>;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly register: (payload: {
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  checkAuth: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    const tokenExists = await hasToken();
    if (!tokenExists) {
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await clearToken();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email: string, password: string): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed";
      set({ error: message, isLoading: false });
    }
  },

  register: async (payload): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.register(payload);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      set({ error: message, isLoading: false });
    }
  },

  logout: async (): Promise<void> => {
    await authApi.logout();
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: (): void => {
    set({ error: null });
  },
}));

// ─── App Preferences Store ────────────────────────────────────────────────

interface AppPreferencesState {
  readonly theme: "light" | "dark" | "system";
  readonly density: "compact" | "comfortable" | "spacious";
  readonly accentColor: string;
  readonly notificationsEnabled: boolean;
}

interface AppPreferencesActions {
  readonly setTheme: (theme: "light" | "dark" | "system") => void;
  readonly setDensity: (
    density: "compact" | "comfortable" | "spacious",
  ) => void;
  readonly setAccentColor: (color: string) => void;
  readonly setNotificationsEnabled: (enabled: boolean) => void;
}

type AppPreferencesStore = AppPreferencesState & AppPreferencesActions;

export const useAppPreferences = create<AppPreferencesStore>((set) => ({
  theme: "system",
  density: "comfortable",
  accentColor: "#3b82f6",
  notificationsEnabled: true,

  setTheme: (theme): void => {
    set({ theme });
  },

  setDensity: (density): void => {
    set({ density });
  },

  setAccentColor: (accentColor): void => {
    set({ accentColor });
  },

  setNotificationsEnabled: (notificationsEnabled): void => {
    set({ notificationsEnabled });
  },
}));
