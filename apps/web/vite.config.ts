import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Licitatio Bid Desk',
        short_name: 'Licitatio',
        description: 'Bid readiness workspace for construction firms',
        theme_color: '#ffd60a',
        background_color: '#faf8f2',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      // Installable shell only: no offline data, so API calls are never cached.
      workbox: { navigateFallbackDenylist: [/^\/api\//], runtimeCaching: [] },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // stable vendor chunks cache across releases; pages load on demand
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          forms: ['react-hook-form', 'zod'],
        },
      },
    },
  },
  // host: true listens on the local network; /api is proxied so other PCs need only this address
  server: { port: 5173, strictPort: true, host: true, proxy: { '/api': 'http://localhost:8080' } },
  preview: { host: true, proxy: { '/api': 'http://localhost:8080' } },
});
