import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { publicClient } from "../client";
import { formatEther } from "viem";

export function UnifiedWalletButton({ theme }) {
    const navigate = useNavigate();
    const { open } = useAppKit();
    const { address, isConnected, chainId: connectedChainId } = useAccount();
    const [isConnecting, setIsConnecting] = useState(false);
    const [chainId, setChainId] = useState(null);

    // Auto-switch to Arc network when connected to wrong network
    useEffect(() => {
        const getChain = async () => {
            try {
                const chain = await publicClient.getChainId();
                setChainId(chain);
            } catch (e) {
                console.warn("Failed to fetch chainId", e);
            }
        };
        getChain();
    }, []);

    // Navigate to trade page after connection
    useEffect(() => {
        if (isConnected && connectedChainId) {
            console.log("✅ [WALLET] Connected to network, navigating to trade page...");
            // Navigate to trade page after successful connection
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
