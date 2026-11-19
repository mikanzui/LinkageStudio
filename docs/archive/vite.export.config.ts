import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Historical standalone export configuration, retained for provenance only.
 * This is not a current release entry point; use the root vite.config.ts.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
})
