import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, LogOut, Copy, RefreshCcw, AlertTriangle } from 'lucide-react';
import { useAppKit, useAppKitAccount, useDisconnect, useAppKitState } from '@reown/appkit/react';
import { useAccount, useSwitchChain } from 'wagmi';
import { fullWalletReset, clearWalletStorage, disconnectSolanaWallets } from '../utils/walletCleanup';

export const UnifiedWalletButton = ({ currentNetwork, onNetworkChange, theme }) => {
    const { address, isConnected } = useAppKitAccount();
    const { open } = useAppKit();
    const { disconnect } = useDisconnect();
    const { open: isModalOpen } = useAppKitState();

    // Wagmi hooks for EVM network management
    const { chainId } = useAccount();
    const { switchChain } = useSwitchChain();

    const [showChainSelector, setShowChainSelector] = useState(false);
    const [selectedChain, setSelectedChain] = useState(currentNetwork || "solana");
    const [isOpen, setIsOpen] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const dropdownRef = useRef(null);

    // Sync selectedChain with currentNetwork prop
    useEffect(() => {
        if (currentNetwork) {
            setSelectedChain(currentNetwork);
        }
    }, [currentNetwork]);

    const authenticated = isConnected;

    const networks = [
        { id: 'solana', name: 'Solana Devnet', icon: '🟢', color: '#3CB371' },
        { id: 'arc', name: 'Arc Testnet', icon: '🔵', color: '#3B82F6' },
    ];

    const chains = [
        { id: 'solana', name: 'Solana Devnet', icon: '🟢', color: '#3CB371', enabled: true },
        { id: 'arc', name: 'Arc Testnet', icon: '🔵', color: '#3B82F6', enabled: true },
    ];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Ensure selector is closed when connected
    useEffect(() => {
        if (isConnected) {
            setShowChainSelector(false);
        }
    }, [isConnected]);

    const copyAddress = () => {
        if (address) {
            navigator.clipboard.writeText(address);
            setIsOpen(false);
        }
    };

    const handleDisconnect = async () => {
        setIsOpen(false);
        setIsSwitching(true);
        try {
            // 1. Disconnect via AppKit
            await disconnect();

            // 2. Perform full wallet cleanup
            await fullWalletReset();

            console.log("✅ Wallet fully disconnected and cleaned up");
        } catch (e) {
            console.error("Disconnect error:", e);
            // Even if disconnect fails, try to clean up
            await clearWalletStorage();
        } finally {
            setIsSwitching(false);
        }
    };

    const handleChainSelect = async (newChainId) => {
        if (!chains.find(c => c.id === newChainId)?.enabled) return;

        setIsOpen(false);
        setShowChainSelector(false);

        // If clicking same network, do nothing
        if (selectedChain === newChainId) return;

        setIsSwitching(true);

        try {
            // 1. Force Disconnect Current Session to prevent "stuck" states
            if (isConnected) {
                console.log("🔄 Disconnecting for network switch...");
                try {
                    await disconnect();
                } catch (e) { console.warn("AppKit disconnect warn:", e); }

                // 2. Perform full wallet cleanup to clear all stale states
                await fullWalletReset();
            }

            // 3. Update Local State & Notify Parent
            setSelectedChain(newChainId);
            localStorage.setItem("15market_network", newChainId);
            onNetworkChange(newChainId);

            // 4. Prompt New Connection after delay to ensure cleanup completes
            setTimeout(() => {
                setIsSwitching(false);
                if (!isModalOpen) open();
            }, 1000);

        } catch (error) {
            console.error("Network switch failed:", error);
            // Try to clean up even if disconnect fails
            await clearWalletStorage();
            setIsSwitching(false);
        }
    };

    const chainColors = {
        solana: '#3CB371',
        arc: '#3B82F6',
    };

    const currentColor = chainColors[selectedChain] || chainColors.solana;

    // Check if on correct EVM Chain
    const needsChainSwitch = isConnected && currentNetwork === 'arc' && chainId !== 5042002;

    const handleWrongNetworkClick = () => {
        switchChain({ chainId: 5042002 });
    };

    // Wrong Network State - Integrated into the main button
    const WrongNetworkIndicator = () => (
        <div className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </div>
    );

    if (!authenticated) {
        return (
            <button
                onClick={() => !isModalOpen && open()}
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

    // Connected State
    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
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
                    {needsChainSwitch && <WrongNetworkIndicator />}
                </div>
                <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                    {address?.slice(0, 4)}...{address?.slice(-4)}
                </span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: currentColor }} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={`absolute top-full right-0 mt-2 w-64 border rounded-2xl p-2 backdrop-blur-xl z-[100] ${theme === 'light' ? 'bg-white/95 border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.1)]' : 'bg-[#0D0D0D]/95 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]'}`}
                    >
                        <div className={`px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] border-b mb-2 flex justify-between items-center ${theme === 'light' ? 'text-black/30 border-black/5' : 'text-white/30 border-white/5'}`}>
                            <span>Account Details</span>
                            <span className="text-[10px]" style={{ color: networks.find(n => n.id === currentNetwork)?.color }}>
                                {currentNetwork.toUpperCase()}
                            </span>
                        </div>

                        {needsChainSwitch && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={handleWrongNetworkClick}
                                className="mx-2 mb-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 hover:bg-red-500/20 transition-all group"
                            >
                                <AlertTriangle size={16} className="text-red-500 animate-pulse" />
                                <div className="flex flex-col items-start">
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">Wrong Network</span>
                                    <span className="text-[9px] font-bold text-red-500/60 group-hover:text-red-500">Switch to Arc Testnet</span>
                                </div>
                            </motion.button>
                        )}

                        <button
                            onClick={copyAddress}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-black/5 text-black/70 hover:text-black' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
                        >
                            <Copy size={14} />
                            <span className="text-xs font-bold">Copy Address</span>
                        </button>

                        <div className={`my-2 border-t pt-2 ${theme === 'light' ? 'border-black/5' : 'border-white/5'}`}>
                            <div className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'light' ? 'text-black/30' : 'text-white/30'}`}>Switch Network</div>
                            {networks.map((net) => (
                                <button
                                    key={net.id}
                                    onClick={() => handleChainSelect(net.id)}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 group ${currentNetwork === net.id
                                        ? 'bg-white/10 border border-white/10'
                                        : 'hover:bg-white/5'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm">{net.icon}</span>
                                        <span className={`text-xs font-bold ${currentNetwork === net.id ? (theme === 'light' ? 'text-black' : 'text-white') : (theme === 'light' ? 'text-black/60' : 'text-white/60')}`}>{net.name}</span>
                                    </div>
                                    {currentNetwork === net.id && (
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: net.color }} />
                                    )}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleDisconnect}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 transition-all text-red-500/70 hover:text-red-500 mt-2 border-t border-white/5"
                        >
                            <LogOut size={14} />
                            <span className="text-xs font-bold">Disconnect</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
