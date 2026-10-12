import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sms/shared': path.resolve(__dirname, '../shared/types.ts'),
    },
  },
  server: {
    host: '127.0.0.1', // 绑定 IPv4，避免 Windows 上 localhost 优先解析到 IPv6 ::1 时浏览器无法访问
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
