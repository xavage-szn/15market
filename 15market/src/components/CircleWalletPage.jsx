import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check, ArrowLeft, History, Wallet, Globe, Info, ChevronDown, Download, Save } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
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
    const [showSendModal, setShowSendModal] = useState(initialMode === 'send');
    const [showReceiveModal, setShowReceiveModal] = useState(initialMode === 'receive');
    const [sendAmount, setSendAmount] = useState("");
    const [destAddress, setDestAddress] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [qrCodeData, setQrCodeData] = useState("");
    const [activeTab, setActiveTab] = useState('assets'); 
    const [walletSource, setWalletSource] = useState('trading'); // Source for sending
    const [receiveSource, setReceiveSource] = useState('trading'); // Source for receiving
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);
    const [showReceiveDropdown, setShowReceiveDropdown] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showUnifiedFunding, setShowUnifiedFunding] = useState(false);


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
        const receiveAddr = receiveSource === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address;
        
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
    }, [walletInfo, showReceiveModal, isLight, receiveSource, address]);

    const handleDownloadQR = async () => {
        const captureElement = document.getElementById('qr-capture-container');
        if (!captureElement) return;

        setIsDownloading(true);
        notify("Generating Image...", "pending");

        try {
            // Wait a bit to ensure fonts/images are ready
            await new Promise(r => setTimeout(r, 100));

            const dataUrl = await toPng(captureElement, {
                pixelRatio: 2,
                backgroundColor: isLight ? '#ffffff' : '#0a0a0a',
            });
            
            const link = document.createElement('a');
            link.download = `15market-qr-${receiveSource}.png`;
            link.href = dataUrl;
            link.click();
            
            notify("QR Code Saved!", "success");
        } catch (err) {
            console.error("Download Error:", err);
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
            if (walletSource === 'trading') {
                if (!onWithdraw) throw new Error("Withdrawal function not available");
                await onWithdraw(amt, destAddress);
                setShowSendModal(false);
                setSendAmount("");
                setDestAddress("");
            } else if (walletSource === 'main') {
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

    const walletOptions = [
        { key: 'trading', label: 'Trading Wallet', bal: parseFloat(sessionBalance || 0), icon: Zap },
        { key: 'main',    label: 'Main Wallet',    bal: parseFloat(evmBalance || '0'),   icon: Wallet },
    ];

    const currentSource = walletOptions.find(o => o.key === walletSource) || walletOptions[0];
    const currentReceiveSource = walletOptions.find(o => o.key === receiveSource) || walletOptions[0];
    const receiveAddr = receiveSource === 'trading' && walletInfo?.wallet?.address ? walletInfo.wallet.address : address;

    return (
        <div className={`fixed inset-0 h-[100dvh] z-[200] ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'} overflow-y-auto custom-scrollbar flex flex-col`}>
            
            {/* Hidden Capture Container for Download */}
            <div id="qr-capture-container" className="fixed left-[-9999px] top-[-9999px] w-[400px] p-10 flex flex-col items-center justify-center gap-6"
                style={{ backgroundColor: isLight ? '#ffffff' : '#0a0a0a' }}>
                <img src={isLight ? "https://15market.com/goblogo.png" : "https://15market.com/gowlogo.png"} className="h-12 w-auto mb-2" alt="Logo" />
                <p className={`text-sm italic font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>15market.com</p>
                <div className={`p-4 rounded-3xl bg-white shadow-xl`}>
                    <img src={qrCodeData} alt="QR" className="w-64 h-64" />
                </div>
                <div className="text-center">
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Receive Address ({receiveSource})</p>
                    <p className={`text-xs font-black font-mono break-all ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>{receiveAddr}</p>
                </div>
                <div className={`w-full p-4 rounded-2xl border-2 border-[#3CB371]/20 bg-[#3CB371]/5 text-center`}>
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#3CB371]">
                        Warning: Only USDC should be sent to this address on the Arc Network.
                    </p>
                </div>
            </div>

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
                        </div>

                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Total Available</p>
                        <h1 className={`text-3xl md:text-6xl font-black ${isLight ? 'text-black' : 'text-white'} tracking-tighter mb-4`}>
                            {(parseFloat(evmBalance) + parseFloat(sessionBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-base md:text-xl opacity-20 ml-2">USDC</span>
                        </h1>

                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                            <button 
                                onClick={() => setShowSendModal(true)}
                                className="flex items-center justify-center gap-2 bg-[#3CB371] text-black font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#3CB371]/20"
                            >
                                <Send size={14} /> Send
                            </button>
                            <button 
                                onClick={() => setShowReceiveModal(true)}
                                className={`flex items-center justify-center gap-2 ${isLight ? 'bg-black text-white' : 'bg-white text-black'} font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest active:scale-[0.98] transition-all`}
                            >
                                <ArrowDownLeft size={14} /> Receive
                            </button>
                        </div>
                    </div>
                </motion.div>

                <div className="flex items-center gap-6 border-b border-white/5">
                    <button 
                        onClick={() => setActiveTab('assets')}
                        className={`pb-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'assets' ? (isLight ? 'text-black' : 'text-[#3CB371]') : 'text-white/20 hover:text-white/40'}`}
                    >
                        Wallets
                        {activeTab === 'assets' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3CB371] rounded-t-full" />}
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`pb-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? (isLight ? 'text-black' : 'text-[#3CB371]') : 'text-white/20 hover:text-white/40'}`}
                    >
                        Activity
                        {activeTab === 'history' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3CB371] rounded-t-full" />}
                    </button>
                </div>

                <div className="flex-1 min-h-0">
                    {activeTab === 'assets' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {walletOptions.map((opt) => (
                                <div key={opt.key} className={`p-6 rounded-3xl border ${isLight ? 'bg-white border-black/5 shadow-sm' : 'bg-[#111] border-white/5 shadow-xl'} flex flex-col gap-4 transition-all hover:border-[#3CB371]/30 group`}>
                                    <div className="flex items-center justify-between">
                                        <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center transition-transform group-hover:scale-110">
                                            <opt.icon size={24} className="text-[#3CB371]" />
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-[10px] font-black uppercase tracking-widest opacity-40`}>{opt.label}</p>
                                            <p className={`text-xl font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                                {opt.bal.toFixed(2)} <span className="text-[10px] opacity-40">USDC</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-2">
                                        <button 
                                            onClick={() => {
                                                if (opt.key === 'trading') {
                                                    setShowUnifiedFunding(true);
                                                } else {
                                                    setWalletSource(opt.key);
                                                    setShowSendModal(true);
                                                }
                                            }}

                                            className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest ${isLight ? 'bg-black text-white' : 'bg-white/5 text-white hover:bg-white/10'} transition-all`}
                                        >
                                            Send
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setReceiveSource(opt.key);
                                                setShowReceiveModal(true);
                                            }}
                                            className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-[#3CB371]/10 text-[#3CB371] border border-[#3CB371]/20 hover:bg-[#3CB371]/20 transition-all`}
                                        >
                                            Receive
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {!walletInfo?.transactions?.length ? (
                                <div className={`p-12 rounded-3xl border border-dashed flex flex-col items-center justify-center gap-4 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                                    <History size={48} className="opacity-10" />
                                    <p className={`text-[12px] font-black uppercase tracking-widest opacity-20`}>No transaction history</p>
                                </div>
                            ) : (
                                walletInfo.transactions.map((tx, i) => {
                                    const isOut = tx.type === 'OUTGOING';
                                    return (
                                        <div key={i} className={`p-6 rounded-3xl flex items-center justify-between border ${isLight ? 'bg-white border-black/5 shadow-sm' : 'bg-[#111] border-white/5 shadow-xl'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${isOut ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-[#3CB371]/10 border-[#3CB371]/20 text-[#3CB371]'}`}>
                                                    {isOut ? <Send size={20} /> : <ArrowDownLeft size={20} />}
                                                </div>
                                                <div>
                                                    <h3 className={`text-base font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{tx.type}</h3>
                                                    <p className="text-[10px] font-bold opacity-40 uppercase">{new Date(tx.createDate).toLocaleDateString()} • {new Date(tx.createDate).toLocaleTimeString()}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-lg font-black ${isOut ? 'text-orange-500' : 'text-[#3CB371]'}`}>
                                                    {isOut ? '-' : '+'}{tx.amounts?.[0] || '0.00'}
                                                </p>
                                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${tx.state === 'COMPLETE' ? 'bg-[#3CB371]/10 text-[#3CB371]' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                    {tx.state}
                                                </span>
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
                    <p className={`text-[11px] font-bold uppercase tracking-wide leading-relaxed ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                        Unified Transfer Hub allows you to move assets from your Trading or Main wallet to any external address on the Arc Network.
                    </p>
                </div>
            </div>

            <AnimatePresence>
                {showSendModal && (() => {
                    const sourceBalance = walletSource === 'main' ? parseFloat(evmBalance || '0') : parseFloat(sessionBalance || 0);
                    return (
                        <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSendModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                            <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }} className={`w-full md:max-w-md relative z-10 p-5 md:p-8 rounded-t-[32px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} max-h-[92dvh] overflow-y-auto`}>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Send Assets</h3>
                                    <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                                </div>
                                
                                <div className="mb-6 relative">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Source Wallet</label>
                                    <button onClick={() => setShowSourceDropdown(!showSourceDropdown)} className={`w-full flex items-center justify-between p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 ${showSourceDropdown ? 'border-[#3CB371]' : 'border-transparent'} transition-all`}>
                                        <div className="flex items-center gap-3">
                                            <currentSource.icon size={16} className="text-[#3CB371]" />
                                            <div className="text-left">
                                                <p className={`text-[12px] font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{currentSource.label}</p>
                                                <p className="text-[10px] font-bold text-[#3CB371] uppercase">{currentSource.bal.toFixed(2)} USDC</p>
                                            </div>
                                        </div>
                                        <ChevronDown size={18} className={`transition-transform duration-300 ${showSourceDropdown ? 'rotate-180' : ''}`} />
                                    </button>
                                    <AnimatePresence>
                                        {showSourceDropdown && (
                                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`absolute top-full left-0 right-0 mt-2 z-50 p-2 rounded-2xl border ${isLight ? 'bg-white border-black/5 shadow-2xl' : 'bg-[#151515] border-white/5 shadow-2xl'}`}>
                                                {walletOptions.map((opt) => (
                                                    <button key={opt.key} onClick={() => { setWalletSource(opt.key); setShowSourceDropdown(false); setSendAmount(""); }} className={`w-full flex items-center justify-between p-3 rounded-xl ${walletSource === opt.key ? 'bg-[#3CB371]/10' : 'hover:bg-white/5'}`}>
                                                        <div className="flex items-center gap-3">
                                                            <opt.icon size={14} className={walletSource === opt.key ? 'text-[#3CB371]' : 'opacity-40'} />
                                                            <span className={`text-[11px] font-black uppercase ${walletSource === opt.key ? 'text-[#3CB371]' : ''}`}>{opt.label}</span>
                                                        </div>
                                                        <span className="text-[10px] font-black opacity-40">{opt.bal.toFixed(2)}</span>
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="flex flex-col gap-5">
                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Destination Address</label>
                                        <input type="text" placeholder="0x..." value={destAddress} onChange={(e) => setDestAddress(e.target.value)} className={`w-full py-4 px-5 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-transparent focus:border-[#3CB371]/30 outline-none text-sm font-bold transition-all`} />
                                    </div>
                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Amount (USDC)</label>
                                        <div className="relative">
                                            <input type="number" placeholder="0.00" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className={`w-full py-4 px-5 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-transparent focus:border-[#3CB371]/30 outline-none text-xl font-black transition-all`} />
                                            <button onClick={() => setSendAmount(sourceBalance.toFixed(4))} className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#3CB371] uppercase hover:underline">Max</button>
                                        </div>
                                    </div>
                                    <button onClick={handleSend} disabled={isSending} className="w-full bg-[#3CB371] text-black font-black py-5 rounded-[24px] uppercase tracking-widest mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#3CB371]/20">
                                        {isSending ? 'Authorizing...' : 'Confirm & Send'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    );
                })()}

                {showReceiveModal && (
                    <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowReceiveModal(false); setShowReceiveDropdown(false); }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }} className={`w-full md:max-w-md relative z-10 p-5 md:p-8 rounded-t-[32px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-white border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} flex flex-col items-center max-h-[92dvh] overflow-y-auto`}>
                            <div className="flex items-center justify-between w-full mb-6">
                                <h3 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Receive Assets</h3>
                                <button onClick={() => setShowReceiveModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                            </div>

                            <div className="w-full mb-6 relative">
                                <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Destination Wallet</label>
                                <button onClick={() => setShowReceiveDropdown(!showReceiveDropdown)} className={`w-full flex items-center justify-between p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 ${showReceiveDropdown ? 'border-[#3CB371]' : 'border-transparent'} transition-all`}>
                                    <div className="flex items-center gap-3">
                                        <currentReceiveSource.icon size={16} className="text-[#3CB371]" />
                                        <span className={`text-[12px] font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>{currentReceiveSource.label}</span>
                                    </div>
                                    <ChevronDown size={18} className={`transition-transform duration-300 ${showReceiveDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {showReceiveDropdown && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`absolute top-full left-0 right-0 mt-2 z-50 p-2 rounded-2xl border ${isLight ? 'bg-white border-black/5 shadow-2xl' : 'bg-[#151515] border-white/5 shadow-2xl'}`}>
                                            {walletOptions.map((opt) => (
                                                <button key={opt.key} onClick={() => { setReceiveSource(opt.key); setShowReceiveDropdown(false); }} className={`w-full flex items-center gap-3 p-3 rounded-xl ${receiveSource === opt.key ? 'bg-[#3CB371]/10' : 'hover:bg-white/5'}`}>
                                                    <opt.icon size={14} className={receiveSource === opt.key ? 'text-[#3CB371]' : 'opacity-40'} />
                                                    <span className={`text-[11px] font-black uppercase ${receiveSource === opt.key ? 'text-[#3CB371]' : ''}`}>{opt.label}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className={`p-4 rounded-3xl ${isLight ? 'bg-white' : 'bg-white'} mb-6 shadow-2xl relative group overflow-hidden`}>
                                {qrCodeData ? (
                                    <>
                                        <img src={qrCodeData} alt="QR Code" className="w-64 h-64" />
                                        <button onClick={handleDownloadQR} disabled={isDownloading} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all backdrop-blur-[2px]">
                                            <Download size={32} className="text-[#3CB371] mb-2" />
                                            <span className="text-[10px] font-black uppercase text-white tracking-widest">Save Image</span>
                                        </button>
                                    </>
                                ) : <RefreshCw size={32} className="animate-spin text-black/20" />}
                            </div>

                            <div className={`w-full p-6 rounded-3xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-dashed text-center mb-6`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-40`}>Receive Address</p>
                                <p className={`text-sm font-black font-mono break-all ${isLight ? 'text-black' : 'text-[#3CB371]'}`}>{receiveAddr}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 w-full">
                                <button onClick={() => { navigator.clipboard.writeText(receiveAddr); notify("Address copied!", "success"); }} className={`flex items-center justify-center gap-3 ${isLight ? 'bg-black text-white' : 'bg-[#3CB371] text-black'} font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all`}>
                                    <Copy size={16} /> Copy
                                </button>
                                <button onClick={handleDownloadQR} disabled={isDownloading} className={`flex items-center justify-center gap-3 ${isLight ? 'bg-black/5' : 'bg-white/5'} border ${isLight ? 'border-black/10' : 'border-white/10'} font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all`}>
                                    {isDownloading ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} Save Image
                                </button>
                            </div>
                            
                            <p className={`text-[9px] font-black uppercase tracking-widest mt-6 text-center leading-relaxed ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                <span className="text-[#3CB371]">Warning:</span> Only <span className="text-[#3CB371]">USDC</span> should be sent to this address on the Arc Network. Sending assets on other chains will result in permanent loss.
                            </p>
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
                onSuccess={() => fetchWalletInfo(true)}
            />
        </div>

    );
}
