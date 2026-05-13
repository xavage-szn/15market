import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
    window.global = window;
}

import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import './index.css';
import { config } from './wagmiConfig';
import { arcTestnet } from './constants';

const queryClient = new QueryClient();

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="p-8 text-white">Critical Load Error</div>;
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
          supportedChains: [arcTestnet],
          embeddedWallets: {
            createOnLogin: 'all-users',
            requireUserPasswordOnCreate: false,
          },
          appearance: {
            theme: 'dark',
            accentColor: '#3CB371',
            logo: 'https://www.15market.online/gowlogo.png',
            walletList: ['metamask', 'rabby', 'okx_wallet', 'detected_ethereum_wallets', 'wallet_connect'],
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={config}>
            <App />
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
