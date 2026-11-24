import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base: the app has no routes, so it works on GitHub Pages under any repo name.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
