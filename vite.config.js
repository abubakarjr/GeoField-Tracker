// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // CRITICAL: Tells Vercel to look for assets in the current directory
  build: {
    outDir: 'dist',
  }
});