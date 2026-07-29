import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Los catálogos se cargan con top-level await en src/realDiskData.js y
    // src/pjudCausesData.js, que exige salida ESM moderna.
    target: 'esnext',
  },
})
