import type { Config } from "tailwindcss";

const config: Config = {
  // Class strategy, not the `media` default.
  //
  // 24 stray `dark:` utilities exist in components (EmailScriptManager,
  // VoiceCloneManager, VoiceReplyComposer and others). Under Tailwind's default
  // `media` strategy those fire on the visitor's OS preference, so a handful of
  // elements flipped to dark while the light-only page around them did not —
  // partial dark rendering nobody asked for and nobody could switch off.
  //
  // AlecRae is a light, warm-ivory product. Under `class` those utilities are
  // inert unless a `.dark` ancestor exists, which nothing sets. If a real dark
  // theme ships later this is also the strategy it needs, so this is the
  // forward-compatible setting rather than a workaround.
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // AlecRae racing green — the considered, signature accent.
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
        // Warm ivory surfaces matching the marketing identity (#f5f4ef).
        //
        // `raised` through `inverted` were being USED before they were
        // DEFINED. `bg-surface-raised` appears 154 times and `text-content-subtle`
        // 364 times, and neither existed here — Tailwind emits no rule for an
        // undefined name, so ~573 class usages compiled to nothing and failed
        // silently. The visible result was the whole reason the app looked
        // broken: every card marked `bg-surface-raised` rendered TRANSPARENT
        // and dissolved into the ivory page behind it, and every element marked
        // `text-content-subtle` inherited the near-black default, so there was
        // no muted tier and no visual hierarchy anywhere.
        surface: {
          DEFAULT: "#ffffff",
          /** Cards and panels lifted off the ivory page. White is the lift. */
          raised: "#ffffff",
          /** A hair off white — for nested blocks inside a raised card. */
          subtle: "#faf9f6",
          secondary: "#f5f4ef",
          tertiary: "#efede5",
          /** Row/list hover. Distinct from tertiary so hover reads as a change. */
          hover: "#eceae1",
          /** Pressed / currently-selected row. */
          active: "#e3dfd3",
          inverse: "#1c1a17",
          // Synonyms used by packages/ui, which grew a third vocabulary of its
          // own. Aliased rather than renamed so the library keeps rendering;
          // the names are consolidated in the component migration, not here.
          primary: "#ffffff",
          inverted: "#1c1a17",
        },
        border: {
          DEFAULT: "#e3dfd3",
          strong: "#d1ccbe",
          focus: "#4d735c",
        },
        content: {
          DEFAULT: "#1c1a17",
          secondary: "#57534a",
          /**
           * The muted tier, and the most-used colour in the app (364 uses).
           * #6f6a5e is deliberately darker than `tertiary`: it lands on real
           * body and caption text, so it has to clear WCAG AA — it measures
           * 5.35:1 on white, where `tertiary` (#8a8475) is only ~3.4:1 and
           * would have failed for anything but large text.
           */
          subtle: "#6f6a5e",
          muted: "#6f6a5e",
          /** Labels, timestamps, disabled — decorative, large, or non-essential. */
          tertiary: "#8a8475",
          inverse: "#f5f4ef",
          brand: "#1f3d2e",
          // Synonyms used by packages/ui — see the note on `surface` above.
          primary: "#1c1a17",
          inverted: "#f5f4ef",
        },
        status: {
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-display)", "Georgia", "serif"],
        script: ["var(--font-italianno)", "cursive"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-md": ["2.5rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "display-sm": ["2rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "heading-lg": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        "heading-md": ["1.25rem", { lineHeight: "1.4" }],
        "heading-sm": ["1.125rem", { lineHeight: "1.4" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body-md": ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.5" }],
      },
      spacing: {
        "4.5": "1.125rem",
        "18": "4.5rem",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-hover": "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
        "elevated": "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "slide": "indeterminateSlide 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        /** Indeterminate progress bar: a 40%-wide bar sweeps left-to-right. */
        indeterminateSlide: {
          "0%": { marginLeft: "-40%", width: "40%" },
          "50%": { marginLeft: "60%", width: "40%" },
          "100%": { marginLeft: "110%", width: "40%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
