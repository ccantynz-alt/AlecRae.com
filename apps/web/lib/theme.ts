/**
 * AlecRae Theme System — Dark Mode + Custom Themes
 *
 * Features:
 *   - Light / Dark / System (auto-detect) modes
 *   - Custom accent colors
 *   - Density settings (compact / comfortable / spacious)
 *   - Persisted in IndexedDB via settingsCache
 *   - CSS custom properties for instant theme switching
 */

export type ThemeMode = "light" | "dark" | "system";
export type Density = "compact" | "comfortable" | "spacious";
export type AccentColor = "blue" | "purple" | "green" | "orange" | "red" | "pink" | "teal";

export interface ThemeConfig {
  mode: ThemeMode;
  density: Density;
  accentColor: AccentColor;
  fontSize: "small" | "medium" | "large";
  sidebarCollapsed: boolean;
  previewPanePosition: "right" | "bottom" | "hidden";
}

export const DEFAULT_THEME: ThemeConfig = {
  mode: "system",
  density: "comfortable",
  accentColor: "blue",
  fontSize: "medium",
  sidebarCollapsed: false,
  previewPanePosition: "right",
};

// ─── CSS Custom Properties ───────────────────────────────────────────────────

const LIGHT_TOKENS: Record<string, string> = {
  "--bg-primary": "#ffffff",
  "--bg-secondary": "#f8f9fa",
  "--bg-tertiary": "#f0f1f3",
  "--bg-hover": "#f0f1f3",
  "--bg-selected": "#e8f0fe",
  "--bg-surface": "#ffffff",
  "--text-primary": "#1a1a1a",
  "--text-secondary": "#5f6368",
  "--text-tertiary": "#9aa0a6",
  "--text-inverse": "#ffffff",
  "--border-primary": "#e0e0e0",
  "--border-secondary": "#f0f0f0",
  "--shadow-sm": "0 1px 2px rgba(0,0,0,0.05)",
  "--shadow-md": "0 4px 6px rgba(0,0,0,0.07)",
  "--shadow-lg": "0 10px 15px rgba(0,0,0,0.1)",
};

const DARK_TOKENS: Record<string, string> = {
  "--bg-primary": "#1a1a2e",
  "--bg-secondary": "#16213e",
  "--bg-tertiary": "#0f3460",
  "--bg-hover": "#1e2a4a",
  "--bg-selected": "#1e3a5f",
  "--bg-surface": "#1e1e32",
  "--text-primary": "#e4e4e7",
  "--text-secondary": "#a1a1aa",
  "--text-tertiary": "#71717a",
  "--text-inverse": "#1a1a1a",
  "--border-primary": "#2e2e42",
  "--border-secondary": "#252538",
  "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
  "--shadow-md": "0 4px 6px rgba(0,0,0,0.4)",
  "--shadow-lg": "0 10px 15px rgba(0,0,0,0.5)",
};

const ACCENT_COLORS: Record<AccentColor, { primary: string; light: string; dark: string }> = {
  blue: { primary: "#3b82f6", light: "#dbeafe", dark: "#1e40af" },
  purple: { primary: "#8b5cf6", light: "#ede9fe", dark: "#5b21b6" },
  green: { primary: "#10b981", light: "#d1fae5", dark: "#065f46" },
  orange: { primary: "#f59e0b", light: "#fef3c7", dark: "#92400e" },
  red: { primary: "#ef4444", light: "#fee2e2", dark: "#991b1b" },
  pink: { primary: "#ec4899", light: "#fce7f3", dark: "#9d174d" },
  teal: { primary: "#14b8a6", light: "#ccfbf1", dark: "#134e4a" },
};

const DENSITY_TOKENS: Record<Density, Record<string, string>> = {
  compact: {
    "--spacing-xs": "2px",
    "--spacing-sm": "4px",
    "--spacing-md": "8px",
    "--spacing-lg": "12px",
    "--spacing-xl": "16px",
    "--email-row-height": "36px",
    "--sidebar-width": "220px",
    "--font-size-base": "13px",
  },
  comfortable: {
    "--spacing-xs": "4px",
    "--spacing-sm": "8px",
    "--spacing-md": "12px",
    "--spacing-lg": "16px",
    "--spacing-xl": "24px",
    "--email-row-height": "48px",
    "--sidebar-width": "260px",
    "--font-size-base": "14px",
  },
  spacious: {
    "--spacing-xs": "6px",
    "--spacing-sm": "12px",
    "--spacing-md": "16px",
    "--spacing-lg": "24px",
    "--spacing-xl": "32px",
    "--email-row-height": "60px",
    "--sidebar-width": "300px",
    "--font-size-base": "15px",
  },
};

const FONT_SIZE_TOKENS: Record<ThemeConfig["fontSize"], Record<string, string>> = {
  small: { "--font-size-base": "13px", "--font-size-sm": "11px", "--font-size-lg": "15px" },
  medium: { "--font-size-base": "14px", "--font-size-sm": "12px", "--font-size-lg": "16px" },
  large: { "--font-size-base": "16px", "--font-size-sm": "14px", "--font-size-lg": "18px" },
};

// ─── Theme Application ───────────────────────────────────────────────────────

function getEffectiveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(config: ThemeConfig): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const effectiveMode = getEffectiveMode(config.mode);

  // Apply color mode tokens
  const modeTokens = effectiveMode === "dark" ? DARK_TOKENS : LIGHT_TOKENS;
  for (const [prop, value] of Object.entries(modeTokens)) {
    root.style.setProperty(prop, value);
  }

  // Apply accent color
  const accent = ACCENT_COLORS[config.accentColor];
  root.style.setProperty("--accent-primary", accent.primary);
  root.style.setProperty("--accent-light", accent.light);
  root.style.setProperty("--accent-dark", accent.dark);

  // Apply density
  const densityTokens = DENSITY_TOKENS[config.density];
  for (const [prop, value] of Object.entries(densityTokens)) {
    root.style.setProperty(prop, value);
  }

  // Apply font size
  const fontTokens = FONT_SIZE_TOKENS[config.fontSize];
  for (const [prop, value] of Object.entries(fontTokens)) {
    root.style.setProperty(prop, value);
  }

  // Set data attribute for CSS selectors
  root.dataset.theme = effectiveMode;
  root.dataset.density = config.density;
  root.classList.toggle("dark", effectiveMode === "dark");
}

/**
 * Listen for system theme changes and re-apply if mode is "system".
 */
export function watchSystemTheme(config: ThemeConfig, onChange: () => void): () => void {
  if (typeof window === "undefined") return () => { /* no-op on server */ };

  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (config.mode === "system") {
      applyTheme(config);
      onChange();
    }
  };

  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
