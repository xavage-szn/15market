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
