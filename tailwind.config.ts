import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dark': '#0f1419',
        'dark-card': '#1a1f2e',
        'accent': '#00d4ff',
        'accent-gold': '#ffd700',
      },
    },
  },
  plugins: [],
}
export default config
