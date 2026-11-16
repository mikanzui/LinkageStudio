import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

const base = process.env.VITE_BASE_PATH || '/LinkageStudio/'
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('VITE_BASE_PATH must be a root-relative directory with a trailing slash.')

export default defineConfig({
  base,
  build: { rollupOptions: { input: { main: 'index.html', redirect: 'redirect.html' } } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon-192.svg', 'icon-512.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Slinker',
        short_name: 'Slinker',
        description: 'Design and simulate 2D mechanical linkages',
        theme_color: '#2d2d2d',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: false,
        navigateFallbackDenylist: [/\/redirect\.html(?:\?|$)/],
        globIgnores: ['**/redirect.html'],
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'examples/*.{slinker,json}'],
        runtimeCaching: []
      }
    })
  ],
})
