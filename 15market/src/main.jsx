import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
    window.global = window;
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
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) return <div className="p-6 text-white min-h-screen flex flex-col items-center justify-center text-sm font-bold"><p className="text-[#249C6C] text-lg mb-2">Load Error</p><pre className="max-w-full overflow-auto text-[10px] opacity-70">{this.state.error?.message || 'Unknown error'}</pre></div>;
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
          // Smart wallets — paymaster URL is configured on Privy dashboard (Pimlico)
          // This enables ERC-4337 smart accounts so users pay gas in USDC on source chains
          smartWallets: {
            enabled: true,
          },
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
