/**
 * Design tokens — the JS-readable mirror of the shipped palette.
 *
 * ⚠️ **`apps/web/tailwind.config.ts` is the source of truth.** Styling in this
 * repo is expressed as Tailwind class strings, so the config is what actually
 * renders; these constants exist for the rare case that needs a colour in JS
 * (canvas, chart libraries, inline SVG fills).
 *
 * **Keep the two in sync.** Until 2026-08-04 they were not, and the drift was
 * total: every value below was Tailwind's stock indigo/slate — `brand.600` read
 * `#4f46e5` (indigo) while the app renders `#1f3d2e` (racing green), and the
 * surfaces were cool slate against the app's warm ivory. Nothing imports these
 * constants except `provider.tsx`, and `ThemeProvider` is never mounted, so the
 * file had no runtime effect — it was pure documentation, and it documented a
 * product that does not exist. Anyone designing a new component against it
 * would have produced an indigo-on-slate panel in a green-on-ivory app.
 *
 * Values below now match `apps/web/tailwind.config.ts` exactly.
 */
export const colors = {
  /** AlecRae racing green — the considered, signature accent. */
  brand: {
    50: "#f3f6f4",
    100: "#e3ebe5",
    200: "#c6d6cb",
    300: "#9eb8a7",
    400: "#6f937d",
    500: "#4d735c",
    600: "#1f3d2e",
    700: "#1a3427",
    800: "#15281e",
    900: "#102018",
    950: "#0a1510",
  },
  /** Warm ivory surfaces matching the marketing identity. */
  surface: {
    DEFAULT: "#ffffff",
    raised: "#ffffff",
    subtle: "#faf9f6",
    secondary: "#f5f4ef",
    tertiary: "#efede5",
    hover: "#eceae1",
    active: "#e3dfd3",
    inverse: "#1c1a17",
  },
  border: {
    DEFAULT: "#e3dfd3",
    strong: "#d1ccbe",
    focus: "#4d735c",
  },
  content: {
    DEFAULT: "#1c1a17",
    secondary: "#57534a",
    /** The muted tier. Clears WCAG AA on white at 5.35:1 — see the config. */
    subtle: "#6f6a5e",
    tertiary: "#8a8475",
    inverse: "#f5f4ef",
    brand: "#1f3d2e",
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
