/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/components/ui/**/*.{js,jsx,ts,tsx}",
    "./src/features/fenceCalculator/**/*.{js,jsx,ts,tsx}",
  ],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        background: "var(--paper-bright)",
        foreground: "var(--ink)",
        muted: "var(--paper-cream)",
        border: "var(--ink-faint)",
        primary: "var(--cobalt)",
        destructive: "var(--c-danger)",
      },
      borderRadius: {
        lg: "var(--radius-panel)",
        md: "var(--radius-control)",
        sm: "var(--radius-soft)",
      },
      fontFamily: {
        sans: ["var(--f-body)"],
        mono: ["var(--f-mono)"],
      },
    },
  },
  plugins: [],
};
