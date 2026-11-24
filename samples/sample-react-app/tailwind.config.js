/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#4f46e5', 50: '#eef2ff', 700: '#4338ca' },
        sunset: '#f59e0b',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
}
