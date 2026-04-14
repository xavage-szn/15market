import React, { useEffect, useState, useMemo } from "react";
import * as ethers from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { Check, Trophy, Activity, DollarSign, Award, Target, BarChart2, User, Settings, ArrowLeft, ArrowRight, TrendingUp, TrendingDown, Zap, Shield, Globe, MessageSquare, AlertCircle, Copy } from "lucide-react";
import MessagingSystem from "./MessagingSystem";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { LatencyMeter } from "./LatencyMeter";
import ArcABI from "../abi/ArcPrediction.json";
import { KEEPER_URL_ARC, ARC_CONTRACT_ADDRESS, ARC_RPC, KEEPER_URL_ROUNDS, ADMIN_TOKEN } from "../constants";
import { parseEther } from "viem";

export function DashboardPage({ onBack, onAdmin, sessionBalance, evmBalance, onRefill, onWithdraw, treasuryBalance,
    autoSignerFees,
    userProfile,
    theme,
    isSmallScreen,
    evmSessionWallet,
    transactionHistory,
    onViewReceipt,
    uiVersion,
    setUiVersion
}) {
    const isLight = theme === 'light';
    const { isConnected, address } = useAccount();

    const [stats, setStats] = useState({
        userWinRate: 0,
        userTotalTrades: 0,
        userTotalWins: 0,
        marketSentiment: 50,
        marketAvgStake: 0,
        marketTotalVol: 0,
        bullsInfo: 0,
        bearsInfo: 0,
        recentTrades: []
    });
    const [userHistory, setUserHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [localWithdrawAmount, setLocalWithdrawAmount] = useState("");
    const [modalConfig, setModalConfig] = useState(null); // { title: string, message: string, onConfirm: function }
    const [promptConfig, setPromptConfig] = useState(null); // { title: string, placeholder: string, onConfirm: function }

    const [isSyncing, setIsSyncing] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [activeCampaignLeaderboard, setActiveCampaignLeaderboard] = useState([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState(null);
    const [toast, setToast] = useState(null);
    const [enrolling, setEnrolling] = useState(false);
    const [enrollments, setEnrollments] = useState({});

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const paginatedHistory = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return userHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [userHistory, currentPage]);

    const totalPages = Math.ceil(userHistory.length / ITEMS_PER_PAGE);

    // Fetch Data
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const xHandle = params.get('x_handle');
        const xImage = params.get('x_image');
        if (xHandle && address) {
            handleSyncX(xHandle, xImage);
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 20000); // Poll every 20s — analytics data is not real-time
        return () => clearInterval(interval);
    }, [address]);

    const handleSyncX = async (handle, image) => {
        if (!address) return;
        setIsSyncing(true);
        try {
            // Sync to Keeper (Handle + Image)
            await fetch(`${KEEPER_URL_ARC}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address,
                    username: userProfile?.username || `Trader_${address.slice(0, 4)}`,
                    xHandle: handle,
                    xProfileImage: image || "",
                })
            });

            console.log("✅ X handle & image synced successfully!");
            fetchMetrics();
        } catch (e) {
            console.error("Sync failed:", e);
        } finally {
            setIsSyncing(false);
        }
    };

    const fetchMetrics = async () => {
        try {
            // AUTHORITATIVE BACKEND METRICS
            if (address) {
                const res = await fetch(`${KEEPER_URL_ARC}/profile?address=${address}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.stats) {
                        setStats(prev => ({
                            ...prev,
                            userWinRate: data.stats.totalTrades > 0 ? ((data.stats.totalWins / data.stats.totalTrades) * 100).toFixed(1) : 0,
                            userTotalTrades: data.stats.totalTrades || 0,
                            userTotalWins: data.stats.totalWins || 0
                        }));
                    }
                }
            }

            // Global Market Data... (keep existing logic for market pulse)
            const savedHistory = localStorage.getItem("15market_global_history_v2");
            let history = savedHistory ? JSON.parse(savedHistory) : [];

            let bulls = 0;
            let bears = 0;
            let totalStake = 0;
            let vol = 0;

            history.forEach(trade => {
                const amt = parseFloat(trade.amount || 0);
                if (String(trade.direction).toUpperCase().includes("UP")) bulls++;
                else bears++;
                totalStake += amt;
                vol += amt;
            });

            const total = bulls + bears;

            setStats(prev => ({
                ...prev,
                marketSentiment: total > 0 ? ((bulls / total) * 100).toFixed(0) : 50,
                marketAvgStake: total > 0 ? (totalStake / total).toFixed(3) : "0.000",
                marketTotalVol: vol.toFixed(3),
                bullsInfo: bulls,
                bearsInfo: bears,
                recentTrades: history.slice(0, 50)
            }));

            setIsLoading(false);
        } catch (e) {
            console.error("Dashboard Sync Error:", e);
            setIsLoading(false);
        }
    };

    const fetchCampaigns = async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/campaigns`);
            if (!res.ok) return;
            const data = await res.json();
            setCampaigns(data);

            if (address && data.length > 0) {
                const newEnrollments = {};
                for (const c of data) {
                   const eRes = await fetch(`${KEEPER_URL_ARC}/enroll?campaignId=${c.id}&address=${address}`);
                   if (eRes.ok) {
                       const eData = await eRes.json();
                       newEnrollments[c.id] = eData.enrolled;
                   }
                }
                setEnrollments(newEnrollments);
            }
        } catch (e) {}
    };

    const fetchActiveLeaderboard = async () => {
        if (!selectedCampaignId) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/leaderboard?campaignId=${selectedCampaignId}`);
            if (!res.ok) return;
            const data = await res.json();
            setActiveCampaignLeaderboard(data);
        } catch (e) {}
    };

    useEffect(() => {
        fetchCampaigns();
        const interval = setInterval(fetchCampaigns, 15000);
        return () => clearInterval(interval);
    }, [address]);

    useEffect(() => {
        if (selectedCampaignId) {
            fetchActiveLeaderboard();
            const interval = setInterval(fetchActiveLeaderboard, 5000);
            return () => clearInterval(interval);
        }
    }, [selectedCampaignId]);

    const handleEnroll = async (cid) => {
        if (!address) return;
        setEnrolling(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/enroll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId: cid, address })
            });

            if (res.ok) {
                setEnrollments(prev => ({ ...prev, [cid]: true }));
                if (!selectedCampaignId) setSelectedCampaignId(cid);
            }
        } catch (e) {} finally { setEnrolling(false); }
    };

    const chartData = useMemo(() => {
        return stats.recentTrades
            .slice(0, 20)
            .reverse()
            .map((t, i) => ({
                name: i,
                amount: parseFloat(t.amount),
                type: (t.direction === "UP" || t.direction === 1 || String(t.direction) === "1") ? 1 : -1
            }));
    }, [stats.recentTrades]);


    const truncate = (str) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : "";

    return (
        <div className={`h-screen w-full flex flex-col overflow-hidden ${isLight ? 'bg-[#b4d9c7] text-[#0a261a]' : 'bg-transparent text-white'}`}>
            <div className={`flex-none ${isLight ? 'bg-[#b4d9c7]/90 border-[#3CB371]/35 shadow-sm' : 'bg-[#0d0d0d] border-white/5'} border-b backdrop-blur-xl`}>
                <div className="max-w-[1600px] mx-auto p-3 md:px-8 md:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onBack}
                                className={`p-2 md:p-2.5 rounded-full ${isLight ? 'bg-[#3CB371]/5 hover:bg-[#3CB371]/10 border-[#3CB371]/10 text-[#0a261a]' : 'bg-white/5 hover:bg-white/10 border-white/5 text-white'} border transition-colors group px-4 md:px-5`}
                            >
                                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                            </button>
                            <div>
                                <h1 className="text-lg md:text-xl font-black uppercase tracking-tighter flex items-center gap-2">
                                    Dashboard
                                    <span className={`text-[8px] md:text-[9px] ${isLight ? 'bg-[#3CB371]/10 text-[#3CB371] border-[#3CB371]/20' : 'bg-[#3CB371]/20 text-[#3CB371] border-[#3CB371]/30'} px-2 py-0.5 rounded border`}>Live</span>
                                </h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                            <button
                                onClick={onAdmin}
                                className={`p-2.5 rounded-2xl border transition-all flex items-center gap-2 group ${isLight ? 'bg-white border-[#3CB371]/20 hover:bg-[#3CB371]/10 text-black' : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'}`}
                            >
                                <Shield size={14} className="text-[#3CB371]" />
                                <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">Citadel</span>
                            </button>
                            <div className="flex flex-col items-end">
                                <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-[#3D5A4C]/40' : 'text-white/20'}`}>Authorized Wallet</p>
                                <p className={`text-[10px] font-bold font-mono ${isLight ? 'text-[#3CB371]' : 'text-[#3CB371]'}`}>{truncate(address)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="max-w-[1700px] mx-auto h-full p-4 md:p-6 lg:p-8 flex flex-col gap-6">
                    {/* Unified Grid Layout - 3 Column: Controls | Transactions | Analytics+Chat */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">

                        {/* COL 1: Profile + Auto-Signer + Activity (lg:col-span-4) */}
                        <div className="lg:col-span-4 flex flex-col gap-5 min-h-0">
                            {/* Profile & Auto-Signer Compact Card */}
                            <div className={`p-5 border rounded-[28px] ${isLight ? 'bg-[#cce3d7] border-[#3CB371]/35 shadow-sm' : 'bg-[#111] border-white/5'} flex flex-col gap-5`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3CB371] to-black p-[1px]">
                                        <div className={`w-full h-full rounded-full ${isLight ? 'bg-[#c8ddd2]' : 'bg-[#050505]'} flex items-center justify-center overflow-hidden`}>
                                            {userProfile?.xProfileImage ? (
                                                <img src={userProfile.xProfileImage} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={20} className={isLight ? 'text-[#3CB371]/40' : 'text-white/50'} />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className={`text-base font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} leading-tight`}>{userProfile?.username || "Trader"}</h2>
                                        <div className={`text-[8px] font-mono uppercase tracking-widest opacity-40`}>{truncate(address)}</div>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5 w-full" />

                                {/* Trading Wallet Control Section */}
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className={`text-[9px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'}`}>Trading Wallet</h4>
                                            {evmSessionWallet?.address && (
                                                <div 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(evmSessionWallet.address);
                                                        setToast("Address Copied!");
                                                        setTimeout(() => setToast(null), 2000);
                                                    }}
                                                    className={`text-[8px] font-mono opacity-40 hover:opacity-100 cursor-pointer transition-all mt-1 flex items-center gap-1 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}
                                                >
                                                    {truncate(evmSessionWallet.address)}
                                                    <Copy size={8} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-xl font-black text-[#3CB371] tabular-nums">${(parseFloat(sessionBalance || 0)).toFixed(2)}</div>
                                    </div>

                                    {/* Main Wallet Source */}
                                    <div className={`mb-4 p-3 rounded-2xl border ${isLight ? 'bg-white/40 border-[#3CB371]/20' : 'bg-white/5 border-white/10'}`}>
                                        <div className="flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className={`text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]/40' : 'text-white/30'}`}>Main Wallet Balance</span>
                                                <span className={`text-[9px] font-mono font-bold ${isLight ? 'text-[#0a261a]/60' : 'text-white/60'}`}>{truncate(address)}</span>
                                            </div>
                                            <div className={`text-sm font-black ${isLight ? 'text-[#0a261a]' : 'text-white/90'}`}>
                                                ${(parseFloat(evmBalance || 0)).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button onClick={() => setPromptConfig({
                                            title: "Refill Trading Wallet",
                                            placeholder: "USDC Amount from Main",
                                            onConfirm: (val) => onRefill(parseFloat(val))
                                        })} className="py-3 bg-[#3CB371] text-white text-[9px] font-black uppercase tracking-[0.2em] rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#3CB371]/20">
                                            Refill
                                        </button>
                                        <button onClick={() => setPromptConfig({
                                            title: "Sweep to Main Wallet",
                                            placeholder: "Withdraw Amount",
                                            onConfirm: (val) => onWithdraw(val)
                                        })} className={`py-3 ${isLight ? 'bg-white/40 border-[#3CB371]/20 text-[#0a261a]' : 'bg-white/5 border-white/10 text-white'} border text-[9px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-white/10 active:scale-95 transition-all`}>
                                            Sweep
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Activity Pulse Chart - Desktop Only */}
                            {!isSmallScreen && (
                            <div className={`hidden lg:flex flex-1 min-h-[120px] ${isLight ? 'bg-[#cce3d7] border-[#3CB371]/35 shadow-sm' : 'bg-[#111] border-white/5'} border rounded-[28px] p-5 overflow-hidden flex-col`}>
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className={`text-[9px] font-black uppercase tracking-[0.3em] opacity-40`}>Activity Pulse</h3>
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#3CB371] animate-pulse" />
                                </div>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3CB371" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#3CB371" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="name" hide />
                                            <YAxis hide domain={['auto', 'auto']} />
                                            <Area type="monotone" dataKey="amount" stroke="#3CB371" fillOpacity={1} fill="url(#colorAmt)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            )}
                        </div>

                        {/* COL 2: Transaction Matrix - Desktop Only */}
                        {!isSmallScreen && (
                        <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 min-h-0">
                            <div className={`flex-1 min-h-0 ${isLight ? 'bg-[#cce3d7] border-[#3CB371]/35 shadow-sm' : 'bg-[#111] border-white/5'} border rounded-[28px] p-5 flex flex-col`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className={`text-[9px] font-black uppercase tracking-[0.3em] opacity-40`}>Transactions</h3>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            className={`p-1 rounded-lg border ${isLight ? 'bg-[#cce0d5] border-[#3CB371]/20' : 'bg-black/40 border-white/10'} disabled:opacity-20 hover:border-[#3CB371]/40 transition-all`}
                                        >
                                            <ArrowLeft size={10} />
                                        </button>
                                        <span className="text-[8px] font-black opacity-30 uppercase tabular-nums">{currentPage}/{Math.max(1, Math.ceil((transactionHistory?.length || 0) / 5))}</span>
                                        <button
                                            disabled={currentPage >= Math.ceil((transactionHistory?.length || 0) / 5)}
                                            onClick={() => setCurrentPage(prev => prev + 1)}
                                            className={`p-1 rounded-lg border ${isLight ? 'bg-[#cce0d5] border-[#3CB371]/20' : 'bg-black/40 border-white/10'} disabled:opacity-20 hover:border-[#3CB371]/40 transition-all`}
                                        >
                                            <ArrowRight size={10} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-hidden flex flex-col gap-2">
                                    {!transactionHistory || transactionHistory.length === 0 ? (
                                        <div className={`flex-1 flex items-center justify-center ${isLight ? 'text-[#0a261a]/20' : 'text-white/10'} text-[9px] uppercase font-black text-center`}>No transactions<br />recognized</div>
                                    ) : transactionHistory.slice((currentPage - 1) * 5, currentPage * 5).map((tx, i) => (
                                        <div key={tx.id || i} className={`p-3 ${isLight ? 'bg-[#d4e6dc] border-[#3CB371]/15' : 'bg-white/[0.03] border-white/5'} border rounded-2xl flex flex-col gap-1 transition-all hover:border-[#3CB371]/40`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1 rounded-lg ${tx.type === "DEPOSIT" ? "bg-[#3CB371]/20 text-[#3CB371]" : "bg-[#FF7F50]/20 text-[#FF7F50]"}`}>
                                                        {tx.type === "DEPOSIT" ? <Zap size={10} /> : <Shield size={10} />}
                                                    </div>
                                                    <div className="text-[9px] font-black uppercase">{tx.type === "DEPOSIT" ? "In" : "Out"}</div>
                                                </div>
                                                <div className={`text-[10px] font-black ${tx.type === "DEPOSIT" ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>
                                                    {tx.type === "DEPOSIT" ? '+' : '-'}{tx.amount}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className={`text-[7px] opacity-30 font-bold uppercase`}>{new Date(tx.timestamp).toLocaleDateString()}</div>
                                                <button onClick={() => onViewReceipt?.(tx)} className="text-[7px] font-black text-[#3CB371]/50 underline uppercase hover:text-[#3CB371]">Receipt</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        )}

                        {/* COL 3: Analytics Stats + Community Chat (lg:col-span-5) */}
                        <div className="lg:col-span-5 flex flex-col gap-5 min-h-0">
                            {/* Analytics Quick Stats */}
                            <div className="grid grid-cols-2 gap-3 flex-none">
                                <div className={`p-3 border rounded-2xl ${isLight ? 'bg-[#cce3d7] border-[#3CB371]/35 shadow-sm' : 'bg-[#111] border-white/5'}`}>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">24h Volume</div>
                                    <div className={`text-base font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{stats.marketTotalVol}</div>
                                    <div className="text-[7px] opacity-20 uppercase font-bold">USDC</div>
                                </div>
                                <div className={`p-3 border rounded-2xl ${isLight ? 'bg-[#d4e6dc] border-[#3CB371]/20' : 'bg-[#111] border-white/5'}`}>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">Sentiment</div>
                                    <div className="text-base font-black text-[#3CB371]">{stats.marketSentiment}%</div>
                                    <div className="text-[7px] opacity-20 uppercase font-bold">Bullish</div>
                                </div>
                                <div className={`p-3 border rounded-2xl ${isLight ? 'bg-[#d4e6dc] border-[#3CB371]/20' : 'bg-[#111] border-white/5'}`}>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">Win Rate</div>
                                    <div className="text-base font-black text-[#FF7F50]">{stats.userWinRate}%</div>
                                    <div className="text-[7px] opacity-20 uppercase font-bold">Efficiency</div>
                                </div>
                                <div className={`p-3 border rounded-2xl ${isLight ? 'bg-[#d4e6dc] border-[#3CB371]/20' : 'bg-[#111] border-white/5'}`}>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">Avg Stake</div>
                                    <div className={`text-base font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{stats.marketAvgStake}</div>
                                    <div className="text-[7px] opacity-20 uppercase font-bold">USDC</div>
                                </div>
                            </div>

                            {/* Dynamic Campaigns Section - Replaces Generic Chat on Mobile/Dashboard context */}
                            <div className={`flex-1 ${isLight ? 'bg-[#cce3d7] border-[#3CB371]/35 shadow-sm' : 'bg-[#111] border-white/5'} border rounded-[28px] overflow-hidden flex flex-col min-h-0`}>
                                <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Trophy size={14} className="text-[#3CB371]" />
                                        <h3 className={`text-[9px] font-black uppercase tracking-widest opacity-40`}>Campaigns & Leaderboards</h3>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#3CB371] animate-pulse" />
                                        <span className="text-[8px] text-[#3CB371] font-bold uppercase tracking-widest">LIVE EVENT</span>
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-3">
                                    {/* Campaign Selector / List */}
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                        {campaigns.length === 0 ? (
                                            <div className="text-[8px] font-black opacity-20 uppercase py-2">No active campaigns</div>
                                        ) : campaigns.map(c => {
                                            const isUpcoming = Date.now() < c.startTime;
                                            const canJoin = isUpcoming;
                                            const isJoined = enrollments[c.id];
                                            const isSelected = selectedCampaignId === c.id;

                                            return (
                                                <button 
                                                    key={c.id}
                                                    onClick={() => setSelectedCampaignId(c.id)}
                                                    className={`shrink-0 px-4 py-2 rounded-xl border transition-all flex flex-col gap-1 min-w-[120px]
                                                        ${isSelected ? 'bg-[#3CB371]/20 border-[#3CB371]/40 shadow-sm' : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'}
                                                    `}
                                                >
                                                    <span className="text-[9px] font-black uppercase truncate w-full text-left">{c.title}</span>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className={`text-[7px] font-black uppercase ${isUpcoming ? 'text-amber-500' : 'text-[#3CB371]'}`}>
                                                            {isUpcoming ? 'Upcoming' : 'Active'}
                                                        </span>
                                                        {isJoined && <Check size={10} className="text-[#3CB371]" />}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Campaign Details / Leaderboard Area */}
                                    {selectedCampaignId ? (
                                        <div className={`flex-1 flex flex-col min-h-0 rounded-2xl p-4 gap-4 ${isLight ? 'bg-[#d4e6dc]' : 'bg-black/20'}`}>
                                            {/* Header */}
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-[8px] font-black opacity-40 uppercase tracking-widest">Prize Pool</div>
                                                    <div className="text-sm font-black text-[#3CB371]">{campaigns.find(c => c.id === selectedCampaignId)?.prize || 'USDC Entry'}</div>
                                                </div>
                                                {!enrollments[selectedCampaignId] ? (
                                                    <button 
                                                        disabled={enrolling || Date.now() >= (campaigns.find(c => c.id === selectedCampaignId)?.startTime || 0)}
                                                        onClick={() => handleEnroll(selectedCampaignId)}
                                                        className="px-5 py-2 bg-[#3CB371] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 disabled:opacity-30"
                                                    >
                                                        {Date.now() >= (campaigns.find(c => c.id === selectedCampaignId)?.startTime || 0) ? 'Entry Ended' : (enrolling ? 'Joining...' : 'Enroll Now')}
                                                    </button>
                                                ) : (
                                                    <div className="px-4 py-1.5 bg-[#3CB371]/20 text-[#3CB371] text-[8px] font-black uppercase tracking-widest rounded-xl border border-[#3CB371]/20">Joined</div>
                                                )}
                                            </div>

                                            {/* Live Mini-Leaderboard */}
                                            <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto no-scrollbar">
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest border-b border-white/5 pb-1">Leaderboard Sync</div>
                                                <div className="flex flex-col gap-1.5">
                                                    {activeCampaignLeaderboard.slice(0, 8).map((entry, idx) => {
                                                        const isMe = address && entry.address.toLowerCase() === address.toLowerCase();
                                                        return (
                                                            <motion.div 
                                                                layout
                                                                key={entry.address}
                                                                initial={{ opacity: 0, x: -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                className={`flex items-center justify-between p-2 rounded-xl transition-all ${isMe ? 'bg-[#3CB371]/30 border border-[#3CB371]/40' : 'bg-white/5 hover:bg-white/10'}`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`text-[10px] font-black ${idx < 3 ? 'text-[#3CB371]' : 'opacity-40'}`}>#{idx + 1}</span>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-bold font-mono">{truncate(entry.address)}</span>
                                                                        {isMe && <span className="text-[6px] font-black text-[#3CB371] uppercase">My Position</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="text-[10px] font-black text-[#3CB371]">{entry.wins} W</div>
                                                            </motion.div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center opacity-20 text-[9px] font-black uppercase">Select a campaign to view standing</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {modalConfig && (
                <div className={`fixed inset-0 z-[200] flex items-center justify-center px-4 ${isLight ? 'bg-[#0a261a]/20' : 'bg-black/60'} backdrop-blur-sm`}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className={`w-full max-w-md ${isLight ? 'bg-[#b4d9c7] border-[#3CB371]/40 shadow-2xl' : 'bg-[#0a0a0a] border-white/10 shadow-2xl'} border rounded-[32px] p-8 relative overflow-hidden`}
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#3CB371]/10 blur-[80px] pointer-events-none" />
                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-[#3CB371]/10 flex items-center justify-center mb-6">
                                {modalConfig.type === 'alert' ? (
                                    <AlertCircle size={32} className="text-[#3CB371]" />
                                ) : (
                                    <Zap size={32} className="text-[#3CB371]" />
                                )}
                            </div>
                            <h3 className={`text-2xl font-black ${isLight ? 'text-gray-900' : 'text-white'} mb-2 tracking-tight uppercase`}>
                                {modalConfig.title}
                            </h3>
                            <p className={`text-sm font-medium ${isLight ? 'text-gray-500' : 'text-white/50'} mb-8 whitespace-pre-line leading-relaxed`}>
                                {modalConfig.message}
                            </p>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                {modalConfig.type === 'confirm' && (
                                    <button
                                        onClick={() => setModalConfig(null)}
                                        className={`py-4 ${isLight ? 'bg-[#cce0d5] hover:bg-[#bed9ce] border-[#3CB371]/20 text-[#0a261a]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'} border text-xs font-black uppercase tracking-widest rounded-full transition-all`}
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (modalConfig.onConfirm) modalConfig.onConfirm();
                                        setModalConfig(null);
                                    }}
                                    className={`py-4 bg-[#3CB371] text-white text-xs font-black uppercase tracking-widest rounded-full hover:brightness-110 active:scale-[0.98] transition-all ${modalConfig.type === 'alert' ? 'col-span-2' : ''}`}
                                >
                                    {modalConfig.confirmText || "OK"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {promptConfig && (
                <div className={`fixed inset-0 z-[200] flex items-center justify-center px-4 ${isLight ? 'bg-[#0a261a]/20' : 'bg-black/60'} backdrop-blur-sm`}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className={`w-full max-w-md ${isLight ? 'bg-[#b4d9c7] border-[#3CB371]/40 shadow-2xl' : 'bg-[#0a0a0a] border-white/10 shadow-2xl'} border rounded-[32px] p-8 relative overflow-hidden`}
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#3CB371]/10 blur-[80px] pointer-events-none" />
                        <div className="relative z-10">
                            <h3 className={`text-2xl font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} mb-6 tracking-tight uppercase text-center`}>
                                {promptConfig.title}
                            </h3>
                            <div className="mb-8 relative">
                                <input
                                    type="number"
                                    autoFocus
                                    placeholder={promptConfig.placeholder}
                                    className={`w-full ${isLight ? 'bg-[#cce0d5] border-[#3CB371]/20 text-[#0a261a] placeholder:text-[#0a261a]/30' : 'bg-white/5 border-white/10 text-white placeholder:text-white/10'} border rounded-2xl py-4 px-6 font-black text-center focus:border-[#3CB371]/50 outline-none transition-all`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            promptConfig.onConfirm(e.target.value);
                                            setPromptConfig(null);
                                        }
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <button
                                    onClick={() => setPromptConfig(null)}
                                    className={`py-4 ${isLight ? 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'} border text-xs font-black uppercase tracking-widest rounded-full transition-all font-sans`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const val = document.querySelector('input[type="number"]').value;
                                        promptConfig.onConfirm(val);
                                        setPromptConfig(null);
                                    }}
                                    className="py-4 bg-[#3CB371] text-white text-xs font-black uppercase tracking-widest rounded-full hover:brightness-110 active:scale-[0.98] transition-all font-sans"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
            {toast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300]">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="bg-[#3CB371] text-white px-6 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-widest border border-white/20"
                    >
                        {toast}
                    </motion.div>
                </div>
            )}
        </div>
    );
};

const NavTab = React.memo(({ active, id, label, icon, onClick, isLight }) => {
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${active === id
                ? 'bg-[#3CB371] text-white shadow-lg'
                : `${isLight ? 'text-[#0a261a]/40 hover:text-[#0a261a] hover:bg-[#3CB371]/5' : 'text-white/40 hover:text-white hover:bg-white/5'}`
                }`}
        >
            {icon}
            {label}
        </button>
    );
});

const StatCard = React.memo(({ label, value, sub, icon, highlight, isLight, compact }) => {
    return (
        <div className={`${compact ? 'p-3 md:p-4' : 'p-4 md:p-6'} rounded-[24px] border ${highlight ? 'bg-[#FF7F50]/10 border-[#FF7F50]/30 shadow-lg' : `${isLight ? 'bg-[#f8fdfb] border-[#3CB371]/10' : 'bg-[#111] border-white/5'}`}`}>
            <div className="flex justify-between items-start mb-2 md:mb-4">
                <div className={`text-[7px] md:text-[9px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'}`}>{label}</div>
                <div className={`p-1.5 ${isLight ? 'bg-[#3CB371]/5' : 'bg-white/5'} rounded-lg`}>{icon}</div>
            </div>
            <div className={`${compact ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black mb-1 tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{value}</div>
            <div className={`text-[7px] md:text-[9px] font-bold ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase`}>{sub}</div>
        </div>
    );
});
