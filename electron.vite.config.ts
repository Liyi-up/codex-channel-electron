import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist',
      lib: {
        entry: path.resolve(__dirname, 'src/main.ts'),
        formats: ['cjs'],
        fileName: () => 'main.js'
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, 'src/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.js'
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    base: './',
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, 'dist/renderer'),
      emptyOutDir: false
    }
  }
});
