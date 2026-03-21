import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: "#0c0f14",
        canvas: "#f8f6f3",
        surface: "#ffffff",
        "surface-muted": "#f1f0ed",
        border: "#e4e2dd",
        muted: "#6b6862",
        accent: "#0d726e",
        "accent-muted": "#e6f2f1",
        "accent-hover": "#095c59",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      keyframes: {
        "reveal-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "reveal-up": "reveal-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
