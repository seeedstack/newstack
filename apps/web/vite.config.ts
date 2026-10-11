import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
// vitest/config's defineConfig extends Vite's UserConfig type with `test`, so `tsc -b`
// (run by `npm run build`) type-checks this file cleanly — plain vite's defineConfig doesn't
// know about `test` and fails the build with "Object literal may only specify known
// properties, and 'test' does not exist in type 'UserConfigExport'".
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
