import React from 'react';
import { useModal, useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { Copy, LogOut, ChevronDown } from 'lucide-react';

export const UnifiedWalletButton = ({ currentNetwork, onNetworkChange, theme }) => {
    const { openModal } = useModal();
    const { isConnected: isParaConnected } = useParaAccount();
    const { data: paraWallet } = useWallet();
    const address = paraWallet?.address;
    const isConnected = isParaConnected && !!address;

    const currentColor = '#3B82F6'; // Arc Blue

    if (!isConnected) {
        return (
            <button
                onClick={() => openModal()}
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-xs lg:text-sm tracking-widest rounded-xl transition-all active:scale-95 text-white relative overflow-hidden group"
                style={{
                    backgroundColor: currentColor,
                    boxShadow: `0 0 20px ${currentColor}50`,
                }}
            >
                <span className="relative z-10 flex items-center gap-2">
                    Connect Wallet
                </span>
                <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300"
                    style={{
                        background: `linear-gradient(45deg, transparent, ${currentColor}, transparent)`,
                        backgroundSize: '200% 200%',
                        animation: 'gradient 3s ease infinite'
                    }}
                />
            </button>
        );
    }

    return (
        <button
            onClick={() => openModal()}
            className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-4 py-1.5 lg:py-2 rounded-xl border backdrop-blur-md transition-all duration-300 group`}
            style={{
                backgroundColor: theme === 'light' ? `${currentColor}08` : `${currentColor}15`,
                borderColor: theme === 'light' ? `${currentColor}20` : `${currentColor}30`,
            }}
        >
            <div className="relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg"
                    style={{ backgroundColor: currentColor }}
                >
                    {address?.slice(0, 1) || 'W'}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {address?.slice(0, 4)}...{address?.slice(-4)}
            </span>
        </button>
    );
};
