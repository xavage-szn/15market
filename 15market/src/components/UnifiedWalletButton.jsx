import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { useTurnkey } from '@turnkey/react-wallet-kit';
import { ARC_CHAIN_ID } from '../constants';

export function UnifiedWalletButton({ theme }) {
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const connectedChainId = useChainId();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();
    const { switchChain } = useSwitchChain();
    const { handleLogin } = useTurnkey();
    
    const [isConnecting, setIsConnecting] = useState(false);

    // Auto-switch to Arc Testnet if wallet is on any other network
    useEffect(() => {
        if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
            console.log(`🔄 [NETWORK] Wallet on chain ${connectedChainId}, auto-switching to Arc Testnet (${ARC_CHAIN_ID})...`);
            switchChain?.({ chainId: ARC_CHAIN_ID });
        }
    }, [isConnected, connectedChainId, switchChain]);

    const currentColor = '#3CB371';

    // Open Turnkey onboarding flow
    const onConnect = async () => {
        if (isConnecting) return;
        setIsConnecting(true);
        try {
            console.log("📂 [WALLET] Opening Turnkey Onboarding...");
            await handleLogin();
            
            // After Turnkey login, we need to connect the Wagmi connector
            const turnkeyConnector = connectors.find(c => c.id === 'turnkey');
            if (turnkeyConnector) {
                connect({ connector: turnkeyConnector });
            }
        } catch (err) {
            console.error("Connect failed:", err);
        } finally {
            setTimeout(() => setIsConnecting(false), 1000);
        }
    };

    const handleLogout = async () => {
        try {
            disconnect();
            console.log("🚪 [WALLET] Disconnected");
        } catch (err) {
            console.error("Disconnect failed:", err);
        }
    };

    if (!isConnected) {
        return (
            <button
                onClick={onConnect}
                disabled={isConnecting}
                id="connect-wallet-btn"
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-[10px] lg:text-xs tracking-[0.2em] rounded-full transition-all active:scale-95 text-white relative overflow-hidden group shadow-xl"
                style={{
                    backgroundColor: '#3CB371',
                    boxShadow: `0 0 20px #3CB37150`,
                    opacity: isConnecting ? 0.7 : 1,
                }}
            >
                <span className="relative z-10 flex items-center gap-2">
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </span>
            </button>
        );
    }

    return (
        <button
            onClick={handleLogout}
            title="Click to Disconnect"
            id="disconnect-wallet-btn"
            className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-4 py-1.5 lg:py-2 rounded-full border backdrop-blur-md transition-all duration-300 group`}
            style={{
                backgroundColor: theme === 'light' ? `${currentColor}08` : `${currentColor}15`,
                borderColor: theme === 'light' ? `${currentColor}20` : `${currentColor}30`,
                cursor: 'pointer'
            }}
        >
            <div className="relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg relative"
                    style={{ backgroundColor: currentColor }}
                >
                    {(address?.slice(0, 1) || 'W')}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {`${address?.slice(0, 4)}...${address?.slice(-4)}`}
            </span>
        </button>
    );
}
