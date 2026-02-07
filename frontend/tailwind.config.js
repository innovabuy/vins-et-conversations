/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        wine: {
          50: '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d9',
          300: '#f4a9ba',
          400: '#ec7896',
          500: '#e04d74',
          600: '#cc2d5a',
          700: '#ab2049',
          800: '#8f1d40',
          900: '#7a1c3b',
          950: '#44091c',
        },
        gold: {
          400: '#C4A35A',
          500: '#B8963E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
