import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// Test config lives in vitest.config.ts (without the electron-renderer plugin,
// which aliases Node built-ins and breaks tests that import node:* modules).
export default defineConfig({
  plugins: [
    react(),
    electron([
      { entry: 'electron/main.ts' },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
      },
    ]),
    renderer(),
  ],
})
