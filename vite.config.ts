import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    target: 'es2022', // Target ES2022 for Cloudflare Workers
    lib: {
      entry: 'worker/index.ts', // Entry point for the worker
      formats: ['es'], // ES Module format
      fileName: 'worker', // Output file name
    },
  },
})