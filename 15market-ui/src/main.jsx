import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AppParaProvider } from './providers/ParaProvider';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './wagmiConfig';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './paraClient';

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

const Root = () => {
  return (
    <React.StrictMode>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </QueryClientProvider>
      </WagmiProvider>
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
