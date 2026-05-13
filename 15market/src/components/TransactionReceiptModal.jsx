import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, ExternalLink } from 'lucide-react';
import { Stamp } from './Stamp';

export function TransactionReceiptModal({ isOpen, onClose, transaction }) {
    const cardRef = useRef(null);

    if (!transaction || !isOpen) return null;

    const handleDownload = async () => {
        if (cardRef.current === null) return;
        try {
            const buttons = cardRef.current.querySelectorAll('.receipt-control');
            buttons.forEach(b => b.style.opacity = '0');

            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                quality: 1,
                backgroundColor: '#f8f8f8'
            });

            buttons.forEach(b => b.style.opacity = '1');

            const link = document.createElement('a');
            link.download = `15market-${transaction.type}-${transaction.timestamp}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to download image:', err);
        }
    };

    const isDeposit = transaction.type === 'DEPOSIT';
    const message = isDeposit
        ? "Good luck with your trades! 🍀"
        : "Thank you for trading on 15Market! 🎯";

    return (
        <AnimatePresence>
            <div
                onClick={onClose}
                className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md bg-black/30 cursor-pointer"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative max-w-sm w-full cursor-default"
                >
                    <div
                        ref={cardRef}
                        className="bg-white text-[#1a1a1a] p-5 sm:p-8 font-mono shadow-2xl relative overflow-hidden custom-scrollbar"
                        style={{
                            minHeight: 'min(520px, 90vh)',
                            clipPath: 'polygon(0% 0%, 30% 0%, 35% 5%, 65% 5%, 70% 0%, 100% 0%, 100% 97%, 98.5% 100%, 97% 97%, 95.5% 100%, 94% 97%, 92.5% 100%, 91% 97%, 89.5% 100%, 88% 97%, 86.5% 100%, 85% 97%, 83.5% 100%, 82% 97%, 80.5% 100%, 79% 97%, 77.5% 100%, 76% 97%, 74.5% 100%, 73% 97%, 71.5% 100%, 70% 97%, 68.5% 100%, 67% 97%, 65.5% 100%, 64% 97%, 62.5% 100%, 61% 97%, 59.5% 100%, 58% 97%, 56.5% 100%, 55% 97%, 53.5% 100%, 52% 97%, 50.5% 100%, 49% 97%, 47.5% 100%, 46% 97%, 44.5% 100%, 43% 97%, 41.5% 100%, 40% 97%, 38.5% 100%, 37% 97%, 35.5% 100%, 34% 97%, 32.5% 100%, 31% 97%, 29.5% 100%, 28% 97%, 26.5% 100%, 25% 97%, 23.5% 100%, 22% 97%, 20.5% 100%, 19% 97%, 17.5% 100%, 16% 97%, 14.5% 100%, 13% 97%, 11.5% 100%, 10% 97%, 8.5% 100%, 7% 97%, 5.5% 100%, 4% 97%, 2.5% 100%, 1% 97%, 0% 100%)',
                            border: '2px solid #3CB371',
                        }}
                    >
                        {/* Green Border Simulation (since clip-path clips actual borders) */}
                        <div className="absolute inset-0 pointer-events-none" style={{ border: '4px solid #3CB371', opacity: 0.8, clipPath: 'inherit' }} />

                        <div
                            className="absolute inset-0 pointer-events-none select-none overflow-hidden"
                            style={{
                                backgroundImage: `url(${theme === 'light' ? '/goblogo.png' : '/gowlogo.png'})`,
                                backgroundSize: '40%',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                                opacity: 0.05,
                                filter: 'grayscale(1) brightness(0.5)'
                            }}
                        />

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="flex flex-col items-center mb-5">
                                <img src={theme === 'light' ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="h-20 w-auto mb-2 drop-shadow-sm" />
                                <h1 className="text-2xl font-black tracking-tighter border-y border-black px-4 py-0.5">{transaction.type === 'rounds' ? 'ROUNDS ENTRY' : '15MARKET'}</h1>
                                <p className="text-[8px] font-black mt-1.5 tracking-[0.2em] text-black/50 uppercase">
                                    {transaction.type === 'rounds' ? 'P2P POOLED ENTRY' : 'TRANSACTION RECEIPT'} • ARC_NETWORK
                                </p>
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 my-1.5" />

                            <div className="w-full py-2 space-y-0.5 text-[10px] font-bold opacity-70">
                                <div className="flex justify-between">
                                    <span className="opacity-40 uppercase">TX_REF:</span>
                                    <span>{transaction.tx ? `${transaction.tx.slice(0, 8)}...${transaction.tx.slice(-6)}` : 'PENDING'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-40 uppercase">TIMESTAMP:</span>
                                    <span>{new Date(transaction.timestamp).toLocaleString()}</span>
                                </div>
                                {transaction.type === 'rounds' && (
                                    <div className="flex justify-between">
                                        <span className="opacity-40 uppercase">POOL_ID:</span>
                                        <span>#{transaction.poolId || 'N/A'}</span>
                                    </div>
                                )}
                            </div>

                            <div className="w-full border-t border-black/10 my-3" />

                            <div className="w-full space-y-3 py-1">
                                <div className="flex justify-between items-end border-b border-black/5 pb-1.5">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] opacity-40 font-black tracking-tighter uppercase">{transaction.type === 'rounds' ? 'P2P_ROUND_TYPE' : 'TRANSACTION_TYPE'}</span>
                                        <span className={`text-base font-black tracking-tighter ${transaction.type === 'rounds' ? 'text-[#3CB371]' : (isDeposit ? 'text-[#3CB371]' : 'text-orange-600')}`}>
                                            {transaction.type === 'rounds' ? 'LIVE_ROUNDS_ENTRY' : transaction.type}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] opacity-40 font-black tracking-tighter uppercase">{transaction.type === 'rounds' ? 'ACTIVE_POOL' : 'ASSET_PAIR'}</span>
                                        <span className="text-base font-black tracking-tighter">
                                            {transaction.symbol ? `${transaction.symbol.toUpperCase()} // USD` : 'ETH // USD'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] opacity-40 font-black tracking-tighter uppercase">AMOUNT</span>
                                        <span className="font-black text-lg">
                                            {isDeposit ? '+' : '-'}{Number(transaction.amount || 0).toFixed(2)} {transaction.currency || 'USDC'}
                                        </span>
                                    </div>
                                </div>

                                {transaction.type !== 'DEPOSIT' && transaction.type !== 'CASHOUT' && (
                                    <div className="flex justify-between px-1 py-1 border-b border-black/5 relative">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] opacity-40 font-black tracking-tighter uppercase">STAKE_PRICE</span>
                                            <span className="text-xs font-black">${Number(transaction.entryPrice || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[8px] opacity-40 font-black tracking-tighter uppercase">EXIT_PRICE</span>
                                            <span className="text-xs font-black">${Number(transaction.exitPrice || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[8px] opacity-40 font-black tracking-tighter uppercase">DIRECTION</span>
                                            <span className={`text-xs font-black ${transaction.direction === 'UP' || transaction.direction === 1 || String(transaction.direction) === '1' ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                                {transaction.direction === 'UP' || transaction.direction === 1 || String(transaction.direction) === '1' ? 'LONG' : 'SHORT'}
                                            </span>
                                        </div>

                                        {/* STATUS STAMP OVERLAY */}
                                        {(transaction.status === 'WON' || transaction.status === 'LOST') && (
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[20] pointer-events-none opacity-80">
                                                <Stamp status={transaction.status} size="lg" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="p-4 bg-black/5 rounded-lg border border-black/10">
                                    <p className="text-center text-[11px] font-black italic text-black/70">
                                        "{transaction.type === 'rounds' ? 'Predict the outcome, claim the pool! 🏁' : message}"
                                    </p>
                                </div>
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 my-4" />

                            {transaction.tx ? (
                                <a
                                    href={`https://testnet.arcscan.app/tx/${transaction.tx}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full mb-4 py-3 bg-black/10 hover:bg-black/20 text-black border border-black/20 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    <ExternalLink size={14} />
                                    VIEW ON ARCSCAN
                                </a>
                            ) : transaction.type === 'rounds' ? (
                                <div className="w-full mb-4 py-3 bg-black/5 text-black/30 border border-black/10 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2">
                                    <Lock size={12} />
                                    P2P_LOCAL_AUTH_ONLY
                                </div>
                            ) : null}

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
                                TRANSACTION_RECEIPT // 15MARKET_PROTOCOL<br />
                                AUTO_SIGNER_BALANCE_MOVEMENT
                            </p>
                        </div>

                        <div className="absolute bottom-0 left-0 w-full h-4 bg-white" style={{ clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)' }} />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
