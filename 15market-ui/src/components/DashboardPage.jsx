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
import { getProgram } from "../api/program";
import { getProfilePda } from "../api/pdas";
import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from '../idl/sol_prediction.json';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { LatencyMeter } from "./LatencyMeter";
import { useAccount, useWriteContract } from "wagmi";
import ArcABI from "../abi/ArcPrediction.json";
import { KEEPER_URL } from "../constants";
import { ARC_CONTRACT_ADDRESS, ARC_RPC } from "../reownConfig";
import { parseEther } from "viem";

export const DashboardPage = ({ onBack, wallet, connection, sessionKeypair, sessionBalance, onRefill, onWithdraw, treasuryBalance, currentNetwork,
    autoSignerFees,
    userProfile
}) => {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const [activeTab, setActiveTab] = useState("overview"); // overview, profile, settings
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
    const [isMessagingOpen, setIsMessagingOpen] = useState(false);
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
        if (xHandle && (wallet?.publicKey || address)) {
            console.log("🎯 Detected X Handle from redirect:", xHandle, "Image:", xImage);
            handleSyncX(xHandle, xImage);
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [wallet, connection]);

    const handleSyncX = async (handle, image) => {
        if (!wallet?.publicKey && !address) return;
        setIsSyncing(true);
        try {
            // 1. Sync On-Chain (Handle only, as contract doesn't support image URL)
            if (currentNetwork === 'solana' && wallet?.publicKey) {
                const program = getProgram(wallet, connection);
                const [profilePda] = getProfilePda(wallet.publicKey, program.programId);
                const existing = await program.account.userProfile.fetchNullable(profilePda);
                const username = existing?.username || `User_${wallet.publicKey.toBase58().slice(0, 4)}`;
                const discord = existing?.discordHandle || "";

                console.log("🔗 Syncing X handle to Solana:", handle);
                await program.methods
                    .syncProfile(username, handle, discord)
                    .accounts({
                        user: wallet.publicKey,
                        profile: profilePda,
                    })
                    .rpc();
            } else if (currentNetwork === 'arc' && address) {
                console.log("🔗 Syncing X handle to Arc/EVM:", handle);
                await writeContractAsync({
                    address: ARC_CONTRACT_ADDRESS,
                    abi: ArcABI.abi,
                    functionName: 'syncProfile',
                    args: [`User_${address.slice(0, 6)}`, handle, ""],
                });
            }

            // 2. Sync to Keeper (Handle + Image)
            await fetch(`${KEEPER_URL}/sync-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: currentNetwork === 'solana' ? wallet?.publicKey?.toBase58() : address,
                    username: `Trader_${(wallet?.publicKey?.toBase58() || address || "").slice(0, 4)}`,
                    xHandle: handle,
                    xProfileImage: image || "",
                    network: currentNetwork
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
            // 1. User Metrics (Hybrid: On-chain + Local Fallback)
            let onChainProfile = null;
            let uWins = 0;
            let uTrades = 0;

            // Fetch On-Chain
            if (currentNetwork === 'solana' && wallet?.publicKey) {
                const program = getProgram(wallet, connection);
                try {
                    const [profilePda] = getProfilePda(wallet.publicKey, program.programId);
                    const profile = await program.account.userProfile.fetchNullable(profilePda);
                    if (profile) {
                        onChainProfile = {
                            ...profile,
                            xHandle: profile.xHandle // Match Solana naming? Actually it's x_handle in Anchor but we should normalize
                        };
                        uWins = profile.totalWins.toNumber();
                        uTrades = profile.totalTrades.toNumber();
                    }
                } catch (e) {
                    console.log("On-chain profile not found or error:", e);
                }
            } else if (currentNetwork === 'arc' && address) {
                try {
                    const provider = new ethers.JsonRpcProvider(ARC_RPC);
                    const contract = new ethers.Contract(ARC_CONTRACT_ADDRESS, ArcABI.abi, provider);
                    const profile = await contract.profiles(address);
                    if (profile && profile.totalTrades > 0) {
                        onChainProfile = {
                            username: profile.username,
                            xHandle: profile.xHandle,
                            totalWins: profile.totalWins,
                            totalTrades: profile.totalTrades,
                            totalVolume: profile.totalVolume
                        };
                        uWins = Number(profile.totalWins);
                        uTrades = Number(profile.totalTrades);
                    }
                } catch (e) {
                    console.log("Arc profile error:", e);
                }
            }

            // Fetch Local History (Fallback/Supplement)
            const localHistoryFn = localStorage.getItem("15market_history_v1");
            if (localHistoryFn) {
                try {
                    const localHistory = JSON.parse(localHistoryFn);
                    if (Array.isArray(localHistory)) {
                        setUserHistory(localHistory.reverse()); // Store full history
                        const localTrades = localHistory.length;
                        const localWins = localHistory.filter(t => t.status === "WON").length;

                        // Use whichever is higher (Local might be more up to date if keeper is slow, 
                        // On-chain might be higher if local storage was cleared)
                        uTrades = Math.max(uTrades, localTrades);
                        uWins = Math.max(uWins, localWins);
                    }
                } catch (e) { }
            }

            setStats(prev => ({
                ...prev,
                userWinRate: uTrades > 0 ? ((uWins / uTrades) * 100).toFixed(1) : 0,
                userTotalTrades: uTrades,
                userTotalWins: uWins
            }));

            // 2. Global Market Data (Live + History)
            // We combine localStorage history (past) with live fetching if we wanted stricter accuracy
            // For now, we rely on the same shared localStorage cache that GlobalTradeScroller populates
            // PLUS we fetch active bets to ensure "Live" data is fresh.

            const savedHistory = localStorage.getItem("15market_global_history_v2");
            let history = savedHistory ? JSON.parse(savedHistory) : [];

            // Simple Analysis
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
                recentTrades: history.slice(0, 50).reverse() // Newest first
            }));

            setIsLoading(false);
        } catch (e) {
            console.error("Dashboard Sync Error:", e);
            setIsLoading(false);
        }
    };

    // Chart Data Preparation
    const chartData = useMemo(() => {
        return stats.recentTrades
            .slice(0, 20)
            .reverse() // Oldest to newest for chart
            .map((t, i) => ({
                name: i,
                amount: parseFloat(t.amount),
                type: t.direction === "UP" ? 1 : -1
            }));
    }, [stats.recentTrades]);

    return (
        <div className="min-h-screen w-full bg-transparent text-white flex flex-col">
            {/* Fixed Top Navigation Bar - Mobile Optimized */}
            <div className="sticky top-0 z-40 bg-[#0d0d0d] border-b border-white/5 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto p-4 md:p-6">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onBack}
                                className="p-2 md:p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
                            >
                                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                            </button>
                            <div>
                                <h1 className="text-lg md:text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                                    Command Center
                                    <span className="text-[8px] md:text-[10px] bg-[#3CB371]/20 text-[#3CB371] px-2 py-0.5 rounded border border-[#3CB371]/30">LIVE</span>
                                </h1>
                                <p className="text-[10px] md:text-xs text-white/40 font-bold uppercase tracking-widest hidden md:block">
                                    {wallet?.publicKey ? `${wallet.publicKey.toBase58().slice(0, 4)}...${wallet.publicKey.toBase58().slice(-4)}` : "Guest View"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Tab Bar */}
                    <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
                        <div className="flex bg-[#111] p-1 rounded-xl border border-white/5 w-max md:w-auto">
                            <NavTab active={activeTab} id="overview" label="Overview" icon={<Activity size={14} />} onClick={setActiveTab} />
                            <NavTab active={activeTab} id="profile" label="My Profile" icon={<User size={14} />} onClick={setActiveTab} />
                            <NavTab active={activeTab} id="community" label="Community" icon={<MessageSquare size={14} />} onClick={setActiveTab} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto p-4 md:p-8">

                    {/* CONTENT AREA */}
                    <div>
                        {activeTab === "overview" && (
                            <div className="space-y-6">
                                {/* Key Stats Row */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <StatCard
                                        label="Market Volume"
                                        value={`${stats.marketTotalVol} ${currentNetwork === 'arc' ? 'USDC' : 'SOL'}`}
                                        sub="24h Observed"
                                        icon={<Globe size={16} className="text-[#3CB371]" />}
                                    />
                                    <StatCard
                                        label="Bullish Sentiment"
                                        value={`${stats.marketSentiment}%`}
                                        sub={`${stats.bullsInfo} Calls vs ${stats.bearsInfo} Puts`}
                                        icon={<TrendingUp size={16} className={Number(stats.marketSentiment) > 50 ? "text-[#3CB371]" : "text-white/20"} />}
                                    />
                                    <StatCard
                                        label="Avg. Stake Size"
                                        value={`${stats.marketAvgStake} ${currentNetwork === 'arc' ? 'USDC' : 'SOL'}`}
                                        sub="Per Trade"
                                        icon={<DollarSign size={16} className="text-[#3CB371]" />}
                                    />
                                    <StatCard
                                        label="Your Win Rate"
                                        value={`${stats.userWinRate}%`}
                                        sub={`${stats.userTotalWins} / ${stats.userTotalTrades} Trades`}
                                        icon={<Award size={16} className="text-[#3CB371]" />}
                                        highlight
                                    />
                                </div>

                                {/* Main Chart Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    <div className="lg:col-span-2 bg-[#111] border border-white/5 rounded-[24px] p-6 relative overflow-hidden">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Market Activity Pulse</h3>
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
                                                        contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#fff' }}
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
                                        <div className="bg-[#111] border border-white/5 rounded-[24px] p-6 flex flex-col h-full">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-white/40 mb-4">Recent Signals</h3>
                                            <div className="flex-1 overflow-y-auto space-y-3 max-h-[180px] custom-scrollbar">
                                                {stats.recentTrades.length === 0 ? (
                                                    <div className="text-center py-4 text-white/10 text-[10px] uppercase font-black">No active signals</div>
                                                ) : stats.recentTrades.map((t, i) => (
                                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${t.direction === "UP" ? "bg-[#3CB371]/10 text-[#3CB371]" : "bg-[#FF7F50]/10 text-[#FF7F50]"}`}>
                                                                {t.direction === "UP" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] font-bold">{t.user?.slice(0, 6) || "Trader"}</div>
                                                                <div className="text-[8px] text-white/30 uppercase">{t.direction}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] font-mono font-bold text-[#3CB371]">{t.amount} {currentNetwork === 'arc' ? 'USDC' : 'SOL'}</div>
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
                            <div className="max-w-2xl mx-auto bg-[#111] border border-white/5 rounded-[32px] p-8">
                                <div className="flex flex-col items-center mb-8">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#3CB371] to-black p-[2px] mb-4 overflow-hidden">
                                        <div className="w-full h-full rounded-full bg-[#050505] flex items-center justify-center overflow-hidden">
                                            {userProfile?.xProfileImage ? (
                                                <img src={userProfile.xProfileImage} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={40} className="text-white/50" />
                                            )}
                                        </div>
                                    </div>
                                    <h2 className="text-2xl font-black">{userProfile?.username || (wallet?.publicKey ? "Trader" : "Guest User")}</h2>
                                    <div className="text-sm text-white/40 font-mono mb-4">
                                        {wallet?.publicKey?.toBase58()}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {userProfile?.xHandle ? (
                                            <div className="flex items-center gap-2 px-4 py-2 bg-[#6366f1]/10 border border-[#6366f1]/20 rounded-xl text-[#6366f1]">
                                                <Globe size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">@{userProfile.xHandle}</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const CLIENT_ID = 'cDdEeHQwYnp4Y2lJRVMzdk5CRlg6MTpjaQ';
                                                        const REDIRECT_URI = encodeURIComponent(`${KEEPER_URL}/auth/twitter/callback`);
                                                        const SCOPE = encodeURIComponent('users.read tweet.read offline.access');

                                                        // Securely prepare state on backend
                                                        const prepareRes = await fetch(`${KEEPER_URL}/auth/twitter/prepare`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                address: currentNetwork === 'solana' ? wallet?.publicKey?.toBase58() : address,
                                                                network: currentNetwork
                                                            })
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
                                                className="flex items-center gap-2 px-4 py-2 bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 rounded-xl text-[#1DA1F2] hover:bg-[#1DA1F2]/20 transition-all"
                                            >
                                                <MessageSquare size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Link Twitter (X)</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className="p-4 bg-white/5 rounded-2xl text-center">
                                        <div className="text-3xl font-black text-[#3CB371]">{stats.userTotalWins}</div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Total Wins</div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-2xl text-center">
                                        <div className="text-3xl font-black text-white">{stats.userTotalTrades}</div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Total Trades</div>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-[#3CB371]/10 border border-[#3CB371]/20 flex gap-4 mb-4">
                                    <Shield className="text-[#3CB371] shrink-0" />
                                    <div>
                                        <h4 className="font-bold text-[#3CB371] mb-1">Account Status: Good</h4>
                                        <p className="text-xs text-white/60 leading-relaxed">
                                            Your account is active. You can now dispute trades below if you find discrepancies.
                                        </p>
                                    </div>
                                </div>

                                {/* Burner Wallet Section */}
                                <div className="p-6 bg-black/40 border border-white/5 rounded-[24px] mb-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
                                                <Zap size={18} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black uppercase tracking-widest text-white/80">Auto-Signer Module</h4>
                                                <p className="text-[10px] text-white/30 font-bold uppercase">Active Burner Identity</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-black text-[#3CB371] tabular-nums">{(sessionBalance || 0).toFixed(4)} {currentNetwork === 'arc' ? 'USDC' : 'SOL'}</div>
                                            <div className="text-[9px] text-white/20 font-black uppercase tracking-tighter">Current Balance</div>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-black/60 rounded-xl border border-white/5 mb-6">
                                        <div className="text-[8px] font-black text-white/20 uppercase mb-1 tracking-widest">Burner Public Key</div>
                                        <div className="text-xs font-mono text-[#3CB371] break-all">
                                            {sessionKeypair?.publicKey.toBase58()}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 mb-6">
                                        <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Withdrawal Amount</div>
                                        <div className="flex items-center gap-3 p-1 rounded-xl border border-white/5 bg-black/60">
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0.0001"
                                                value={localWithdrawAmount}
                                                onChange={(e) => setLocalWithdrawAmount(e.target.value)}
                                                className="flex-1 bg-transparent px-3 py-2 text-sm font-black text-[#3CB371] outline-none"
                                                placeholder={`Max: ${(sessionBalance - 0.0005).toFixed(4)}`}
                                            />
                                            <span className="pr-3 text-[9px] font-black uppercase text-white/20">{currentNetwork === 'arc' ? 'USDC' : 'SOL'}</span>
                                        </div>
                                        <p className="text-[8px] font-bold text-white/10 uppercase italic">A 0.5% Protocol Fee applies to all withdrawals.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            onClick={() => {
                                                setPromptConfig({
                                                    title: `Refill ${currentNetwork === 'arc' ? 'USDC' : 'SOL'}`,
                                                    placeholder: "Enter amount (e.g. 0.1)",
                                                    onConfirm: (val) => onRefill(val)
                                                });
                                            }}
                                            className="py-3 bg-[#3CB371] text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-[0.98] transition-all"
                                        >
                                            Refill Funds
                                        </button>
                                        <button
                                            onClick={() => {
                                                const buffer = 0.0005;
                                                const maxPossible = Math.max(0, sessionBalance - buffer);
                                                const inputVal = localWithdrawAmount.trim();
                                                const amtToWithdraw = inputVal === "" ? maxPossible : parseFloat(inputVal);

                                                if (isNaN(amtToWithdraw) || amtToWithdraw <= 0) {
                                                    setModalConfig({
                                                        title: "Invalid Amount",
                                                        message: "Please enter a valid amount or leave it empty to sweep all.",
                                                        type: 'alert'
                                                    });
                                                    return;
                                                }

                                                if (amtToWithdraw > maxPossible + 0.0000001) {
                                                    setModalConfig({
                                                        title: "Balance Exceeded",
                                                        message: `Amount exceeds available balance. Max possible after gas buffer: ${maxPossible.toFixed(6)}`,
                                                        type: 'alert'
                                                    });
                                                    return;
                                                }

                                                setModalConfig({
                                                    title: "Confirm Withdrawal",
                                                    message: `Withdraw ${amtToWithdraw.toFixed(6)} ${currentNetwork === 'arc' ? 'USDC' : 'SOL'} to your main wallet?\n\nProtocol Fee (0.5%) will be deducted.`,
                                                    onConfirm: () => onWithdraw(amtToWithdraw.toFixed(6)),
                                                    confirmText: "Sweep Now",
                                                    type: 'confirm'
                                                });
                                            }}
                                            className="py-3 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 active:scale-[0.98] transition-all"
                                        >
                                            Sweep to Main
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white/40 mb-4">Your Trade History</h3>
                                    <div className="space-y-3">
                                        {userHistory.length === 0 ? (
                                            <div className="text-center py-8 text-white/20 text-xs uppercase font-black bg-white/[0.02] border border-white/5 rounded-2xl">No trades found</div>
                                        ) : paginatedHistory.map((trade, i) => (
                                            <div key={trade.id || i} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${trade.status === "WON" ? "bg-[#3CB371]/20 text-[#3CB371]" : trade.status === "LOST" ? "bg-red-500/20 text-red-500" : "bg-orange-500/20 text-orange-500"}`}>
                                                        {trade.direction === "buy" ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black uppercase">{trade.direction === "buy" ? "CALL / UP" : "PUT / DOWN"}</div>
                                                        <div className="text-[10px] text-white/30 font-mono">Entry: ${trade.entryPrice}</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <div className="text-right">
                                                        <div className={`text-xs font-black ${trade.status === "WON" ? "text-[#3CB371]" : trade.status === "LOST" ? "text-red-500" : "text-orange-500"}`}>
                                                            {trade.status}
                                                        </div>
                                                        <div className="text-[10px] text-white/30">{trade.amount} {trade.network === 'arc' ? 'USDC' : 'SOL'}</div>
                                                    </div>

                                                    {(trade.status === "LOST" || trade.status === "STUCK" || trade.status === "TIMEOUT") && (
                                                        <button
                                                            onClick={() => {
                                                                const confirmed = window.confirm("Initiate a dispute for this trade? Admins will review the settlement price.");
                                                                if (confirmed) {
                                                                    const updated = userHistory.map(t =>
                                                                        t.id === trade.id ? { ...t, status: "DISPUTED" } : t
                                                                    );
                                                                    localStorage.setItem("15market_history_v1", JSON.stringify([...updated].reverse()));
                                                                    fetchMetrics();
                                                                }
                                                            }}
                                                            className="p-2 rounded-lg bg-white/5 hover:bg-[#FF8C00]/20 text-white/40 hover:text-[#FF8C00] transition-all"
                                                            title="Dispute Trade"
                                                        >
                                                            <AlertCircle size={16} />
                                                        </button>
                                                    )}

                                                    {trade.status === "DISPUTED" && (
                                                        <div className="flex items-center gap-1 text-[9px] font-black text-[#FF8C00] uppercase animate-pulse">
                                                            <Activity size={12} />
                                                            URGENT REVIEW
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Pagination Controls */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-center gap-2 mt-8 py-4 border-t border-white/5">
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                    disabled={currentPage === 1}
                                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all"
                                                >
                                                    Prev
                                                </button>

                                                <div className="flex gap-1">
                                                    {[...Array(totalPages)].map((_, i) => {
                                                        const p = i + 1;
                                                        // Only show first, last, and pages around current
                                                        if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                                                            return (
                                                                <button
                                                                    key={p}
                                                                    onClick={() => setCurrentPage(p)}
                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${currentPage === p ? 'bg-[#3CB371] text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                                                                >
                                                                    {p}
                                                                </button>
                                                            );
                                                        } else if (p === currentPage - 2 || p === currentPage + 2) {
                                                            return <span key={p} className="text-white/20 px-1">...</span>;
                                                        }
                                                        return null;
                                                    })}
                                                </div>

                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "community" && (
                            <div className="max-w-4xl mx-auto">
                                <MessagingSystem
                                    wallet={wallet}
                                    connection={connection}
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

            {/* Branded Confirm/Alert Modal */}
            {modalConfig && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden"
                    >
                        {/* Background Glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#3CB371]/10 blur-[80px] pointer-events-none" />

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-[#3CB371]/10 flex items-center justify-center mb-6">
                                {modalConfig.type === 'alert' ? (
                                    <AlertCircle size={32} className="text-[#3CB371]" />
                                ) : (
                                    <Zap size={32} className="text-[#3CB371]" />
                                )}
                            </div>

                            <h3 className="text-2xl font-black text-white mb-2 tracking-tight uppercase">
                                {modalConfig.title}
                            </h3>

                            <p className="text-sm font-medium text-white/50 mb-8 whitespace-pre-line leading-relaxed">
                                {modalConfig.message}
                            </p>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                {modalConfig.type === 'confirm' && (
                                    <button
                                        onClick={() => setModalConfig(null)}
                                        className="py-4 bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all font-sans"
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (modalConfig.onConfirm) modalConfig.onConfirm();
                                        setModalConfig(null);
                                    }}
                                    className={`py-4 bg-[#3CB371] text-black text-xs font-black uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all font-sans ${modalConfig.type === 'alert' ? 'col-span-2' : ''}`}
                                >
                                    {modalConfig.confirmText || "OK"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Branded Prompt Modal */}
            {promptConfig && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden"
                    >
                        {/* Background Glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#3CB371]/10 blur-[80px] pointer-events-none" />

                        <div className="relative z-10">
                            <h3 className="text-2xl font-black text-white mb-6 tracking-tight uppercase text-center">
                                {promptConfig.title}
                            </h3>

                            <div className="mb-8 relative">
                                <input
                                    type="number"
                                    autoFocus
                                    placeholder={promptConfig.placeholder}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white font-black text-center focus:border-[#3CB371]/50 outline-none transition-all"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            promptConfig.onConfirm(e.target.value);
                                            setPromptConfig(null);
                                        }
                                    }}
                                    id="branded-prompt-input"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                <button
                                    onClick={() => setPromptConfig(null)}
                                    className="py-4 bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all font-sans"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const val = document.getElementById('branded-prompt-input').value;
                                        if (val) promptConfig.onConfirm(val);
                                        setPromptConfig(null);
                                    }}
                                    className="py-4 bg-[#3CB371] text-black text-xs font-black uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all font-sans"
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

const NavTab = ({ id, label, icon, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${active === id
            ? "bg-[#3CB371] text-black shadow-lg shadow-[#3CB371]/20"
            : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
    >
        {icon}
        {label}
    </button>
);

const StatCard = ({ label, value, sub, icon, highlight }) => (
    <div className={`p-6 rounded-[24px] border transition-all hover:scale-[1.02] ${highlight ? 'bg-[#3CB371]/10 border-[#3CB371]/30' : 'bg-[#111] border-white/5'}`}>
        <div className="flex justify-between items-start mb-4">
            <span className={`text-[9px] font-black uppercase tracking-widest ${highlight ? 'text-[#3CB371]' : 'text-white/30'}`}>{label}</span>
            <div className={`p-2 rounded-lg ${highlight ? 'bg-[#3CB371]/20' : 'bg-white/5'}`}>
                {icon}
            </div>
        </div>
        <div className="text-3xl font-black text-white tracking-tight mb-1">{value}</div>
        {sub && <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{sub}</div>}
    </div>
);

const Toggle = ({ active }) => (
    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${active ? 'bg-[#3CB371]' : 'bg-white/10'}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${active ? 'translate-x-4' : ''}`} />
    </div>
);
