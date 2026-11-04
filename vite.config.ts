import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages などのサブパスでも動くよう相対パスで出力する
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
  },
  test: { include: ['tests/**/*.test.ts'] },
} as import('vite').UserConfig);
