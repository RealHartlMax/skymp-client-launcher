import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Prevents Vite from obscuring Rust errors in Tauri dev mode
process.env.VITE_CJS_IGNORE_WARNING = 'true';

export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port in dev mode
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome105', 'safari14'],
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
