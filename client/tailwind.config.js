/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Status / semantic
        ok: { bg: '#EAF3DE', text: '#3B6D11' },
        warn: { bg: '#FAEEDA', text: '#854F0B' },
        crit: { bg: '#FCEBEB', text: '#A32D2D' },
        info: { bg: '#E6F1FB', text: '#185FA5' },

        // Claude brand palette — coral/clay accent on warm cream
        claude: {
          50: '#FBF7F2',
          100: '#F5E9DD',
          200: '#EFD0BA',
          300: '#E5AE89',
          400: '#DC8E63',
          500: '#D97757', // primary
          600: '#C45A38',
          700: '#9F4429',
          800: '#7B3520',
          900: '#5A2818',
          DEFAULT: '#D97757',
        },
        cream: {
          50: '#FBFAF6',
          100: '#F5F4ED',
          200: '#EDE9DA',
          DEFAULT: '#F5F4ED',
        },

        // Warm dark text — replaces the cold slate-ink
        ink: '#1F1B16',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
