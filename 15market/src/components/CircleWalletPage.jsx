import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check, ArrowLeft, History, Wallet, Globe, Info, ChevronDown } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import QRCode from 'qrcode';

export function CircleWalletPage({ 
    address, 
    isLight, 
    notify, 
    onBack, 
    initialMode, 
    evmBalance = '0', 
    sessionBalance = 0,
    wallets = [],
    onWithdraw
}) {
    const [walletInfo, setWalletInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showSendModal, setShowSendModal] = useState(initialMode === 'send');
    const [showReceiveModal, setShowReceiveModal] = useState(initialMode === 'receive');
    const [sendAmount, setSendAmount] = useState("");
    const [destAddress, setDestAddress] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [qrCodeData, setQrCodeData] = useState("");
    const [activeTab, setActiveTab] = useState('assets'); 
    const [walletSource, setWalletSource] = useState('trading'); // Default to trading
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);

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
        // Generate QR for the current context - if receiving, we usually want to receive to the Main wallet or Trading wallet
        // But the original code was for Circle Wallet. Let's keep Circle as a deposit destination if it exists,
        // or allow switching destination. For now, let's just use the address passed as prop (Main).
        const receiveAddr = walletSource === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address;
        
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
    }, [walletInfo, showReceiveModal, isLight, walletSource, address]);

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
            if (walletSource === 'trading') {
                // Trading Wallet Transfer (Backend)
                if (!onWithdraw) throw new Error("Withdrawal function not available");
                await onWithdraw(amt, destAddress);
                setShowSendModal(false);
                setSendAmount("");
                setDestAddress("");
            } else if (walletSource === 'main') {
                // Main Wallet Transfer (Wagmi/Privy)
                const activeWallet = wallets[0];
                if (!activeWallet) throw new Error("No connected wallet found");

                notify("Confirming transaction...", "pending");
                
                // Use parseEther or similar if we assume 18 decimals for USDC on this chain
                // Actually, let's check the chain's USDC decimals. Usually 18 on EVM if it's a testnet variant.
                const txHash = await activeWallet.sendTransaction({
                    to: destAddress,
                    value: BigInt(Math.floor(amt * 1e18)).toString(), // Simple 18 decimal assumption for Arc Testnet
                });

                if (txHash) {
                    notify("Transfer Success!", "success");
                    setShowSendModal(false);
                    setSendAmount("");
                    setDestAddress("");
                }
            } else {
                // Legacy Circle Transfer
                const token = walletInfo?.balances?.find(b => b.token.symbol === 'USDC') || walletInfo?.balances?.[0];
                if (!token) throw new Error("No tokens available to send");

                const res = await fetch(`${KEEPER_URL_ARC}/circle/transfer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        address,
                        destinationAddress: destAddress,
                        amount: sendAmount,
                        tokenId: token.token.id
                    })
                });

                if (res.ok) {
                    notify("Transfer Broadcasted!", "success");
                    setShowSendModal(false);
                    setSendAmount("");
                    setDestAddress("");
                } else {
                    const data = await res.json();
                    throw new Error(data.error || "Transfer failed");
                }
            }
        } catch (err) {
            notify(err.message, "error");
        } finally {
            setIsSending(false);
        }
    };

    const truncate = (str) => str ? `${str.slice(0, 8)}...${str.slice(-6)}` : "";

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

    const usdcBalance = walletInfo?.balances?.find(b => b.token.symbol === 'USDC')?.amount || "0.00";
    const transactions = walletInfo?.transactions || [];

    const walletOptions = [
        { key: 'trading', label: 'Trading Wallet', bal: parseFloat(sessionBalance || 0), icon: Zap },
        { key: 'main',    label: 'Main Wallet',    bal: parseFloat(evmBalance || '0'),   icon: Wallet },
    ];

    const currentSource = walletOptions.find(o => o.key === walletSource) || walletOptions[0];

    return (
        <div className={`fixed inset-0 h-[100dvh] z-[200] ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'} overflow-y-auto custom-scrollbar flex flex-col`}>
            <div className={`sticky top-0 z-[350] px-4 flex items-center justify-between backdrop-blur-xl border-b safe-top ${isLight ? 'bg-white/80 border-black/5' : 'bg-black/80 border-white/5'} h-16 md:h-24`}>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onBack}
                        className={`p-2 md:p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h2 className={`text-base md:text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Transfer Hub</h2>
                        <p className={`text-[8px] font-bold uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-[#3CB371]'}`}>Unified Assets</p>
                    </div>
                </div>
                <button 
                    onClick={() => fetchWalletInfo(true)}
                    className={`p-2 md:p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/5 hover:bg-white/10 text-white'} ${isRefreshing ? 'animate-spin' : ''}`}
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 flex flex-col gap-4 md:gap-8">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-5 md:p-8 rounded-[28px] md:rounded-[40px] relative overflow-hidden border ${isLight ? 'bg-white border-black/5 shadow-xl' : 'bg-[#111] border-white/5 shadow-2xl'}`}
                >
                    <div className="absolute top-0 right-0 w-40 h-40 md:w-64 md:h-64 bg-[#3CB371]/5 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
                    
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#3CB371]/10 border border-[#3CB371]/20">
                                <Globe size={10} className="text-[#3CB371]" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#3CB371]">Arc Network</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#3CB371] animate-pulse" />
                                <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Secured</span>
                            </div>
                        </div>

                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Total Available</p>
                        <h1 className={`text-3xl md:text-6xl font-black ${isLight ? 'text-black' : 'text-white'} tracking-tighter mb-4`}>
                            {(parseFloat(evmBalance) + parseFloat(sessionBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-base md:text-xl opacity-20 ml-2">USDC</span>
                        </h1>

                        <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => setShowSendModal(true)}
                                    className="flex items-center justify-center gap-2 bg-[#3CB371] text-black font-black py-3 md:py-4 rounded-2xl text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#3CB371]/20"
                                >
                                    <Send size={14} />
                                    Send
                                </button>
                                <button 
                                    onClick={() => setShowReceiveModal(true)}
                                    className={`flex items-center justify-center gap-2 ${isLight ? 'bg-black text-white hover:bg-black/90' : 'bg-white text-black hover:bg-white/90'} font-black py-3 md:py-4 rounded-2xl text-[11px] uppercase tracking-widest active:scale-[0.98] transition-all`}
                                >
                                    <ArrowDownLeft size={14} />
                                    Receive
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="flex items-center gap-6 border-b border-white/5">
                    <button 
                        onClick={() => setActiveTab('assets')}
                        className={`pb-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'assets' ? (isLight ? 'text-black' : 'text-[#3CB371]') : 'text-white/20 hover:text-white/40'}`}
                    >
                        Wallets
                        {activeTab === 'assets' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3CB371] rounded-t-full" />}
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`pb-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? (isLight ? 'text-black' : 'text-[#3CB371]') : 'text-white/20 hover:text-white/40'}`}
                    >
                        History
                        {activeTab === 'history' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3CB371] rounded-t-full" />}
                    </button>
                </div>

                <div className="flex-1">
                    {activeTab === 'assets' ? (
                        <div className="flex flex-col gap-4">
                            <div className={`p-6 rounded-3xl flex items-center justify-between border ${isLight ? 'bg-white border-black/5' : 'bg-[#111] border-white/5'}`}>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center border border-[#3CB371]/20">
                                        <Zap size={24} className="text-[#3CB371]" />
                                    </div>
                                    <div>
                                        <h3 className={`text-lg font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>Trading Wallet</h3>
                                        <p className={`text-[10px] font-bold uppercase opacity-40`}>Session EOA</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xl font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                        {parseFloat(sessionBalance || 0).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] font-bold opacity-40 uppercase">USDC</p>
                                </div>
                            </div>
                            <div className={`p-6 rounded-3xl flex items-center justify-between border ${isLight ? 'bg-white border-black/5' : 'bg-[#111] border-white/5'}`}>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center border border-[#3CB371]/20">
                                        <Wallet size={24} className="text-[#3CB371]" />
                                    </div>
                                    <div>
                                        <h3 className={`text-lg font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>Main Wallet</h3>
                                        <p className={`text-[10px] font-bold uppercase opacity-40`}>Connected Wallet</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xl font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                        {parseFloat(evmBalance).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] font-bold opacity-40 uppercase">USDC</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {transactions.length === 0 ? (
                                <div className={`p-12 rounded-3xl border border-dashed flex flex-col items-center justify-center gap-4 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                                    <History size={48} className="opacity-10" />
                                    <p className={`text-[12px] font-black uppercase tracking-widest opacity-20`}>No transaction history</p>
                                </div>
                            ) : (
                                transactions.map((tx, i) => {
                                    const isOut = tx.type === 'OUTGOING';
                                    return (
                                        <div key={i} className={`p-6 rounded-3xl flex items-center justify-between border ${isLight ? 'bg-white border-black/5' : 'bg-[#111] border-white/5'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${isOut ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-[#3CB371]/10 border-[#3CB371]/20 text-[#3CB371]'}`}>
                                                    {isOut ? <Send size={20} /> : <ArrowDownLeft size={20} />}
                                                </div>
                                                <div>
                                                    <h3 className={`text-base font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                                                        {tx.type}
                                                    </h3>
                                                    <p className={`text-[10px] font-bold uppercase opacity-40`}>
                                                        {new Date(tx.createDate).toLocaleDateString()} • {new Date(tx.createDate).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-lg font-black ${isOut ? 'text-orange-500' : 'text-[#3CB371]'}`}>
                                                    {isOut ? '-' : '+'}{tx.amounts?.[0] || '0.00'}
                                                </p>
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${tx.state === 'COMPLETE' ? 'bg-[#3CB371]/10 text-[#3CB371]' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                        {tx.state}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                <div className={`p-6 rounded-3xl flex items-start gap-4 ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                    <Info size={20} className="text-[#3CB371] shrink-0" />
                    <div>
                        <p className={`text-[11px] font-bold uppercase tracking-wide leading-relaxed ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                            Unified Transfer Hub allows you to move assets from your Trading (Session) or Main wallet to any external address on the Arc Network.
                        </p>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showSendModal && (() => {
                    const sourceBalance =
                        walletSource === 'main'    ? parseFloat(evmBalance || '0') :
                        parseFloat(sessionBalance || 0); // trading

                    return (
                        <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => { setShowSendModal(false); setShowSourceDropdown(false); }}
                                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, y: 60 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 60 }}
                                className={`w-full md:max-w-md relative z-10 p-5 md:p-8 rounded-t-[32px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} max-h-[92dvh] overflow-y-auto`}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Send Assets</h3>
                                    <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="mb-6 relative">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Source Wallet</label>
                                    <button 
                                        onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                                        className={`w-full flex items-center justify-between p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 ${showSourceDropdown ? 'border-[#3CB371]' : 'border-transparent'} transition-all`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[#3CB371]/10 flex items-center justify-center">
                                                <currentSource.icon size={16} className="text-[#3CB371]" />
                                            </div>
                                            <div className="text-left">
                                                <p className={`text-[12px] font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{currentSource.label}</p>
                                                <p className="text-[10px] font-bold text-[#3CB371] uppercase">{currentSource.bal.toFixed(2)} USDC</p>
                                            </div>
                                        </div>
                                        <ChevronDown size={18} className={`transition-transform duration-300 ${showSourceDropdown ? 'rotate-180' : ''}`} />
                                    </button>

                                    <AnimatePresence>
                                        {showSourceDropdown && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className={`absolute top-full left-0 right-0 mt-2 z-50 p-2 rounded-2xl border ${isLight ? 'bg-white border-black/5 shadow-2xl' : 'bg-[#151515] border-white/5 shadow-2xl overflow-hidden'}`}
                                            >
                                                {walletOptions.map((opt) => (
                                                    <button
                                                        key={opt.key}
                                                        onClick={() => {
                                                            setWalletSource(opt.key);
                                                            setShowSourceDropdown(false);
                                                            setSendAmount("");
                                                        }}
                                                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${walletSource === opt.key ? 'bg-[#3CB371]/10 border border-[#3CB371]/20' : 'hover:bg-white/5'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <opt.icon size={14} className={walletSource === opt.key ? 'text-[#3CB371]' : 'opacity-40'} />
                                                            <span className={`text-[11px] font-black uppercase ${walletSource === opt.key ? 'text-[#3CB371]' : ''}`}>{opt.label}</span>
                                                        </div>
                                                        <span className={`text-[10px] font-black ${walletSource === opt.key ? 'text-[#3CB371]' : 'opacity-40'}`}>{opt.bal.toFixed(2)}</span>
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="flex flex-col gap-5">
                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Destination Address</label>
                                        <input
                                            type="text"
                                            placeholder="0x..."
                                            value={destAddress}
                                            onChange={(e) => setDestAddress(e.target.value)}
                                            className={`w-full py-4 px-5 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-transparent focus:border-[#3CB371]/30 outline-none text-sm font-bold transition-all`}
                                        />
                                    </div>
                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Amount (USDC)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={sendAmount}
                                                onChange={(e) => setSendAmount(e.target.value)}
                                                className={`w-full py-4 px-5 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-transparent focus:border-[#3CB371]/30 outline-none text-xl font-black transition-all`}
                                            />
                                            <button
                                                onClick={() => setSendAmount(sourceBalance.toFixed(4))}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#3CB371] uppercase hover:underline"
                                            >
                                                Max
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleSend}
                                        disabled={isSending}
                                        className="w-full bg-[#3CB371] text-black font-black py-5 rounded-[24px] text-[14px] uppercase tracking-widest mt-2 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#3CB371]/20"
                                    >
                                        {isSending ? 'Authorizing...' : 'Confirm & Send'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    );
                })()}

                {showReceiveModal && (
                    <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowReceiveModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, y: 60 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 60 }}
                            className={`w-full md:max-w-md relative z-10 p-5 md:p-8 rounded-t-[32px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} flex flex-col items-center max-h-[92dvh] overflow-y-auto`}
                        >
                            <div className="flex items-center justify-between w-full mb-8">
                                <h3 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Receive Assets</h3>
                                <button onClick={() => setShowReceiveModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className={`p-4 rounded-3xl ${isLight ? 'bg-white' : 'bg-white'} mb-8 shadow-2xl`}>
                                {qrCodeData ? (
                                    <img src={qrCodeData} alt="QR Code" className="w-64 h-64" />
                                ) : (
                                    <div className="w-64 h-64 flex items-center justify-center">
                                        <RefreshCw size={32} className="animate-spin text-black/20" />
                                    </div>
                                )}
                            </div>

                            <div className={`w-full p-6 rounded-3xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-dashed ${isLight ? 'border-black/10' : 'border-white/10'} text-center mb-6`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Receive Address</p>
                                <p className={`text-sm md:text-base font-black font-mono break-all ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>
                                    {walletSource === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address}
                                </p>
                            </div>

                            <button 
                                onClick={() => {
                                    const addr = walletSource === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address;
                                    navigator.clipboard.writeText(addr);
                                    notify("Address copied!", "success");
                                }}
                                className={`w-full flex items-center justify-center gap-3 ${isLight ? 'bg-black text-white' : 'bg-[#3CB371] text-black'} font-black py-5 rounded-[24px] text-[12px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all`}
                            >
                                <Copy size={18} />
                                Copy Address
                            </button>

                            <p className={`text-[9px] font-black uppercase tracking-widest mt-6 text-center leading-relaxed ${isLight ? 'text-black/20' : 'text-white/20'}`}>
                                Ensure you are sending USDC on the Arc Network. Sending assets on other chains will result in permanent loss.
                            </p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
