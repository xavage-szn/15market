import React, { useEffect, useState, useMemo } from "react";
import { ethers } from "ethers";
import { motion } from "framer-motion";
import {
    Activity,
    DollarSign,
    Award,
    Target,
    BarChart2,
    User,
    Settings,
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    Zap,
    Shield,
    Globe,
    MessageSquare,
    AlertCircle
} from "lucide-react";
import MessagingSystem from "./MessagingSystem";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { LatencyMeter } from "./LatencyMeter";
import { useAccount } from "wagmi";
import ArcABI from "../abi/ArcPrediction.json";
import { KEEPER_URL_ARC, ARC_CONTRACT_ADDRESS, ARC_RPC } from "../constants";
import { parseEther } from "viem";

export const DashboardPage = ({ onBack, sessionBalance, onRefill, onWithdraw, treasuryBalance,
    autoSignerFees,
    userProfile,
    theme,
    evmSessionWallet,
    transactionHistory,
    onViewReceipt
}) => {
    const isLight = theme === 'light';
    const { isConnected, address } = useAccount();

    const [activeTab, setActiveTab] = useState("overview"); // overview, profile, community
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
        const interval = setInterval(fetchMetrics, 5000); // Poll every 5s
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
                    if (data) {
                        setStats(prev => ({
                            ...prev,
                            userWinRate: data.totalTrades > 0 ? ((data.totalWins / data.totalTrades) * 100).toFixed(1) : 0,
                            userTotalTrades: data.totalTrades || 0,
                            userTotalWins: data.totalWins || 0
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
                marketTotalVol: vol.toFixed(2),
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

    const chartData = useMemo(() => {
        return stats.recentTrades
            .slice(0, 20)
            .reverse()
            .map((t, i) => ({
                name: i,
                amount: parseFloat(t.amount),
                type: t.direction === "UP" ? 1 : -1
            }));
    }, [stats.recentTrades]);

    const truncate = (str) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : "";

    return (
        <div className={`min-h-screen w-full flex flex-col ${isLight ? 'bg-[#f8f9fa] text-gray-900' : 'bg-transparent text-white'}`}>
            <div className={`sticky top-0 z-40 ${isLight ? 'bg-white border-gray-200' : 'bg-[#0d0d0d] border-white/5'} border-b backdrop-blur-xl`}>
                <div className="max-w-7xl mx-auto p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onBack}
                                className={`p-2 md:p-3 rounded-xl ${isLight ? 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-900' : 'bg-white/5 hover:bg-white/10 border-white/5 text-white'} border transition-colors group`}
                            >
                                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                            </button>
                            <div>
                                <h1 className="text-lg md:text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                                    Command Center
                                    <span className="text-[8px] md:text-[10px] bg-[#3CB371]/20 text-[#3CB371] px-2 py-0.5 rounded border border-[#3CB371]/30">ARC LIVE</span>
                                </h1>
                                <p className={`text-[10px] md:text-xs ${isLight ? 'text-gray-500' : 'text-white/40'} font-bold uppercase tracking-widest hidden md:block`}>
                                    {address ? truncate(address) : "Guest View"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
                        <div className={`flex ${isLight ? 'bg-gray-100 border-gray-200' : 'bg-[#111] border-white/5'} p-1 rounded-xl border w-max md:w-auto`}>
                            <NavTab active={activeTab} id="overview" label="Overview" icon={<Activity size={14} />} onClick={setActiveTab} isLight={isLight} />
                            <NavTab active={activeTab} id="profile" label="My Profile" icon={<User size={14} />} onClick={setActiveTab} isLight={isLight} />
                            <NavTab active={activeTab} id="community" label="Community" icon={<MessageSquare size={14} />} onClick={setActiveTab} isLight={isLight} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto p-4 md:p-8">
                    <div>
                        {activeTab === "overview" && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <StatCard
                                        label="Market Volume"
                                        value={`${stats.marketTotalVol} USDC`}
                                        sub="24h Observed"
                                        icon={<Globe size={16} className="text-[#3CB371]" />}
                                        isLight={isLight}
                                    />
                                    <StatCard
                                        label="Bullish Sentiment"
                                        value={`${stats.marketSentiment}%`}
                                        sub={`${stats.bullsInfo} Calls vs ${stats.bearsInfo} Puts`}
                                        icon={<TrendingUp size={16} className={Number(stats.marketSentiment) > 50 ? "text-[#3CB371]" : isLight ? "text-gray-300" : "text-white/20"} />}
                                        isLight={isLight}
                                    />
                                    <StatCard
                                        label="Avg. Stake Size"
                                        value={`${stats.marketAvgStake} USDC`}
                                        sub="Per Trade"
                                        icon={<DollarSign size={16} className="text-[#3CB371]" />}
                                        isLight={isLight}
                                    />
                                    <StatCard
                                        label="Your Win Rate"
                                        value={`${stats.userWinRate}%`}
                                        sub={`${stats.userTotalWins} / ${stats.userTotalTrades} Trades`}
                                        icon={<Award size={16} className="text-[#3CB371]" />}
                                        highlight
                                        isLight={isLight}
                                    />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    <div className={`lg:col-span-2 ${isLight ? 'bg-white border-gray-200' : 'bg-[#111] border-white/5'} border rounded-[24px] p-6 relative overflow-hidden`}>
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className={`text-sm font-black uppercase tracking-widest ${isLight ? 'text-gray-400' : 'text-white/40'}`}>Market Activity Pulse</h3>
                                            <div className="flex gap-2">
                                                <span className="h-2 w-2 rounded-full bg-[#3CB371] animate-pulse" />
                                                <span className="text-[10px] text-[#3CB371] font-bold">Real-time</span>
                                            </div>
                                        </div>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={chartData}>
                                                    <defs>
                                                        <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#3CB371" stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor="#3CB371" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: isLight ? '#fff' : '#000', border: isLight ? '1px solid #ddd' : '1px solid #333', borderRadius: '8px' }}
                                                        itemStyle={{ color: isLight ? '#000' : '#fff' }}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="amount"
                                                        stroke="#3CB371"
                                                        fillOpacity={1}
                                                        fill="url(#colorAmt)"
                                                        strokeWidth={2}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-6 lg:col-span-2">
                                        <div className={`${isLight ? 'bg-white border-gray-200' : 'bg-[#111] border-white/5'} border rounded-[24px] p-6 flex flex-col h-full`}>
                                            <h3 className={`text-sm font-black uppercase tracking-widest ${isLight ? 'text-gray-400' : 'text-white/40'} mb-4`}>Recent Signals</h3>
                                            <div className="flex-1 overflow-y-auto space-y-3 max-h-[180px] custom-scrollbar">
                                                {stats.recentTrades.length === 0 ? (
                                                    <div className={`text-center py-4 ${isLight ? 'text-gray-200' : 'text-white/10'} text-[10px] uppercase font-black`}>No active signals</div>
                                                ) : stats.recentTrades.map((t, i) => (
                                                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${isLight ? 'bg-gray-50 border-gray-100' : 'bg-white/[0.02] border-white/5'} border`}>
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${t.direction === "UP" ? "bg-[#3CB371]/10 text-[#3CB371]" : "bg-orange-500/10 text-orange-500"}`}>
                                                                {t.direction === "UP" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] font-bold">{t.user?.slice(0, 6) || "Trader"}</div>
                                                                <div className={`text-[8px] ${isLight ? 'text-gray-400' : 'text-white/30'} uppercase`}>{t.direction}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] font-mono font-bold text-[#3CB371]">{t.amount} USDC</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "profile" && (
                            <div className={`max-w-2xl mx-auto ${isLight ? 'bg-white border-gray-200' : 'bg-[#111] border-white/5'} border rounded-[32px] p-8`}>
                                <div className="flex flex-col items-center mb-8">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#3CB371] to-black p-[2px] mb-4 overflow-hidden">
                                        <div className={`w-full h-full rounded-full ${isLight ? 'bg-gray-50' : 'bg-[#050505]'} flex items-center justify-center overflow-hidden`}>
                                            {userProfile?.xProfileImage ? (
                                                <img src={userProfile.xProfileImage} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={40} className={isLight ? 'text-gray-300' : 'text-white/50'} />
                                            )}
                                        </div>
                                    </div>
                                    <h2 className="text-2xl font-black">{userProfile?.username || (address ? "Trader" : "Guest User")}</h2>
                                    <div className={`text-sm ${isLight ? 'text-gray-400' : 'text-white/40'} font-mono mb-4 text-center`}>
                                        {address}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {userProfile?.xHandle ? (
                                            <div className="flex items-center gap-2 px-4 py-2 bg-[#3CB371]/10 border border-[#3CB371]/20 rounded-xl text-[#3CB371]">
                                                <Globe size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">@{userProfile.xHandle}</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const CLIENT_ID = 'cDdEeHQwYnp4Y2lJRVMzdk5CRlg6MTpjaQ';
                                                        const REDIRECT_URI = encodeURIComponent(`${KEEPER_URL_ARC}/auth/twitter/callback`);
                                                        const SCOPE = encodeURIComponent('users.read tweet.read offline.access');

                                                        const prepareRes = await fetch(`${KEEPER_URL_ARC}/auth/twitter/prepare`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ address })
                                                        });
                                                        const { state: stateId } = await prepareRes.json();

                                                        if (!stateId) throw new Error("Failed to prepare secure state");

                                                        const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&state=${stateId}&code_challenge=challenge&code_challenge_method=plain`;
                                                        window.location.href = url;
                                                    } catch (e) {
                                                        console.error("X Auth Preparation Failed:", e);
                                                        setModalConfig({
                                                            title: "Auth Error",
                                                            message: "Failed to initiate secure login. Please try again.",
                                                            type: 'alert'
                                                        });
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-[#3CB371]/10 border border-[#3CB371]/20 rounded-xl text-[#3CB371] hover:bg-[#3CB371]/20 transition-all"
                                            >
                                                <MessageSquare size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Link Twitter (X)</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className={`p-4 ${isLight ? 'bg-gray-50 border-gray-100' : 'bg-white/5 border-white/5'} border rounded-2xl text-center`}>
                                        <div className="text-3xl font-black text-[#3CB371]">{stats.userTotalWins}</div>
                                        <div className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-gray-400' : 'text-white/30'}`}>Total Wins</div>
                                    </div>
                                    <div className={`p-4 ${isLight ? 'bg-gray-50 border-gray-100' : 'bg-white/5 border-white/5'} border rounded-2xl text-center`}>
                                        <div className={`text-3xl font-black ${isLight ? 'text-gray-900' : 'text-white'}`}>{stats.userTotalTrades}</div>
                                        <div className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-gray-400' : 'text-white/30'}`}>Total Trades</div>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-[#3CB371]/10 border border-[#3CB371]/20 flex gap-4 mb-4">
                                    <Shield className="text-[#3CB371] shrink-0" />
                                    <div>
                                        <h4 className="font-bold text-[#3CB371] mb-1">Account Status: Good</h4>
                                        <p className={`text-xs ${isLight ? 'text-gray-600' : 'text-white/60'} leading-relaxed`}>
                                            Your account is active. You can now dispute trades below if you find discrepancies.
                                        </p>
                                    </div>
                                </div>

                                <div className={`p-6 ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-black/40 border-white/5'} border rounded-[24px] mb-8`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
                                                <Zap size={18} />
                                            </div>
                                            <div>
                                                <h4 className={`text-sm font-black uppercase tracking-widest ${isLight ? 'text-gray-700' : 'text-white/80'}`}>Auto-Signer Module</h4>
                                                <p className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-white/30'} font-bold uppercase`}>
                                                    {evmSessionWallet ? `Active: ${evmSessionWallet.address.slice(0, 6)}...${evmSessionWallet.address.slice(-4)}` : "Initializing..."}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end">
                                            <div className="text-xl font-black text-[#3CB371] tabular-nums">{(sessionBalance || 0).toFixed(4)} USDC</div>
                                            <div className="flex items-center gap-2">
                                                <div className={`text-[9px] ${isLight ? 'text-gray-400' : 'text-white/20'} font-black uppercase tracking-tighter`}>Current Balance</div>
                                                {autoSignerFees > 0 && (
                                                    <div className="text-[8px] font-black text-[#3CB371]/60 uppercase tracking-tighter">
                                                        • Fees: {autoSignerFees.toFixed(4)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            onClick={() => {
                                                setPromptConfig({
                                                    title: `Refill Auto-Signer`,
                                                    placeholder: "Enter amount (e.g. 1.0)",
                                                    onConfirm: (val) => {
                                                        const amt = parseFloat(val);
                                                        if (isNaN(amt) || amt <= 0) return;
                                                        setModalConfig({
                                                            title: "Confirm Refill",
                                                            message: `Deposit ${amt.toFixed(4)} USDC to auto-signer?\n\nA 1% protocol fee (${(amt * 0.01).toFixed(4)} USDC) will be added to the treasury.`,
                                                            onConfirm: () => onRefill(amt),
                                                            confirmText: "Refill Now",
                                                            type: 'confirm'
                                                        });
                                                    }
                                                });
                                            }}
                                            className="py-4 bg-[#3CB371] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-[#3CB371]/10"
                                        >
                                            Refill Funds
                                        </button>
                                        <button
                                            onClick={() => {
                                                setPromptConfig({
                                                    title: `Sweep to Main`,
                                                    placeholder: "Enter amount (e.g. 0.5)",
                                                    onConfirm: (val) => {
                                                        const amt = parseFloat(val);
                                                        if (isNaN(amt) || amt <= 0) return;
                                                        setModalConfig({
                                                            title: "Confirm Withdrawal",
                                                            message: `Withdraw ${amt.toFixed(4)} USDC to your main wallet?\n\nProtocol Fee (1%) will be deducted.`,
                                                            onConfirm: () => onWithdraw(amt.toFixed(4)),
                                                            confirmText: "Sweep Now",
                                                            type: 'confirm'
                                                        });
                                                    }
                                                });
                                            }}
                                            className={`py-4 ${isLight ? 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'} text-[10px] font-black uppercase tracking-widest rounded-2xl active:scale-[0.98] transition-all border shadow-lg`}
                                        >
                                            Sweep to Main
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className={`text-sm font-black uppercase tracking-widest ${isLight ? 'text-gray-400' : 'text-white/40'} mb-4`}>Transaction History</h3>
                                    <div className="space-y-3">
                                        {!transactionHistory || transactionHistory.length === 0 ? (
                                            <div className={`text-center py-8 ${isLight ? 'text-gray-300 bg-gray-50 border-gray-100' : 'text-white/20 bg-white/[0.02] border-white/5'} text-xs uppercase font-black border rounded-2xl`}>No transactions found</div>
                                        ) : transactionHistory.map((tx, i) => (
                                            <div key={tx.id || i} className={`p-4 ${isLight ? 'bg-white border-gray-100 hover:border-gray-200' : 'bg-white/5 border-white/5 hover:border-white/10'} border rounded-2xl flex items-center justify-between group transition-all`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === "DEPOSIT" ? "bg-[#3CB371]/20 text-[#3CB371]" : "bg-orange-500/20 text-orange-500"}`}>
                                                        {tx.type === "DEPOSIT" ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                                    </div>
                                                    <div>
                                                        <div className={`text-xs font-black uppercase ${isLight ? 'text-gray-900' : 'text-white'}`}>{tx.type === "DEPOSIT" ? "Auto-Signer Deposit" : "Auto-Signer Withdrawal"}</div>
                                                        <div className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-white/30'} font-mono uppercase`}>{new Date(tx.timestamp).toLocaleDateString()}</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <div className="text-right">
                                                        <div className={`text-xs font-black ${tx.type === "DEPOSIT" ? "text-[#3CB371]" : "text-white/80"}`}>
                                                            {tx.type === "DEPOSIT" ? '+' : '-'}{tx.amount} USDC
                                                        </div>
                                                        <button
                                                            onClick={() => onViewReceipt && onViewReceipt(tx)}
                                                            className="text-[8px] font-black text-[#3CB371] uppercase underline hover:opacity-70 transition-opacity"
                                                        >
                                                            View Receipt
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "community" && (
                            <div className="max-w-4xl mx-auto">
                                <MessagingSystem
                                    isOpen={true}
                                    embedded={true}
                                    onClose={() => { }}
                                    userProfile={userProfile}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {modalConfig && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className={`w-full max-w-md ${isLight ? 'bg-white border-gray-200' : 'bg-[#0a0a0a] border-white/10'} border rounded-[32px] p-8 shadow-2xl relative overflow-hidden`}
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
                                        className={`py-4 ${isLight ? 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'} border text-xs font-black uppercase tracking-widest rounded-2xl transition-all`}
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (modalConfig.onConfirm) modalConfig.onConfirm();
                                        setModalConfig(null);
                                    }}
                                    className={`py-4 bg-[#3CB371] text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all ${modalConfig.type === 'alert' ? 'col-span-2' : ''}`}
                                >
                                    {modalConfig.confirmText || "OK"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {promptConfig && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className={`w-full max-w-md ${isLight ? 'bg-white border-gray-200' : 'bg-[#0a0a0a] border-white/10'} border rounded-[32px] p-8 shadow-2xl relative overflow-hidden`}
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#3CB371]/10 blur-[80px] pointer-events-none" />
                        <div className="relative z-10">
                            <h3 className={`text-2xl font-black ${isLight ? 'text-gray-900' : 'text-white'} mb-6 tracking-tight uppercase text-center`}>
                                {promptConfig.title}
                            </h3>
                            <div className="mb-8 relative">
                                <input
                                    type="number"
                                    autoFocus
                                    placeholder={promptConfig.placeholder}
                                    className={`w-full ${isLight ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-300' : 'bg-white/5 border-white/10 text-white placeholder:text-white/10'} border rounded-2xl py-4 px-6 font-black text-center focus:border-[#3CB371]/50 outline-none transition-all`}
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
                                    className={`py-4 ${isLight ? 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'} border text-xs font-black uppercase tracking-widest rounded-2xl transition-all font-sans`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const val = document.querySelector('input[type="number"]').value;
                                        promptConfig.onConfirm(val);
                                        setPromptConfig(null);
                                    }}
                                    className="py-4 bg-[#3CB371] text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all font-sans"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

const NavTab = ({ active, id, label, icon, onClick, isLight }) => (
    <button
        onClick={() => onClick(id)}
        className={`flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${active === id
            ? 'bg-[#3CB371] text-white shadow-[0_0_20px_#3CB37150]'
            : `${isLight ? 'text-gray-400 hover:text-gray-900 hover:bg-gray-200' : 'text-white/40 hover:text-white hover:bg-white/5'}`
            }`}
    >
        {icon}
        {label}
    </button>
);

const StatCard = ({ label, value, sub, icon, highlight, isLight }) => (
    <div className={`p-4 md:p-6 rounded-[24px] border ${highlight ? 'bg-[#3CB371]/10 border-[#3CB371]/30' : `${isLight ? 'bg-white border-gray-100' : 'bg-[#111] border-white/5'}`}`}>
        <div className="flex justify-between items-start mb-4">
            <div className={`text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-gray-400' : 'text-white/40'}`}>{label}</div>
            <div className={`p-2 ${isLight ? 'bg-gray-50' : 'bg-white/5'} rounded-lg`}>{icon}</div>
        </div>
        <div className={`text-xl md:text-2xl font-black mb-1 tracking-tighter ${isLight ? 'text-gray-900' : 'text-white'}`}>{value}</div>
        <div className={`text-[8px] md:text-[10px] font-bold ${isLight ? 'text-gray-300' : 'text-white/20'} uppercase`}>{sub}</div>
    </div>
);
