/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,tsx,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-inv": "rgb(var(--color-primary-inv) / <alpha-value>)",
        terracotta: "#8E392B",
        mustard: "#D18D3D",
      },
      fontFamily: {
        sans: ['Inter', 'Gilroy', 'sans-serif'],
      },
      borderRadius: {
        'pill': '9999px',
      }
    },
  },
  plugins: [],
}
