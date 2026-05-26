import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    proxy: {
      '/api/cheapshark': {
        target: 'https://www.cheapshark.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cheapshark/, ''),
        headers: {
          'User-Agent': 'GameBacklogTracker/1.0 (+local-dev)',
        },
      },
      '/api/freetogame': {
        target: 'https://www.freetogame.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/freetogame/, ''),
      },
      '/api/steam': {
        target: 'https://store.steampowered.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/steam/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Game Backlog Tracker',
        short_name: 'GameBacklog',
        description:
          'Track completed, backlog, shelved, and currently played games in one place.',
        theme_color: '#0c111b',
        background_color: '#070c14',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})

