import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Microsoft YaHei"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        primary: {
          50: "#fdf8f0",
          100: "#f5eddc",
          200: "#e8d5b0",
          300: "#d4b87a",
          400: "#c4a050",
          500: "#b8860b",
          600: "#9a6f09",
          700: "#7a5707",
          800: "#5c4105",
          900: "#3d2b03",
        },
        dark: "#1a1815",
      },
    },
  },
  plugins: [],
};

export default config;
