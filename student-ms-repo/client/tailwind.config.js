/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 用 ink 系深灰，符合用户偏好「浅底深字」
        ink: { DEFAULT: '#1c2530', soft: '#5b6672' },
        brand: {
          DEFAULT: '#1f5f8b',
          soft: '#e8f0f7',
          dark: '#15466a',
        },
        warn: { DEFAULT: '#8a5a00', soft: '#fff5df' },
        good: { DEFAULT: '#1f7a4d', soft: '#e6f5ed' },
        bad: { DEFAULT: '#a12424', soft: '#fbe7e7' },
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
