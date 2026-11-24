import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the FastAPI backend runs on :8000; /api calls are proxied to it.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } } },
  build: { chunkSizeWarningLimit: 2000 },
});
