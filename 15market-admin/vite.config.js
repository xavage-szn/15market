import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
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
    ],
    resolve: {
        dedupe: ['react', 'react-dom', '@tanstack/react-query'],
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    optimizeDeps: {
        exclude: []
    },
    build: {
        rollupOptions: {
            external: []
        }
    },
    server: {
        port: 3001,
        host: true,
        proxy: {
            '/api-mexc': {
                target: 'https://api.mexc.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api-mexc/, '')
            }
        }
    }
});
