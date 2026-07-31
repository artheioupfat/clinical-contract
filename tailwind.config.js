/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./site/**/*.html', './site/**/*.js'],
  // Result classes are assembled in results.js and cannot be discovered statically.
  safelist: [
    'status-chip--passed',
    'status-chip--failed',
    'status-chip--error',
    'status-chip--warning',
    'status-dot--passed',
    'status-dot--failed',
    'status-dot--error',
    'status-dot--warning',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
