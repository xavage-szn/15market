import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { config } from './wagmiConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PRIVY_APP_ID, arcTestnet } from './constants';

const queryClient = new QueryClient();

// #region agent log
fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de7e69'},body:JSON.stringify({sessionId:'de7e69',runId:'initial',hypothesisId:'H6',location:'main.jsx:startup',message:'App startup probe log emitted',data:{href:window.location.href},timestamp:Date.now()})}).catch(()=>{});
// #endregion

// --- CONSOLE LOG CLEANER & SDK ERROR SUPPRESSOR ---
// Silence known non-critical third-party SDK errors to keep logs clean for platform operations.
(function silenceSDKNoise() {
  const originalError = console.error;
  const originalWarn = console.warn;
  const suppressedErrors = [
    "TypeError: Cannot read properties of undefined (reading 'includes')", // Para SDK Storage Listener bug
    "violates the document's Content Security Policy", // CSP noise
    "api.binance.com", // Binance monitoring
    "stream.binance.com", // WebSocket monitoring
    "Cannot redefine property: ethereum" // Wallet extension conflict noise
  ];

  console.error = (...args) => {
    const msg = args[0]?.toString() || "";
    if (suppressedErrors.some(sub => msg.includes(sub))) return;
    originalError.apply(console, args);
  };

  console.warn = (...args) => {
    const msg = args[0]?.toString() || "";
    if (suppressedErrors.some(sub => msg.includes(sub))) return;
    originalWarn.apply(console, args);
  };
})();

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#e2e8f0', backgroundColor: '#0D0D0D', height: '100vh', overflow: 'auto', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#3CB371', fontSize: '2rem', marginBottom: '1rem' }}>Something went wrong.</h2>
          <div style={{ padding: '20px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(60,179,113,0.3)' }}>
            <pre style={{ margin: 0, color: '#ff7f50' }}>{this.state.error && this.state.error.toString()}</pre>
          </div>
          <br />
          <h3 style={{ color: '#3CB371', marginTop: '20px' }}>Stack Trace:</h3>
          <pre style={{ fontSize: '0.8em', color: '#94a3b8', overflowX: 'auto' }}>
            {this.state.error && this.state.error.stack}
          </pre>
          <br />
          <h3 style={{ color: '#3CB371' }}>Component Stack:</h3>
          <pre style={{ fontSize: '0.8em', color: '#94a3b8', overflowX: 'auto' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#3CB371',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function Root() {
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            loginMethods: ['email', 'wallet', 'google', 'twitter', 'apple', 'discord'],
            appearance: {
              theme: 'dark',
              accentColor: '#3CB371',
              showWalletLoginFirst: true,
              logo: 'https://15market.online/logo.png',
            },
            defaultChain: arcTestnet,
            supportedChains: [arcTestnet],
            embeddedWallets: {
              createOnLogin: 'users-without-wallets',
            },
          }}
        >
          <WagmiProvider config={config}>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </WagmiProvider>
        </PrivyProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
