/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        textMain: 'rgb(var(--color-text-main) / <alpha-value>)',
        textSub: 'rgb(var(--color-text-sub) / <alpha-value>)',
        codexBlue: '#3c82f6',
        codexOrange: '#ff9e4a',
        codexDanger: '#ff5d5d',
        codexSuccess: '#38d59f'
      },
      boxShadow: {
        panel: '0 30px 80px rgba(0, 0, 0, 0.45)'
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', 'sans-serif']
      }
    }
  },
  plugins: []
};
