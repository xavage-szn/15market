import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Search, TrendingUp, Users, DollarSign, Activity, ChevronRight, ChevronUp, ChevronDown, CheckCircle, Copy, Wallet, Trophy, X, AlertCircle } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

export function CopyTradingPage({
    address,
    isLight,
    notify,
    onBack,
    profile
}) {
    const [mode, setMode] = useState('investor'); // 'investor' or 'trader'
    const [providers, setProviders] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [providerToCopy, setProviderToCopy] = useState(null);
    const [copyParams, setCopyParams] = useState({ mode: 'isolated', allocated: '', stakePerTrade: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isApplying, setIsApplying] = useState(false);
    const [appStep, setAppStep] = useState(0);
    const [appData, setAppData] = useState({ name: '', twitter: '', telegram: '', email: '', fee: '' });
    const [appSuccess, setAppSuccess] = useState(false);
    const [localPending, setLocalPending] = useState(false);

    // Wallet state
    const [hasCopyWallet, setHasCopyWallet] = useState(!!profile?.copyTradingWallet);
    const [isGeneratingWallet, setIsGeneratingWallet] = useState(false);

    // Provider list scroll refs
    const providerListRef = useRef(null);
    const scrollIntervalRef = useRef(null);

    const handleGenerateWallet = async () => {
        setIsGeneratingWallet(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/wallet/${address}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setHasCopyWallet(true);
                    notify("Copy Trading Wallet generated successfully!", "success");
                } else {
                    throw new Error('Wallet generation failed');
                }
            } else {
                throw new Error('Server error');
            }
        } catch (e) {
            notify(e.message || "Failed to generate wallet", "error");
        } finally {
            setIsGeneratingWallet(false);
        }
    };

    // Scroll provider list helpers
    const startScrolling = useCallback((direction, speed) => {
        stopScrolling();
        const el = providerListRef.current;
        if (!el) return;
        scrollIntervalRef.current = setInterval(() => {
            el.scrollTop += direction * speed;
        }, 16);
    }, []);

    const stopScrolling = useCallback(() => {
        if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopScrolling();
    }, [stopScrolling]);

    // Fetch Providers
    const fetchProviders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers`);
            if (res.ok) {
                const data = await res.json();
                setProviders(data.providers || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProviders();
    }, []);

    const handleApply = async () => {
        setIsApplying(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    primaryWallet: address,
                    name: appData.name,
                    twitter: appData.twitter,
                    telegram: appData.telegram,
                    email: appData.email,
                    copyFee: appData.fee,
                    onChainData: {
                        winRate: profile?.stats?.totalTrades > 0 ? ((profile.stats.totalWins / profile.stats.totalTrades) * 100).toFixed(1) + '%' : '0%',
                        volume: `$${(profile?.stats?.totalVolume || 0).toLocaleString()}`,
                        totalTrades: profile?.stats?.totalTrades || 0,
                        avgRoi: profile?.stats?.totalTrades > 0 ? `+${((profile.stats.totalWins / profile.stats.totalTrades) * 15).toFixed(1)}%` : '0%'
                    }
                })
            });
            if (res.ok) {
                setAppSuccess(true);
                setTimeout(() => {
                    setAppSuccess(false);
                    setLocalPending(true);
                }, 3000);
            } else {
                throw new Error("Application failed");
            }
        } catch (e) {
            notify(e.message, "error");
        } finally {
            setIsApplying(false);
        }
    };

    const filteredProviders = providers.filter(p =>
        p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isProvider = profile?.isProvider;
    const isPending = profile?.providerApplication?.status === 'PENDING' || localPending;

    // User's copy trading metrics (from profile or defaults)
    const userMetrics = {
        balance: profile?.copyTradingBalance || '0.00',
        allocated: profile?.copyTradingAllocated || '0.00',
        pnl: profile?.copyTradingPnl || '+0.00',
        pnlPercent: profile?.copyTradingPnlPercent || '0.0',
        activeCopies: profile?.activeCopies || 0,
        totalCopied: profile?.totalCopied || 0,
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute inset-0 z-[100] ${isLight ? 'bg-[#CFDCD5]' : 'bg-[#050505]'} overflow-hidden flex flex-col font-sans transition-all duration-700`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            {/* Texture & Ambient Glows */}
            <div className="fixed inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#249C6C]/5' : 'bg-[#249C6C]/10'} blur-[120px] rounded-full`} />
                <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#249C6C]/5' : 'bg-[#249C6C]/10'} blur-[120px] rounded-full`} />
            </div>

            {/* Header */}
            <div className="w-full shrink-0 relative z-50 safe-top">
                <div className="w-full px-4 md:px-12 h-16 md:h-24 md:pt-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                if (selectedProvider) {
                                    setSelectedProvider(null);
                                } else {
                                    onBack();
                                }
                            }}
                            className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all active:scale-95`}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black/80' : 'text-white'} leading-none`}>
                            Copy Trading
                        </h2>
                    </div>

                    {/* Mode Toggle Navbar */}
                    <div className={`flex items-center p-1 rounded-2xl border ${isLight ? 'bg-white border-[#249C6C]/20' : 'bg-white/5 border-white/10'}`}>
                        <button
                            onClick={() => setMode('investor')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mode === 'investor' ? 'bg-[#249C6C] text-white shadow-lg' : (isLight ? 'text-black/50 hover:bg-black/5' : 'text-white/50 hover:bg-white/5')}`}
                        >
                            Investor
                        </button>
                        <button
                            onClick={() => setMode('trader')}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mode === 'trader' ? 'bg-[#249C6C] text-white shadow-lg' : (isLight ? 'text-black/50 hover:bg-black/5' : 'text-white/50 hover:bg-white/5')}`}
                        >
                            Trader
                        </button>
                    </div>
                </div>


            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full px-4 md:px-12 py-4 md:py-8 flex flex-col lg:flex-row gap-6 lg:gap-16 overflow-y-auto lg:overflow-hidden relative z-10 no-scrollbar">

                {mode === 'investor' ? (
                    !hasCopyWallet ? (
                        <div className="w-full h-full max-w-lg mx-auto flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-full bg-[#249C6C]/10 text-[#249C6C] flex items-center justify-center mb-6">
                                <DollarSign size={24} />
                            </div>
                            <h2 className="text-3xl font-black mb-4">Activate Investor Account</h2>
                            <p className="text-sm font-bold opacity-60 leading-relaxed mb-10">
                                To start copying top traders, you need to generate a dedicated Copy Trading Wallet. 
                                This wallet will be added to your unified Transfer Hub and used to separate your copy trading funds from your main balance.
                            </p>
                            <button 
                                onClick={handleGenerateWallet}
                                disabled={isGeneratingWallet}
                                className="w-full py-5 rounded-[24px] bg-[#249C6C] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isGeneratingWallet ? 'Generating Wallet...' : 'Generate Copy Trading Wallet'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE ONLY: Simple Metrics at top */}
                            {!selectedProvider && (
                                <div className="lg:hidden flex flex-col gap-4 w-full shrink-0 mb-2">
                                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-gradient-to-r from-[#249C6C] to-[#124e36] shadow-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-0.5">Available Balance</span>
                                            <span className="text-2xl font-black text-white">{userMetrics.balance} <span className="text-sm opacity-60">USDC</span></span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-white/10 text-white">
                                            <Wallet size={20} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className={`px-4 py-3 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                            <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Allocated Stake</div>
                                            <div className="text-lg font-black">${userMetrics.allocated}</div>
                                        </div>
                                        <div className={`px-4 py-3 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                            <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Profit/Loss</div>
                                            <div className="text-lg font-black text-[#249C6C]">{userMetrics.pnl}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* LEFT PANE: Top Traders List */}
                        <div className={`flex flex-col gap-2 lg:gap-4 w-full lg:max-w-[320px] shrink-0 ${!selectedProvider ? '' : 'hidden lg:flex'} lg:h-full`}>
                            <div className="flex items-center justify-between px-2">
                                <h3 className={`text-sm font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/60'}`}>Top Traders</h3>
                                <div className={`text-[10px] font-bold px-3 py-1 rounded-full ${isLight ? 'bg-[#249C6C]/10 text-[#249C6C]' : 'bg-[#249C6C]/20 text-[#249C6C]'}`}>
                                    {providers.length} Active
                                </div>
                            </div>

                            <div className={`flex flex-row lg:flex-col lg:flex-1 overflow-x-auto lg:overflow-y-auto no-scrollbar gap-3 pb-2 lg:pb-0 lg:p-3 lg:rounded-[32px] lg:border ${isLight ? 'lg:border-[#249C6C]/20' : 'lg:border-white/10'} lg:backdrop-blur-xl lg:mt-2`}>
                                    {isLoading ? (
                                        <div className="flex flex-col items-center justify-center w-full lg:h-full opacity-50 py-4">
                                            <div className="w-8 h-8 border-2 border-[#249C6C]/20 border-t-[#249C6C] rounded-full animate-spin lg:mb-4" />
                                        </div>
                                    ) : filteredProviders.length > 0 ? (
                                        filteredProviders.map((provider, idx) => (
                                            <button
                                                key={provider.address}
                                                onClick={() => setSelectedProvider(provider)}
                                                className={`shrink-0 w-[280px] lg:w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between group ${selectedProvider?.address === provider.address ? (isLight ? 'bg-white border-[#249C6C]/40 shadow-md' : 'bg-white/10 border-[#249C6C]/40') : (isLight ? 'bg-transparent border-transparent hover:bg-black/5' : 'bg-transparent border-transparent hover:bg-white/5')}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-6 flex justify-center items-center flex-shrink-0">
                                                        {idx === 0 ? <Trophy size={16} className="text-[#FFD700]" /> : 
                                                         idx === 1 ? <span className="text-[10px] font-black text-gray-400">2ND</span> : 
                                                         idx === 2 ? <span className="text-[10px] font-black text-[#CD7F32]">3RD</span> : 
                                                         idx === 3 ? <span className="text-[10px] font-black opacity-30">4TH</span> : 
                                                         <span className="text-[10px] font-black opacity-30">{idx + 1}TH</span>}
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] flex-shrink-0">
                                                        {provider.avatar ? <img src={provider.avatar} className="w-full h-full object-cover" /> : null}
                                                    </div>
                                                    <div className="min-w-0 flex flex-col justify-center">
                                                        <h4 className="font-black text-sm truncate">{provider.username}</h4>
                                                        <div className="text-[9px] font-bold opacity-50 uppercase mt-0.5 whitespace-nowrap">
                                                            {provider.winRate}% Win · +{provider.roi}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center pl-2 flex-shrink-0">
                                                    <div 
                                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isLight ? 'bg-[#249C6C]/10 text-[#249C6C] hover:bg-[#249C6C] hover:text-white' : 'bg-[#249C6C]/20 text-[#249C6C] hover:bg-[#249C6C] hover:text-white'}`}
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setProviderToCopy(provider);
                                                            setIsCopyModalOpen(true);
                                                        }}
                                                    >
                                                        Copy
                                                    </div>
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-center opacity-40 text-xs font-bold py-10 w-full">No providers found</div>
                                    )}
                            </div>
                        </div>

                        {/* Divider Line (Desktop) */}
                        <div className={`hidden lg:block w-px h-full ${isLight ? 'bg-gradient-to-b from-transparent via-[#249C6C]/20 to-transparent' : 'bg-gradient-to-b from-transparent via-white/10 to-transparent'}`} />

                        {/* RIGHT PANE: Metrics + Search + Details */}
                        <div className="flex-1 lg:h-full flex flex-col xl:flex-row gap-6 lg:gap-8 overflow-visible lg:overflow-y-auto xl:overflow-visible no-scrollbar">
                            {!selectedProvider ? (
                                <>
                                    {/* Desktop-Only Sub-Left: Wallet Card & Metrics */}
                                    <div className="hidden lg:flex w-full xl:max-w-md flex-col shrink-0 lg:h-full overflow-visible">

                                        {/* Transfer Hub Style Large Copy Trading Wallet */}
                                        <div className="w-full h-[260px] shrink-0 mb-6 group">
                                            <div className={`w-full h-full p-8 md:p-10 rounded-[40px] relative overflow-hidden flex flex-col justify-between bg-[#249C6C] border border-white/20`} style={{ boxShadow: isLight ? '0 8px 30px rgba(0,0,0,0.1)' : '0 8px 30px rgba(0,0,0,0.5)' }}>
                                                
                                                {/* Immersive Nature-Series Layer (Behind Texture) */}
                                                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                                    <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                        <path d="M0,20 Q20,10 40,20 T80,20 T100,10" fill="none" stroke="white" strokeWidth="0.15" />
                                                        <path d="M0,40 Q20,30 40,40 T80,40 T100,30" fill="none" stroke="white" strokeWidth="0.15" />
                                                        <path d="M0,60 Q20,50 40,60 T80,60 T100,50" fill="none" stroke="white" strokeWidth="0.15" />
                                                        <path d="M0,80 Q20,70 40,80 T80,80 T100,70" fill="none" stroke="white" strokeWidth="0.15" />
                                                    </svg>
                                                    <svg className="absolute top-0 right-[-10%] w-[120%] h-full opacity-40" viewBox="0 0 200 100" preserveAspectRatio="none">
                                                        <path d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" fill="none" stroke="white" strokeWidth="10" className="opacity-10" />
                                                        <path d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" fill="none" stroke="white" strokeWidth="0.6" strokeDasharray="4 6" className="opacity-30" />
                                                    </svg>
                                                    <div className="absolute bottom-[15%] right-[12%] flex items-end gap-1 opacity-30">
                                                        <svg width="20" height="28" viewBox="0 0 24 32" fill="white">
                                                            <path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" />
                                                        </svg>
                                                        <svg width="14" height="20" viewBox="0 0 24 32" fill="white" className="opacity-60">
                                                            <path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" />
                                                        </svg>
                                                    </div>
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
                                                    <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/carbon-fibre.png')` }} />
                                                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-30" />
                                                </div>

                                                {/* Credit Card Chip (Metallic Gold) */}
                                                <div className="absolute top-1/2 right-10 -translate-y-1/2 w-14 h-11 rounded-xl bg-gradient-to-br from-[#E6BE8A] via-[#C5A059] to-[#8B7355] shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-black/20 z-10">
                                                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-[1.5px] p-2.5 opacity-30">
                                                        {[...Array(6)].map((_, i) => (
                                                            <div key={i} className="border border-black/40 rounded-[3px]" />
                                                        ))}
                                                    </div>
                                                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-black/20" />
                                                </div>

                                                <div className="flex-1 flex flex-col justify-between relative z-20">
                                                    <div className="flex items-center justify-between">
                                                        <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>COPY TRADING WALLET</p>
                                                        <img src="/boblogo.png" alt="Logo" className="h-16 md:h-20 object-contain brightness-0 invert mix-blend-overlay opacity-80" />
                                                    </div>

                                                    <div className="py-2">
                                                        <div className="flex items-center gap-3 group/copy cursor-pointer" onClick={(e) => { e.stopPropagation(); address && navigator.clipboard.writeText(address); }}>
                                                            <p className="text-[18px] md:text-[22px] font-mono tracking-[0.2em] text-white">
                                                                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '---'}
                                                            </p>
                                                            <div className="p-1.5 rounded-lg bg-white/5 opacity-0 group-hover/copy:opacity-100 transition-all hover:bg-white/10 active:scale-90">
                                                                <Copy size={14} className="text-white/40" />
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1.5 mt-4">
                                                            <div className="w-4 h-1.5 rounded-full bg-white transition-all duration-300" />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-end justify-between relative">
                                                        <div>
                                                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-white`}>Available Balance</p>
                                                            <h1 className={`text-4xl md:text-5xl font-black tracking-tighter text-white flex items-baseline gap-2`}>
                                                                0.00
                                                                <span className="text-xl text-white/60">USDC</span>
                                                            </h1>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* User Copy Trading Metrics */}
                                        <div className="grid grid-cols-2 gap-3 mt-4">
                                            <div className={`px-4 py-3 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Allocated Stake</div>
                                                <div className="text-lg font-black">${userMetrics.allocated}</div>
                                            </div>
                                            <div className={`px-4 py-3 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Profit/Loss</div>
                                                <div className="text-lg font-black text-[#249C6C]">{userMetrics.pnl}</div>
                                            </div>
                                            <div className={`px-4 py-3 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Active Copies</div>
                                                <div className="text-lg font-black">{userMetrics.activeCopies}</div>
                                            </div>
                                            <div className={`px-4 py-3 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Total Copied</div>
                                                <div className="text-lg font-black">{userMetrics.totalCopied}</div>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Vertical Divider Line (Desktop) / Horizontal (Mobile) */}
                                    <div className={`hidden xl:block w-px h-full shrink-0 ${isLight ? 'bg-gradient-to-b from-transparent via-[#249C6C]/20 to-transparent' : 'bg-gradient-to-b from-transparent via-white/10 to-transparent'}`} />

                                    {/* Sub-Right: Provider List */}
                                    <div className="flex-1 flex flex-col lg:h-full lg:overflow-hidden mt-2 lg:mt-0">

                                    <div className="flex items-center justify-between mb-4 px-2">
                                        <h3 className={`text-sm font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/60'}`}>Providers</h3>
                                        <div className={`text-[10px] font-bold px-3 py-1 rounded-full ${isLight ? 'bg-[#249C6C]/10 text-[#249C6C]' : 'bg-[#249C6C]/20 text-[#249C6C]'}`}>
                                            {providers.length} Available
                                        </div>
                                    </div>

                                    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border mb-4 ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                        <Search size={14} className="opacity-40 flex-none" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search providers..."
                                            className={`w-full bg-transparent force-transparent-bg text-xs font-bold outline-none border-none transition-all focus:!ring-0 focus:!shadow-none focus:!border-none focus:!outline-none ${isLight ? 'text-black placeholder:text-black/30' : 'text-white placeholder:text-white/30'}`}
                                        />
                                    </div>

                                    {/* Chevron Up Scroll Control */}
                                    <button 
                                        className={`w-full py-2 mb-2 flex items-center justify-center transition-all ${isLight ? 'text-black/20 hover:text-black/60' : 'text-white/20 hover:text-white/60'}`}
                                        onMouseEnter={() => startScrolling(-1, 2)}
                                        onMouseLeave={stopScrolling}
                                        onClick={() => {
                                            if (providerListRef.current) providerListRef.current.scrollTop -= 100;
                                        }}
                                    >
                                        <ChevronUp size={16} />
                                    </button>

                                    {/* Provider List */}
                                    <div ref={providerListRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2 scroll-smooth">
                                        {isLoading ? (
                                            <div className="flex flex-col items-center justify-center h-32 opacity-50">
                                                <div className="w-8 h-8 border-2 border-[#249C6C]/20 border-t-[#249C6C] rounded-full animate-spin mb-4" />
                                            </div>
                                        ) : filteredProviders.length > 0 ? (
                                            filteredProviders.map(provider => (
                                                <button
                                                    key={provider.address}
                                                    onClick={() => setSelectedProvider(provider)}
                                                    className={`w-full text-left p-4 rounded-2xl border flex items-center justify-between transition-all group ${isLight ? 'bg-transparent border-[#249C6C]/10 hover:bg-white hover:shadow-md' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] flex-shrink-0 border-2 border-[#249C6C]">
                                                            {provider.avatar ? <img src={provider.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-black text-sm">{provider.username?.[0] || 'T'}</div>}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-sm">{provider.username}</h4>
                                                            <div className="text-[10px] font-bold opacity-50 uppercase mt-0.5">
                                                                {provider.winRate}% Win Rate · {provider.followers} Copiers
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center gap-3">
                                                        <div>
                                                            <div className="text-[#249C6C] font-black text-sm">+{provider.roi}%</div>
                                                            <div className="text-[10px] font-bold opacity-30 uppercase mt-0.5">ROI</div>
                                                        </div>
                                                        <ChevronRight size={16} className="opacity-30 group-hover:opacity-70 transition-all" />
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-center opacity-40 text-xs font-bold py-10">No providers found</div>
                                        )}
                                    </div>

                                    {/* Chevron Down Scroll Control */}
                                    <button 
                                        className={`w-full py-2 mt-2 flex items-center justify-center transition-all ${isLight ? 'text-black/20 hover:text-black/60' : 'text-white/20 hover:text-white/60'}`}
                                        onMouseEnter={() => startScrolling(1, 2)}
                                        onMouseLeave={stopScrolling}
                                        onClick={() => {
                                            if (providerListRef.current) providerListRef.current.scrollTop += 100;
                                        }}
                                    >
                                        <ChevronDown size={16} />
                                    </button>
                                    </div>
                                    </>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="h-full flex flex-col"
                                >
                                    <h3 className={`text-sm font-black uppercase tracking-[0.2em] mb-6 px-2 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Provider Analysis</h3>

                                    <div className={`p-8 rounded-[32px] border ${isLight ? 'bg-transparent border-[#249C6C]/20 shadow-xl' : 'bg-transparent border-white/10 shadow-2xl'} backdrop-blur-xl relative overflow-hidden`}>
                                        
                                        <div className="flex items-start justify-between mb-8">
                                            <div className="flex items-center gap-6">
                                                <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] shadow-lg border-4 border-white/5">
                                                    {selectedProvider.avatar && <img src={selectedProvider.avatar} className="w-full h-full object-cover" />}
                                                </div>
                                                <div>
                                                    <h2 className="text-3xl font-black">{selectedProvider.username}</h2>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <span className="text-xs font-bold opacity-50 font-mono">{selectedProvider.address.substring(0, 6)}...{selectedProvider.address.slice(-4)}</span>
                                                        <div className="px-2 py-0.5 rounded-full bg-[#249C6C]/20 text-[#249C6C] text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                            <CheckCircle size={10} /> Verified
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 mb-10">
                                            <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Win Rate</div>
                                                <div className="text-xl font-black text-[#249C6C]">{selectedProvider.winRate}%</div>
                                            </div>
                                            <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Total Trades</div>
                                                <div className="text-xl font-black">{selectedProvider.totalTrades}</div>
                                            </div>
                                            <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Total ROI</div>
                                                <div className="text-xl font-black text-[#249C6C]">+{selectedProvider.roi}%</div>
                                            </div>
                                        </div>

                                        <button className="w-full py-5 rounded-[24px] bg-[#249C6C] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                                            <Copy size={18} />
                                            <span>Copy This Trader</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                        </>
                    )
                ) : (
                    /* TRADER MODE PANE */
                    <div className="w-full h-full max-w-4xl mx-auto flex flex-col items-center justify-center">
                        {isProvider ? (
                            !hasCopyWallet ? (
                                <div className="w-full h-full max-w-lg mx-auto flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6">
                                        <Activity size={24} />
                                    </div>
                                    <h2 className="text-3xl font-black mb-4">Activate Provider Account</h2>
                                    <p className="text-sm font-bold opacity-60 leading-relaxed mb-10">
                                        Your provider application has been approved! You must now generate a dedicated Copy Trading Wallet to receive your performance fees and manage your follower capital.
                                    </p>
                                    <button 
                                        onClick={handleGenerateWallet}
                                        disabled={isGeneratingWallet}
                                        className="w-full py-5 rounded-[24px] bg-amber-500 text-black font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(245,158,11,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        {isGeneratingWallet ? 'Generating Wallet...' : 'Generate Copy Trading Wallet'}
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full text-center">
                                    <div className="w-24 h-24 mx-auto rounded-full bg-[#249C6C]/10 text-[#249C6C] flex items-center justify-center mb-8">
                                        <Activity size={48} />
                                    </div>
                                    <h2 className="text-4xl font-black mb-4">Provider Command Center</h2>
                                    <p className="text-sm font-bold opacity-50 uppercase tracking-widest mb-12">Your audience is growing.</p>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                                        <div className={`p-6 rounded-[32px] border ${isLight ? 'bg-transparent border-[#249C6C]/20' : 'bg-transparent border-white/5'}`}>
                                            <div className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-2">Total Followers</div>
                                            <div className="text-3xl font-black text-[#249C6C]">{profile?.providerStats?.followers || 0}</div>
                                        </div>
                                        <div className={`p-6 rounded-[32px] border ${isLight ? 'bg-transparent border-[#249C6C]/20' : 'bg-transparent border-white/5'}`}>
                                            <div className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-2">AUM (Assets Under Management)</div>
                                            <div className="text-3xl font-black">${(profile?.providerStats?.aum || 0).toLocaleString()}</div>
                                        </div>
                                        <div className={`p-6 rounded-[32px] border ${isLight ? 'bg-transparent border-[#249C6C]/20' : 'bg-transparent border-white/5'}`}>
                                            <div className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-2">Success Fees Earned</div>
                                            <div className="text-3xl font-black text-amber-500">${(profile?.providerStats?.profitGenerated || 0).toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : isPending ? (
                            <div className={`p-12 rounded-[40px] border max-w-lg w-full text-center ${isLight ? 'bg-transparent border-[#249C6C]/20' : 'bg-transparent border-white/10'} backdrop-blur-xl`}>
                                <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6">
                                    <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                                </div>
                                <h2 className="text-2xl font-black mb-4">Application Pending</h2>
                                <p className="text-sm font-bold opacity-60 leading-relaxed mb-8">
                                    The 15market citadel is reviewing your on-chain trading metrics. You will be notified once approved.
                                </p>
                            </div>
                        ) : appSuccess ? (
                            <motion.div initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} exit={{opacity:0}} className="max-w-sm w-full mx-auto text-center bg-transparent backdrop-blur-xl flex flex-col items-center justify-center">
                                <div className="w-24 h-24 rounded-full bg-[#249C6C]/10 flex items-center justify-center mb-6 relative">
                                    <motion.div 
                                        initial={{ scale: 0 }} 
                                        animate={{ scale: 1 }} 
                                        transition={{ type: 'spring', stiffness: 200, damping: 10, delay: 0.2 }}
                                    >
                                        <CheckCircle size={48} className="text-[#249C6C]" />
                                    </motion.div>
                                    <motion.div 
                                        className="absolute inset-0 border-2 border-[#249C6C] rounded-full"
                                        initial={{ scale: 1, opacity: 1 }}
                                        animate={{ scale: 1.5, opacity: 0 }}
                                        transition={{ repeat: Infinity, duration: 1.5 }}
                                    />
                                </div>
                                <h2 className="text-3xl font-black mb-2 text-[#249C6C]">Success!</h2>
                                <p className="text-sm font-bold opacity-60 uppercase tracking-widest">Application Submitted</p>
                            </motion.div>
                        ) : (
                            <div className="max-w-sm w-full mx-auto text-center bg-transparent backdrop-blur-xl">
                                {appStep === 0 && (
                                    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center">
                                        <div className="w-10 h-10 mx-auto rounded-full bg-[#249C6C]/10 text-[#249C6C] flex items-center justify-center mb-6">
                                            <TrendingUp size={20} />
                                        </div>
                                        <h2 className="text-xl font-black mb-4">Become a Provider</h2>
                                        <p className="text-sm font-bold opacity-60 leading-relaxed mb-10">
                                            Monetize your trading edge. Allow others to copy your trades and earn a flat performance fee on all generated profits. 
                                            Your application will be evaluated based on your historical 15market PnL and win rate.
                                        </p>
                                        <button 
                                            onClick={() => setAppStep(1)}
                                            className="w-full py-5 rounded-[24px] bg-[#249C6C] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            Apply
                                        </button>
                                    </motion.div>
                                )}

                                {appStep >= 1 && (
                                    <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="text-left w-full">
                                        <h2 className="text-xl font-black mb-6 text-center">Provider Application</h2>
                                        
                                        <div className="flex flex-col gap-4 mb-8">
                                            <input 
                                                type="text" 
                                                placeholder="Display Name" 
                                                value={appData.name}
                                                onChange={(e) => setAppData({...appData, name: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="Twitter Username" 
                                                value={appData.twitter}
                                                onChange={(e) => setAppData({...appData, twitter: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="Telegram Username" 
                                                value={appData.telegram}
                                                onChange={(e) => setAppData({...appData, telegram: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="email" 
                                                placeholder="Email Address" 
                                                value={appData.email}
                                                onChange={(e) => setAppData({...appData, email: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="number" 
                                                placeholder="Copy Fee % (0-5%)" 
                                                value={appData.fee}
                                                onChange={(e) => {
                                                    let val = e.target.value;
                                                    if(val !== '') {
                                                        val = Number(val);
                                                        if(val > 5) val = 5;
                                                        if(val < 0) val = 0;
                                                    }
                                                    setAppData({...appData, fee: val});
                                                }}
                                                min="0"
                                                max="5"
                                                disabled={appStep > 1}
                                                className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                        </div>

                                        <button 
                                            onClick={handleApply}
                                            disabled={isApplying || !appData.name || !appData.email || appData.fee === ''}
                                            className="w-full py-5 mt-6 rounded-[24px] bg-[#249C6C] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                        >
                                            {isApplying ? 'Submitting...' : 'Submit Application'}
                                        </button>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Copy Settings Modal */}
            <AnimatePresence>
                {isCopyModalOpen && providerToCopy && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }} 
                            animate={{ scale: 1, y: 0 }} 
                            exit={{ scale: 0.95, y: 20 }} 
                            className={`w-full max-w-md p-6 rounded-[32px] border ${isLight ? 'bg-[#F2F7F4] border-[#249C6C]/20' : 'bg-[#0A0A0A] border-white/10'} shadow-2xl relative`}
                        >
                            <button 
                                onClick={() => setIsCopyModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <X size={20} className={isLight ? 'text-black/40' : 'text-white/40'} />
                            </button>
                            
                            <h2 className="text-2xl font-black mb-2">Copy Settings</h2>
                            <p className="text-sm font-bold opacity-50 mb-6">Configure parameters for copying {providerToCopy.username}</p>

                            <div className="space-y-6 mb-8">
                                {/* Mode Selection */}
                                <div className={`flex gap-2 p-1 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                    <button 
                                        onClick={() => setCopyParams({...copyParams, mode: 'isolated'})}
                                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${copyParams.mode === 'isolated' ? 'bg-[#249C6C] text-white shadow-md' : 'text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                    >
                                        Isolated
                                    </button>
                                    <button 
                                        onClick={() => setCopyParams({...copyParams, mode: 'cross'})}
                                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${copyParams.mode === 'cross' ? 'bg-[#FF4444] text-white shadow-md' : 'text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                    >
                                        Cross
                                    </button>
                                </div>

                                {copyParams.mode === 'isolated' && (
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Allocated Funds (USDC)</label>
                                        <p className="text-[10px] font-bold opacity-30 mb-3 leading-relaxed">Total maximum risk limit for this trader. Protects your main copy trading balance.</p>
                                        <input 
                                            type="number"
                                            placeholder="e.g. 500"
                                            value={copyParams.allocated}
                                            onChange={e => setCopyParams({...copyParams, allocated: e.target.value})}
                                            className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Stake Per Trade (USDC)</label>
                                    <p className="text-[10px] font-bold opacity-30 mb-3 leading-relaxed">Amount placed for each individual trade copied.</p>
                                    <input 
                                        type="number"
                                        placeholder="e.g. 50"
                                        value={copyParams.stakePerTrade}
                                        onChange={e => setCopyParams({...copyParams, stakePerTrade: e.target.value})}
                                        className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                    />
                                </div>

                                {copyParams.mode === 'cross' && (
                                    <div className="p-4 rounded-xl bg-[#FF4444]/10 border border-[#FF4444]/20 flex items-start gap-3">
                                        <AlertCircle size={16} className="text-[#FF4444] shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-bold text-[#FF4444]/80 leading-relaxed uppercase tracking-widest">
                                            Warning: Cross mode exposes your entire copy trading balance. Risk of full liquidation.
                                        </p>
                                    </div>
                                )}

                                <div className="p-4 rounded-xl bg-[#249C6C]/10 border border-[#249C6C]/20 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-[#249C6C]">Activation Fee</span>
                                        <span className="text-xs font-black text-[#249C6C]">10 USDC</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] font-bold opacity-50 uppercase">
                                        <span>Provider Share</span>
                                        <span>50% (5 USDC)</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] font-bold opacity-50 uppercase">
                                        <span>Protocol Share</span>
                                        <span>50% (5 USDC)</span>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={async () => {
                                    if(!profile?.copyTradingWallet) {
                                        notify("You do not have a copy trading wallet yet.", "error");
                                        return;
                                    }
                                    if(copyParams.mode === 'isolated' && !copyParams.allocated) { notify("Please specify allocated funds for isolated mode", "error"); return; }
                                    if(!copyParams.stakePerTrade) { notify("Please specify a stake per trade", "error"); return; }

                                    try {
                                        const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/activate`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                investorAddress: address,
                                                providerAddress: providerToCopy.address,
                                                mode: copyParams.mode,
                                                allocated: copyParams.allocated,
                                                stakePerTrade: copyParams.stakePerTrade
                                            })
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                            setIsCopyModalOpen(false);
                                            setCopyParams({ mode: 'isolated', allocated: '', stakePerTrade: '' });
                                            notify(`Copy trading activated on ${providerToCopy.username}! New balance: ${data.newBalance} USDC`, "success");
                                        } else {
                                            notify(data.error || 'Activation failed', "error");
                                        }
                                    } catch (e) {
                                        notify(e.message || 'Network error', "error");
                                    }
                                }}
                                className="w-full py-5 rounded-[24px] bg-[#249C6C] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                Confirm & Activate
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </motion.div>
    );
}
