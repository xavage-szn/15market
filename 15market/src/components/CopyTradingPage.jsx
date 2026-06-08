import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Search, TrendingUp, Users, DollarSign, Activity, ChevronRight, ChevronUp, ChevronDown, CheckCircle, Copy, Wallet, Trophy, X, AlertCircle, BarChart, PieChartIcon, Download, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart as ReBarChart, Bar } from 'recharts';
import { KEEPER_URL_ARC } from '../constants';

export function CopyTradingPage({
    address,
    isLight,
    notify,
    onBack,
    profile
}) {
    const [mode, setMode] = useState(null); // null = select, 'investor' or 'trader'
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

    // Provider dashboard data
    const [followers, setFollowers] = useState([]);
    const [providerPerformance, setProviderPerformance] = useState(null);
    const [providerReport, setProviderReport] = useState(null);
    const [reportPeriod, setReportPeriod] = useState('all');
    const [isLoadingFollowers, setIsLoadingFollowers] = useState(false);
    const [isLoadingPerformance, setIsLoadingPerformance] = useState(false);
    const [investorCopies, setInvestorCopies] = useState({ active: [], history: [] });
    const [isLoadingInvestorCopies, setIsLoadingInvestorCopies] = useState(false);

    // Provider list scroll refs
    const providerListRef = useRef(null);
    const scrollIntervalRef = useRef(null);
    const isProvider = profile?.isProvider;
    const isPending = profile?.providerApplication?.status === 'PENDING' || localPending;

    const formatCurrency = (value, decimals = 2) => {
        const n = Number(value || 0);
        return `$${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    };

    const formatNumber = (value, decimals = 0) => {
        const n = Number(value || 0);
        return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

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

    // Provider dashboard data fetching
    const fetchFollowers = useCallback(async () => {
        if (!address) return;
        setIsLoadingFollowers(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/followers`);
            if (res.ok) {
                const data = await res.json();
                setFollowers(data.followers || []);
            }
        } catch (e) {
            console.error('Failed to fetch followers:', e);
        } finally {
            setIsLoadingFollowers(false);
        }
    }, [address]);

    const fetchPerformance = useCallback(async () => {
        if (!address) return;
        setIsLoadingPerformance(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/performance`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) setProviderPerformance(data.performance);
            }
        } catch (e) {
            console.error('Failed to fetch performance:', e);
        } finally {
            setIsLoadingPerformance(false);
        }
    }, [address]);

    const fetchReport = useCallback(async (period) => {
        if (!address) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/reports?period=${period}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) setProviderReport(data.report);
            }
        } catch (e) {
            console.error('Failed to fetch report:', e);
        }
    }, [address]);

    const fetchInvestorCopies = useCallback(async () => {
        if (!address) return;
        setIsLoadingInvestorCopies(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/investors/${address.toLowerCase()}/copies`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setInvestorCopies({
                        active: data.active || [],
                        history: data.history || []
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch investor copy activity:', e);
        } finally {
            setIsLoadingInvestorCopies(false);
        }
    }, [address]);

    useEffect(() => {
        if (isProvider && hasCopyWallet) {
            fetchFollowers();
            fetchPerformance();
            fetchReport(reportPeriod);
        }
    }, [isProvider, hasCopyWallet, fetchFollowers, fetchPerformance, fetchReport, reportPeriod]);

    useEffect(() => {
        if (mode === 'investor' && hasCopyWallet) {
            fetchInvestorCopies();
        }
    }, [mode, hasCopyWallet, fetchInvestorCopies]);

    const filteredProviders = providers.filter(p =>
        p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // User's copy trading metrics (from profile or defaults)
    const userMetrics = {
        balance: profile?.copyTradingWallet?.balance ?? profile?.copyTradingBalance ?? '0.00',
        allocated: profile?.copyTradingAllocated || '0.00',
        pnl: profile?.copyTradingPnl || '+0.00',
        pnlPercent: profile?.copyTradingPnlPercent || '0.0',
        activeCopies: investorCopies.active.length || profile?.activeCopies?.length || profile?.activeCopies || 0,
        totalCopied: investorCopies.history.length + investorCopies.active.length || profile?.totalCopied || 0,
    };

    const providerPortfolio = useMemo(() => {
        const isolatedFollowers = followers.filter(f => f.mode === 'isolated');
        const crossFollowers = followers.filter(f => f.mode === 'cross');
        const isolatedAllocated = isolatedFollowers.reduce((sum, f) => sum + Number(f.allocated || 0), 0);
        const crossStake = crossFollowers.reduce((sum, f) => sum + Number(f.stakePerTrade || 0), 0);
        const totalStakePerTrade = followers.reduce((sum, f) => sum + Number(f.stakePerTrade || 0), 0);
        const totalPnl = followers.reduce((sum, f) => sum + Number(f.pnl || 0), 0);
        return {
            isolatedFollowers,
            crossFollowers,
            isolatedAllocated,
            crossStake,
            totalStakePerTrade,
            totalPnl,
            modeData: [
                { name: 'Isolated', value: isolatedFollowers.length },
                { name: 'Cross', value: crossFollowers.length }
            ].filter(item => item.value > 0),
            allocationData: [
                { name: 'Allocated', value: isolatedAllocated },
                { name: 'Per-trade', value: totalStakePerTrade }
            ].filter(item => item.value > 0)
        };
    }, [followers]);

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
                <div className="w-full px-3 md:px-6 h-12 md:h-14 flex items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                if (mode && selectedProvider) {
                                    setSelectedProvider(null);
                                } else if (mode) {
                                    setMode(null);
                                } else {
                                    onBack();
                                }
                            }}
                            className={`p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all active:scale-95`}
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <h2 className={`text-base font-black uppercase tracking-tighter ${isLight ? 'text-black/80' : 'text-white'} leading-none`}>
                            Copy Trading
                        </h2>
                    </div>
                </div>
            </div>

            {/* Mode Selection Screen */}
            {!mode && (
                <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 max-w-2xl mx-auto w-full relative z-10 px-4">
                    <motion.div 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMode('investor')}
                        className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer group"
                    >
                        <div className="text-center">
                            <h2 className={`text-xl md:text-2xl font-black uppercase tracking-widest mb-2 group-hover:text-[#249C6C] transition-colors ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Investor</h2>
                            <p className={`text-[10px] md:text-xs font-bold leading-relaxed max-w-[200px] mx-auto ${isLight ? 'text-black/50' : 'text-white/50'}`}>Browse top traders and automatically mirror their positions in real-time.</p>
                        </div>
                    </motion.div>

                    <div className="w-full h-px md:w-px md:h-24 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-[#249C6C] to-transparent" />

                    <motion.div 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMode('trader')}
                        className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer group"
                    >
                        <div className="text-center">
                            <h2 className={`text-xl md:text-2xl font-black uppercase tracking-widest mb-2 group-hover:text-[#249C6C] transition-colors ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Trader</h2>
                            <p className={`text-[10px] md:text-xs font-bold leading-relaxed max-w-[200px] mx-auto ${isLight ? 'text-black/50' : 'text-white/50'}`}>Apply to become a verified copy trading provider and earn from your strategies.</p>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Main Content Area */}
            {mode && (
            <div className="flex-1 w-full px-3 md:px-6 py-2 md:py-4 flex flex-col lg:flex-row items-start justify-center gap-4 lg:gap-8 overflow-y-auto lg:overflow-hidden relative z-10 no-scrollbar">

                {mode === 'investor' ? (
                    !hasCopyWallet ? (
                        <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center text-center">
                            <h2 className="text-xl font-black mb-3">Activate Investor Account</h2>
                            <p className="text-xs font-bold opacity-60 leading-relaxed mb-6">
                                To start copying top traders, you need to generate a dedicated Copy Trading Wallet. 
                                This wallet will be added to your unified Transfer Hub and used to separate your copy trading funds from your main balance.
                            </p>
                            <button 
                                onClick={handleGenerateWallet}
                                disabled={isGeneratingWallet}
                                className="w-auto px-8 py-4 rounded-[20px] bg-[#249C6C] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isGeneratingWallet ? 'Activating...' : 'Activate'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE ONLY: Simple Metrics at top */}
                            {!selectedProvider && (
                                <div className="lg:hidden flex flex-col gap-2 w-full shrink-0 mb-1">
                                    <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-gradient-to-r from-[#249C6C] to-[#124e36] shadow-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-0.5">Available Balance</span>
                                            <span className="text-xl font-black text-white">{userMetrics.balance} <span className="text-xs opacity-60">USDC</span></span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-white/10 text-white">
                                            <Wallet size={16} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                            <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-1">Allocated Stake</div>
                                            <div className="text-base font-black">${userMetrics.allocated}</div>
                                        </div>
                                        <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                            <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Profit/Loss</div>
                                            <div className="text-lg font-black text-[#249C6C]">{userMetrics.pnl}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* LEFT PANE: Top Traders List */}
                        <div className={`flex flex-col gap-2 lg:gap-2 w-full lg:max-w-[280px] shrink-0 ${!selectedProvider ? '' : 'hidden lg:flex'} lg:h-full`}>
                            <div className="flex items-center justify-between px-1">
                                <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/60'}`}>Top Traders</h3>
                                <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isLight ? 'bg-[#249C6C]/10 text-[#249C6C]' : 'bg-[#249C6C]/20 text-[#249C6C]'}`}>
                                    {providers.length} Active
                                </div>
                            </div>

                            <div className={`flex flex-row lg:flex-col lg:flex-1 overflow-x-auto lg:overflow-y-auto no-scrollbar gap-2 pb-2 lg:pb-0 lg:p-2 lg:rounded-[24px] lg:border ${isLight ? 'lg:border-[#249C6C]/20' : 'lg:border-white/10'} lg:backdrop-blur-xl`}>
                                    {isLoading ? (
                                        <div className="flex flex-col items-center justify-center w-full lg:h-full opacity-50 py-4">
                                            <div className="w-6 h-6 border-2 border-[#249C6C]/20 border-t-[#249C6C] rounded-full animate-spin" />
                                        </div>
                                    ) : filteredProviders.length > 0 ? (
                                        filteredProviders.map((provider, idx) => (
                                            <button
                                                key={provider.address}
                                                onClick={() => setSelectedProvider(provider)}
                                                className={`shrink-0 w-[240px] lg:w-full text-left p-2 rounded-2xl border transition-all flex items-center justify-between group ${selectedProvider?.address === provider.address ? (isLight ? 'bg-white border-[#249C6C]/40 shadow-md' : 'bg-white/10 border-[#249C6C]/40') : (isLight ? 'bg-transparent border-transparent hover:bg-black/5' : 'bg-transparent border-transparent hover:bg-white/5')}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 flex justify-center items-center flex-shrink-0">
                                                        {idx === 0 ? <Trophy size={12} className="text-[#FFD700]" /> : 
                                                         idx === 1 ? <span className="text-[8px] font-black text-gray-400">2ND</span> : 
                                                         idx === 2 ? <span className="text-[8px] font-black text-[#CD7F32]">3RD</span> : 
                                                         idx === 3 ? <span className="text-[8px] font-black opacity-30">4TH</span> : 
                                                         <span className="text-[8px] font-black opacity-30">{idx + 1}TH</span>}
                                                    </div>
                                                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] flex-shrink-0">
                                                        {provider.avatar ? <img src={provider.avatar} className="w-full h-full object-cover" /> : null}
                                                    </div>
                                                    <div className="min-w-0 flex flex-col justify-center">
                                                        <h4 className="font-black text-xs truncate">{provider.username}</h4>
                                                        <div className="text-[8px] font-bold opacity-50 uppercase whitespace-nowrap">
                                                            {provider.winRate}% Win · +{provider.roi}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center pl-1 flex-shrink-0">
                                                    <div 
                                                        className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${isLight ? 'bg-[#249C6C]/10 text-[#249C6C] hover:bg-[#249C6C] hover:text-white' : 'bg-[#249C6C]/20 text-[#249C6C] hover:bg-[#249C6C] hover:text-white'}`}
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
                                        <div className="text-center opacity-40 text-xs font-bold py-6 w-full">No providers found</div>
                                    )}
                            </div>
                        </div>

                        {/* Divider Line (Desktop) */}
                        <div className={`hidden lg:block w-px h-full ${isLight ? 'bg-gradient-to-b from-transparent via-[#249C6C]/20 to-transparent' : 'bg-gradient-to-b from-transparent via-white/10 to-transparent'}`} />

                        {/* RIGHT PANE: Metrics + Search + Details */}
                        <div className="flex-1 max-w-2xl lg:h-full flex flex-col xl:flex-row gap-4 lg:gap-6 overflow-visible lg:overflow-y-auto xl:overflow-visible no-scrollbar">
                            {!selectedProvider ? (
                                <>
                                    {/* Desktop-Only Sub-Left: Wallet Card & Metrics */}
                                    <div className="hidden lg:flex w-full xl:max-w-md flex-col shrink-0 lg:h-full overflow-visible">

                                        {/* Transfer Hub Style Copy Trading Wallet */}
                                        <div className="w-full h-[180px] shrink-0 mb-4 group">
                                            <div className={`w-full h-full p-6 rounded-[32px] relative overflow-hidden flex flex-col justify-between bg-[#249C6C] border border-white/20`} style={{ boxShadow: isLight ? '0 8px 30px rgba(0,0,0,0.1)' : '0 8px 30px rgba(0,0,0,0.5)' }}>
                                                
                                                {/* Platform Standard Texture Layer */}
                                                <div className="absolute inset-0 z-0">
                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2E8B57_0%,transparent_60%)] opacity-60" />
                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,#1E5D3B_0%,transparent_60%)] opacity-40" />
                                                    <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/carbon-fibre.png')` }} />
                                                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-30" />
                                                </div>

                                                <div className="flex-1 flex flex-col justify-between relative z-20">
                                                    <div className="flex items-center justify-between">
                                                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] text-white/80`}>COPY TRADING WALLET</p>
                                                        <img src="/boblogo.png" alt="Logo" className="h-10 object-contain brightness-0 invert mix-blend-overlay opacity-80" />
                                                    </div>

                                                    <div>
                                                        <div className="flex items-center gap-2 group/copy cursor-pointer" onClick={(e) => { e.stopPropagation(); address && navigator.clipboard.writeText(address); }}>
                                                            <p className="text-sm font-mono tracking-[0.2em] text-white">
                                                                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '---'}
                                                            </p>
                                                            <div className="p-1 rounded-lg bg-white/5 opacity-0 group-hover/copy:opacity-100 transition-all hover:bg-white/10 active:scale-90">
                                                                <Copy size={12} className="text-white/40" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 text-white/80`}>Available Balance</p>
                                                        <h1 className={`text-2xl font-black tracking-tighter text-white flex items-baseline gap-1`}>
                                                            {formatNumber(userMetrics.balance, 2)}
                                                            <span className="text-sm text-white/60">USDC</span>
                                                        </h1>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* User Copy Trading Metrics */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Allocated Stake</div>
                                                <div className="text-base font-black">${userMetrics.allocated}</div>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Profit/Loss</div>
                                                <div className="text-base font-black text-[#249C6C]">{userMetrics.pnl}</div>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Active Copies</div>
                                                <div className="text-base font-black">{userMetrics.activeCopies}</div>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Total Copied</div>
                                                <div className="text-base font-black">{userMetrics.totalCopied}</div>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Vertical Divider Line (Desktop) / Horizontal (Mobile) */}
                                    <div className={`hidden xl:block w-px h-full shrink-0 ${isLight ? 'bg-gradient-to-b from-transparent via-[#249C6C]/20 to-transparent' : 'bg-gradient-to-b from-transparent via-white/10 to-transparent'}`} />

                                    {/* Sub-Right: Provider List */}
                                    <div className="flex-1 flex flex-col lg:h-full lg:overflow-hidden lg:mt-0">

                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/60'}`}>Providers</h3>
                                        <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isLight ? 'bg-[#249C6C]/10 text-[#249C6C]' : 'bg-[#249C6C]/20 text-[#249C6C]'}`}>
                                            {providers.length} Available
                                        </div>
                                    </div>

                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border mb-3 ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                        <Search size={12} className="opacity-40 flex-none" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search providers..."
                                            className={`w-full bg-transparent force-transparent-bg text-[11px] font-bold outline-none border-none transition-all focus:!ring-0 focus:!shadow-none focus:!border-none focus:!outline-none ${isLight ? 'text-black placeholder:text-black/30' : 'text-white placeholder:text-white/30'}`}
                                        />
                                    </div>

                                    {/* Provider List */}
                                    <div ref={providerListRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1.5 scroll-smooth">
                                        {isLoading ? (
                                            <div className="flex flex-col items-center justify-center h-24 opacity-50">
                                                <div className="w-6 h-6 border-2 border-[#249C6C]/20 border-t-[#249C6C] rounded-full animate-spin" />
                                            </div>
                                        ) : filteredProviders.length > 0 ? (
                                            filteredProviders.map(provider => (
                                                <button
                                                    key={provider.address}
                                                    onClick={() => setSelectedProvider(provider)}
                                                    className={`w-full text-left p-3 rounded-2xl border flex items-center justify-between transition-all group ${isLight ? 'bg-transparent border-[#249C6C]/10 hover:bg-white hover:shadow-md' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] flex-shrink-0 border border-[#249C6C]">
                                                            {provider.avatar ? <img src={provider.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-black text-[10px]">{provider.username?.[0] || 'T'}</div>}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-xs">{provider.username}</h4>
                                                            <div className="text-[9px] font-bold opacity-50 uppercase">
                                                                {provider.winRate}% Win Rate · {provider.followers} Copiers
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center gap-2">
                                                        <div>
                                                            <div className="text-[#249C6C] font-black text-xs">+{provider.roi}%</div>
                                                            <div className="text-[9px] font-bold opacity-30 uppercase">ROI</div>
                                                        </div>
                                                        <ChevronRight size={14} className="opacity-30 group-hover:opacity-70 transition-all" />
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-center opacity-40 text-xs font-bold py-6">No providers found</div>
                                        )}
                                    </div>

                                    <div className={`mt-3 shrink-0 rounded-2xl border overflow-hidden ${isLight ? 'border-[#249C6C]/15 bg-white/40' : 'border-white/5 bg-white/[0.03]'}`}>
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                                            <div className="flex items-center gap-2">
                                                <Activity size={12} className="text-[#249C6C]" />
                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-50">Active Traders & History</span>
                                            </div>
                                            <button onClick={fetchInvestorCopies} className="text-[7px] font-bold opacity-40 hover:opacity-70 uppercase tracking-widest transition-opacity">Refresh</button>
                                        </div>
                                        <div className="max-h-44 overflow-y-auto no-scrollbar divide-y divide-white/[0.04]">
                                            {isLoadingInvestorCopies ? (
                                                <div className="py-6 flex items-center justify-center">
                                                    <div className="w-5 h-5 border-2 border-[#249C6C]/20 border-t-[#249C6C] rounded-full animate-spin" />
                                                </div>
                                            ) : [...investorCopies.active, ...investorCopies.history].length > 0 ? (
                                                [...investorCopies.active, ...investorCopies.history].map((copy, i) => {
                                                    const isActive = copy.status !== 'closed' && copy.status !== 'stopped';
                                                    return (
                                                        <div key={`${copy.providerAddress}-${copy.activatedAt || i}`} className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-[#249C6C] shadow-[0_0_8px_rgba(36,156,108,0.7)]' : 'bg-white/20'}`} />
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-black truncate">{copy.providerName || `${copy.providerAddress?.substring(0, 6)}...`}</div>
                                                                    <div className="text-[8px] font-bold opacity-40 uppercase tracking-widest">
                                                                        {isActive ? 'Active' : 'History'} · {copy.tradesTaken || 0} trades taken
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest ${copy.mode === 'isolated' ? 'bg-blue-400/10 text-blue-400' : 'bg-amber-400/10 text-amber-400'}`}>
                                                                    {copy.mode || 'cross'}
                                                                </span>
                                                                <div className="text-right">
                                                                    <div className="text-[9px] font-black">{formatCurrency(copy.allocated || copy.stakePerTrade || 0, 0)}</div>
                                                                    <div className={`text-[8px] font-bold ${Number(copy.pnl || 0) >= 0 ? 'text-[#249C6C]' : 'text-red-400'}`}>
                                                                        {Number(copy.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(copy.pnl || 0)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="py-7 text-center">
                                                    <p className="text-[9px] font-bold opacity-30">No copied traders yet</p>
                                                    <p className="text-[8px] font-bold opacity-20 mt-1">Activated traders and past copied trades will appear here</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </div>
                                    </>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="h-full flex flex-col"
                                >
                                    <h3 className={`text-xs font-black uppercase tracking-[0.2em] mb-4 px-2 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Provider Analysis</h3>

                                    <div className={`p-5 rounded-[24px] border ${isLight ? 'bg-transparent border-[#249C6C]/20 shadow-xl' : 'bg-transparent border-white/10 shadow-2xl'} backdrop-blur-xl relative overflow-hidden`}>
                                        
                                        <div className="flex items-start justify-between mb-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] shadow-lg border-2 border-white/5">
                                                    {selectedProvider.avatar && <img src={selectedProvider.avatar} className="w-full h-full object-cover" />}
                                                </div>
                                                <div>
                                                    <h2 className="text-2xl font-black">{selectedProvider.username}</h2>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[11px] font-bold opacity-50 font-mono">{selectedProvider.address.substring(0, 6)}...{selectedProvider.address.slice(-4)}</span>
                                                        <div className="px-2 py-0.5 rounded-full bg-[#249C6C]/20 text-[#249C6C] text-[9px] font-black uppercase tracking-widest">Verified</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3 mb-6">
                                            <div className={`p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-0.5">Win Rate</div>
                                                <div className="text-lg font-black text-[#249C6C]">{selectedProvider.winRate}%</div>
                                            </div>
                                            <div className={`p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-0.5">Total Trades</div>
                                                <div className="text-lg font-black">{selectedProvider.totalTrades}</div>
                                            </div>
                                            <div className={`p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-0.5">Total ROI</div>
                                                <div className="text-lg font-black text-[#249C6C]">+{selectedProvider.roi}%</div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setProviderToCopy(selectedProvider);
                                                setIsCopyModalOpen(true);
                                            }}
                                            className="w-full py-4 rounded-[20px] bg-[#249C6C] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                        >
                                            <Copy size={16} />
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
                    <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center">
                        {isProvider ? (
                            !hasCopyWallet ? (
                                <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center text-center">
                                    <h2 className="text-xl font-black mb-3">Activate Provider Account</h2>
                                    <p className="text-xs font-bold opacity-60 leading-relaxed mb-6">
                                        Your provider application has been approved! You must now generate a dedicated Copy Trading Wallet to receive your performance fees and manage your follower capital.
                                    </p>
                                    <button 
                                        onClick={handleGenerateWallet}
                                        disabled={isGeneratingWallet}
                                        className="w-auto px-8 py-4 rounded-[20px] bg-amber-500 text-black font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(245,158,11,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        {isGeneratingWallet ? 'Generating Wallet...' : 'Generate Copy Trading Wallet'}
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full max-w-4xl mx-auto text-left space-y-6 px-4 pb-8">
                                    {/* Dashboard Header */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-2xl font-black tracking-tight">Provider Dashboard</h2>
                                            <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest mt-0.5">{profile?.providerApplication?.contactInfo?.name || address?.substring(0, 6)} · Active Provider · {profile?.providerApplication?.copyFee || 0}% fee</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[#249C6C] animate-pulse shadow-[0_0_8px_rgba(36,156,108,0.6)]" />
                                            <span className="text-[9px] font-black text-[#249C6C] uppercase tracking-widest">Live</span>
                                        </div>
                                    </div>

                                    {/* Key Metrics */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        {[
                                            { icon: Users, label: 'Followers', value: providerPerformance?.followers ?? profile?.providerStats?.followers ?? 0, color: 'text-[#249C6C]' },
                                            { icon: DollarSign, label: 'AUM', value: `$${(providerPerformance?.aum ?? profile?.providerStats?.aum ?? 0).toLocaleString()}`, color: 'text-blue-400' },
                                            { icon: Activity, label: 'Trades', value: providerPerformance?.totalTrades ?? profile?.stats?.totalTrades ?? 0, color: '' },
                                            { icon: TrendingUp, label: 'Win Rate', value: `${providerPerformance?.winRate ?? (profile?.stats?.totalTrades > 0 ? ((profile.stats.totalWins / profile.stats.totalTrades) * 100).toFixed(1) : '0.0')}%`, color: 'text-[#249C6C]' },
                                            { icon: Trophy, label: 'Revenue', value: `$${(providerPerformance?.revenue ?? profile?.providerStats?.profitGenerated ?? 0).toLocaleString()}`, color: 'text-amber-400' },
                                            { icon: BarChart, label: 'Volume', value: `$${(providerPerformance?.totalVolume ?? profile?.stats?.totalVolume ?? 0).toLocaleString()}`, color: 'text-blue-400' }
                                        ].map((item, idx) => (
                                            <div key={idx} className="bg-white/[0.03] rounded-2xl p-3 border border-white/[0.05]">
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <item.icon size={10} className={item.color || 'text-white/40'} />
                                                    <span className="text-[7px] font-black uppercase opacity-40 tracking-widest">{item.label}</span>
                                                </div>
                                                <div className={`text-base font-black ${item.color}`}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Portfolio Overview */}
                                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                                        <div className="lg:col-span-3 bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <Wallet size={12} className="text-[#249C6C]" />
                                                    <span className="text-[8px] font-black uppercase opacity-40 tracking-widest">Follower Portfolio</span>
                                                </div>
                                                <span className="text-[8px] font-black text-[#249C6C] uppercase tracking-widest">{formatCurrency(providerPerformance?.aum ?? profile?.providerStats?.aum ?? 0, 0)} AUM</span>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {[
                                                    { label: 'Isolated AUM', value: formatCurrency(providerPortfolio.isolatedAllocated, 0), tone: 'text-blue-400' },
                                                    { label: 'Cross Stake', value: formatCurrency(providerPortfolio.crossStake, 0), tone: 'text-amber-400' },
                                                    { label: 'Stake/Trade', value: formatCurrency(providerPortfolio.totalStakePerTrade, 0), tone: 'text-[#249C6C]' },
                                                    { label: 'Follower PnL', value: `${providerPortfolio.totalPnl >= 0 ? '+' : ''}${formatCurrency(providerPortfolio.totalPnl)}`, tone: providerPortfolio.totalPnl >= 0 ? 'text-[#249C6C]' : 'text-red-400' }
                                                ].map(item => (
                                                    <div key={item.label} className="rounded-xl bg-white/[0.03] p-3">
                                                        <div className="text-[7px] font-black opacity-35 uppercase tracking-widest mb-1">{item.label}</div>
                                                        <div className={`text-sm font-black ${item.tone}`}>{item.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                                            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                                <div className="text-[8px] font-black uppercase opacity-40 tracking-widest mb-2">Mode Mix</div>
                                                <div className="h-24">
                                                    {providerPortfolio.modeData.length > 0 ? (
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie data={providerPortfolio.modeData} cx="50%" cy="50%" innerRadius={24} outerRadius={38} dataKey="value" stroke="none">
                                                                    <Cell fill="#60A5FA" />
                                                                    <Cell fill="#F59E0B" />
                                                                </Pie>
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    ) : (
                                                        <div className="h-full flex items-center justify-center text-[8px] font-bold opacity-25">No followers</div>
                                                    )}
                                                </div>
                                                <div className="flex justify-center gap-3 text-[7px] font-black uppercase opacity-60">
                                                    <span className="text-blue-400">Iso {providerPortfolio.isolatedFollowers.length}</span>
                                                    <span className="text-amber-400">Cross {providerPortfolio.crossFollowers.length}</span>
                                                </div>
                                            </div>

                                            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                                <div className="text-[8px] font-black uppercase opacity-40 tracking-widest mb-2">Capital Mix</div>
                                                <div className="h-24">
                                                    {providerPortfolio.allocationData.length > 0 ? (
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie data={providerPortfolio.allocationData} cx="50%" cy="50%" innerRadius={24} outerRadius={38} dataKey="value" stroke="none">
                                                                    <Cell fill="#249C6C" />
                                                                    <Cell fill="#A3E635" />
                                                                </Pie>
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    ) : (
                                                        <div className="h-full flex items-center justify-center text-[8px] font-bold opacity-25">No capital</div>
                                                    )}
                                                </div>
                                                <div className="flex justify-center gap-3 text-[7px] font-black uppercase opacity-60">
                                                    <span className="text-[#249C6C]">Alloc</span>
                                                    <span className="text-lime-300">Stake</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Charts Row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                                        {/* Win Rate Trend Chart */}
                                        <div className="lg:col-span-3 bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <TrendingUp size={12} className="text-[#249C6C]" />
                                                    <span className="text-[8px] font-black uppercase opacity-40 tracking-widest">Win Rate Trend</span>
                                                </div>
                                            </div>
                                            <div className="h-32">
                                                {providerPerformance?.monthlyPerformance?.length > 0 ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={providerPerformance.monthlyPerformance} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                                            <defs>
                                                                <linearGradient id="winRateGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="#249C6C" stopOpacity={0.3} />
                                                                    <stop offset="100%" stopColor="#249C6C" stopOpacity={0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <XAxis dataKey="month" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} axisLine={false} />
                                                            <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                                                            <Tooltip contentStyle={{ background: 'rgba(10,10,10,0.9)', border: 'none', borderRadius: 8, fontSize: 8 }} formatter={(v) => [`${v}%`, 'Win Rate']} />
                                                            <Area type="monotone" dataKey="winRate" stroke="#249C6C" strokeWidth={1.5} fill="url(#winRateGrad)" dot={false} activeDot={{ r: 3, fill: '#249C6C' }} />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-[9px] font-bold opacity-30">No trade data yet</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Win/Loss Donut Chart */}
                                        <div className="lg:col-span-2 bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                            <div className="flex items-center gap-2 mb-3">
                                                <PieChartIcon size={12} className="text-amber-400" />
                                                <span className="text-[8px] font-black uppercase opacity-40 tracking-widest">Win / Loss</span>
                                            </div>
                                            <div className="flex items-center justify-center h-32 gap-4">
                                                {providerPerformance && (providerPerformance.wins > 0 || providerPerformance.losses > 0) ? (
                                                    <>
                                                        <ResponsiveContainer width={100} height={100}>
                                                            <PieChart>
                                                                <Pie data={[
                                                                    { name: 'Wins', value: providerPerformance.wins },
                                                                    { name: 'Losses', value: providerPerformance.losses }
                                                                ]} cx="50%" cy="50%" innerRadius={28} outerRadius={42} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                                                                    <Cell fill="#249C6C" />
                                                                    <Cell fill="rgba(255,255,255,0.1)" />
                                                                </Pie>
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-[#249C6C]" />
                                                                <span className="text-[9px] font-bold text-white/60">Wins <span className="text-white font-black">{providerPerformance.wins}</span></span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-white/10" />
                                                                <span className="text-[9px] font-bold text-white/60">Losses <span className="text-white font-black">{providerPerformance.losses}</span></span>
                                                            </div>
                                                            <div className="text-[8px] font-black text-[#249C6C]">{providerPerformance.winRate}% Win Rate</div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-[9px] font-bold opacity-30">No data yet</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Followers / Subscribers List */}
                                    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.05] overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                                            <div className="flex items-center gap-2">
                                                <Users size={12} className="text-[#249C6C]" />
                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Active Investors ({followers.length})</span>
                                            </div>
                                            <button onClick={fetchFollowers} className="text-[7px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors">Refresh</button>
                                        </div>
                                        {followers.length > 0 ? (
                                            <div className="divide-y divide-white/[0.03]">
                                                {followers.map((f, i) => (
                                                    <div key={i} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_90px_80px_70px] gap-3 items-center px-4 py-3 hover:bg-white/[0.01] transition-colors">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-[#249C6C] to-[#124e36] shrink-0">
                                                                {f.avatar ? <img src={f.avatar} className="w-full h-full object-cover" /> : null}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-xs font-bold truncate block">{f.username}</span>
                                                                <span className="text-[8px] font-mono opacity-25 hidden sm:inline">{f.address?.substring(0, 6)}...{f.address?.slice(-4)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="hidden md:block">
                                                            <div className="text-[7px] font-black opacity-30 uppercase tracking-widest">Allocated</div>
                                                            <div className="text-[9px] font-black">{formatCurrency(f.allocated || 0, 0)}</div>
                                                        </div>
                                                        <div className="hidden md:block">
                                                            <div className="text-[7px] font-black opacity-30 uppercase tracking-widest">Stake/Trade</div>
                                                            <div className="text-[9px] font-black">{formatCurrency(f.stakePerTrade || 0, 0)}</div>
                                                        </div>
                                                        <div className="hidden md:block">
                                                            <div className="text-[7px] font-black opacity-30 uppercase tracking-widest">PnL</div>
                                                            <div className={`text-[9px] font-black ${Number(f.pnl || 0) >= 0 ? 'text-[#249C6C]' : 'text-red-400'}`}>{Number(f.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(f.pnl || 0)}</div>
                                                        </div>
                                                        <div className="flex items-center justify-end">
                                                            <span className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest ${f.mode === 'isolated' ? 'bg-blue-400/10 text-blue-400' : 'bg-amber-400/10 text-amber-400'}`}>
                                                                {f.mode === 'isolated' ? 'Isolated' : 'Cross'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-8 text-center">
                                                <p className="text-[9px] font-bold opacity-30">No active subscribers yet</p>
                                                <p className="text-[8px] font-bold opacity-20 mt-1">Investors will appear here when they start copying your trades</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Monthly Performance + Report Section */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {/* Monthly Volume Bar Chart */}
                                        <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Activity size={12} className="text-blue-400" />
                                                <span className="text-[8px] font-black uppercase opacity-40 tracking-widest">Monthly Volume</span>
                                            </div>
                                            <div className="h-28">
                                                {providerPerformance?.monthlyPerformance?.length > 0 ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ReBarChart data={providerPerformance.monthlyPerformance} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                                            <XAxis dataKey="month" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} axisLine={false} />
                                                            <YAxis tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                                                            <Tooltip contentStyle={{ background: 'rgba(10,10,10,0.9)', border: 'none', borderRadius: 8, fontSize: 8 }} formatter={(v) => [`$${v.toLocaleString()}`, 'Volume']} />
                                                            <Bar dataKey="volume" fill="#249C6C" radius={[2, 2, 0, 0]} />
                                                        </ReBarChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-[9px] font-bold opacity-30">No volume data yet</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Reports Panel */}
                                        <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.05]">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={12} className="text-amber-400" />
                                                    <span className="text-[8px] font-black uppercase opacity-40 tracking-widest">Reports</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {['daily', 'weekly', 'monthly', 'annual', 'all'].map(p => (
                                                        <button key={p} onClick={() => { setReportPeriod(p); fetchReport(p); }}
                                                            className={`px-2 py-1 text-[7px] font-black uppercase tracking-widest rounded transition-colors ${reportPeriod === p ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
                                                            {p === 'all' ? 'All' : p.substring(0, 3)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {providerReport && (
                                                <div className="grid grid-cols-2 gap-2 text-[9px]">
                                                    <div className="bg-white/[0.03] rounded-lg p-2">
                                                        <span className="text-white/30 font-bold uppercase tracking-widest text-[7px] block mb-0.5">Trades</span>
                                                        <span className="font-black">{providerReport.totalTrades}</span>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2">
                                                        <span className="text-white/30 font-bold uppercase tracking-widest text-[7px] block mb-0.5">Win Rate</span>
                                                        <span className="font-black text-[#249C6C]">{providerReport.winRate}%</span>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2">
                                                        <span className="text-white/30 font-bold uppercase tracking-widest text-[7px] block mb-0.5">Volume</span>
                                                        <span className="font-black">${providerReport.totalVolume.toLocaleString()}</span>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2">
                                                        <span className="text-white/30 font-bold uppercase tracking-widest text-[7px] block mb-0.5">PnL</span>
                                                        <span className={`font-black ${providerReport.totalPnl >= 0 ? 'text-[#249C6C]' : 'text-red-400'}`}>{providerReport.totalPnl >= 0 ? '+' : ''}${providerReport.totalPnl.toFixed(2)}</span>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2">
                                                        <span className="text-white/30 font-bold uppercase tracking-widest text-[7px] block mb-0.5">Revenue</span>
                                                        <span className="font-black text-amber-400">${providerReport.revenue.toFixed(2)}</span>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2">
                                                        <span className="text-white/30 font-bold uppercase tracking-widest text-[7px] block mb-0.5">New Followers</span>
                                                        <span className="font-black text-blue-400">+{providerReport.newFollowers}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : isPending ? (
                            <div className={`p-8 rounded-[32px] max-w-md w-full text-center ${isLight ? 'bg-transparent' : 'bg-transparent'} backdrop-blur-xl`}>
                                <div className="flex items-center justify-center gap-1 mb-5">
                                    {[...Array(3)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="w-2 h-10 rounded-full bg-[#249C6C]"
                                            style={{
                                                animation: `futuristicPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                                                boxShadow: '0 0 12px rgba(36,156,108,0.6)',
                                            }}
                                        />
                                    ))}
                                </div>
                                <h2 className="text-lg font-black mb-3">Application Pending</h2>
                                <p className="text-xs font-bold opacity-60 leading-relaxed">
                                    The 15market citadel is reviewing your on-chain trading metrics. You will be notified once approved.
                                </p>
                                <style>{`
                                    @keyframes futuristicPulse {
                                        0%, 80%, 100% { transform: scaleY(0.4); opacity: 0.4; }
                                        40% { transform: scaleY(1.2); opacity: 1; }
                                    }
                                `}</style>
                            </div>
                        ) : appSuccess ? (
                            <motion.div initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} exit={{opacity:0}} className="max-w-sm w-full mx-auto text-center bg-transparent backdrop-blur-xl flex flex-col items-center justify-center">
                                <h2 className="text-2xl font-black mb-1 text-[#249C6C]">Success!</h2>
                                <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Application Submitted</p>
                            </motion.div>
                        ) : (
                            <div className="w-full max-w-sm mx-auto text-center bg-transparent backdrop-blur-xl">
                                {appStep === 0 && (
                                    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center">
                                        <h2 className="text-lg font-black mb-3">Become a Provider</h2>
                                        <p className="text-xs font-bold opacity-60 leading-relaxed mb-6">
                                            Monetize your trading edge. Allow others to copy your trades and earn a flat performance fee on all generated profits. 
                                            Your application will be evaluated based on your historical 15market PnL and win rate.
                                        </p>
                                        <button 
                                            onClick={() => setAppStep(1)}
                                            className="w-auto px-10 py-4 rounded-[20px] bg-[#249C6C] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            Apply
                                        </button>
                                    </motion.div>
                                )}

                                {appStep >= 1 && (
                                    <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="text-left w-full">
                                        <h2 className="text-lg font-black mb-4 text-center">Provider Application</h2>
                                        
                                        <div className="flex flex-col gap-3 mb-6">
                                            <input 
                                                type="text" 
                                                placeholder="Display Name" 
                                                value={appData.name}
                                                onChange={(e) => setAppData({...appData, name: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-3 rounded-xl text-xs font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="Twitter Username" 
                                                value={appData.twitter}
                                                onChange={(e) => setAppData({...appData, twitter: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-3 rounded-xl text-xs font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="Telegram Username" 
                                                value={appData.telegram}
                                                onChange={(e) => setAppData({...appData, telegram: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-3 rounded-xl text-xs font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                            <input 
                                                type="email" 
                                                placeholder="Email Address" 
                                                value={appData.email}
                                                onChange={(e) => setAppData({...appData, email: e.target.value})}
                                                disabled={appStep > 1}
                                                className={`w-full p-3 rounded-xl text-xs font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
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
                                                className={`w-full p-3 rounded-xl text-xs font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                            />
                                        </div>

                                        <button 
                                            onClick={handleApply}
                                            disabled={isApplying || !appData.name || !appData.email || appData.fee === ''}
                                            className="w-auto px-8 py-4 rounded-[20px] bg-[#249C6C] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(36,156,108,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
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
            )}

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
