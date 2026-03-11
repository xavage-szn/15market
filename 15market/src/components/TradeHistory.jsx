import React, { memo, useState, useMemo } from 'react';
import { Lock, Share2 } from 'lucide-react';

function TradeHistoryComponent({
    tradeHistory,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme,
    wallet
}) {
    // Combined address source
    const address = wallet?.address;
    // We are connected if the wallet object says so, OR if we have a valid address string
    const isConnected = !!address || wallet?.connected;
    const isLight = theme === 'light';

    // Debugging logs to help diagnosis
    React.useEffect(() => {
        // Debug logs removed for privacy
    }, [wallet, address, isConnected]);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const filteredTrades = useMemo(() => {
        // We trust the tradeHistory prop as it's already pre-filtered by UserApp 
        // to include both main and session wallet trades.
        return tradeHistory;
    }, [tradeHistory]);

    React.useEffect(() => {
        if (address) {
            // Sync logic
        }
    }, [address, tradeHistory.length, filteredTrades.length]);

    const totalPages = Math.ceil(filteredTrades.length / ITEMS_PER_PAGE);
    const paginatedTrades = filteredTrades.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const isCompact = window.localStorage.getItem('15market_ui_version') === 'v2';

    return (
        <div className={`w-full ${isCompact ? 'h-full' : 'w-full mt-6 lg:mt-10 mb-20'} text-left`} >
            <div className={`
                ${isCompact ? 'h-full flex flex-col p-3' : 'p-4 lg:p-6'} 
                rounded-2xl border transition-all duration-300 glass-panel
                ${isLight ? 'coral-green-gradient-light !shadow-xl' : 'shadow-2xl'}`}
                style={isLight ? {} : { background: 'rgba(10, 10, 10, 0.7)' }}
            >
                <div className="flex items-center justify-between mb-3 lg:mb-4 px-1">
                    <h3 className={`text-xs lg:text-base font-bold ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Trade History</h3>
                </div>

                {filteredTrades.length === 0 ? (
                    <div className={`${isLight ? 'text-[#0a261a]/60' : 'text-white/40'} py-10 text-center uppercase text-[10px] font-black tracking-widest`}>No trades yet for this wallet.</div>
                ) : (
                    <div className="space-y-2">
                        {paginatedTrades.map((t) => (
                            <div key={t.id} className={`flex flex-row items-center justify-between p-2 lg:p-4 rounded-xl border transition-all group ${isLight
                                ? 'bg-[#f0f9f4] border-[#3CB371]/10 shadow-sm hover:shadow-md hover:border-[#3CB371]/40'
                                : 'bg-black/40 border-white/10 hover:border-[#3CB371]/30'}`}>
                                <div className="flex items-center gap-2 lg:gap-4">
                                    <div className="font-bold px-2 py-0.5 lg:px-3 lg:py-1 rounded-md text-[9px] lg:text-sm" style={{
                                        background: (t.direction === "UP" || t.direction === 1 || String(t.direction) === "1") ? `rgba(60, 179, 113, 0.2)` : `rgba(255, 127, 80, 0.2)`,
                                        color: (t.direction === "UP" || t.direction === 1 || String(t.direction) === "1") ? '#3CB371' : '#FF7F50'
                                    }}>
                                        {String(t.direction || "").toUpperCase()}
                                    </div>
                                    <div className={`text-[10px] lg:text-sm font-bold ${isLight ? 'text-[#0a261a]' : 'text-white/90'}`}>{Number(t.amount).toFixed(2)} USDC</div>
                                </div>

                                <div className={`${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} text-[9px] lg:text-sm hidden sm:flex flex-col`}>
                                    <span>Entry: ${Number(t.entryPrice).toFixed(2)}</span>
                                    {t.settlementPrice > 0 && <span className="text-[8px] lg:text-xs opacity-60">Exit: ${Number(t.settlementPrice).toFixed(2)}</span>}
                                </div>

                                <div className="flex items-center gap-2 lg:gap-6">
                                    <div className={`text-[8px] font-mono hidden lg:block ${isLight ? 'text-[#0a261a]/30' : 'text-white/20'}`}>{t.timestamp}</div>

                                    <a
                                        href={`https://testnet.arcscan.app/tx/${t.tx}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`text-[9px] lg:text-sm font-black px-2 py-0.5 lg:px-4 lg:py-1 rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1 lg:gap-2 ${t.status === "WON" ? "bg-[#3CB371]/10 text-[#3CB371] border border-[#3CB371]/30" :
                                            t.status === "LOST" ? "bg-[#FF7F50]/10 text-[#FF7F50] border border-[#FF7F50]/30" :
                                                (isLight ? "bg-black/5 text-black/40" : "bg-white/5 text-white/40")
                                            }`}
                                    >
                                        {t.status}
                                        <span className="text-[8px] lg:text-[10px] opacity-40 group-hover:opacity-100 transition-opacity">↗</span>
                                    </a>

                                    {t.status !== "PENDING" && (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedPnLTrade(t);
                                                setIsPnLOpen(true);
                                            }}
                                            className={`p-1.5 lg:p-2 rounded-xl transition-all ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/40 hover:text-[#3CB371]' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-[#3CB371]'}`}
                                            title="Share PnL"
                                        >
                                            <Share2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-8 py-4 border-t border-dashed border-white/5">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 ${isLight ? 'bg-[#3CB371]/10 text-[#0a261a]/60 hover:bg-[#3CB371]/20' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                >
                                    Prev
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 ${isLight ? 'bg-[#3CB371]/10 text-[#0a261a]/60 hover:bg-[#3CB371]/20' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
};

export const TradeHistory = memo(TradeHistoryComponent);
