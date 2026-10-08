import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API calls in development, so the session cookie just works.
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } }
  },
  build: { outDir: 'dist', sourcemap: false }
});
