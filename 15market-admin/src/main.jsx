import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

import { AppParaProvider } from './providers/ParaProvider.jsx';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './wagmiConfig';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './paraClient';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <AppParaProvider>
                    <App />
                </AppParaProvider>
            </QueryClientProvider>
        </WagmiProvider>
    </React.StrictMode>
);
