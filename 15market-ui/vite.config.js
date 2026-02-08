import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },
      manifest: {
        name: '15Market Systems',
        short_name: '15Market',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Mock unnecessary Cosmos dependency from Para SDK
      "graz": path.resolve(__dirname, "./src/utils/mock-module.js"),
      "@cosmjs/amino": path.resolve(__dirname, "./src/utils/mock-module.js"),
      "@cosmjs/stargate": path.resolve(__dirname, "./src/utils/mock-module.js"),
      "@cosmjs/proto-signing": path.resolve(__dirname, "./src/utils/mock-module.js"),
    },
  },
  optimizeDeps: {
    exclude: [
      '@getpara/evm-wallet-connectors',
      '@getpara/solana-wallet-connectors',
      '@getpara/cosmjs-v0-integration',
      'graz',
      '@cosmjs/amino',
      '@cosmjs/stargate',
      '@cosmjs/proto-signing'
    ]
  },
  build: {
    rollupOptions: {
      external: [
        '@getpara/evm-wallet-connectors',
        '@getpara/solana-wallet-connectors',
        '@getpara/cosmjs-v0-integration',
        'graz',
        '@cosmjs/amino',
        '@cosmjs/stargate',
        '@cosmjs/proto-signing'
      ]
    }
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: [
      "revenues-margin-authorities-booth.trycloudflare.com",
      ".trycloudflare.com"
    ],
    proxy: {
      '/api-mexc': {
        target: 'https://api.mexc.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-mexc/, '')
      }
    }
  }
});
