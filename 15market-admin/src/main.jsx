import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './wagmiConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

try {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <WagmiProvider config={wagmiConfig}>
                <QueryClientProvider client={queryClient}>
                    <App />
                </QueryClientProvider>
            </WagmiProvider>
        </React.StrictMode>
    );
} catch (error) {
    console.error('FATAL RENDER ERROR:', error);
    document.getElementById('root').innerHTML = `
        <div style="padding: 40px; background: #1a1a1a; color: #fff; font-family: monospace;">
            <h2 style="color: #ff4444;">Fatal Initialization Error</h2>
            <pre style="background: #000; padding: 20px; border-radius: 8px; overflow: auto; color: #ff6b6b;">
${error.stack || error.message}
            </pre>
            <p style="color: #888; margin-top: 20px;">Check browser console for full details.</p>
        </div>
    `;
}
