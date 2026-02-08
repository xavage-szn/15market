import React, { Suspense } from 'react';
import SimpleAdmin from './components/SimpleAdmin';

const AdminPortal = React.lazy(() => import('./components/AdminPortal'));

export default function App() {
    const [price, setPrice] = React.useState(0);

    React.useEffect(() => {
        const fetchPrice = async () => {
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
                const data = await res.json();
                setPrice(parseFloat(data.price));
            } catch (e) {
                console.error("Price fetch failed", e);
            }
        };
        fetchPrice();
        const interval = setInterval(fetchPrice, 5000);
        return () => clearInterval(interval);
    }, []);

    // Simple Error Boundary for Lazy Load
    class ErrorBoundary extends React.Component {
        constructor(props) {
            super(props);
            this.state = { hasError: false, error: null };
        }
        static getDerivedStateFromError(error) {
            return { hasError: true, error };
        }
        render() {
            if (this.state.hasError) {
                return (
                    <div>
                        <SimpleAdmin />
                        <div style={{ padding: '20px', color: 'red', background: '#330000', borderTop: '1px solid #ff4444' }}>
                            <h3 style={{ margin: 0 }}>CRITICAL ERROR:</h3>
                            <pre style={{ overflow: 'auto', marginTop: '10px' }}>{this.state.error.toString()}</pre>
                        </div>
                    </div>
                );
            }
            return this.props.children;
        }
    }

    const handleBack = React.useCallback(() => console.log("Back"), []);

    // Memoize the lazy component to prevent re-creation
    const MemoizedAdminPortal = React.useMemo(() => React.memo(AdminPortal), []);

    return (
        <ErrorBoundary>
            <Suspense fallback={
                <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#fff' }}>
                    <div className="animate-pulse flex flex-col items-center">
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Initializing Admin Portal...</h2>
                        <p style={{ color: '#71717a' }}>Connecting to RPC & Syncing State</p>
                    </div>
                </div>
            }>
                <MemoizedAdminPortal
                    onBack={handleBack}
                    price={price}
                />
            </Suspense>
        </ErrorBoundary>
    );
}
