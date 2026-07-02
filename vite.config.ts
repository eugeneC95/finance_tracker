import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        pwa: resolve(__dirname, 'index.html'),
        chrome: resolve(__dirname, 'finance-tracker-chrome/app.html'),
      },
    },
  },
});
