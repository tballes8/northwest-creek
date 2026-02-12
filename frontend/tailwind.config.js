/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdfc',
          100: '#ccfbf6',
          200: '#99f6eb',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',  // Main teal from logo
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        forest: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#2c5f54',  // Dark green from logo
          600: '#234d44',
          700: '#1a3a34',
          800: '#122824',
          900: '#0a1614',
        },
        cream: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#f5e6d3',  // Cream from logo
          500: '#eab308',
          600: '#ca8a04',
        },
      },
    },
  },

darkMode: 'class', // ← Make sure this line is here!
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdfc',
          100: '#ccfbf6',
          200: '#99f6eb',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        forest: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#2c5f54',
          600: '#234d44',
          700: '#1a3a34',
          800: '#122824',
          900: '#0a1614',
        },
        cream: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#f5e6d3',
          500: '#eab308',
          600: '#ca8a04',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}