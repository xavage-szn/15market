import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, ExternalLink, ShieldAlert } from 'lucide-react';

const ACCESS_CODE = "NORgate123+";
const TYPEFORM_LINK = "https://samclassic.typeform.com/to/H2gkMCCb";

export default function RoundsAccessGate({ children, theme, active, onUnlock }) {
    const [hasAccess, setHasAccess] = useState(() => {
        return localStorage.getItem('15market_rounds_access') === 'true';
    });
    const [inputCode, setInputCode] = useState("");
    const [error, setError] = useState(false);
    const isDark = theme !== 'light';

    const handleVerify = () => {
        if (inputCode.trim() === ACCESS_CODE) {
            localStorage.setItem('15market_rounds_access', 'true');
            setHasAccess(true);
            setError(false);
            onUnlock?.();
        } else {
            setError(true);
            setTimeout(() => setError(false), 2000);
        }
    };

    if (!active || hasAccess) return children;

    return (
        <div className="w-full h-full min-h-[500px] flex items-center justify-center p-4 relative overflow-hidden rounded-[32px]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xl z-0" />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`relative z-10 max-w-md w-full p-8 rounded-[40px] border shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${
                    isDark ? 'bg-[#0f110f] border-white/10' : 'bg-white border-[#3CB371]/20'
                }`}
            >
                <div className="flex flex-col items-center text-center gap-8">
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 shadow-inner ${
                        error ? 'border-[#FF7F50] bg-[#FF7F50]/10 animate-shake' : 'border-[#3CB371] bg-[#3CB371]/10'
                    }`}>
                        {error ? <ShieldAlert size={40} className="text-[#FF7F50]" /> : <Lock size={40} className="text-[#3CB371]" />}
                    </div>

                    <div>
                        <h2 className={`text-3xl font-black uppercase tracking-tighter mb-3 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>
                            Vault Protected
                        </h2>
                        <p className={`text-[11px] font-bold uppercase tracking-widest leading-loose ${isDark ? 'text-white/40' : 'text-[#05140b]/40'}`}>
                            Rounds mode is currently <span className="text-[#3CB371]">Invite Only</span>. 
                            Authenticate to continue.
                        </p>
                    </div>

                    <div className="w-full space-y-4">
                        <div className="relative group">
                            <input 
                                type="password"
                                value={inputCode}
                                onChange={(e) => setInputCode(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                placeholder="Enter Access Code"
                                className={`w-full px-8 py-5 rounded-[24px] text-sm font-black transition-all outline-none border-2 text-center tracking-widest ${
                                    isDark 
                                    ? 'bg-white/5 border-white/5 focus:border-[#3CB371]/50 focus:bg-white/10 text-white' 
                                    : 'bg-black/5 border-black/5 focus:border-[#3CB371]/50 focus:bg-black/10 text-black'
                                } ${error ? 'border-[#FF7F50]/50' : ''}`}
                            />
                        </div>

                        <button 
                            onClick={handleVerify}
                            className="w-full py-5 rounded-[24px] bg-[#3CB371] hover:bg-[#3CB371]/90 active:scale-[0.98] transition-all text-white font-black uppercase tracking-[0.3em] text-[10px] shadow-[0_15px_40px_-10px_rgba(60,179,113,0.6)]"
                        >
                            Authorize Terminal
                        </button>
                    </div>

                    <div className={`pt-8 border-t w-full ${isDark ? 'border-white/5' : 'border-black/5'}`}>
                        <p className={`text-[9px] font-black uppercase tracking-[0.4em] mb-4 ${isDark ? 'text-white/20' : 'text-black/20'}`}>
                            Need Access?
                        </p>
                        <a 
                            href={TYPEFORM_LINK}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-3 group px-6 py-3 rounded-full border border-[#3CB371]/20 hover:bg-[#3CB371]/5 transition-all"
                        >
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#3CB371]">
                                Request Access Pass
                            </span>
                            <ExternalLink size={14} className="text-[#3CB371]" />
                        </a>
                    </div>
                </div>
            </motion.div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
                    20%, 40%, 60%, 80% { transform: translateX(4px); }
                }
                .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
            `}</style>
        </div>
    );
}
