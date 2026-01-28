import React, { useState, useEffect } from 'react';
import { getProgram } from '../api/program';
import { getProfilePda } from '../api/pdas';
import { motion, AnimatePresence } from 'framer-motion';
import { SystemProgram } from '@solana/web3.js';
import { ThemeToggle } from './ThemeToggle';

export const ProfileModal = ({ isOpen, onClose, wallet, connection, theme, toggleTheme, userProfile = null }) => {
    const [username, setUsername] = useState("");
    const [xHandle, setXHandle] = useState("");
    const [discordHandle, setDiscordHandle] = useState("");
    const [metrics, setMetrics] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isVerifyingX, setIsVerifyingX] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (wallet.publicKey) {
                fetchProfile();
            } else if (userProfile) {
                setUsername(userProfile.username || "");
            }
        }
    }, [isOpen, wallet.publicKey, userProfile]);

    const fetchProfile = async () => {
        try {
            const program = getProgram(wallet, connection);
            const [profilePda] = getProfilePda(wallet.publicKey);
            const profileAcc = await program.account.userProfile.fetchNullable(profilePda);
            if (profileAcc) {
                setUsername(profileAcc.username || "");
                setXHandle(profileAcc.xHandle || "");
                setDiscordHandle(profileAcc.discordHandle || "");
                setMetrics({
                    wins: profileAcc.totalWins ? profileAcc.totalWins.toNumber() : 0,
                    losses: profileAcc.totalLosses ? profileAcc.totalLosses.toNumber() : 0,
                    trades: profileAcc.totalTrades ? profileAcc.totalTrades.toNumber() : 0,
                    volume: profileAcc.totalVolume ? (profileAcc.totalVolume.toNumber() / 1e9).toFixed(2) : "0.00"
                });
            }
        } catch (err) {
            console.error("Fetch profile error:", err);
        }
    };

    const handleSave = async () => {
        if (!wallet.publicKey) {
            alert("Please connect your wallet first.");
            return;
        }
        setIsSaving(true);
        try {
            const program = getProgram(wallet, connection);
            const [profilePda] = getProfilePda(wallet.publicKey);

            console.log("Saving profile to:", profilePda.toBase58());

            await program.methods
                .syncProfile(username, xHandle, discordHandle)
                .accounts({
                    profile: profilePda,
                    user: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            alert("Profile synced on-chain successfully!");
            onClose();
        } catch (err) {
            console.error("Save profile error:", err);
            // Check if it's a "Simulation failed" or "Account already exists" or "Insufficient SOL"
            let msg = err.message;
            if (msg.includes("0x1")) msg = "Insufficient SOL for on-chain storage.";
            alert("Failed to save profile: " + msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleVerifyX = () => {
        setIsVerifyingX(true);
        const tweetText = encodeURIComponent(`Verifying my on-chain identity on @15market_sol 🚀\n\nWallet: ${wallet.publicKey?.toBase58()}\n\n#15market #Solana`);
        window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
        setTimeout(() => setIsVerifyingX(false), 3000);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-md bg-black/80">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="w-full max-w-md bg-[#0D0D0D] border border-[#3CB371]/30 rounded-[32px] p-8 shadow-[0_0_50px_rgba(60,179,113,0.15)] relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#3CB371] to-transparent" />

                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3CB371] to-black p-[1px] overflow-hidden">
                                <div className="w-full h-full rounded-2xl bg-[#050505] flex items-center justify-center overflow-hidden">
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
                                <h3 className="text-xl font-black uppercase tracking-widest text-white">DeGen Account</h3>
                                <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest mt-1">Identity & Metrics</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <ThemeToggle theme={theme} onToggle={toggleTheme} />
                            <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/40">✕</button>
                        </div>
                    </div>

                    {metrics && (
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col justify-center">
                                <p className="text-[8px] font-bold text-[#3CB371] uppercase tracking-widest mb-1">Win Rate</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-2xl font-black text-white">
                                        {metrics.trades > 0 ? ((metrics.wins / metrics.trades) * 100).toFixed(0) : 0}
                                    </p>
                                    <span className="text-xs font-bold text-white/40">%</span>
                                </div>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col justify-center">
                                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-1">Total Volume</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-2xl font-black text-white">{metrics.volume}</p>
                                    <span className="text-xs font-bold text-white/40">SOL</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] ml-1 mb-2 block">Username (Public)</label>
                            <input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Anonymous DeGen"
                                className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:border-[#3CB371]/50 focus:ring-1 focus:ring-[#3CB371]/20 outline-none transition-all placeholder:text-white/10"
                            />
                        </div>

                        <div className="relative">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] ml-1 mb-2 block">X Handle Binding</label>
                            <div className="flex gap-2">
                                <input
                                    value={xHandle}
                                    onChange={(e) => setXHandle(e.target.value)}
                                    placeholder="@username"
                                    className="flex-1 bg-black border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:border-[#3CB371]/50 outline-none transition-all placeholder:text-white/10"
                                />
                                <button
                                    onClick={handleVerifyX}
                                    className="px-4 rounded-2xl bg-white text-black text-xs font-black transition-transform active:scale-95 hover:bg-[#3CB371]"
                                >
                                    {isVerifyingX ? "OPENING..." : "VERIFY"}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] ml-1 mb-2 block">Discord ID</label>
                            <input
                                value={discordHandle}
                                onChange={(e) => setDiscordHandle(e.target.value)}
                                placeholder="name#0000"
                                className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:border-[#3CB371]/50 outline-none transition-all placeholder:text-white/10"
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-3">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`w-full bg-[#3CB371] text-black font-black py-5 rounded-2xl shadow-[0_10px_30px_rgba(60,179,113,0.2)] transition-all flex items-center justify-center gap-2 ${isSaving ? 'opacity-50' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                    SYNCING IDENTITY...
                                </>
                            ) : "SAVE & SYNC PROFILE"}
                        </button>

                        <p className="text-[7px] text-center text-white/10 uppercase tracking-[0.4em]">Requires one-time SOL for account initialization</p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
