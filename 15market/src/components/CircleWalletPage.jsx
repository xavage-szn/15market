import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check, ArrowLeft, History, Wallet, Globe, Info, ChevronDown, Download, Save, CreditCard } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import { SUPPORTED_TOKENS } from '../tokens';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { UnifiedFundingModal } from './UnifiedFundingModal';

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
    
    // UI State
    const [activeWalletIdx, setActiveWalletIdx] = useState(0); // 0: Trading, 1: Main
    const [activeTokenIdx, setActiveTokenIdx] = useState(0); // For Main Wallet token funding
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

    const walletOptions = [
        { key: 'trading', label: 'Trading Wallet', bal: parseFloat(sessionBalance || 0), icon: Zap, color: '#3CB371' },
        { key: 'main',    label: 'Main Wallet',    bal: parseFloat(evmBalance || '0'),   icon: Wallet, color: '#FFFFFF' },
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
        const receiveAddr = currentWallet.key === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address;
        
        if (receiveAddr && showReceiveModal) {
            QRCode.toDataURL(receiveAddr, {
                width: 400,
                margin: 2,
                color: {
                    dark: isLight ? '#000000' : '#3CB371',
                    light: isLight ? '#ffffff' : '#000000',
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
        if (direction === 'left' && activeWalletIdx < walletOptions.length - 1) {
            setActiveWalletIdx(prev => prev + 1);
        } else if (direction === 'right' && activeWalletIdx > 0) {
            setActiveWalletIdx(prev => prev - 1);
        }
    };

    const handleSwipeToken = (direction) => {
        if (direction === 'left' && activeTokenIdx < SUPPORTED_TOKENS.length - 1) {
            setActiveTokenIdx(prev => prev + 1);
        } else if (direction === 'right' && activeTokenIdx > 0) {
            setActiveTokenIdx(prev => prev - 1);
        }
    };

    if (isLoading) {
        return (
            <div className={`fixed inset-0 z-[200] ${isLight ? 'bg-[#b4d9c7]' : 'bg-[#050505]'} flex items-center justify-center`}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full border-4 border-[#3CB371]/20 border-t-[#3CB371] animate-spin" />
                    <p className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                        Preparing Vault...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={`fixed inset-0 h-[100dvh] z-[200] ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'} overflow-hidden flex flex-col`}>
            
            {/* Hidden Capture Container */}
            <div id="qr-capture-container" className="fixed left-[-9999px] top-[-9999px] w-[400px] p-10 flex flex-col items-center justify-center gap-6"
                style={{ backgroundColor: isLight ? '#ffffff' : '#0a0a0a' }}>
                <img src={isLight ? "https://15market.com/goblogo.png" : "https://15market.com/gowlogo.png"} className="h-12 w-auto mb-2" alt="Logo" />
                <p className={`text-sm italic font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>15market.com</p>
                <div className={`p-4 rounded-3xl bg-white shadow-xl`}>
                    <img src={qrCodeData} alt="QR" className="w-64 h-64" />
                </div>
                <div className="text-center">
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Address ({currentWallet.label})</p>
                    <p className={`text-xs font-black font-mono break-all ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>{currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address}</p>
                </div>
            </div>

            {/* Sticky Header */}
            <div className={`px-4 pt-6 flex items-center justify-between backdrop-blur-xl border-b safe-top ${isLight ? 'bg-white/80 border-black/5' : 'bg-black/80 border-white/5'} h-20 shrink-0`}>
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className={`p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h2 className={`text-base font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Transfer Hub</h2>
                        <p className={`text-[8px] font-bold uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-[#3CB371]'}`}>Swipe to Switch Wallets</p>
                    </div>
                </div>
                <button onClick={() => fetchWalletInfo(true)} className={`p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/5 hover:bg-white/10 text-white'} ${isRefreshing ? 'animate-spin' : ''}`}>
                    <RefreshCw size={18} />
                </button>
            </div>

            <div className="flex-1 w-full max-w-lg mx-auto px-4 py-2 flex flex-col gap-2 overflow-hidden">
                
                {/* Swipeable Wallet Card */}
                <div className="relative h-[160px] md:h-[220px] w-full mt-0">
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
                            className={`w-full h-full p-6 md:p-10 rounded-[40px] border relative overflow-hidden flex flex-col justify-between cursor-grab active:cursor-grabbing ${isLight ? 'bg-white border-black/5 shadow-[0_40px_100px_rgba(0,0,0,0.15)]' : 'bg-[#111] border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.6)]'}`}
                        >
                            {/* Animated Background Glow */}
                            <motion.div 
                                animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                                transition={{ duration: 4, repeat: Infinity }}
                                className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px]"
                                style={{ backgroundColor: currentWallet.color }}
                            />

                            <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center`} style={{ backgroundColor: `${currentWallet.color}15` }}>
                                        <currentWallet.icon size={24} style={{ color: currentWallet.color }} />
                                    </div>
                                    <div>
                                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>{currentWallet.label}</p>
                                        <p className="text-[8px] font-bold text-[#3CB371] uppercase tracking-widest">Active Session</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    {walletOptions.map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${activeWalletIdx === i ? 'w-4 bg-[#3CB371]' : 'bg-white/20'}`} />
                                    ))}
                                </div>
                            </div>

                            <div className="relative z-10">
                                <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Available Balance</p>
                                <h1 className={`text-4xl md:text-5xl font-black tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>
                                    {currentWallet.bal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    <span className="text-xl md:text-2xl opacity-20 ml-2">USDC</span>
                                </h1>
                            </div>

                            <div className="flex items-center gap-2 relative z-10">
                                <Shield size={12} className="text-[#3CB371]" />
                                <p className={`text-[9px] font-bold uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>
                                    Encrypted & Deterministic Vault
                                </p>
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Primary Actions */}
                <div className="grid grid-cols-2 gap-3 shrink-0">
                    <button 
                        onClick={() => setShowSendModal(true)}
                        className="flex items-center justify-center gap-3 bg-[#3CB371] text-black font-black py-5 rounded-[24px] text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-xl shadow-[#3CB371]/20"
                    >
                        <Send size={16} /> Send
                    </button>
                    <button 
                        onClick={() => setShowReceiveModal(true)}
                        className={`flex items-center justify-center gap-3 ${isLight ? 'bg-black text-white' : 'bg-white text-black'} font-black py-5 rounded-[24px] text-xs uppercase tracking-widest active:scale-[0.95] transition-all`}
                    >
                        <ArrowDownLeft size={16} /> Receive
                    </button>
                </div>

                {/* Secondary Section - Tokens or History */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center gap-6 mb-2 border-b border-white/5 shrink-0">
                        <button onClick={() => setActiveTab('assets')} className={`pb-2 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'assets' ? 'text-[#3CB371]' : 'text-white/20'}`}>
                            Assets & Funding
                            {activeTab === 'assets' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3CB371]" />}
                        </button>
                        <button onClick={() => setActiveTab('history')} className={`pb-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? 'text-[#3CB371]' : 'text-white/20'}`}>
                            Activity
                            {activeTab === 'history' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3CB371]" />}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-10">
                        {activeTab === 'assets' ? (
                            <div className="flex flex-col gap-4">
                                {currentWallet.key === 'main' ? (
                                    <div className="flex flex-col gap-2">
                                        <div className={`p-2 px-4 rounded-[32px] border ${isLight ? 'bg-white border-black/5 shadow-sm' : 'bg-[#111] border-white/5'} flex flex-col gap-2`}>
                                            <div className="flex items-center justify-between">
                                                <h3 className={`text-[10px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Funding Assets</h3>
                                                <div className="flex gap-1">
                                                    {SUPPORTED_TOKENS.map((_, i) => (
                                                        <div key={i} className={`w-1 h-1 rounded-full ${activeTokenIdx === i ? 'bg-[#3CB371]' : 'bg-white/10'}`} />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="relative h-[200px] w-full flex items-center justify-center overflow-hidden">
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
                                                        <div className="flex items-center justify-center mb-0 relative">
                                                            <img 
                                                                 src={selectedToken.icon} 
                                                                 className="w-48 h-48 object-contain drop-shadow-[0_0_60px_rgba(60,179,113,0.5)]" 
                                                                 style={{ filter: isLight ? 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' : 'none' }}
                                                                 alt={selectedToken.symbol} 
                                                            />
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-32">
                                                                <p className={`text-4xl font-black ${isLight ? 'text-black' : 'text-white'} drop-shadow-2xl`}>{selectedToken.symbol}</p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>

                                            <button 
                                                onClick={() => setShowUnifiedFunding(true)}
                                                className="w-full py-4 rounded-2xl bg-[#3CB371]/10 text-[#3CB371] border border-[#3CB371]/20 font-black uppercase text-[10px] tracking-widest hover:bg-[#3CB371]/20 transition-all"
                                            >
                                                Fund Trading Wallet with {selectedToken.symbol}
                                            </button>
                                        </div>

                                        <div className={`p-4 rounded-[32px] border border-dashed flex items-start gap-4 ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                                            <Info size={18} className="text-[#3CB371] shrink-0" />
                                            <p className={`text-[9px] font-bold uppercase leading-relaxed ${isLight ? 'text-black/60' : 'text-white/40'}`}>
                                                Swipe to select token. Unified funding swaps any asset to USDC and deposits it into your Vault for zero-latency execution.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <div className={`p-6 rounded-[32px] border ${isLight ? 'bg-white border-black/5' : 'bg-[#111] border-white/5'} flex items-center justify-between group`}>
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center">
                                                    <Zap size={20} className="text-[#3CB371]" />
                                                </div>
                                                <div>
                                                    <h3 className={`text-base font-black ${isLight ? 'text-black' : 'text-white'}`}>Active Vault</h3>
                                                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Arc Testnet Node</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-lg font-black ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>{sessionBalance.toFixed(2)}</p>
                                                <p className="text-[9px] font-bold opacity-40 uppercase">USDC</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setShowUnifiedFunding(true)}
                                            className="w-full py-5 rounded-[28px] bg-white/5 border border-white/5 text-white/40 font-black uppercase text-[10px] tracking-widest hover:bg-white/10 hover:text-white transition-all"
                                        >
                                            Deposit more assets
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {walletInfo?.transactions?.map((tx, i) => (
                                    <div key={i} className={`p-6 rounded-[32px] border ${isLight ? 'bg-white border-black/5 shadow-sm' : 'bg-[#111] border-white/5'} flex items-center justify-between`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${tx.type === 'OUTGOING' ? 'bg-orange-500/10 text-orange-500' : 'bg-[#3CB371]/10 text-[#3CB371]'}`}>
                                                {tx.type === 'OUTGOING' ? <Send size={20} /> : <ArrowDownLeft size={20} />}
                                            </div>
                                            <div>
                                                <p className={`text-xs font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{tx.type}</p>
                                                <p className="text-[9px] font-bold opacity-40 uppercase">{new Date(tx.createDate).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <p className={`text-base font-black ${tx.type === 'OUTGOING' ? 'text-orange-500' : 'text-[#3CB371]'}`}>
                                            {tx.type === 'OUTGOING' ? '-' : '+'}{tx.amounts?.[0] || '0.00'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals Integrated */}
            <AnimatePresence>
                {showSendModal && (
                    <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSendModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className={`w-full md:max-w-md relative z-10 p-6 md:p-8 rounded-t-[40px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} max-h-[92dvh] overflow-y-auto`}>
                            <div className="flex items-center justify-between mb-8">
                                <h3 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Send Assets</h3>
                                <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                            </div>
                            
                            <div className="flex flex-col gap-6">
                                <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-[#3CB371]/20`}>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Source Wallet</p>
                                    <p className={`text-sm font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{currentWallet.label}</p>
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
                                <h3 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Receive</h3>
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
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Deposit to {currentWallet.label}</p>
                                <p className={`text-xs font-black font-mono break-all ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>{currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 w-full">
                                <button onClick={() => { navigator.clipboard.writeText(currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address); notify("Copied!", "success"); }} className={`flex items-center justify-center gap-3 ${isLight ? 'bg-black text-white' : 'bg-[#3CB371] text-black'} font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest transition-all`}>
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
                onSuccess={() => fetchWalletInfo(true)}
            />
        </div>
    );
}
