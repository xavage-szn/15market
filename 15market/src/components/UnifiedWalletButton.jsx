import React, { useEffect } from 'react';
import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { ARC_CHAIN_ID } from '../constants';
import { useTradingWallet } from '../hooks/useTradingWallet';
import { X } from 'lucide-react';


export function UnifiedWalletButton({ theme }) {
    const { address, isConnected } = useAccount();
    const connectedChainId = useChainId();
    const { disconnect } = useDisconnect();
    const { switchChain } = useSwitchChain();
    const { login, logout, authenticated, user } = usePrivy();
    const { isSmartWalletReady } = useTradingWallet();
    
    // Auto-switch to Arc Testnet if wallet is on any other network
    useEffect(() => {
        if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
            console.log(`🔄 [NETWORK] Wallet on chain ${connectedChainId}, auto-switching to Arc Testnet (${ARC_CHAIN_ID})...`);
            switchChain?.({ chainId: ARC_CHAIN_ID });
        }
    }, [isConnected, connectedChainId, switchChain]);

    const currentColor = '#249C6C';

    // Open Privy login flow
    const onConnect = () => {
        console.log("📂 [WALLET] login() called");
        try {
            login({
                onComplete: (user, isNewUser, wasAlreadyAuthenticated) => {
                    console.log("✅ [WALLET] Login Complete", { user, isNewUser, wasAlreadyAuthenticated });
                },
                onError: (error) => {
                    console.error("❌ [WALLET] Login Error:", error);
                }
            });
            
            // Check if modal doesn't appear after 2 seconds
            setTimeout(() => {
                const modalExists = !!document.querySelector('div[id^="privy"]');
                if (!modalExists) {
                    console.warn("⚠️ [WALLET] 2s passed and no Privy modal found in DOM. The login() call might have hung.");
                } else {
                    console.log("💎 [WALLET] Privy modal found in DOM");
                }
            }, 2000);

        } catch (err) {
            console.error("💥 [WALLET] login() crashed synchronously:", err);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            disconnect();
            console.log("🚪 [WALLET] Disconnected");
        } catch (err) {
            console.error("Disconnect failed:", err);
        }
    };

    // Use Privy's authenticated state or Wagmi's isConnected
    const isActuallyConnected = isConnected || authenticated;

    if (!isActuallyConnected) {
        return (
            <button
                onClick={onConnect}
                id="connect-wallet-btn"
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-[10px] lg:text-xs tracking-[0.2em] rounded-full transition-all active:scale-95 text-white relative overflow-hidden group shadow-xl"
                style={{
                    backgroundColor: '#249C6C',
                    boxShadow: `0 0 20px #249C6C50`,
                }}
            >
                <span className="relative z-10 flex items-center gap-2">
                    Connect Wallet
                </span>
            </button>
        );
    }

    return (
        <button
            onClick={handleLogout}
            title="Click to Disconnect"
            id="disconnect-wallet-btn"
            className="flex items-center gap-2 lg:gap-3 px-1 lg:px-2 py-1.5 lg:py-2 transition-all duration-300 group cursor-pointer"
        >
            {isSmartWalletReady && (
                <div className="w-2 h-2 bg-yellow-400 rounded-full border border-[#0D0D0D] shadow-sm shrink-0" title="Smart Wallet Active"></div>
            )}
            <span className={`hidden md:inline-block text-xs font-black font-mono ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {user?.wallet?.address ? `${user.wallet.address.slice(0, 4)}...${user.wallet.address.slice(-4)}` : (address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Connected')}
            </span>
            <div className={`flex items-center justify-center transition-all ml-1 ${
                theme === 'light'
                    ? 'text-black/40 group-hover:text-red-500'
                    : 'text-white/40 group-hover:text-red-500'
            }`}>
                <svg width="21" height="21" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1L11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
                    <path d="M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
                </svg>
            </div>
        </button>
    );
}

