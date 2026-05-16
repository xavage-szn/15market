import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check, ArrowLeft, History, Wallet, Globe, Info, ChevronDown, Download, Save, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import { SUPPORTED_TOKENS } from '../tokens';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { UnifiedFundingModal } from './UnifiedFundingModal';
import WalletConnectionLoading from './WalletConnectionLoading';
import * as ethers from 'ethers';

const CHAIN_CONFIG = {
    'mon': { rpc: 'https://testnet-rpc.monad.xyz/', isEVM: true, usdc: '0x0000000000000000000000000000000000000000' }, // Monad placeholder until updated
    'avax': { rpc: 'https://api.avax-test.network/ext/bc/C/rpc', isEVM: true, usdc: '0x5425890298aed601595a70AB815c96711a31Bc65' },
    'eth': { rpc: 'https://ethereum-sepolia-rpc.publicnode.com', isEVM: true, usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
    'sol': { rpc: 'https://api.testnet.solana.com', isEVM: false, usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' }
};

const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)", "function decimals() view returns (uint8)"];

export function CircleWalletPage({ 
    address, 
    isLight, 
    notify, 
    onBack, 
    initialMode, 
    evmBalance = '0', 
    sessionBalance = 0,
    sessionAddress = '',
    wallets = [],
    onWithdraw
}) {
    const [walletInfo, setWalletInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [multiChainBalances, setMultiChainBalances] = useState({});
    const [isFetchingBalances, setIsFetchingBalances] = useState(false);
    
    // UI State
    const [activeWalletIdx, setActiveWalletIdx] = useState(0); // 0: Trading, 1: Main
    const [activeTokenIdx, setActiveTokenIdx] = useState(0); // For Main Wallet token funding
    const [fundingType, setFundingType] = useState(null); // null | 'native' | 'usdc'
    const [showSendModal, setShowSendModal] = useState(initialMode === 'send');
    const [showReceiveModal, setShowReceiveModal] = useState(initialMode === 'receive');
    const [showUnifiedFunding, setShowUnifiedFunding] = useState(false);
    
    // Form State
    const [sendAmount, setSendAmount] = useState("");
    const [destAddress, setDestAddress] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [qrCodeData, setQrCodeData] = useState("");
    const [activeTab, setActiveTab] = useState('assets'); 
    const [isDownloading, setIsDownloading] = useState(false);
    const [showDesktopFunding, setShowDesktopFunding] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

    const walletOptions = [
        { 
            key: 'trading', 
            label: 'Trading Wallet', 
            bal: parseFloat(sessionBalance || 0), 
            address: sessionAddress || walletInfo?.wallet?.address 
        },
        { 
            key: 'main', 
            label: 'Main Wallet', 
            bal: parseFloat(evmBalance || 0), 
            address: address 
        }
    ];

    const currentWallet = walletOptions[activeWalletIdx];
    const selectedToken = SUPPORTED_TOKENS[activeTokenIdx];

    const fetchWalletInfo = async (silent = false) => {
        if (!address) return;
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/circle/wallet/${address}`);
            if (res.ok) {
                const data = await res.json();
                setWalletInfo(data);
            }
        } catch (err) {
            console.error("Circle Wallet Error:", err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchWalletInfo();
    }, [address]);

    useEffect(() => {
        if (!address) return;

        let isMounted = true;
        const fetchAllBalances = async () => {
            setIsFetchingBalances(true);
            const newBalances = { ...multiChainBalances };
            
            // Extract solana address if present in privy wallets
            const solWallet = wallets?.find(w => w.address && !w.address.startsWith('0x'));
            const solAddress = solWallet?.address || null;

            const promises = SUPPORTED_TOKENS.map(async (token) => {
                const config = CHAIN_CONFIG[token.id];
                if (!config) return;
                
                newBalances[token.id] = { native: 0, usdc: 0 };

                try {
                    if (config.isEVM) {
                        const provider = new ethers.JsonRpcProvider(config.rpc);
                        
                        // Native
                        const nativeBal = await provider.getBalance(address).catch(() => 0n);
                        newBalances[token.id].native = parseFloat(ethers.formatEther(nativeBal));
                        
                        // USDC
                        if (config.usdc && config.usdc !== '0x0000000000000000000000000000000000000000') {
                            const contract = new ethers.Contract(config.usdc, ERC20_ABI, provider);
                            const usdcBal = await contract.balanceOf(address).catch(() => 0n);
                            const decimals = await contract.decimals().catch(() => 6);
                            newBalances[token.id].usdc = parseFloat(ethers.formatUnits(usdcBal, decimals));
                        }
                    } else if (token.id === 'sol' && solAddress) {
                        // Solana Native
                        const bodyNative = { jsonrpc: "2.0", id: 1, method: "getBalance", params: [solAddress] };
                        const resNative = await fetch(config.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyNative) });
                        const dataNative = await resNative.json();
                        newBalances[token.id].native = (dataNative.result?.value || 0) / 1e9;

                        // Solana USDC
                        const bodyUsdc = { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [solAddress, { mint: config.usdc }, { encoding: "jsonParsed" }] };
                        const resUsdc = await fetch(config.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyUsdc) });
                        const dataUsdc = await resUsdc.json();
                        newBalances[token.id].usdc = dataUsdc.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
                    }
                } catch (e) {
                    console.warn(`Failed to fetch balance for ${token.id}`, e);
                }
            });

            await Promise.allSettled(promises);
            if (isMounted) {
                setMultiChainBalances(newBalances);
                setIsFetchingBalances(false);
            }
        };

        fetchAllBalances();
        return () => { isMounted = false; };
    }, [address, wallets]);

    useEffect(() => {
        const receiveAddr = currentWallet.key === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address;
        
        if (receiveAddr && showReceiveModal) {
            QRCode.toDataURL(receiveAddr, {
                width: 400,
                margin: 2,
                color: {
                    dark: '#FFFFFF',
                    light: '#000000',
                },
            }, (err, url) => {
                if (err) console.error(err);
                setQrCodeData(url);
            });
        }
    }, [walletInfo, showReceiveModal, isLight, currentWallet, address]);

    const handleDownloadQR = async () => {
        const captureElement = document.getElementById('qr-capture-container');
        if (!captureElement) return;

        setIsDownloading(true);
        notify("Generating Image...", "pending");

        try {
            await new Promise(r => setTimeout(r, 100));
            const dataUrl = await toPng(captureElement, {
                pixelRatio: 3,
                backgroundColor: isLight ? '#ffffff' : '#0a0a0a',
                cacheBust: true,
                skipAutoScale: true,
            });
            const link = document.createElement('a');
            link.download = `15market-qr-${currentWallet.key}.png`;
            link.href = dataUrl;
            link.click();
            notify("QR Code Saved!", "success");
        } catch (err) {
            notify("Failed to save image", "error");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSend = async () => {
        if (!destAddress || !sendAmount) {
            notify("Please fill in all fields", "error");
            return;
        }

        const amt = parseFloat(sendAmount);
        if (isNaN(amt) || amt <= 0) {
            notify("Invalid amount", "error");
            return;
        }

        setIsSending(true);
        try {
            if (currentWallet.key === 'trading') {
                if (!onWithdraw) throw new Error("Withdrawal function not available");
                await onWithdraw(amt, destAddress);
                setShowSendModal(false);
                setSendAmount("");
                setDestAddress("");
            } else if (currentWallet.key === 'main') {
                const activeWallet = wallets[0];
                if (!activeWallet) throw new Error("No connected wallet found");

                notify("Confirming transaction...", "pending");
                const txHash = await activeWallet.sendTransaction({
                    to: destAddress,
                    value: BigInt(Math.floor(amt * 1e18)).toString(), 
                });

                if (txHash) {
                    notify("Transfer Success!", "success");
                    setShowSendModal(false);
                    setSendAmount("");
                    setDestAddress("");
                }
            }
        } catch (err) {
            notify(err.message, "error");
        } finally {
            setIsSending(false);
        }
    };

    const handleSwipeWallet = (direction) => {
        if (direction === 'left') {
            setActiveWalletIdx(prev => (prev + 1) % walletOptions.length);
        } else if (direction === 'right') {
            setActiveWalletIdx(prev => (prev - 1 + walletOptions.length) % walletOptions.length);
        }
    };

    const handleSwipeToken = (direction) => {
        if (direction === 'left') {
            setActiveTokenIdx(prev => (prev + 1) % SUPPORTED_TOKENS.length);
        } else if (direction === 'right') {
            setActiveTokenIdx(prev => (prev - 1 + SUPPORTED_TOKENS.length) % SUPPORTED_TOKENS.length);
        }
    };

    return (
        <>
        <AnimatePresence>
            {isLoading && (
                <WalletConnectionLoading 
                    theme={isLight ? 'light' : 'dark'} 
                    onFinish={() => setIsLoading(false)} 
                />
            )}
        </AnimatePresence>

        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute inset-0 z-[100] ${isLight ? 'bg-white' : 'bg-black'} overflow-hidden flex flex-col font-sans transition-all duration-700 ${isLoading ? 'blur-3xl scale-[1.1]' : 'blur-0 scale-100'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            {/* Full-page Standard Carbon-Fibre Texture */}
            <div className={`fixed inset-0 pointer-events-none z-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? 'opacity-[0.07] mix-blend-multiply' : 'opacity-[0.05] mix-blend-screen'}`} />
            
            {/* Immersive Ambiance (Global Glows) */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#3CB371]/5' : 'bg-[#3CB371]/10'} blur-[120px] rounded-full`} />
                <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#3CB371]/5' : 'bg-[#3CB371]/10'} blur-[120px] rounded-full`} />
            </div>

            {/* Sticky Header - Full Width */}
            <div className="w-full shrink-0 relative z-50 safe-top">
                <div className="w-full px-4 md:px-12 h-16 md:h-24 md:pt-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => fundingType ? setFundingType(null) : onBack()} 
                            className={`p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all hover:scale-110 active:scale-95`}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h2 className={`text-xl font-black uppercase tracking-tighter text-white leading-none`}>
                                {fundingType ? 'Select Source' : 'Transfer Hub'}
                            </h2>
                            <p className={`text-[9px] font-bold uppercase tracking-[0.3em] text-[#3CB371] mt-1`}>
                                {fundingType ? 'Choose how to add funds' : 'Swipe to Switch Wallets'}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => fetchWalletInfo(true)} className={`p-3 rounded-full bg-white/5 hover:bg-white/10 text-white ${isRefreshing ? 'animate-spin' : ''}`}>
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* Main Content - Full Width */}
            <div className="flex-1 w-full px-4 md:px-12 py-4 md:py-8 flex flex-col lg:flex-row gap-16 overflow-y-auto no-scrollbar items-start justify-start relative z-10">
                
                {/* LEFT SIDE: WALLETS & PRIMARY ACTIONS */}
                <div className={`flex flex-col gap-4 md:gap-8 w-full lg:max-w-md shrink-0 transition-all duration-500 mt-2 md:mt-0`}>
                    {/* Swipeable Wallet Card */}
                    <div className="relative h-[220px] md:h-[260px] w-full mt-4 md:mt-0 group">
                        {/* Static Navigation Buttons (Shifted Outside) - Hidden on Mobile */}
                        <button 
                            onClick={() => handleSwipeWallet('right')}
                            className="hidden md:block absolute left-[-45px] top-1/2 -translate-y-1/2 z-20 p-2 transition-all active:scale-90 text-[#3CB371]"
                        >
                            <ChevronLeft size={32} strokeWidth={2.5} />
                        </button>
                        <button 
                            onClick={() => handleSwipeWallet('left')}
                            className="hidden md:block absolute right-[-45px] top-1/2 -translate-y-1/2 z-20 p-2 transition-all active:scale-90 text-[#3CB371]"
                        >
                            <ChevronRight size={32} strokeWidth={2.5} />
                        </button>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeWalletIdx}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                onDragEnd={(e, info) => {
                                    if (info.offset.x < -100) handleSwipeWallet('left');
                                    else if (info.offset.x > 100) handleSwipeWallet('right');
                                }}
                                initial={{ opacity: 0, scale: 0.9, x: 100 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9, x: -100 }}
                                className={`w-full h-full p-8 md:p-10 rounded-[40px] relative overflow-hidden flex flex-col justify-between cursor-grab active:cursor-grabbing bg-[#3CB371] ${isLight ? 'shadow-[0_60px_120px_rgba(0,0,0,0.5)]' : 'shadow-[0_40px_100px_rgba(60,179,113,0.35)]'} border border-white/20`}
                            >
                                {/* Immersive Nature-Series Layer (Behind Texture) */}
                                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                    {/* Complex Topographic Texture */}
                                    <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <path d="M0,20 Q20,10 40,20 T80,20 T100,10" fill="none" stroke="white" strokeWidth="0.15" />
                                        <path d="M0,40 Q20,30 40,40 T80,40 T100,30" fill="none" stroke="white" strokeWidth="0.15" />
                                        <path d="M0,60 Q20,50 40,60 T80,60 T100,50" fill="none" stroke="white" strokeWidth="0.15" />
                                        <path d="M0,80 Q20,70 40,80 T80,80 T100,70" fill="none" stroke="white" strokeWidth="0.15" />
                                    </svg>

                                    {/* Winding Road Path */}
                                    <svg className="absolute top-0 right-[-10%] w-[120%] h-full opacity-40" viewBox="0 0 200 100" preserveAspectRatio="none">
                                        <path 
                                            d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" 
                                            fill="none" 
                                            stroke="white" 
                                            strokeWidth="10" 
                                            className="opacity-10"
                                        />
                                        <path 
                                            d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" 
                                            fill="none" 
                                            stroke="white" 
                                            strokeWidth="0.6" 
                                            strokeDasharray="4 6" 
                                            className="opacity-30"
                                        />
                                    </svg>
                                    
                                    {/* Pine Tree Silhouettes */}
                                    <div className="absolute bottom-[15%] right-[12%] flex items-end gap-1 opacity-30">
                                        <svg width="20" height="28" viewBox="0 0 24 32" fill="white">
                                            <path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" />
                                        </svg>
                                        <svg width="14" height="20" viewBox="0 0 24 32" fill="white" className="opacity-60">
                                            <path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" />
                                        </svg>
                                    </div>

                                    {/* Geometric Icons (Plus/Cross) */}
                                    <div className="absolute top-[20%] left-[45%] opacity-20">
                                        <div className="relative w-3 h-3">
                                            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
                                            <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white" />
                                        </div>
                                    </div>
                                    <div className="absolute bottom-[30%] left-[20%] opacity-10 grid grid-cols-2 gap-2">
                                        <div className="w-1 h-1 rounded-full bg-white" />
                                        <div className="w-1 h-1 rounded-full bg-white" />
                                    </div>
                                </div>

                                {/* Platform Standard Texture Layer (On Top) */}
                                <div className="absolute inset-0 z-0">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2E8B57_0%,transparent_60%)] opacity-60" />
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,#1E5D3B_0%,transparent_60%)] opacity-40" />
                                    <div 
                                        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
                                        style={{ 
                                            backgroundImage: `url('https://www.transparenttextures.com/patterns/carbon-fibre.png')`
                                        }} 
                                    />
                                    {/* Subtle Glass Ripple */}
                                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-30" />
                                </div>

                                {/* Credit Card Chip (Metallic Gold) - Moved to Right */}
                                <div className="absolute top-1/2 right-10 -translate-y-1/2 w-14 h-11 rounded-xl bg-gradient-to-br from-[#E6BE8A] via-[#C5A059] to-[#8B7355] shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-black/20 z-10">
                                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-[1.5px] p-2.5 opacity-30">
                                        {[...Array(6)].map((_, i) => (
                                            <div key={i} className="border border-black/40 rounded-[3px]" />
                                        ))}
                                    </div>
                                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-black/20" />
                                </div>

                                <motion.div className="flex-1 flex flex-col justify-between relative z-20"
                                    animate={{ y: '-15%' }}
                                    transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                >
                                    <div className="flex items-center justify-between">
                                        <p className={`text-[11px] font-black uppercase tracking-[0.2em] text-white`}>{currentWallet.label}</p>
                                        <img 
                                            src="/boblogo.png" 
                                            alt="Logo" 
                                            className="h-16 md:h-20 object-contain brightness-0 invert mix-blend-overlay opacity-80" 
                                        />
                                    </div>

                                    {/* Card Number (Wallet Address) */}
                                    <div className="py-2">
                                        <p className="text-[18px] md:text-[22px] font-mono tracking-[0.2em] text-white">
                                            {currentWallet.address 
                                                ? `${currentWallet.address.slice(0, 6)}...${currentWallet.address.slice(-4)}`.toUpperCase()
                                                : "xxxx...xxxx"}
                                        </p>
                                        <div className="flex gap-1.5 mt-4">
                                            {walletOptions.map((_, i) => (
                                                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${activeWalletIdx === i ? 'w-4 bg-white' : 'bg-white/10'}`} />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-end justify-between relative">
                                        <div>
                                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-white`}>Available Balance</p>
                                            <h1 className={`text-4xl md:text-5xl font-black tracking-tighter text-white flex items-baseline gap-2`}>
                                                {currentWallet.bal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                <span className="text-xl text-white/60">USDC</span>
                                            </h1>
                                        </div>

                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        <Shield size={10} className="text-white opacity-40" />
                                        <p className={`text-[9px] font-bold uppercase tracking-widest text-white opacity-40`}>
                                            Secured
                                        </p>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Primary Actions */}
                    <div className="grid grid-cols-2 gap-3 md:gap-4 shrink-0 relative z-20">
                        <button 
                            onClick={() => setShowSendModal(true)}
                            className="flex items-center justify-center gap-2 md:gap-3 bg-[#3CB371] text-white font-black py-4 md:py-6 rounded-[20px] md:rounded-[28px] text-[10px] md:text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-2xl shadow-[#3CB371]/20"
                        >
                            <Send size={16} /> Send
                        </button>
                        <button 
                            onClick={() => setShowReceiveModal(true)}
                            className={`flex items-center justify-center gap-2 md:gap-3 ${isLight ? 'bg-black' : 'bg-white/10 border border-white/10'} text-[#3CB371] font-black py-4 md:py-6 rounded-[20px] md:rounded-[28px] text-[10px] md:text-sm uppercase tracking-widest active:scale-[0.95] transition-all shadow-2xl shadow-black/20`}
                        >
                            <ArrowDownLeft size={16} className="text-[#3CB371]" /> Receive
                        </button>
                    </div>
                </div>

                {/* VERTICAL DIVIDER (Desktop Only) */}
                <motion.div 
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    className={`hidden lg:block w-[2px] rounded-full self-stretch my-4 bg-[#3CB371]/40`}
                />

                {/* RIGHT SIDE: ASSETS & FUNDING (Visible on Mobile & Desktop) */}
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 flex flex-col min-h-0 h-full w-full max-w-2xl overflow-visible md:overflow-hidden -mt-12 md:mt-0"
                >
                    <div className="flex items-center gap-8 mb-6 border-b border-white/5 shrink-0">
                        <button onClick={() => setActiveTab('assets')} className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'assets' ? 'text-white' : 'text-white/20'}`}>
                            Assets & Funding
                            {activeTab === 'assets' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white" />}
                        </button>
                        <button onClick={() => setActiveTab('history')} className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'history' ? 'text-white' : 'text-white/20'}`}>
                            Activity Pulse
                            {activeTab === 'history' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white" />}
                        </button>
                    </div>

                    <div className={`flex-1 overflow-visible md:overflow-hidden custom-scrollbar pr-2 pb-20`}>
                        {activeTab === 'assets' ? (
                            <div className="flex flex-col gap-6">
                                    <div className="flex flex-col gap-4 h-full min-h-[400px]">
                                        {!fundingType ? (
                                            <div className="flex flex-col items-center justify-start md:justify-center flex-1 pt-6 pb-16 md:py-10 gap-4 md:gap-16 relative z-10 w-full h-full md:min-h-[300px] md:pb-0">
                                                {/* TOP SECTION: Funding Buttons */}
                                                <div className="flex flex-col items-center gap-6 md:gap-16 w-full -translate-y-[5vh] md:-translate-y-[5vh] mt-2 md:mt-0">
                                                    <h3 className={`text-[10px] md:text-xs font-black uppercase tracking-[0.3em] opacity-40 text-white mt-1 md:mt-0`}>Select Funding Type</h3>
                                                    
                                                    <div className="flex items-center justify-center gap-6 md:gap-16 w-full -mt-3 md:mt-0">
                                                        <button 
                                                        onClick={() => setFundingType('native')}
                                                        className="flex flex-col items-center gap-4 md:gap-6 transition-all hover:scale-110 active:scale-95 group"
                                                    >
                                                        <Globe size={32} md:size={48} strokeWidth={1.5} className={`transition-all ${isLight ? 'text-black/30 group-hover:text-[#3CB371]' : 'text-white/40 group-hover:text-[#3CB371]'}`} />
                                                        <div className="text-center">
                                                            <p className={`text-[10px] md:text-sm font-black uppercase tracking-[0.2em] transition-all ${isLight ? 'text-black/60 group-hover:text-[#3CB371]' : 'text-white/60 group-hover:text-[#3CB371]'}`}>Native Tokens</p>
                                                        </div>
                                                    </button>
                                                    {/* Divider Line */}
                                                <div className={`w-[2px] h-16 md:h-24 bg-[#3CB371]/40 mx-2 md:mx-12 rounded-full`}></div>
 
                                                    <button 
                                                        onClick={() => setFundingType('usdc')}
                                                        className="flex flex-col items-center gap-4 md:gap-6 transition-all hover:scale-110 active:scale-95 group"
                                                    >
                                                        <Shield size={32} md:size={48} strokeWidth={1.5} className={`transition-all ${isLight ? 'text-black/30 group-hover:text-[#3CB371]' : 'text-white/40 group-hover:text-[#3CB371]'}`} />
                                                        <div className="center">
                                                            <p className={`text-[10px] md:text-sm font-black uppercase tracking-[0.2em] transition-all ${isLight ? 'text-black/60 group-hover:text-[#3CB371]' : 'text-white/60 group-hover:text-[#3CB371]'}`}>USDC</p>
                                                        </div>
                                                    </button>
                                                </div>
                                                </div>

                                                {/* BOTTOM SECTION: Logos and Powered By */}
                                                <div className={`fixed md:relative bottom-0 left-0 w-full flex flex-col items-center gap-1 md:gap-8 mt-auto md:mt-0 pt-0 pb-0 z-50 md:z-auto safe-bottom pointer-events-none md:pointer-events-auto -translate-y-[3vh] md:translate-y-0`}>
                                                    {/* Infinite Scrolling Asset Marquee - Enabled on Mobile & Desktop */}
                                                    <div className="block w-full max-w-5xl mx-auto md:mt-8 overflow-hidden relative [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)] z-0 translate-y-[2vh] md:translate-y-0">
                                                        <motion.div
                                                        animate={{ x: ["0%", "-50%"] }}
                                                        transition={{ ease: "linear", duration: 25, repeat: Infinity }}
                                                        className="flex items-center w-max"
                                                    >
                                                        {/* Duplicate exactly TWICE for seamless -50% loop */}
                                                        {[...Array(2)].map((_, groupIdx) => (
                                                            <div key={groupIdx} className="flex items-center">
                                                                {/* To make it long enough, repeat the tokens within each half */}
                                                                {[...SUPPORTED_TOKENS, ...SUPPORTED_TOKENS, ...SUPPORTED_TOKENS].map((token, i) => (
                                                                    <div key={`${groupIdx}-${i}`} className="flex items-center justify-center w-12 md:w-24">
                                                                        <img 
                                                                            src={token.icon} 
                                                                            alt={token.name} 
                                                                            className="w-5 h-5 md:w-10 md:h-10 object-contain opacity-30 brightness-0 md:brightness-100 grayscale transition-all drop-shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ))}
                                                    </motion.div>
                                                </div>

                                                {/* Powered By Badge */}
                                                <div className="flex items-center justify-center gap-2 md:gap-3 relative md:-mt-6 opacity-60 hover:opacity-100 transition-opacity duration-500 z-20 translate-y-[2vh] md:translate-y-0">
                                                    <span className={`relative z-30 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Powered by</span>
                                                    <div className="flex items-center gap-1.5 md:gap-2.5 relative z-30">
                                                        <img 
                                                            src="/circle.png" 
                                                            alt="Circle" 
                                                            className="h-5 md:h-10 object-contain drop-shadow-[0_0_10px_rgba(60,179,113,0.3)] relative z-30"
                                                            style={{ filter: 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' }}
                                                        />
                                                        <div className={`relative z-30 text-white opacity-40 scale-75 md:scale-100`}>
                                                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                                                <path d="M1 1L11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3"/>
                                                                <path d="M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3"/>
                                                            </svg>
                                                        </div>
                                                        <span className="relative z-30 text-[9px] md:text-xs font-black tracking-widest text-[#3CB371]">CCTP</span>
                                                        <div className={`relative z-30 text-white opacity-40 scale-75 md:scale-100`}>
                                                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                                                <path d="M1 1L11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3"/>
                                                                <path d="M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3"/>
                                                            </svg>
                                                        </div>
                                                        <span className={`relative z-30 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>GATEWAY</span>
                                                    </div>
                                                </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={`flex flex-col gap-4 relative z-10`}>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <button 
                                                            onClick={() => setFundingType(null)}
                                                            className={`p-2.5 rounded-full border transition-all ${isLight ? 'bg-white/50 border-black/10 text-black/60 hover:text-black hover:bg-black/5' : 'bg-black/50 border-white/10 text-white/60 hover:text-white hover:bg-white/5'}`}
                                                        >
                                                            <ArrowLeft size={16} />
                                                        </button>
                                                        <h3 className={`text-[11px] font-black uppercase tracking-[0.3em] opacity-40 text-white`}>
                                                            {fundingType === 'native' ? 'Native Tokens' : 'USDC'}
                                                        </h3>
                                                        <div className="flex gap-1.5">
                                                            {SUPPORTED_TOKENS.map((_, i) => (
                                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${activeTokenIdx === i ? 'bg-[#3CB371]' : 'bg-white/10'}`} />
                                                            ))}
                                                        </div>
                                                    </div>

                                            {/* MOBILE SIDE-BY-SIDE VIEW (Scroll-free) */}
                                            <div className="flex md:hidden flex-row flex-nowrap items-center justify-between w-full h-[280px] -mt-12 gap-0 relative overflow-visible">
                                                {/* Big Swipeable Logo Area (60%) */}
                                                <div className="relative w-[60%] h-full flex items-center justify-center overflow-visible group/token z-10">
                                                    {/* Navigation Arrows for Mobile */}
                                                    <button onClick={() => handleSwipeToken('right')} className="absolute left-1 top-[22%] -translate-y-1/2 z-20 p-1.5 text-[#3CB371]"><ChevronLeft size={20} /></button>
                                                    <button onClick={() => handleSwipeToken('left')} className="absolute right-1 top-[22%] -translate-y-1/2 z-20 p-1.5 text-[#3CB371]"><ChevronRight size={20} /></button>

                                                    <AnimatePresence mode="wait">
                                                        <motion.div
                                                            key={activeTokenIdx}
                                                            drag="x"
                                                            dragConstraints={{ left: 0, right: 0 }}
                                                            onDragEnd={(e, info) => {
                                                                if (info.offset.x < -30) handleSwipeToken('left');
                                                                else if (info.offset.x > 30) handleSwipeToken('right');
                                                            }}
                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.8 }}
                                                            className="absolute inset-0 flex flex-col items-center justify-center"
                                                        >
                                                            <div className="relative w-full h-full flex items-center justify-center">
                                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[95%] w-44 h-44 pointer-events-none z-0">
                                                                    <img 
                                                                        src={selectedToken.icon} 
                                                                        className="w-full h-full object-contain drop-shadow-[0_0_40px_rgba(60,179,113,0.3)]" 
                                                                        style={{ filter: isLight ? 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' : 'none' }}
                                                                        alt={selectedToken.symbol} 
                                                                    />
                                                                    {fundingType === 'usdc' && (
                                                                        <img 
                                                                            src="/circlewhite.png" 
                                                                            className={`absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-10 ${
                                                                                selectedToken.id === 'eth' ? 'top-[45%] left-[50%] w-[22%] h-[22%]' :
                                                                                selectedToken.id === 'avax' ? 'top-[56%] left-[59%] w-[18%] h-[18%]' :
                                                                                selectedToken.id === 'sol' ? 'top-[59%] left-[50%] w-[18%] h-[18%]' :
                                                                                selectedToken.id === 'mon' ? 'top-[65%] left-[50%] w-[18%] h-[18%]' :
                                                                                'top-[50%] left-[50%] w-[20%] h-[20%]'
                                                                            }`}
                                                                            style={{ filter: 'brightness(0) invert(1)' }}
                                                                            alt="USDC" 
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div className="relative z-10 -translate-y-[3vh]">
                                                                    <p className="text-xl md:text-2xl font-black tracking-tighter text-white drop-shadow-xl text-center">
                                                                        {fundingType === 'native' ? selectedToken.symbol : `${selectedToken.symbol}-USDC`}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    </AnimatePresence>
                                                </div>

                                                {/* Vertical Divider (In front) */}
                                                <div className="w-[1.5px] h-24 bg-[#3CB371]/40 rounded-full shrink-0 relative z-30 -translate-y-[10vh]" />

                                                {/* Normal Fund Button Area (38%) */}
                                                <div className="w-[38%] flex flex-col gap-1.5 items-center justify-center px-2 relative z-30 -translate-y-[10vh]">
                                                    <div className="flex flex-col items-center opacity-80">
                                                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Available</span>
                                                        <span className={`text-[13px] font-black tracking-wider ${isLight ? 'text-black/80' : 'text-white/90'}`}>
                                                            {fundingType === 'usdc' ? 
                                                                (currentWallet.key === 'trading' ? currentWallet.bal.toFixed(2) : (multiChainBalances[selectedToken.id]?.usdc || 0).toFixed(2)) 
                                                                : (multiChainBalances[selectedToken.id]?.native || 0).toFixed(4)} {fundingType === 'native' ? selectedToken.symbol : 'USDC'}
                                                        </span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setShowUnifiedFunding(true)}
                                                        className="w-full py-3.5 rounded-full bg-[#3CB371] text-white font-black uppercase text-[9px] tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-xl shadow-[#3CB371]/20 flex items-center justify-center text-center"
                                                    >
                                                        Fund {selectedToken.symbol}
                                                    </button>
                                                </div>

                                                {/* Mobile Specific Nature Decoration */}
                                                <div className="absolute inset-0 opacity-[0.15] pointer-events-none overflow-hidden z-0">
                                                    <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                        <path d="M0,20 Q20,10 40,20 T80,20 T100,10" fill="none" stroke="white" strokeWidth="0.2" />
                                                        <path d="M0,50 Q20,40 40,50 T80,50 T100,40" fill="none" stroke="white" strokeWidth="0.2" />
                                                        <path d="M0,80 Q20,70 40,80 T80,80 T100,70" fill="none" stroke="white" strokeWidth="0.2" />
                                                    </svg>
                                                    <div className="absolute bottom-4 left-4 opacity-40 scale-75">
                                                        <svg width="24" height="32" viewBox="0 0 24 32" fill="white">
                                                            <path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* DESKTOP CAROUSEL (Existing) */}
                                            <div className="hidden md:flex relative h-[280px] w-full items-center justify-center overflow-hidden group/token">
                                                {/* Static Token Navigation Buttons (Green & Standalone) */}
                                            <button 
                                                onClick={() => handleSwipeToken('right')}
                                                className="absolute left-[-20px] top-1/2 -translate-y-1/2 z-20 p-2 transition-all active:scale-90 text-[#3CB371]"
                                            >
                                                <ChevronLeft size={36} strokeWidth={2.5} />
                                            </button>
                                            <button 
                                                onClick={() => handleSwipeToken('left')}
                                                className="absolute right-[-20px] top-1/2 -translate-y-1/2 z-20 p-2 transition-all active:scale-90 text-[#3CB371]"
                                            >
                                                <ChevronRight size={36} strokeWidth={2.5} />
                                            </button>

                                                <AnimatePresence mode="wait">
                                                    <motion.div
                                                        key={activeTokenIdx}
                                                        drag="x"
                                                        dragConstraints={{ left: 0, right: 0 }}
                                                        onDragEnd={(e, info) => {
                                                            if (info.offset.x < -50) handleSwipeToken('left');
                                                            else if (info.offset.x > 50) handleSwipeToken('right');
                                                        }}
                                                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                                                        className="absolute inset-0 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
                                                    >
                                                        <div className="flex items-center justify-center relative w-full h-full">
                                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[70%] w-64 h-64 pointer-events-none z-0">
                                                                <img 
                                                                    src={selectedToken.icon} 
                                                                    className="w-full h-full object-contain drop-shadow-[0_0_80px_rgba(60,179,113,0.5)] transition-all" 
                                                                    style={{ filter: isLight ? 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' : 'none' }}
                                                                    alt={selectedToken.symbol} 
                                                                />
                                                                {fundingType === 'usdc' && (
                                                                    <img 
                                                                        src="/circlewhite.png" 
                                                                        className={`absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-10 ${
                                                                            selectedToken.id === 'eth' ? 'top-[45%] left-[50%] w-[22%] h-[22%]' :
                                                                            selectedToken.id === 'avax' ? 'top-[56%] left-[59%] w-[18%] h-[18%]' :
                                                                            selectedToken.id === 'sol' ? 'top-[59%] left-[50%] w-[18%] h-[18%]' :
                                                                            selectedToken.id === 'mon' ? 'top-[65%] left-[50%] w-[18%] h-[18%]' :
                                                                            'top-[50%] left-[50%] w-[20%] h-[20%]'
                                                                        }`}
                                                                        style={{ filter: 'brightness(0) invert(1)' }}
                                                                        alt="USDC" 
                                                                    />
                                                                )}
                                                            </div>
                                                            <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none translate-y-10">
                                                                <p className={`text-5xl font-black tracking-tighter text-white drop-shadow-2xl`}>
                                                                    {fundingType === 'native' ? selectedToken.symbol : `${selectedToken.symbol}-USDC`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>

                                            <div className="hidden md:flex relative z-20 -translate-y-[30%] flex flex-col items-center gap-6">
                                                {/* Desktop Available Balance */}
                                                <div className="flex flex-col items-center opacity-80 -mb-2 -translate-y-[5vh]">
                                                    <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Available</span>
                                                    <span className={`text-[15px] font-black tracking-wider ${isLight ? 'text-black/80' : 'text-white/90'}`}>
                                                        {fundingType === 'usdc' ? 
                                                            (currentWallet.key === 'trading' ? currentWallet.bal.toFixed(2) : (multiChainBalances[selectedToken.id]?.usdc || 0).toFixed(2)) 
                                                            : (multiChainBalances[selectedToken.id]?.native || 0).toFixed(4)} {fundingType === 'native' ? selectedToken.symbol : 'USDC'}
                                                    </span>
                                                </div>

                                                <button 
                                                    onClick={() => setShowUnifiedFunding(true)}
                                                    className="w-auto px-10 py-4 rounded-[20px] bg-[#3CB371] text-white font-black uppercase text-[11px] tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-2xl shadow-[#3CB371]/20 -translate-y-[7.5vh]"
                                                >
                                                    Fund with {fundingType === 'native' ? selectedToken.name : `${selectedToken.name} USDC`}
                                                </button>

                                                <div className={`w-[70%] py-3 px-4 rounded-[24px] border border-dashed flex items-center justify-center gap-3 ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'} -translate-y-[10.5vh]`}>
                                                    <Info size={12} className="text-[#3CB371] shrink-0" />
                                                    <p className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/60' : 'text-white/40'}`}>
                                                        Click icons or swipe to change asset
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {walletInfo?.transactions?.map((tx, i) => (
                                    <div key={i} className={`p-8 rounded-[40px] border ${isLight ? 'bg-white border-black/5 shadow-sm' : 'bg-[#111] border-white/5'} flex items-center justify-between transition-all hover:scale-[1.01]`}>
                                        <div className="flex items-center gap-5">
                                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${tx.type === 'OUTGOING' ? 'bg-orange-500/10 text-orange-500' : 'bg-[#3CB371]/10 text-[#3CB371]'}`}>
                                                {tx.type === 'OUTGOING' ? <Send size={24} /> : <ArrowDownLeft size={24} />}
                                            </div>
                                            <div>
                                                <p className={`text-sm font-black uppercase tracking-wider text-white`}>{tx.type}</p>
                                                <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest text-white">{new Date(tx.createDate).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <p className={`text-xl font-black text-white`}>
                                            {tx.type === 'OUTGOING' ? '-' : '+'}{tx.amounts?.[0] || '0.00'}
                                        </p>
                                    </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

            {/* Modals Integrated */}
            <AnimatePresence>
                {showSendModal && (
                    <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSendModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className={`w-full md:max-w-md relative z-10 p-6 md:p-8 rounded-t-[40px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} max-h-[92dvh] overflow-y-auto`}>
                            <div className="flex items-center justify-between mb-8">
                                <h3 className={`text-2xl font-black uppercase tracking-tighter text-white`}>Send Assets</h3>
                                <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                            </div>
                            
                            <div className="flex flex-col gap-6">
                                <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-[#3CB371]/20`}>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Source Wallet</p>
                                    <p className={`text-sm font-black uppercase text-white`}>{currentWallet.label}</p>
                                </div>

                                <div>
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Recipient Address</label>
                                    <input type="text" placeholder="0x..." value={destAddress} onChange={(e) => setDestAddress(e.target.value)} className={`w-full py-5 px-6 rounded-2xl ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white'} border-2 border-transparent focus:border-[#3CB371]/30 outline-none text-sm font-bold transition-all`} />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Amount (USDC)</label>
                                        <button onClick={() => setSendAmount(currentWallet.bal.toFixed(4))} className="text-[10px] font-black text-[#3CB371] uppercase hover:underline">Max Available</button>
                                    </div>
                                    <input type="number" placeholder="0.00" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className={`w-full py-5 px-6 rounded-2xl ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white'} border-2 border-transparent focus:border-[#3CB371]/30 outline-none text-3xl font-black transition-all`} />
                                </div>

                                <button onClick={handleSend} disabled={isSending} className="w-full bg-[#3CB371] text-black font-black py-6 rounded-[28px] uppercase tracking-widest mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#3CB371]/20">
                                    {isSending ? 'Processing...' : 'Confirm Transfer'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showReceiveModal && (
                    <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReceiveModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className={`w-full md:max-w-md relative z-10 p-6 md:p-8 rounded-t-[40px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} flex flex-col items-center max-h-[92dvh] overflow-y-auto`}>
                            <div className="flex items-center justify-between w-full mb-8">
                                <h3 className={`text-2xl font-black uppercase tracking-tighter text-white`}>Receive</h3>
                                <button onClick={() => setShowReceiveModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                            </div>

                            <div className="p-4 rounded-3xl bg-white mb-8 shadow-2xl relative group overflow-hidden">
                                {qrCodeData ? (
                                    <>
                                        <img src={qrCodeData} alt="QR Code" className="w-56 h-56" />
                                        <button onClick={handleDownloadQR} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all backdrop-blur-[2px]">
                                            <Download size={32} className="text-[#3CB371] mb-2" />
                                            <span className="text-[10px] font-black uppercase text-white tracking-widest">Download QR</span>
                                        </button>
                                    </>
                                ) : <RefreshCw size={32} className="animate-spin text-black/10" />}
                            </div>

                            <div className={`w-full p-6 rounded-3xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-dashed text-center mb-8`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-40 text-white`}>Deposit to {currentWallet.label}</p>
                                <p className={`text-xs font-black font-mono break-all text-white`}>{currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 w-full">
                                <button onClick={() => { navigator.clipboard.writeText(currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address); notify("Copied!", "success"); }} className={`flex items-center justify-center gap-3 bg-[#3CB371] text-white font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest transition-all`}>
                                    <Copy size={16} /> Copy
                                </button>
                                <button onClick={handleDownloadQR} className={`flex items-center justify-center gap-3 ${isLight ? 'bg-black/5' : 'bg-white/5'} border ${isLight ? 'border-black/10' : 'border-white/10'} font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest transition-all`}>
                                    <Save size={16} /> Save
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <UnifiedFundingModal 
                isOpen={showUnifiedFunding}
                onClose={() => setShowUnifiedFunding(false)}
                isLight={isLight}
                notify={notify}
                address={address}
                sessionAddress={sessionAddress}
                initialToken={selectedToken}
                fundingType={fundingType}
                onSuccess={() => fetchWalletInfo(true)}
            />

            {/* Hidden Capture Container (QR) */}
            <div id="qr-capture-container" className="fixed left-[-9999px] top-[-9999px] w-[400px] p-10 flex flex-col items-center justify-center gap-6"
                style={{ backgroundColor: isLight ? '#ffffff' : '#0a0a0a' }}>
                <img src={isLight ? "https://15market.com/goblogo.png" : "https://15market.com/gowlogo.png"} className="h-12 w-auto mb-2" alt="Logo" />
                <p className={`text-sm italic font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>15market.com</p>
                <div className={`p-4 rounded-3xl bg-white shadow-xl`}>
                    <img src={qrCodeData} alt="QR" className="w-64 h-64" />
                </div>
                <div className="text-center">
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-white/40`}>Address ({currentWallet.label})</p>
                    <p className={`text-xs font-black font-mono break-all text-white`}>{currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address}</p>
                </div>
            </div>
        </motion.div>
        </>
    );
}