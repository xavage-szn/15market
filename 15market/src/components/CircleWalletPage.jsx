import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check, ArrowLeft, History, Wallet, Globe, Info } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import QRCode from 'qrcode';

export function CircleWalletPage({ address, isLight, notify, onBack, initialMode }) {
    const [walletInfo, setWalletInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showSendModal, setShowSendModal] = useState(initialMode === 'send');
    const [showReceiveModal, setShowReceiveModal] = useState(initialMode === 'receive');
    const [sendAmount, setSendAmount] = useState("");
    const [destAddress, setDestAddress] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [qrCodeData, setQrCodeData] = useState("");
    const [activeTab, setActiveTab] = useState('assets'); // 'assets' or 'history'

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
            notify("Failed to load Circle Wallet", "error");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchWalletInfo();
    }, [address]);

    useEffect(() => {
        if (walletInfo?.wallet?.address && showReceiveModal) {
            QRCode.toDataURL(walletInfo.wallet.address, {
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
    }, [walletInfo, showReceiveModal, isLight]);

    const handleSend = async () => {
        if (!destAddress || !sendAmount) {
            notify("Please fill in all fields", "error");
            return;
        }

        setIsSending(true);
        notify("Initiating Transfer...", "pending");

        try {
            const token = walletInfo.balances.find(b => b.token.symbol === 'USDC') || walletInfo.balances[0];
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
                fetchWalletInfo(true);
            } else {
                const data = await res.json();
                throw new Error(data.error || "Transfer failed");
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
                        Accessing Circle Citadel...
                    </p>
                </div>
            </div>
        );
    }

    const usdcBalance = walletInfo?.balances?.find(b => b.token.symbol === 'USDC')?.amount || "0.00";
    const transactions = walletInfo?.transactions || [];

    return (
        <div className={`fixed inset-0 z-[200] ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'} overflow-y-auto custom-scrollbar flex flex-col`}>
            {/* Header */}
            <div className={`sticky top-0 z-30 p-6 flex items-center justify-between backdrop-blur-xl border-b ${isLight ? 'bg-white/80 border-black/5' : 'bg-black/80 border-white/5'}`}>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Circle Managed Wallet</h2>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-[#3CB371]'}`}>Secure MPC Infrastructure</p>
                    </div>
                </div>
                <button 
                    onClick={() => fetchWalletInfo(true)}
                    className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/5 hover:bg-white/10 text-white'} ${isRefreshing ? 'animate-spin' : ''}`}
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-8 flex flex-col gap-8">
                {/* Balance Card */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-8 rounded-[40px] relative overflow-hidden group border ${isLight ? 'bg-white border-black/5 shadow-xl' : 'bg-[#111] border-white/5 shadow-2xl'}`}
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#3CB371]/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
                    
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3CB371]/10 border border-[#3CB371]/20">
                                <Globe size={12} className="text-[#3CB371]" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#3CB371]">
                                    {walletInfo?.wallet?.blockchain?.replace('-', ' ')} Network
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#3CB371] animate-pulse" />
                                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Shielded & Active</span>
                            </div>
                        </div>

                        <p className={`text-[12px] font-black uppercase tracking-[0.2em] mb-2 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Current Balance</p>
                        <h1 className={`text-5xl md:text-6xl font-black ${isLight ? 'text-black' : 'text-white'} tracking-tighter mb-8`}>
                            {parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xl opacity-20 ml-3">USDC</span>
                        </h1>

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-8 border-t border-white/5">
                            <div className="flex items-center gap-4">
                                <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Your Address</p>
                                    <div className="flex items-center gap-3">
                                        <code className={`text-sm md:text-base font-black font-mono ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>
                                            {truncate(walletInfo?.wallet?.address)}
                                        </code>
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(walletInfo?.wallet?.address);
                                                notify("Address copied!", "success");
                                            }}
                                            className="p-2 hover:bg-[#3CB371]/10 rounded-lg transition-colors"
                                        >
                                            <Copy size={16} className="text-[#3CB371]" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setShowSendModal(true)}
                                    className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-[#3CB371] text-black font-black px-8 py-4 rounded-2xl text-[12px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#3CB371]/20"
                                >
                                    <Send size={18} />
                                    Send
                                </button>
                                <button 
                                    onClick={() => setShowReceiveModal(true)}
                                    className={`flex-1 md:flex-none flex items-center justify-center gap-3 ${isLight ? 'bg-black text-white hover:bg-black/90' : 'bg-white text-black hover:bg-white/90'} font-black px-8 py-4 rounded-2xl text-[12px] uppercase tracking-widest active:scale-[0.98] transition-all`}
                                >
                                    <ArrowDownLeft size={18} />
                                    Receive
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Tabs */}
                <div className="flex items-center gap-8 border-b border-white/5 mb-4">
                    <button 
                        onClick={() => setActiveTab('assets')}
                        className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'assets' ? (isLight ? 'text-black' : 'text-[#3CB371]') : 'text-white/20 hover:text-white/40'}`}
                    >
                        Assets
                        {activeTab === 'assets' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-[#3CB371] rounded-t-full" />}
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`pb-4 text-[12px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? (isLight ? 'text-black' : 'text-[#3CB371]') : 'text-white/20 hover:text-white/40'}`}
                    >
                        History
                        {activeTab === 'history' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-[#3CB371] rounded-t-full" />}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1">
                    {activeTab === 'assets' ? (
                        <div className="flex flex-col gap-4">
                            {walletInfo?.balances?.map((bal, i) => (
                                <div key={i} className={`p-6 rounded-3xl flex items-center justify-between border ${isLight ? 'bg-white border-black/5' : 'bg-[#111] border-white/5'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center border border-[#3CB371]/20">
                                            <Zap size={24} className="text-[#3CB371]" />
                                        </div>
                                        <div>
                                            <h3 className={`text-lg font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{bal.token.symbol}</h3>
                                            <p className={`text-[10px] font-bold uppercase opacity-40`}>{bal.token.name}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-xl font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                            {parseFloat(bal.amount).toLocaleString()}
                                        </p>
                                        <p className="text-[10px] font-bold opacity-40 uppercase">Balance</p>
                                    </div>
                                </div>
                            ))}
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
                            Circle Managed Wallets use Multi-Party Computation (MPC) to ensure your keys are never stored in a single location. Transfers to external wallets are broadcast directly to the blockchain.
                        </p>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showSendModal && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSendModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className={`w-full max-w-md relative z-10 p-8 rounded-[40px] border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'}`}
                        >
                            <div className="flex items-center justify-between mb-8">
                                <h3 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>External Transfer</h3>
                                <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-6">
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
                                            onClick={() => setSendAmount(usdcBalance)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#3CB371] uppercase hover:underline"
                                        >
                                            Max
                                        </button>
                                    </div>
                                    <p className={`text-[9px] font-bold uppercase mt-2 ${isLight ? 'text-black/20' : 'text-white/20'}`}>
                                        Available: {parseFloat(usdcBalance).toFixed(2)} USDC
                                    </p>
                                </div>

                                <button 
                                    onClick={handleSend}
                                    disabled={isSending}
                                    className="w-full bg-[#3CB371] text-black font-black py-5 rounded-[24px] text-[14px] uppercase tracking-widest mt-4 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#3CB371]/20"
                                >
                                    {isSending ? "Authorizing MPC..." : "Confirm & Send"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showReceiveModal && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowReceiveModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className={`w-full max-w-md relative z-10 p-8 rounded-[40px] border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} flex flex-col items-center`}
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
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Citadel Deposit Address</p>
                                <p className={`text-sm md:text-base font-black font-mono break-all ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>
                                    {walletInfo?.wallet?.address}
                                </p>
                            </div>

                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(walletInfo?.wallet?.address);
                                    notify("Address copied!", "success");
                                }}
                                className={`w-full flex items-center justify-center gap-3 ${isLight ? 'bg-black text-white' : 'bg-[#3CB371] text-black'} font-black py-5 rounded-[24px] text-[12px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all`}
                            >
                                <Copy size={18} />
                                Copy Address
                            </button>

                            <p className={`text-[9px] font-black uppercase tracking-widest mt-6 text-center leading-relaxed ${isLight ? 'text-black/20' : 'text-white/20'}`}>
                                Only send USDC on {walletInfo?.wallet?.blockchain?.replace('-', ' ')} to this address.
                                Sending other assets may result in permanent loss.
                            </p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
