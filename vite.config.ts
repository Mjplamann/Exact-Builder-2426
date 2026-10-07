import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// BASE_PATH lets the same build serve from a GitHub Pages project path (/<repo>/) or a domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      // index.html is the app; chartlab.html is a developer-only page for visually checking chart components.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        chartlab: fileURLToPath(new URL('./chartlab.html', import.meta.url)),
      },
    },
  },
})
