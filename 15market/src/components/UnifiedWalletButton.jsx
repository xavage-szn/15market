import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useSwitchChain } from 'wagmi';
import { publicClient } from "../client";
import { formatEther } from "viem";
import { ARC_CHAIN_ID } from "../constants";

export function UnifiedWalletButton({ theme }) {
    const navigate = useNavigate();
    const { open } = useAppKit();
    const { address, isConnected, chainId: connectedChainId } = useAccount();
    const { switchChain } = useSwitchChain();
    const [isConnecting, setIsConnecting] = useState(false);

    // Auto-switch to Arc Testnet if wallet is on any other network
    useEffect(() => {
        if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
            console.log(`🔄 [NETWORK] Wallet on chain ${connectedChainId}, auto-switching to Arc Testnet (${ARC_CHAIN_ID})...`);
            switchChain?.({ chainId: ARC_CHAIN_ID });
        }
    }, [isConnected, connectedChainId, switchChain]);

    // Navigate to trade page after connection on correct chain
    useEffect(() => {
        if (isConnected && connectedChainId === ARC_CHAIN_ID) {
            console.log("✅ [WALLET] Connected to Arc Testnet, navigating to trade page...");
            setTimeout(() => navigate('/'), 500);
        }
    }, [isConnected, connectedChainId, navigate]);

    const displayAddress = address;
    const currentColor = '#3CB371';

    // Open Reown modal
    const handleClick = async () => {
        if (isConnecting) return;

        console.log("🖱️ [WALLET BUTTON] Clicked (Reown)", { isConnected, isConnecting, address });

        setIsConnecting(true);
        try {
            console.log("📂 [WALLET] Opening Reown Modal...");
            await open();
        } catch (err) {
            console.error("Connect failed:", err);
        } finally {
            // Keep the button locked for 2s to prevent mobile double-taps
            setTimeout(() => setIsConnecting(false), 2000);
        }
    };

    if (!isConnected) {
        return (
            <button
                onClick={handleClick}
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-[10px] lg:text-xs tracking-[0.2em] rounded-full transition-all active:scale-95 text-white relative overflow-hidden group shadow-xl"
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
                    {(displayAddress?.slice(0, 1) || 'P')}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {`${displayAddress?.slice(0, 4)}...${displayAddress?.slice(-4)}`}
            </span>
        </button>
    );
};
