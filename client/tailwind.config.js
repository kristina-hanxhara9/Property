/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ok: { bg: '#EAF3DE', text: '#3B6D11' },
        warn: { bg: '#FAEEDA', text: '#854F0B' },
        crit: { bg: '#FCEBEB', text: '#A32D2D' },
        info: { bg: '#E6F1FB', text: '#185FA5' },
        ink: '#0F172A',
        slate: {
          850: '#1c2436',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
