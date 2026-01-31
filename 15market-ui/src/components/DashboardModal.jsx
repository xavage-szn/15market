import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, DollarSign, Award, Target, BarChart2 } from "lucide-react";
import { getProgram } from "../api/program";
import { getProfilePda } from "../api/pdas";
import { PublicKey } from "@solana/web3.js";

export const DashboardModal = ({ isOpen, onClose, wallet, connection }) => {
    const [stats, setStats] = useState({
        userWinRate: 0,
        userTotalTrades: 0,
        userTotalWins: 0,
        marketSentiment: 50, // 50% = Neutral
        marketAvgStake: 0,
        marketTotalVol: 0,
        bullsInfo: 0,
        bearsInfo: 0
    });

    useEffect(() => {
        if (isOpen) {
            calculateMetrics();
        }
    }, [isOpen, wallet, connection]);

    const calculateMetrics = async () => {
        // 1. User Metrics
        let uWins = 0;
        let uTrades = 0;

        if (wallet && wallet.publicKey && connection) {
            try {
                const program = getProgram(wallet, connection);
                const [profilePda] = getProfilePda(wallet.publicKey, program.programId);
                const profile = await program.account.userProfile.fetchNullable(profilePda);
                if (profile) {
                    uWins = profile.totalWins.toNumber();
                    uTrades = profile.totalTrades.toNumber();
                }
            } catch (e) {
                console.warn("Could not fetch user profile for dashboard", e);
            }
        }

        // 2. Global/Market Metrics (Derived from local cache of recent trades)
        const savedHistory = localStorage.getItem("15market_global_history_v2");
        let history = [];
        if (savedHistory) {
            try {
                history = JSON.parse(savedHistory);
            } catch (e) { }
        }

        let bulls = 0;
        let bears = 0;
        let totalStake = 0;

        history.forEach(trade => {
            if (String(trade.direction).toUpperCase().includes("UP")) bulls++;
            else bears++;
            totalStake += parseFloat(trade.amount || 0);
        });

        const totalObserved = bulls + bears;
        const avgStake = totalObserved > 0 ? (totalStake / totalObserved).toFixed(3) : "0.000";
        const sentiment = totalObserved > 0 ? (bulls / totalObserved) * 100 : 50;

        // Mocking 'Global Volume' a bit by extrapolating or just showing what we've seen
        // In a real app we'd fetch this from an indexer API
        const vol = totalStake > 0 ? totalStake.toFixed(2) : "0.00";

        setStats({
            userWinRate: uTrades > 0 ? ((uWins / uTrades) * 100).toFixed(1) : 0,
            userTotalTrades: uTrades,
            userTotalWins: uWins,
            marketSentiment: sentiment.toFixed(0),
            marketAvgStake: avgStake,
            marketTotalVol: vol,
            bullsInfo: bulls,
            bearsInfo: bears
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-4xl bg-[#0F0F0F] rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-[#3CB371]/20 flex items-center justify-center border border-[#3CB371]/30">
                            <BarChart2 size={20} className="text-[#3CB371]" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Market Intelligence</h2>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Real-time Analytics</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <span className="text-white/40 font-black">X</span>
                    </button>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Column 1: My Performance */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/20 mb-4">Your Performance</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <StatCard
                                label="Win Rate"
                                value={`${stats.userWinRate}%`}
                                sub="Lifetime"
                                icon={<Award size={16} className="text-[#3CB371]" />}
                                highlight={true}
                            />
                            <StatCard
                                label="Total Trades"
                                value={stats.userTotalTrades}
                                sub={`${stats.userTotalWins} Wins`}
                                icon={<Target size={16} className="text-white/60" />}
                            />
                        </div>

                        <div className="p-6 rounded-2xl bg-[#151515] border border-white/5 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-[#3CB371]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Trading Status</div>
                                    <div className="text-xl font-black text-white">
                                        {stats.userTotalTrades > 0 ? "Active Trader" : "Rookie"}
                                    </div>
                                </div>
                                <div className={`h-2 w-2 rounded-full ${stats.userTotalTrades > 0 ? 'bg-[#3CB371] animate-pulse' : 'bg-white/20'}`} />
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Market Data */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/20 mb-4">Global Market Sentiment</h3>

                        {/* Sentiment Bar */}
                        <div className="p-6 rounded-[24px] bg-[#151515] border border-white/5">
                            <div className="flex justify-between items-end mb-4">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Long vs Short</span>
                                <div className="text-right">
                                    <div className="text-xl font-black text-white">{stats.marketSentiment}% <span className="text-xs text-[#3CB371]">BULLISH</span></div>
                                </div>
                            </div>

                            <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden flex">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stats.marketSentiment}%` }}
                                    className="h-full bg-[#3CB371] shadow-[0_0_15px_rgba(60,179,113,0.4)]"
                                />
                                <div className="h-full flex-1 bg-[#FF7F50]" />
                            </div>
                            <div className="flex justify-between mt-2 text-[9px] font-bold opacity-40">
                                <span>{stats.bullsInfo} CALLS</span>
                                <span>{stats.bearsInfo} PUTS</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <StatCard
                                label="Avg Stake"
                                value={`${stats.marketAvgStake} SOL`}
                                icon={<DollarSign size={16} className="text-[#3CB371]" />}
                            />
                            <StatCard
                                label="Observed Vol"
                                value={`${stats.marketTotalVol} SOL`}
                                icon={<Activity size={16} className="text-[#3CB371]" />}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const StatCard = ({ label, value, sub, icon, highlight }) => (
    <div className={`p-5 rounded-2xl border transition-all hover:scale-[1.02] ${highlight ? 'bg-[#3CB371]/10 border-[#3CB371]/30' : 'bg-[#151515] border-white/5'}`}>
        <div className="flex justify-between items-start mb-3">
            <span className={`text-[9px] font-black uppercase tracking-widest ${highlight ? 'text-[#3CB371]' : 'text-white/30'}`}>{label}</span>
            {icon}
        </div>
        <div className="text-2xl font-black text-white tracking-tight">{value}</div>
        {sub && <div className="text-[10px] font-bold text-white/30 mt-1 uppercase tracking-wider">{sub}</div>}
    </div>
);
