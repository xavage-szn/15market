import React, { memo, useState } from 'react';
import { useAccount, useWallet } from "@getpara/react-sdk";
import { Lock, Share2 } from 'lucide-react';

const TradeHistoryComponent = ({
    wallet,
    sessionMode,
    sessionBalance,
    tradeHistory,
    setTradeHistory,
    setSelectedPnLTrade,
    setIsPnLOpen,
    GREEN,
    CORAL,
    sessionKeypair,
    evmSessionWallet,
    theme,
    currentNetwork
}) => {
    const { open } = useAppKit();
    const { isConnected } = useAccount();
    const { data: wallet } = useWallet();
    const evmAddress = wallet?.address;
    const mainAddress = wallet.publicKey?.toBase58();
    const sessionAddress = sessionKeypair?.publicKey.toBase58();
    const isLight = theme === 'light';

    // Pagination
    const [currentPage, setCurrentPage] = React.useState(1);
    const ITEMS_PER_PAGE = 10;

    const filteredTrades = tradeHistory.filter(t => {
        // Strict Network & Address Isolation
        if (t.network !== currentNetwork) return false;

        if (currentNetwork === 'solana') {
            return (mainAddress && t.userPublicKey === mainAddress) ||
                (sessionAddress && t.userPublicKey === sessionAddress);
        } else {
            return (evmAddress && t.userPublicKey?.toLowerCase() === evmAddress.toLowerCase()) ||
                (evmSessionWallet?.address && t.userPublicKey?.toLowerCase() === evmSessionWallet.address.toLowerCase());
        }
    });

    const totalPages = Math.ceil(filteredTrades.length / ITEMS_PER_PAGE);
    const paginatedTrades = filteredTrades.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const isCompact = theme === 'compact' || (window.localStorage.getItem('15market_ui_version') === 'v2');

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
                    {/* Clear History removed as per protocol security */}
                </div>

                {(!isConnected && (!sessionMode || sessionBalance <= 0)) ? (
                    <div className={`py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl ${isLight ? 'border-black/5 bg-black/5' : 'border-white/5 bg-black/20'}`}>
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${isLight ? 'bg-white shadow-lg' : 'bg-white/5'}`}>
                            <Lock className={isLight ? 'text-black/20' : 'text-white/20'} size={32} />
                        </div>
                        <h4 className={`text-xl font-black uppercase tracking-widest mb-2 text-center ${isLight ? 'text-black/80' : 'text-white'}`}>History Locked</h4>
                        <p className={`text-sm max-w-xs text-center mb-8 font-medium ${isLight ? 'text-black/40' : 'text-white/40'}`}>Connect your wallet to access your private trading records and performance metrics.</p>
                        <button
                            onClick={() => open()}
                            className="px-8 py-3 bg-[#3CB371] text-black font-black uppercase text-xs tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg"
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
                                    <div className="font-bold px-2 py-0.5 lg:px-3 lg:py-1 rounded-md text-[9px] lg:text-sm" style={{ background: t.direction === "buy" ? `${GREEN}22` : `${CORAL}22`, color: t.direction === "buy" ? GREEN : CORAL }}>
                                        {t.direction.toUpperCase()}
                                    </div>
                                    <div className={`text-[10px] lg:text-sm font-bold ${isLight ? 'text-black/90' : 'text-white/90'}`}>{t.amount} {t.network === 'arc' ? 'USDC' : 'SOL'}</div>
                                </div>

                                <div className={`${isLight ? 'text-black/40' : 'text-white/40'} text-[9px] lg:text-sm hidden sm:flex flex-col`}>
                                    <span>Entry: ${t.entryPrice}</span>
                                    {t.exitPrice > 0 && <span className="text-[8px] lg:text-xs opacity-60">Exit: ${t.exitPrice}</span>}
                                </div>

                                <div className="flex items-center gap-2 lg:gap-6">
                                    <div className={`text-[8px] font-mono hidden lg:block ${isLight ? 'text-black/30' : 'text-white/20'}`}>{t.timestamp}</div>

                                    <a
                                        href={t.network === 'arc' ? `https://testnet.arcscan.app/tx/${t.tx}` : `https://explorer.solana.com/tx/${t.tx}?cluster=devnet`}
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
                                            <Share2 size={12} className="lg:hidden" />
                                            <Share2 size={16} className="hidden lg:block" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-8 py-4 border-t border-dashed border-white/5">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 ${isLight ? 'bg-black/5 text-black/60 hover:bg-black/10' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                >
                                    Prev
                                </button>

                                <div className="flex gap-1">
                                    {[...Array(totalPages)].map((_, i) => {
                                        const p = i + 1;
                                        if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                                            return (
                                                <button
                                                    key={p}
                                                    onClick={() => setCurrentPage(p)}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${currentPage === p
                                                        ? 'bg-[#3CB371] text-black'
                                                        : (isLight ? 'bg-black/5 text-black/40 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:bg-white/10')}`}
                                                >
                                                    {p}
                                                </button>
                                            );
                                        } else if (p === currentPage - 2 || p === currentPage + 2) {
                                            return <span key={p} className="text-white/20 px-1 self-center">...</span>;
                                        }
                                        return null;
                                    })}
                                </div>

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
