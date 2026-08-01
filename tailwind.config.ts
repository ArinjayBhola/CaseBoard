import type { Config } from "tailwindcss";

/**
 * CaseBoard palette — light mode only, flat solid colors, no gradients.
 * Neutral greys (slate family) with a blue primary and amber/red accents.
 * The token names are kept (cream / stone / terracotta / clay) so every
 * component keeps working; only the values changed from the old warm scheme.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds and surfaces — white to light slate
        cream: {
          50: "#FFFFFF",
          100: "#F8FAFC",
          200: "#F1F5F9",
          300: "#E2E8F0",
        },
        // Text and borders — neutral slate
        stone: {
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
        },
        // Primary accent — blue
        terracotta: {
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
        },
        // Secondary / warning accent — amber
        amber: {
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
        },
        // Destructive — red
        clay: {
          500: "#EF4444",
          600: "#DC2626",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 2px 8px rgba(15, 23, 42, 0.06)",
        panel: "0 4px 24px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
