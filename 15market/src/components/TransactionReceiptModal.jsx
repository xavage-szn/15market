import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, ExternalLink } from 'lucide-react';

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
                        className="bg-[#f8f8f8] text-[#1a1a1a] p-5 sm:p-8 font-mono shadow-2xl relative overflow-y-auto max-h-[95vh] rounded-sm custom-scrollbar"
                        style={{
                            backgroundImage: 'linear-gradient(#eee 1px, transparent 1px), linear-gradient(90deg, #eee 1px, transparent 1px)',
                            backgroundSize: '18px 18px',
                            minHeight: 'min(480px, 85vh)',
                        }}
                    >
                        <div
                            className="absolute inset-0 pointer-events-none select-none overflow-hidden"
                            style={{
                                backgroundImage: `url('/logo.png')`,
                                backgroundSize: '40px 40px',
                                backgroundRepeat: 'repeat',
                                opacity: 0.2,
                                transform: 'rotate(-20deg) scale(2)',
                                mixBlendMode: 'multiply',
                                filter: 'grayscale(100%) brightness(0.9)'
                            }}
                        />

                        <div className="relative z-10 flex flex-col items-center">
                            <div className="flex flex-col items-center mb-5">
                                <img src="/logo.png" alt="15market" className="h-20 w-auto mb-2 drop-shadow-sm" />
                                <h1 className="text-2xl font-black tracking-tighter border-y border-black px-4 py-0.5">15MARKET</h1>
                                <p className="text-[8px] font-black mt-1.5 tracking-[0.2em] text-black/50 uppercase">
                                    TRANSACTION RECEIPT • ARC_NETWORK
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
                            </div>

                            <div className="w-full border-t border-black/10 my-3" />

                            <div className="w-full space-y-3 py-1">
                                <div className="flex justify-between items-end border-b border-black/5 pb-1.5">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] opacity-40 font-black">TRANSACTION_TYPE</span>
                                        <span className={`text-base font-black tracking-tighter ${isDeposit ? 'text-green-600' : 'text-orange-600'}`}>
                                            {transaction.type}
                                        </span>
                                    </div>
                                    {transaction.type === 'TRADE' && (
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] opacity-40 font-black">ASSET_PAIR</span>
                                            <span className="text-base font-black tracking-tighter">
                                                {transaction.symbol ? `${transaction.symbol.toUpperCase()} // USD` : 'ETH // USD'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] opacity-40 font-black">AMOUNT</span>
                                        <span className="font-black text-lg">
                                            {isDeposit ? '+' : '-'}{Number(transaction.amount).toFixed(2)} {transaction.currency || (transaction.network === 'sol' || transaction.network === 'SOL' ? 'SOL' : 'USDC')}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-4 bg-black/5 rounded-lg border border-black/10">
                                    <p className="text-center text-sm font-black italic text-black/70">
                                        "{message}"
                                    </p>
                                </div>
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 my-4" />

                            {transaction.tx && (
                                <a
                                    href={`https://testnet.arcscan.app/tx/${transaction.tx}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full mb-4 py-3 bg-black/10 hover:bg-black/20 text-black border border-black/20 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    <ExternalLink size={14} />
                                    VIEW ON ARCSCAN
                                </a>
                            )}

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
