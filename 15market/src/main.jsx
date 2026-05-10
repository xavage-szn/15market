import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { config } from './wagmiConfig';
import { WagmiProvider } from 'wagmi';
import { useTurnkey } from "@turnkey/react-wallet-kit";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { arcTestnet, projectId } from './constants';

import { TurnkeyProvider } from "@turnkey/react-wallet-kit";


const queryClient = new QueryClient();

// Helper to get the correct RP_ID for Turnkey based on the current domain
export const getRpId = () => {
  if (typeof window === 'undefined') return import.meta.env.VITE_TURNKEY_RP_ID;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
  
  const envRpId = import.meta.env.VITE_TURNKEY_RP_ID;
  // If the current host ends with the configured RP_ID (e.g. www.15market.online ends with 15market.online), 
  // we use the configured RP_ID to match the Turnkey registration.
  if (envRpId && host.endsWith(envRpId)) return envRpId;
  
  // Otherwise fallback to the actual hostname to avoid WebAuthn SecurityErrors
  return host;
};

const turnkeyConfig = {
  organizationId: import.meta.env.VITE_TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: import.meta.env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID,
  apiBaseUrl: import.meta.env.VITE_TURNKEY_API_BASE_URL,
  defaultNetwork: "ethereum", // Turnkey currently uses ethereum/solana types
  passkeyConfig: {
    rpId: getRpId(),
  },
  ui: {
    authModal: {
      methods: {
        googleOauthEnabled: true,
        appleOauthEnabled: false,
        passkeyAuthEnabled: true,
        emailOtpAuthEnabled: true,
        walletAuthEnabled: true,
      },
      methodOrder: ["socials", "passkey", "email", "wallet"],
    },
    logoDark: "/logo.png",
    logoLight: "/logo.png",
    darkMode: true,
    renderModalInProvider: true,
    preferLargeActionButtons: true,
    colors: {
      dark: {
        primary: "#3CB371",
        primaryText: "#ffffff",
        modalBackground: "#111111",
      }
    }
  }
};

// Helper for the custom Wagmi connector to access Turnkey state
function TurnkeyStateBridge({ children }) {
  const { wallets } = useTurnkey();
  
  // Sync wallets to window synchronously during render to avoid race conditions with Wagmi connect()
  if (typeof window !== 'undefined') {
    window.getTurnkeyWallets = () => wallets;
  }

  useEffect(() => {
    // Also keep the effect for any reactive listeners
    window.getTurnkeyWallets = () => wallets;
  }, [wallets]);

  return children;
}


// #region agent log
fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de7e69'},body:JSON.stringify({sessionId:'de7e69',runId:'initial',hypothesisId:'H6',location:'main.jsx:startup',message:'App startup probe log emitted',data:{href:window.location.href},timestamp:Date.now()})}).catch(()=>{});
// #endregion


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
      <TurnkeyProvider config={turnkeyConfig} onError={(err) => console.error('🔴 [Turnkey] Initialization Error:', err)}>

        <TurnkeyStateBridge>
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </QueryClientProvider>
          </WagmiProvider>
        </TurnkeyStateBridge>
      </TurnkeyProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
