import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, ExternalLink, ShieldAlert, Users, Mail, Twitter, MessageCircle, Send } from 'lucide-react';
import { useAccount } from 'wagmi';

import { KEEPER_URL_ROUNDS } from '../constants';

export default function RoundsAccessGate({ children, theme, active, onUnlock }) {
    const { address } = useAccount();
    const [hasAccess, setHasAccess] = useState(false);
    const [view, setView] = useState("gate"); // gate, apply
    const [inputCode, setInputCode] = useState("");
    const [error, setError] = useState("");
    const [isChecking, setIsChecking] = useState(true);
    const [isApplying, setIsApplying] = useState(false);
    const isDark = theme !== 'light';

    // Application Form state
    const [formData, setFormData] = useState({ xHandle: '', discord: '', email: '' });

    useEffect(() => {
        if (address && active) {
            checkAccess();
        } else {
            setIsChecking(false);
        }
    }, [address, active]);

    const checkAccess = async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/access/check/${address}`);
            const data = await res.json();
            if (data.authorized) {
                setHasAccess(true);
                onUnlock?.();
            }
        } catch (e) {
            // Fallback to localstorage if backend is down or not yet configured correctly
            const local = localStorage.getItem('15market_rounds_access') === 'true';
            if (local) setHasAccess(true);
        } finally {
            setIsChecking(false);
        }
    };

    const handleVerify = async () => {
        if (!inputCode.trim()) return;
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/access/redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, code: inputCode.trim() })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('15market_rounds_access', 'true');
                setHasAccess(true);
                onUnlock?.();
            } else {
                setError(data.error || "Invalid Access Code");
                setTimeout(() => setError(""), 3000);
            }
        } catch (e) {
            setError("Connection Error");
            setTimeout(() => setError(""), 3000);
        }
    };

    const handleApply = async (e) => {
        e.preventDefault();
        if (!formData.xHandle || !formData.email) return;
        setIsApplying(true);
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/access/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, ...formData })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setView("gate");
            } else {
                alert(data.error || "Submission failed");
            }
        } catch (e) {
            alert("Connection Error");
        } finally {
            setIsApplying(false);
        }
    };

    if (isChecking) return null;
    if (!active || hasAccess) return children;

    return (
        <div className="w-full h-full min-h-[600px] flex items-center justify-center p-4 relative overflow-hidden rounded-[32px]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xl z-0" />
            
            <AnimatePresence mode="wait">
                {view === "gate" ? (
                    <motion.div 
                        key="gate"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`relative z-10 max-w-md w-full p-8 rounded-[40px] border shadow-2xl ${
                            isDark ? 'bg-[#0f110f] border-white/10 text-white' : 'bg-white border-[#3CB371]/20 text-black'
                        }`}
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${error ? 'bg-red-500/10' : 'bg-[#3CB371]/10'}`}>
                                {error ? <ShieldAlert size={32} className="text-red-500" /> : <Lock size={32} className="text-[#3CB371]" />}
                            </div>
                            
                            <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">Vault Protected</h2>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-8">
                                Invite-only Beta access to Rounds Terminal.
                            </p>

                            <div className="w-full space-y-4">
                                <input 
                                    type="text"
                                    value={inputCode}
                                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                                    placeholder="ENTER ACCESS CODE"
                                    className={`w-full px-6 py-5 rounded-2xl text-center font-black tracking-widest outline-none border-2 transition-all ${
                                        isDark ? 'bg-white/5 border-white/5 focus:border-[#3CB371]/30' : 'bg-black/5 border-black/5 focus:border-[#3CB371]/30'
                                    } ${error ? 'border-red-500/50' : ''}`}
                                />
                                <button onClick={handleVerify} className="w-full py-5 rounded-2xl bg-[#3CB371] hover:brightness-110 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#3CB371]/20 transition-all">
                                    Unlock Rounds
                                </button>
                                {error && <p className="text-[10px] font-bold text-red-500 uppercase">{error}</p>}
                            </div>

                            <div className="mt-8 pt-8 border-t border-white/5 w-full">
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 text-center">No code yet?</p>
                                <button onClick={() => setView("apply")} className="text-[10px] font-black text-[#3CB371] uppercase underline underline-offset-4 hover:opacity-80 transition-all">
                                    Request Beta Pass
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="apply"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`relative z-10 max-w-md w-full p-8 rounded-[40px] border shadow-2xl ${
                            isDark ? 'bg-[#0f110f] border-white/10 text-white' : 'bg-white border-[#3CB371]/20 text-black'
                        }`}
                    >
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Beta Application</h2>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-6">Complete steps to request access.</p>

                        <div className="space-y-3 mb-8">
                            <Step icon={<Twitter size={12}/>} text="Follow @15_markets on X" link="https://x.com/15_markets" />
                            <Step icon={<Send size={12}/>} text="Like, Retweet & Comment pinned post" link="https://x.com/15_markets" />
                        </div>

                        <form onSubmit={handleApply} className="space-y-4">
                            <Input icon={<Twitter size={14}/>} placeholder="X USERNAME (e.g. @trader)" value={formData.xHandle} onChange={v => setFormData({...formData, xHandle: v})} isDark={isDark} />
                            <Input icon={<MessageCircle size={14}/>} placeholder="DISCORD ID (OPTIONAL)" value={formData.discord} onChange={v => setFormData({...formData, discord: v})} isDark={isDark} />
                            <Input icon={<Mail size={14}/>} placeholder="EMAIL FOR ACCESS CODE" type="email" value={formData.email} onChange={v => setFormData({...formData, email: v})} isDark={isDark} />
                            
                            <button disabled={isApplying} type="submit" className="w-full py-5 rounded-2xl bg-[#3CB371] font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#3CB371]/20 mt-4 disabled:opacity-50">
                                {isApplying ? "SUBMITTING..." : "SUBMIT APPLICATION"}
                            </button>
                        </form>

                        <button onClick={() => setView("gate")} className="w-full mt-6 text-[9px] font-black text-white/20 uppercase tracking-[0.2em] hover:text-white/40 transition-all">
                            Back to Unlock
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const Step = ({ icon, text, link }) => (
    <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-[#3CB371]/30 transition-all group">
        <div className="p-1.5 rounded-lg bg-[#3CB371]/10 text-[#3CB371] group-hover:bg-[#3CB371]/20 transition-all">{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-tight text-white/60">{text}</span>
        <ExternalLink size={10} className="ml-auto text-white/20" />
    </a>
);

const Input = ({ icon, placeholder, value, onChange, type="text", isDark }) => (
    <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#3CB371] transition-all">{icon}</div>
        <input 
            type={type} required value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full pl-12 pr-6 py-4 rounded-xl text-xs font-bold outline-none border-2 transition-all ${
                isDark ? 'bg-white/5 border-white/5 focus:border-[#3CB371]/30' : 'bg-black/5 border-black/5 focus:border-[#3CB371]/30'
            }`}
        />
    </div>
);
