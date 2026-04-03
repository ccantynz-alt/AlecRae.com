export const colors = {
  brand: {
    50: "#eef2ff",
    100: "#e0e7ff",
    200: "#c7d2fe",
    300: "#a5b4fc",
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    800: "#3730a3",
    900: "#312e81",
    950: "#1e1b4b",
  },
  surface: {
    DEFAULT: "#ffffff",
    secondary: "#f8fafc",
    tertiary: "#f1f5f9",
    inverse: "#0f172a",
  },
  border: {
    DEFAULT: "#e2e8f0",
    strong: "#cbd5e1",
    focus: "#6366f1",
  },
  content: {
    DEFAULT: "#0f172a",
    secondary: "#475569",
    tertiary: "#94a3b8",
    inverse: "#ffffff",
    brand: "#4f46e5",
  },
  status: {
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  },
} as const;

export const spacing = {
  px: "1px",
  0: "0",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  2.5: "0.625rem",
  3: "0.75rem",
  3.5: "0.875rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  7: "1.75rem",
  8: "2rem",
  9: "2.25rem",
  10: "2.5rem",
  12: "3rem",
  14: "3.5rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
  32: "8rem",
} as const;

export const typography = {
  fontFamily: {
    sans: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, monospace",
  },
  fontSize: {
    "display-lg": "3.5rem",
    "display-md": "2.5rem",
    "display-sm": "2rem",
    "heading-lg": "1.5rem",
    "heading-md": "1.25rem",
    "heading-sm": "1.125rem",
    "body-lg": "1.125rem",
    "body-md": "1rem",
    "body-sm": "0.875rem",
    caption: "0.75rem",
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.1",
    snug: "1.3",
    normal: "1.5",
    relaxed: "1.6",
  },
} as const;

export const shadows = {
  card: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
  cardHover: "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
  elevated: "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
  none: "none",
} as const;

export const borders = {
  radius: {
    none: "0",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
    full: "9999px",
  },
  width: {
    none: "0",
    thin: "1px",
    medium: "2px",
    thick: "3px",
  },
} as const;

export const tokens = {
  colors,
  spacing,
  typography,
  shadows,
  borders,
} as const;

export type Tokens = typeof tokens;
