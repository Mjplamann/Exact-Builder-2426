import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url))

// BASE_PATH lets the same build serve from a GitHub Pages project path (/<repo>/) or a domain root.
//
// chartlab.html is a developer-only page for visually checking chart components. The dev server
// serves it at /chartlab.html; production builds leave it out unless CHARTLAB=1 is set, so it is never
// deployed by accident.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: {
        main: page('./index.html'),
        ...(process.env.CHARTLAB === '1' ? { chartlab: page('./chartlab.html') } : {}),
      },
    },
  },
})
