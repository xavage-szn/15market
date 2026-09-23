import { Buffer } from 'buffer';

// Install browser globals before loading wallet and blockchain SDKs. Some of
// these packages inspect the globals during module initialization; assigning
// them only after React has mounted can surface Safari's "Cannot access
// uninitialized variable" error instead of a useful application error.
if (typeof globalThis !== 'undefined') {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  if (typeof window !== 'undefined' && !window.global) window.global = window;
}

import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import './index.css';
import { config } from './wagmiConfig';
import { arcTestnet, monadTestnet, avalancheFuji, sepolia } from './constants';

const queryClient = new QueryClient();

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-white min-h-screen flex flex-col items-center justify-center text-sm font-bold">
          <p className="text-[#249C6C] text-lg mb-2">Load Error</p>
          <p className="text-white/60 text-center max-w-md">{this.state.error?.message || 'Unable to load the application.'}</p>
          <button className="mt-6 rounded-lg bg-[#249C6C] px-4 py-2" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  return (
    <ErrorBoundary>
      <PrivyProvider
        appId={import.meta.env.VITE_PRIVY_APP_ID}
        config={{
          defaultChain: arcTestnet,
          supportedChains: [arcTestnet, monadTestnet, avalancheFuji, sepolia],
          embeddedWallets: {
            createOnLogin: 'all-users',
            requireUserPasswordOnCreate: false,
          },
          smartWallets: { enabled: true },
          appearance: {
            theme: 'dark',
            accentColor: '#249C6C',
            logo: 'https://www.15market.online/gowlogo.png',
            walletList: ['metamask', 'rabby', 'okx_wallet', 'detected_ethereum_wallets', 'wallet_connect'],
          },
        }}
      >
        <SmartWalletsProvider>
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={config}>
              <App />
            </WagmiProvider>
          </QueryClientProvider>
        </SmartWalletsProvider>
      </PrivyProvider>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
