import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // The game, plus the weapon grip editor (grip.html).
    rollupOptions: { input: { main: 'index.html', grip: 'grip.html' } },
  },
});
