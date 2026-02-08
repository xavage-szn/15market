import React, { memo, useState } from 'react';
import { useAccount, useWallet, useModal } from "@getpara/react-sdk";
import { Lock, Share2 } from 'lucide-react';

const TradeHistoryComponent = ({
    tradeHistory,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme,
}) => {
    const { openModal } = useModal();
    const { isConnected: isParaConnected } = useAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress } = useAccount();
    const { data: paraWallet } = useWallet();
    const address = paraWallet?.address || wagmiAddress;
    const isConnected = isParaConnected || isWagmiConnected;
    const isLight = theme === 'light';

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const filteredTrades = tradeHistory.filter(t => {
        if (!address) return false;
        const trader = t.userPublicKey || t.owner || t.user || "";
        if (address.startsWith('0x') || String(trader).startsWith('0x')) {
            return String(trader).toLowerCase() === address.toLowerCase();
        }
        return String(trader) === address;
    });

    // Debugging logs
    React.useEffect(() => {
        if (isConnected && address) {
            console.log(`🔍 [TRADE_HISTORY] Address: ${address}`);
            console.log(`🔍 [TRADE_HISTORY] Raw Trade Count: ${tradeHistory.length}`);
            console.log(`🔍 [TRADE_HISTORY] Filtered Count: ${filteredTrades.length}`);
            if (tradeHistory.length > 0 && filteredTrades.length === 0) {
                console.log(`🔍 [TRADE_HISTORY] Sample Trade Data:`, tradeHistory[0]);
            }
        }
    }, [address, isConnected, tradeHistory.length, filteredTrades.length]);

    const totalPages = Math.ceil(filteredTrades.length / ITEMS_PER_PAGE);
    const paginatedTrades = filteredTrades.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const isCompact = window.localStorage.getItem('15market_ui_version') === 'v2';

    return (
        <div className={`w-full ${isCompact ? 'h-full' : 'max-w-4xl mt-6 lg:mt-10 mb-20'} text-left`} >
            <div className={`
                ${isCompact ? 'h-full flex flex-col p-3' : 'p-4 lg:p-6'} 
                rounded-2xl border transition-all duration-300 glass-panel
                ${isLight ? 'static-panel-light !shadow-xl' : 'shadow-2xl'}`}
                style={{ background: isLight ? '#ffffff' : 'rgba(10, 10, 10, 0.7)' }}
            >
                <div className="flex items-center justify-between mb-3 lg:mb-4 px-1">
                    <h3 className={`text-xs lg:text-base font-bold ${isLight ? '!text-black' : 'text-white'}`}>Recent Trades</h3>
                </div>

                {!isConnected ? (
                    <div className={`py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl ${isLight ? 'border-black/5 bg-black/5' : 'border-white/5 bg-black/20'}`}>
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${isLight ? 'bg-white shadow-lg' : 'bg-white/5'}`}>
                            <Lock className={isLight ? 'text-black/20' : 'text-white/20'} size={32} />
                        </div>
                        <h4 className={`text-xl font-black uppercase tracking-widest mb-2 text-center ${isLight ? 'text-black/80' : 'text-white'}`}>History Locked</h4>
                        <p className={`text-sm max-w-xs text-center mb-8 font-medium ${isLight ? 'text-black/40' : 'text-white/40'}`}>Connect your wallet to access your private trading records and performance metrics.</p>
                        <button
                            onClick={() => openModal()}
                            className="px-8 py-3 bg-[#3CB371] text-white font-black uppercase text-xs tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg"
                        >
                            Connect Wallet
                        </button>
                    </div>
                ) : filteredTrades.length === 0 ? (
                    <div className={`${isLight ? 'text-black/40' : 'text-white/40'} py-10 text-center`}>No trades yet for this wallet. Reach for the stars!</div>
                ) : (
                    <div className="space-y-2">
                        {paginatedTrades.map((t) => (
                            <div key={t.id} className={`flex flex-row items-center justify-between p-2 lg:p-4 rounded-xl border-2 gap-2 lg:gap-4 transition-all group ${isLight
                                ? 'bg-[#f8fafc] border-black/5 shadow-md hover:shadow-lg hover:border-black/10'
                                : 'bg-black/40 border-white/10 hover:border-[#3CB371]/30'}`}>
                                <div className="flex items-center gap-2 lg:gap-4">
                                    <div className="font-bold px-2 py-0.5 lg:px-3 lg:py-1 rounded-md text-[9px] lg:text-sm" style={{ background: t.direction === "UP" ? `rgba(59, 130, 246, 0.2)` : `rgba(255, 127, 80, 0.2)`, color: t.direction === "UP" ? '#3CB371' : '#FF7F50' }}>
                                        {t.direction?.toUpperCase()}
                                    </div>
                                    <div className={`text-[10px] lg:text-sm font-bold ${isLight ? 'text-black/90' : 'text-white/90'}`}>{t.amount} USDC</div>
                                </div>

                                <div className={`${isLight ? 'text-black/40' : 'text-white/40'} text-[9px] lg:text-sm hidden sm:flex flex-col`}>
                                    <span>Entry: ${t.entryPrice}</span>
                                    {t.settlementPrice > 0 && <span className="text-[8px] lg:text-xs opacity-60">Exit: ${t.settlementPrice}</span>}
                                </div>

                                <div className="flex items-center gap-2 lg:gap-6">
                                    <div className={`text-[8px] font-mono hidden lg:block ${isLight ? 'text-black/30' : 'text-white/20'}`}>{t.timestamp}</div>

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
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 ${isLight ? 'bg-black/5 text-black/60 hover:bg-black/10' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                >
                                    Prev
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 ${isLight ? 'bg-black/5 text-black/60 hover:bg-black/10' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
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
