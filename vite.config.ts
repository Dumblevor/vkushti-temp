import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    // Keep the browser's Host header so the API's same-origin check passes.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
    fs: { allow: ['../..'] },
  },
});
