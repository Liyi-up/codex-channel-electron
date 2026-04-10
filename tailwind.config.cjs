/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        panel: '#111318',
        border: '#2a2f3a',
        textMain: '#f2f6ff',
        textSub: '#9aa5be',
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
