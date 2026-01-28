import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { Stamp } from './Stamp';

export const PnLModal = ({ isOpen, onClose, trade }) => {
    const cardRef = useRef(null);

    if (!trade || !isOpen) return null;

    const handleDownload = async () => {
        if (cardRef.current === null) return;
        try {
            // Hide buttons during download
            const buttons = cardRef.current.querySelectorAll('.receipt-control');
            buttons.forEach(b => b.style.opacity = '0');

            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                quality: 1,
                backgroundColor: '#f8f8f8'
            });

            // Restore buttons
            buttons.forEach(b => b.style.opacity = '1');

            const link = document.createElement('a');
            link.download = `15market-pnl-${trade.id}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to download image:', err);
        }
    };

    // Safety Mesh: Double check math in case status flag is de-synced or delayed
    const entryUSD = parseFloat(trade.entryPrice);
    const settleUSD = parseFloat(trade.settlementPrice);
    const isUp = trade.direction === "buy";
    const mathSaysWin = isUp ? (settleUSD >= entryUSD) : (settleUSD <= entryUSD);

    // A trade is WON if the status says so OR if the math is undeniable (and we have a settlement price)
    const isWon = trade.status === "WON" || (trade.settlementPrice && trade.settlementPrice !== "0.00" && mathSaysWin);

    // Calculate profit based on duration multiplier
    const getMultiplier = (duration) => {
        if (duration === 5) return 6.98;
        if (duration === 10) return 4.98;
        return 1.98;
    };

    const currency = trade.network === 'arc' ? 'USDC' : 'SOL';
    const multiplier = getMultiplier(trade.duration || 15);
    const totalPayout = trade.payout ? parseFloat(trade.payout) : (parseFloat(trade.amount) * multiplier);
    const netProfit = trade.payout ? (parseFloat(trade.payout) - parseFloat(trade.amount)) : (totalPayout - parseFloat(trade.amount));
    const profit = isWon ? `+${netProfit.toFixed(4)}` : `-${trade.amount}`;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md bg-black/30">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="relative max-w-sm w-full"
                >
                    {/* The PnL Card (Receipt Style) */}
                    <div
                        ref={cardRef}
                        className="bg-[#f8f8f8] text-[#1a1a1a] p-5 sm:p-8 font-mono shadow-2xl relative overflow-y-auto max-h-[95vh] rounded-sm custom-scrollbar"
                        style={{
                            backgroundImage: 'linear-gradient(#eee 1px, transparent 1px), linear-gradient(90deg, #eee 1px, transparent 1px)',
                            backgroundSize: '18px 18px',
                            minHeight: 'min(580px, 85vh)',
                        }}
                    >
                        {/* Watermark Logo */}
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center opacity-[0.05] pointer-events-none select-none -rotate-12">
                            <img src="/logo.png" alt="watermark" className="w-[110%] h-auto" />
                        </div>

                        {/* Receipt Content */}
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="flex flex-col items-center mb-5">
                                <img src="/logo.png" alt="15market" className="h-14 w-auto mb-2 drop-shadow-sm" />
                                <h1 className="text-2xl font-black tracking-tighter border-y border-black px-4 py-0.5">15MARKET</h1>
                                <p className="text-[8px] font-black mt-1.5 tracking-[0.2em] text-black/50 uppercase">
                                    VERIFIED PREDICTION • {trade.network === 'arc' ? 'ARC_NETWORK' : 'SOLANA_PROTOCOL'}
                                </p>
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 my-1.5" />

                            <div className="w-full py-2 space-y-0.5 text-[10px] font-bold opacity-70">
                                <div className="flex justify-between">
                                    <span className="opacity-40 uppercase">TX_REF:</span>
                                    <span>{trade.tx ? trade.tx.slice(0, 12) + '...' : 'OFF_CHAIN'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-40 uppercase">BLOCK_TIME:</span>
                                    <span>{new Date().toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="w-full border-t border-black/10 my-3" />

                            <div className="w-full space-y-3 py-1">
                                <div className="flex justify-between items-end border-b border-black/5 pb-1.5">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] opacity-40 font-black">ASSET_PAIR</span>
                                        <span className="text-base font-black tracking-tighter">SOL // USDT</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] opacity-40 font-black">EXECUTION</span>
                                        <span className={`font-black uppercase text-sm ${trade.direction === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                                            {trade.direction === 'buy' ? 'CALL_OPTION' : 'PUT_OPTION'}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] opacity-40 font-black">ENTRY</span>
                                        <span className="text-sm font-black italic">${trade.entryPrice}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] opacity-40 font-black">STAKE</span>
                                        <span className="text-sm font-black italic">{trade.amount} {currency}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed border-black/10">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] opacity-40 font-black">SETTLED</span>
                                        <span className="text-sm font-black italic">{trade.settlementPrice ? `$${trade.settlementPrice}` : 'PENDING'}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] opacity-40 font-black">PNL_OUTCOME</span>
                                        <span className={`text-2xl font-black tracking-tighter ${isWon ? 'text-green-600' : 'text-red-500'}`}>
                                            {isWon ? '▲' : '▼'}{profit} <small className="text-[9px] opacity-40">{currency}</small>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 my-4" />

                            {/* Stamp: Scaled down for better fit */}
                            <div className="my-2 transform scale-[0.85] origin-center">
                                <Stamp status={trade.status} isWon={isWon} size="md" />
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 mt-3 mb-4" />

                            {/* FOOTER CONTROLS */}
                            <div className="w-full grid grid-cols-2 gap-3 mb-4 receipt-control">
                                <button
                                    onClick={handleDownload}
                                    className="py-2.5 bg-black text-white text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 hover:bg-black/80 transition-all shadow-md"
                                >
                                    <Download size={14} />
                                    SAVE IMAGE
                                </button>
                                <button
                                    onClick={onClose}
                                    className="py-2.5 bg-transparent text-black border border-black/20 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 hover:bg-black/5 transition-all"
                                >
                                    <X size={14} />
                                    CLOSE VIEW
                                </button>
                            </div>

                            <p className="text-[8px] text-black/30 text-center font-black tracking-[0.2em] leading-relaxed">
                                TRADING_RECEIPT // 15MARKET_PROTOCOL<br />
                                0xDE738...BLOCK_VERIFIED
                            </p>
                        </div>

                        {/* Jagged Bottom Edge */}
                        <div className="absolute bottom-0 left-0 w-full h-4 bg-white" style={{ clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)' }} />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
