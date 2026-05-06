import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronRight, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';

const CampaignLeaderboardPane = ({
    isOpen,
    onToggle,
    leaderboard,
    theme,
    address,
    truncate,
    isSmallScreen
}) => {
    const isDark = theme !== 'light';

    if (isSmallScreen) {
        // Mobile layout (slides up from bottom)
        return (
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className={`fixed bottom-0 left-0 right-0 h-[70vh] z-[100] rounded-t-[32px] overflow-hidden flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.3)]
                            ${isDark ? 'bg-[#0a0a0a]/95 border-t border-white/10 backdrop-blur-xl' : 'bg-[#d4e6dc]/95 border-t border-[#3CB371]/20 backdrop-blur-xl'}
                        `}
                    >
                        {/* Drag Handle & Toggle */}
                        <div 
                            onClick={onToggle}
                            className={`w-full h-12 flex items-center justify-center cursor-pointer ${isDark ? 'hover:bg-white/5' : 'hover:bg-[#3CB371]/10'} transition-colors shrink-0`}
                        >
                            <div className={`w-12 h-1.5 rounded-full mb-1 ${isDark ? 'bg-white/20' : 'bg-[#0f2618]/20'}`} />
                        </div>

                        <div className="flex items-center justify-between px-6 pb-4">
                            <div className="flex items-center gap-2">
                                <Trophy size={18} className="text-[#3CB371]" />
                                <h2 className={`text-lg font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>Live Leaderboard</h2>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3CB371]/10 text-[#3CB371] border border-[#3CB371]/20 uppercase tracking-widest">
                                {leaderboard.length} Entries
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-8 flex flex-col gap-2">
                            {leaderboard.length === 0 ? (
                                <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
                                    <Trophy size={48} className="mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No rankings yet</p>
                                </div>
                            ) : (
                                leaderboard.map((entry, idx) => {
                                    const isMe = address && entry.address.toLowerCase() === address.toLowerCase();
                                    return (
                                        <div 
                                            key={entry.address}
                                            className={`flex items-center justify-between p-3 rounded-[20px] transition-all
                                                ${isMe 
                                                    ? 'bg-[#3CB371]/20 border border-[#3CB371]/40 shadow-[0_0_15px_rgba(60,179,113,0.15)]' 
                                                    : isDark ? 'bg-white/5 border border-white/5 hover:border-white/10' : 'bg-white/40 border border-[#3CB371]/10'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black
                                                    ${idx === 0 ? 'bg-amber-400/20 text-amber-500 border border-amber-400/30' : 
                                                      idx === 1 ? 'bg-gray-300/20 text-gray-400 border border-gray-300/30' :
                                                      idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                                                      'bg-transparent text-[#3CB371]'}
                                                `}>
                                                    #{idx + 1}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`text-[12px] font-bold font-mono ${isDark ? 'text-white/90' : 'text-[#0f2618]'}`}>{truncate(entry.address)}</span>
                                                    {isMe && <span className="text-[8px] font-black text-[#3CB371] uppercase tracking-widest">My Position</span>}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <div className="text-[14px] font-black text-[#3CB371]">{entry.wins}</div>
                                                <div className="text-[8px] font-bold uppercase tracking-widest opacity-40">Wins</div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    // Desktop layout (slides from right)
    return (
        <motion.div
            initial={false}
            animate={{
                width: isOpen ? 320 : 0,
                opacity: isOpen ? 1 : 0
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 150 }}
            className={`absolute right-0 top-0 bottom-0 z-[60] flex flex-row items-center pointer-events-none`}
            style={{ width: isOpen ? 320 : 0 }}
        >
            <div className={`
                h-full w-full pointer-events-auto
                backdrop-blur-3xl border-l rounded-l-[40px] shadow-[-20px_0_50px_rgba(0,0,0,0.3)]
                transition-all duration-500 flex flex-col overflow-hidden
                ${isDark
                    ? 'bg-[#0a0a0a]/90 border-white/10'
                    : 'bg-[#d4e6dc]/95 border-[#3CB371]/20'}
            `}>
                <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Trophy size={18} className="text-[#3CB371]" />
                        <h2 className={`text-base font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>Live Leaderboard</h2>
                    </div>
                    <button 
                        onClick={onToggle}
                        className={`p-2 rounded-full transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white' : 'bg-[#0f2618]/5 hover:bg-[#0f2618]/10 text-[#0f2618]/60 hover:text-[#0f2618]'}`}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                    {leaderboard.length === 0 ? (
                        <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
                            <Trophy size={48} className="mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No rankings yet</p>
                        </div>
                    ) : (
                        leaderboard.map((entry, idx) => {
                            const isMe = address && entry.address.toLowerCase() === address.toLowerCase();
                            return (
                                <div 
                                    key={entry.address}
                                    className={`flex items-center justify-between p-3 rounded-[20px] transition-all hover:scale-[1.02]
                                        ${isMe 
                                            ? 'bg-[#3CB371]/20 border border-[#3CB371]/40 shadow-[0_0_15px_rgba(60,179,113,0.15)]' 
                                            : isDark ? 'bg-white/5 border border-white/5 hover:border-white/10' : 'bg-white/40 border border-[#3CB371]/10'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black
                                            ${idx === 0 ? 'bg-amber-400/20 text-amber-500 border border-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.3)]' : 
                                              idx === 1 ? 'bg-gray-300/20 text-gray-400 border border-gray-300/30' :
                                              idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                                              'bg-transparent text-[#3CB371]'}
                                        `}>
                                            #{idx + 1}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-[11px] font-bold font-mono ${isDark ? 'text-white/90' : 'text-[#0f2618]'}`}>{truncate(entry.address)}</span>
                                            {isMe && <span className="text-[7px] font-black text-[#3CB371] uppercase tracking-widest mt-0.5">My Position</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-[14px] font-black text-[#3CB371]">{entry.wins}</div>
                                        <div className="text-[7px] font-bold uppercase tracking-widest opacity-40">Wins</div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default CampaignLeaderboardPane;
