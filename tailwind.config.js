/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./site/*.html', './site/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 20px 45px -30px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
};
