import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KEEPER_URL_ARC } from '../constants';

import { Zap, Shield, TrendingUp, TrendingDown } from 'lucide-react';

export function ProfileModal({ isOpen, onClose, wallet, userProfile = null, transactionHistory = [], onViewReceipt, notify, uiVersion = 'v1', setUiVersion, theme }) {
    const [username, setUsername] = useState("");
    const [xHandle, setXHandle] = useState("");
    const [discordHandle, setDiscordHandle] = useState("");
    const [metrics, setMetrics] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isVerifyingX, setIsVerifyingX] = useState(false);

    const isLight = theme === 'light';

    // wallet prop is the Wagmi/Para wallet object or wrapper. 
    // userProfile is passed from UserApp
    const address = wallet?.address || wallet?.publicKey; // Adapting to whatever wallet object structure is passed, mostly { address } from UserApp "user" memo

    useEffect(() => {
        if (isOpen) {
            if (userProfile) {
                setUsername(userProfile.username || "");
                setXHandle(userProfile.xHandle || "");
                setDiscordHandle(userProfile.discordHandle || "");
            }
            // Fetch metrics from backend if address is available
            if (address) {
                fetchMetrics();
            }
        }
    }, [isOpen, address, userProfile]);

    const fetchMetrics = async () => {
        try {
            // Fetch from Keeper
            const res = await fetch(`${KEEPER_URL_ARC}/profile?address=${address}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.stats) {
                    setMetrics({
                        wins: data.stats.totalWins || 0,
                        losses: (data.stats.totalTrades || 0) - (data.stats.totalWins || 0),
                        trades: data.stats.totalTrades || 0,
                        volume: data.stats.totalVolume ? (parseFloat(data.stats.totalVolume)).toFixed(2) : "0.00"
                    });
                }
                // Store full trade history (includes auto-signer trades)
                if (data.history && Array.isArray(data.history)) {
                    setTradeHistory(data.history.filter(t => t.status === 'WON' || t.status === 'LOST').slice(0, 20));
                }
            }
        } catch (err) {
            console.error("Fetch profile metrics error:", err);
        }
    };

    const handleSave = async () => {
        if (!address) {
            notify("Please connect your wallet first.", "error");
            return;
        }
        setIsSaving(true);
        notify("Syncing Profile...", "pending");
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/sync-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address,
                    username: username,
                    xHandle: xHandle,
                    discordHandle: discordHandle
                })
            });

            if (!res.ok) throw new Error("Failed to save profile on backend.");

            notify("Profile synced successfully!", "success");
            onClose();
            // Trigger a refresh in UserApp if possible, or assume UserApp polling will catch it
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            console.error("Save profile error:", err);
            notify("Failed to save profile: " + err.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleLinkTwitter = async () => {
        setIsVerifyingX(true);
        try {
            const CLIENT_ID = 'cDdEeHQwYnp4Y2lJRVMzdk5CRlg6MTpjaQ';
            const REDIRECT_URI = encodeURIComponent(`${KEEPER_URL_ARC}/auth/twitter/callback`);
            const SCOPE = encodeURIComponent('users.read tweet.read offline.access');

            // Securely prepare state on backend
            // Note: onboarding is TRUE because we want the backend to auto-update the profile
            // The backend handles both new and existing profiles nicely now.
            const prepareRes = await fetch(`${KEEPER_URL_ARC}/auth/twitter/prepare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address,
                    username: username || "User", // Fallback if empty
                    network: 'arc',
                    onboarding: true, // Keep true to trigger the auto-save logic in backend
                    origin: window.location.origin
                })
            });
            const { state: stateId } = await prepareRes.json();

            if (!stateId) throw new Error("Failed to prepare secure state");

            const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&state=${stateId}&code_challenge=challenge&code_challenge_method=plain`;

            console.log('🔗 [X_AUTH] Initiating OAuth flow from Profile...');
            window.location.href = url;
        } catch (e) {
            console.error("X Auth Failed:", e);
            notify("Could not initiate X login.", "error");
            setIsVerifyingX(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className={`fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-md ${isLight ? 'bg-black/20' : 'bg-black/80'}`}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className={`w-full max-w-md ${isLight ? 'bg-[#f0f9f4] border-[#3CB371]/20' : 'bg-[#0D0D0D] border-[#3CB371]/30'} border rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative overflow-hidden`}
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#3CB371] to-transparent" />

                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3CB371] to-black p-[1px] overflow-hidden">
                                <div className={`w-full h-full rounded-2xl ${isLight ? 'bg-[#e6f4ed]' : 'bg-[#050505]'} flex items-center justify-center overflow-hidden`}>
                                    {userProfile?.xProfileImage ? (
                                        <img src={userProfile.xProfileImage} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-[#3CB371] font-black text-xl">
                                            {(username || "A").charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <h3 className={`text-xl font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-white'}`}>DeGen Account</h3>
                                <p className={`text-[9px] ${isLight ? 'text-black/40' : 'text-white/20'} uppercase font-bold tracking-widest mt-1`}>Identity & Metrics</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={onClose} className={`p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/40' : 'bg-white/5 hover:bg-white/10 text-white/40'} transition-colors`}>✕</button>
                        </div>
                    </div>

                    {metrics && (
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'} border flex flex-col justify-center`}>
                                <p className="text-[8px] font-bold text-[#3CB371] uppercase tracking-widest mb-1">Win Rate</p>
                                <div className="flex items-baseline gap-1">
                                    <p className={`text-2xl font-black ${isLight ? 'text-[#05140b]' : 'text-white'}`}>
                                        {metrics.trades > 0 ? ((metrics.wins / metrics.trades) * 100).toFixed(0) : 0}
                                    </p>
                                    <span className={`text-xs font-bold ${isLight ? 'text-[#05140b]/40' : 'text-white/40'}`}>%</span>
                                </div>
                                <p className={`text-[7px] ${isLight ? 'text-[#05140b]/20' : 'text-white/20'} font-bold uppercase mt-1`}>{metrics.wins} W // {metrics.trades - metrics.wins} L</p>
                            </div>
                            <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'} border flex flex-col justify-center`}>
                                <p className={`text-[8px] font-bold ${isLight ? 'text-[#05140b]/40' : 'text-white/40'} uppercase tracking-widest mb-1`}>Total Volume</p>
                                <div className="flex items-baseline gap-1">
                                    <p className={`text-2xl font-black ${isLight ? 'text-[#05140b]' : 'text-white'}`}>{metrics.volume}</p>
                                    <span className={`text-xs font-bold ${isLight ? 'text-[#05140b]/40' : 'text-white/40'}`}>USDC</span>
                                </div>
                                <p className={`text-[7px] ${isLight ? 'text-[#05140b]/20' : 'text-white/20'} font-bold uppercase mt-1`}>Across {metrics.trades} Trades</p>
                            </div>
                        </div>
                    )}

                    <div className="mb-6">
                        <h4 className={`text-[10px] font-black ${isLight ? 'text-black/40' : 'text-white/40'} uppercase tracking-[0.3em] ml-1 mb-3 block`}>Trade Activity</h4>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                            {tradeHistory.length === 0 && (!transactionHistory || transactionHistory.length === 0) ? (
                                <div className={`text-center py-4 ${isLight ? 'text-black/10 border-black/5' : 'text-white/10 border-white/5'} text-[9px] uppercase font-black border rounded-xl`}>No activity yet</div>
                            ) : (
                                <>
                                    {/* Settled Trades from Backend (includes auto-signer) */}
                                    {tradeHistory.map((t, i) => {
                                        const isWon = t.status === 'WON';
                                        const isUp = t.direction === 'UP' || t.direction === 1 || String(t.direction) === '1';
                                        return (
                                            <div key={t.id || `trade-${i}`} className={`flex items-center justify-between p-3 rounded-xl ${isLight ? 'bg-white/60 border-black/5' : 'bg-white/[0.02] border-white/5'} border`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-1.5 rounded-lg ${isUp ? 'bg-[#3CB371]/10 text-[#3CB371]' : 'bg-[#FF7F50]/10 text-[#FF7F50]'}`}>
                                                        {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                    </div>
                                                    <div>
                                                        <div className={`text-[10px] font-black ${isLight ? 'text-black' : 'text-white'} uppercase`}>
                                                            {t.symbol || 'BTC'} {isUp ? 'Long' : 'Short'}
                                                        </div>
                                                        <div className={`text-[8px] ${isLight ? 'text-black/20' : 'text-white/20'} font-mono italic`}>
                                                            {t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className={`text-[11px] font-black ${isWon ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                                        {isWon ? `+${Number(t.payout || 0).toFixed(2)}` : `-${Number(t.amount || 0).toFixed(2)}`}
                                                    </div>
                                                    <span className={`text-[7px] font-black uppercase ${isWon ? 'text-[#3CB371]/60' : 'text-[#FF7F50]/60'}`}>{t.status}</span>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Deposit / Withdraw from local storage */}
                                    {transactionHistory && transactionHistory.map((tx, i) => (
                                        <div key={tx.id || `tx-${i}`} className={`flex flex-row items-center justify-between p-2 lg:p-4 rounded-xl border transition-all group ${isLight
                                            ? 'bg-[#f0f9f4] border-[#3CB371]/10 shadow-sm hover:shadow-md hover:border-[#3CB371]/40'
                                            : 'bg-black/40 border-white/10 hover:border-[#3CB371]/30'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1.5 rounded-lg ${tx.type === "DEPOSIT" ? "bg-[#3CB371]/10 text-[#3CB371]" : "bg-orange-500/10 text-orange-500"}`}>
                                                    {tx.type === "DEPOSIT" ? <Zap size={14} /> : <Shield size={14} />}
                                                </div>
                                                <div>
                                                    <div className={`text-[10px] font-black ${isLight ? 'text-[#05140b]' : 'text-white'} uppercase`}>{tx.type}</div>
                                                    <div className={`text-[8px] ${isLight ? 'text-black/20' : 'text-white/20'} font-mono italic`}>{new Date(tx.timestamp).toLocaleDateString()}</div>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <div className={`text-[11px] font-black ${tx.type === "DEPOSIT" ? "text-[#3CB371]" : (isLight ? "text-black/80" : "text-white/80")}`}>
                                                    {tx.type === "DEPOSIT" ? '+' : '-'}{tx.amount}
                                                </div>
                                                <button
                                                    onClick={() => onViewReceipt && onViewReceipt(tx)}
                                                    className="text-[7px] font-black text-[#3CB371] uppercase underline"
                                                >
                                                    Receipt
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className={`text-[10px] font-black ${isLight ? 'text-black/40' : 'text-white/40'} uppercase tracking-[0.3em] ml-1 mb-2 block`}>Username (Public)</label>
                            <input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Anonymous DeGen"
                                className={`w-full ${isLight ? 'bg-white text-black border-black/10' : 'bg-black text-white border-white/10'} border rounded-2xl px-5 py-3.5 text-xs font-bold focus:border-[#3CB371]/50 outline-none transition-all placeholder:text-black/20`}
                            />
                        </div>

                        <div>
                            <label className={`text-[10px] font-black ${isLight ? 'text-black/40' : 'text-white/40'} uppercase tracking-[0.3em] ml-1 mb-2 block`}>X Handle</label>
                            <div className="flex gap-2">
                                <input
                                    value={xHandle}
                                    placeholder="@username"
                                    disabled={true}
                                    className={`flex-1 ${isLight ? 'bg-white text-black border-black/10' : 'bg-black text-white border-white/10'} border rounded-2xl px-5 py-3.5 text-xs font-bold opacity-70 outline-none cursor-not-allowed`}
                                />
                                {!xHandle && (
                                    <button
                                        onClick={handleLinkTwitter}
                                        className={`px-4 rounded-2xl ${isLight ? 'bg-[#3CB371] text-black' : 'bg-white text-black'} text-[10px] font-black transition-transform active:scale-95 hover:bg-[#3CB371]`}
                                    >
                                        LINK X
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className={`text-[10px] font-black ${isLight ? 'text-black/40' : 'text-white/40'} uppercase tracking-[0.3em] ml-1 mb-2 block`}>Interface Mode</label>
                            <div className={`flex ${isLight ? 'bg-white border-black/10' : 'bg-black border-white/10'} border rounded-2xl p-1 gap-1`}>
                                <button
                                    onClick={() => setUiVersion('v1')}
                                    className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${uiVersion === 'v1' ? (isLight ? 'bg-[#3CB371] text-white shadow-[0_0_20px_#3CB37140]' : 'bg-[#3CB371] text-black shadow-[0_0_20px_#3CB37140]') : (isLight ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white')}`}
                                >
                                    Standard V1
                                </button>
                                <button
                                    onClick={() => setUiVersion('v2')}
                                    className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${uiVersion === 'v2' ? (isLight ? 'bg-[#3CB371] text-white shadow-[0_0_20px_#3CB37140]' : 'bg-[#3CB371] text-black shadow-[0_0_20px_#3CB37140]') : (isLight ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white')}`}
                                >
                                    Pro V2
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`w-full bg-[#3CB371] ${isLight ? 'text-white' : 'text-black'} font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 ${isSaving ? 'opacity-50' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
                        >
                            {isSaving ? "SYNCING..." : "SAVE PROFILE"}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
