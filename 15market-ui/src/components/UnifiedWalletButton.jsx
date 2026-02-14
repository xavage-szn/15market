import React, { useState } from 'react';
import { useModal, useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount, useChainId, useConnect } from "wagmi";

export const UnifiedWalletButton = ({ theme }) => {
    const { openModal } = useModal();
    const { isConnected: isParaConnected, address: paraAddress } = useParaAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress, connector: wagmiConnector } = useWagmiAccount();
    const { connect, connectors } = useConnect();
    const chainId = useChainId();
    const isConnected = isParaConnected || isWagmiConnected;
    const address = paraAddress || wagmiAddress;
    const { data: paraWallet } = useWallet();
    const [isConnecting, setIsConnecting] = useState(false);

    const displayAddress = address || paraWallet?.address || wagmiAddress;
    const isWrongNetwork = isConnected && chainId !== 5042002;
    const currentColor = isWrongNetwork ? '#FF4444' : '#3CB371';

    // Determine if we should allow clicking to open Para modal
    const handleClick = async () => {
        if (isConnecting) return;

        console.log("🖱️ [WALLET BUTTON] Clicked", { isConnected, isParaConnected, isWagmiConnected, isConnecting });

        if (!isConnected) {
            setIsConnecting(true);
            try {
                console.log("📂 [WALLET] Opening Para Modal...");
                await openModal();
            } catch (err) {
                console.error("Connect failed:", err);
            } finally {
                // Keep the button locked for 2s to prevent mobile double-taps
                setTimeout(() => setIsConnecting(false), 2000);
            }
        } else {
            // If already connected, still allow opening modal for session management/switching
            console.log("📂 [WALLET] Opening Para Modal (Already connected)...");
            openModal();
        }
    };

    if (!isConnected) {
        return (
            <button
                onClick={handleClick}
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-xs lg:text-sm tracking-widest rounded-xl transition-all active:scale-95 text-white relative overflow-hidden group"
                style={{
                    backgroundColor: '#3CB371',
                    boxShadow: `0 0 20px #3CB37150`,
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
            onClick={handleClick}
            className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-4 py-1.5 lg:py-2 rounded-xl border backdrop-blur-md transition-all duration-300 group`}
            style={{
                backgroundColor: theme === 'light' ? `${currentColor}08` : `${currentColor}15`,
                borderColor: theme === 'light' ? `${currentColor}20` : `${currentColor}30`,
                cursor: (isParaConnected || !isConnected) ? 'pointer' : 'default'
            }}
        >
            <div className="relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg relative"
                    style={{ backgroundColor: currentColor }}
                >
                    {isWrongNetwork ? '!' : (displayAddress?.slice(0, 1) || (wagmiConnector?.name?.slice(0, 1)) || 'W')}
                    {isWrongNetwork && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
                    )}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'} ${isWrongNetwork ? 'text-[#FF4444]' : ''}`}>
                {isWrongNetwork ? 'SWITCH NETWORK' : `${displayAddress?.slice(0, 4)}...${displayAddress?.slice(-4)}`}
            </span>
        </button>
    );
};
