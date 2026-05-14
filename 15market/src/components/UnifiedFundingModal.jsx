import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ArrowRight, Zap, Wallet, Info, RefreshCw, Check, ArrowDownLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { SUPPORTED_TOKENS } from '../tokens';
import { KEEPER_URL_ARC } from '../constants';

export function UnifiedFundingModal({ 
    isOpen, 
    onClose, 
    isLight, 
    notify, 
    address, 
    sessionAddress, 
    onSuccess,
    initialToken
}) {
    const [selectedToken, setSelectedToken] = useState(initialToken || SUPPORTED_TOKENS[0]);
    const [amount, setAmount] = useState("");
    const [isQuoting, setIsQuoting] = useState(false);
    const [quote, setQuote] = useState(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [balances, setBalances] = useState({});

    // Keep state in sync with initialToken prop
    useEffect(() => {
        if (initialToken) setSelectedToken(initialToken);
    }, [initialToken]);

    // Fetch Balances
    useEffect(() => {
        if (!isOpen) return;
        const fetchBalances = async () => {
            // Simulated balances for research demonstration
            setBalances({
                'usdc': 1250.45,
                'mon': 500.0,
                'avax': 12.5,
                'eth': 1.2,
                'sol': 45.8
            });
        };
        fetchBalances();
    }, [isOpen]);

    // Fetch Quote when amount or token changes
    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0) {
            setQuote(null);
            return;
        }

        const fetchQuote = async () => {
            setIsQuoting(true);
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/fund/quote?fromToken=${selectedToken.symbol}&amount=${amount}`);
                const data = await res.json();
                if (data.success) {
                    setQuote(data);
                }
            } catch (err) {
                console.error("Quote error:", err);
            } finally {
                setIsQuoting(false);
            }
        };

        const timer = setTimeout(fetchQuote, 500);
        return () => clearTimeout(timer);
    }, [amount, selectedToken]);

    const handleSwipeToken = (direction) => {
        const currentIndex = SUPPORTED_TOKENS.findIndex(t => t.id === selectedToken.id);
        if (direction === 'left' && currentIndex < SUPPORTED_TOKENS.length - 1) {
            setSelectedToken(SUPPORTED_TOKENS[currentIndex + 1]);
        } else if (direction === 'right' && currentIndex > 0) {
            setSelectedToken(SUPPORTED_TOKENS[currentIndex - 1]);
        }
    };

    const handleFunding = async () => {
        if (!amount || !quote) return;

        setIsConfirming(true);
        notify("Confirming Deposit...", "pending");

        try {
            // In real app, we would use ethers/viem to send the transaction:
            // const tx = await wallets[0].sendTransaction({ ... })
            
            const mockTxHash = `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(-4)}`;
            
            await new Promise(r => setTimeout(r, 2000)); // Simulate chain interaction

            // Notify Backend
            const res = await fetch(`${KEEPER_URL_ARC}/fund/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address,
                    amount,
                    fromToken: selectedToken.symbol,
                    txHash: mockTxHash
                })
            });

            const data = await res.json();
            if (data.success) {
                notify(`Success! ${quote.estimatedUsdc} USDC added to Trading Wallet`, "success");
                if (onSuccess) onSuccess();
                onClose();
            } else {
                throw new Error(data.error || "Funding failed");
            }
        } catch (err) {
            notify(err.message, "error");
        } finally {
            setIsConfirming(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={onClose} 
                className="absolute inset-0 bg-black/90 backdrop-blur-md" 
            />
            
            <motion.div 
                initial={{ opacity: 0, y: 100 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 100 }}
                className={`w-full md:max-w-xl relative z-10 rounded-t-[40px] md:rounded-[40px] border-t md:border overflow-hidden flex flex-col ${isLight ? 'bg-[#f0f9f4] border-black/5 shadow-2xl' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'}`}
            >
                {/* Header Section */}
                <div className={`p-6 border-b flex items-center justify-between shrink-0 ${isLight ? 'bg-white/40 border-black/5' : 'bg-white/[0.02] border-white/5'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#3CB371]/10 flex items-center justify-center">
                            <Zap className="text-[#3CB371]" size={20} />
                        </div>
                        <div>
                            <h3 className={`text-lg font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Quick Fund</h3>
                            <p className="text-[10px] font-bold text-[#3CB371] uppercase tracking-widest">Main → Trading Vault</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-black/5 text-black/40' : 'hover:bg-white/5 text-white/40'}`}>
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6 max-h-[85dvh] overflow-y-auto custom-scrollbar">
                    
                    {/* Swipeable Token Selector */}
                    <div className={`p-8 rounded-[40px] border relative overflow-hidden flex flex-col items-center justify-center gap-4 ${isLight ? 'bg-white border-black/5 shadow-xl' : 'bg-[#111] border-white/5 shadow-2xl'}`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#3CB371]/5 blur-[60px] rounded-full" />
                        
                        <div className="flex items-center justify-between w-full mb-2">
                            <p className={`text-[10px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Select Funding Asset</p>
                            <div className="flex gap-1">
                                {SUPPORTED_TOKENS.map(t => (
                                    <div key={t.id} className={`w-1 h-1 rounded-full transition-all ${selectedToken.id === t.id ? 'w-3 bg-[#3CB371]' : 'bg-white/10'}`} />
                                ))}
                            </div>
                        </div>

                        <div className="relative h-[100px] w-full flex items-center justify-center">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={selectedToken.id}
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    onDragEnd={(e, info) => {
                                        if (info.offset.x < -50) handleSwipeToken('left');
                                        else if (info.offset.x > 50) handleSwipeToken('right');
                                    }}
                                    initial={{ opacity: 0, scale: 0.8, x: 50 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.8, x: -50 }}
                                    className="absolute inset-0 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
                                >
                                    <div className="flex items-center justify-center mb-4">
                                        <img 
                                            src={selectedToken.icon} 
                                            className="w-20 h-20 object-contain drop-shadow-[0_0_30px_rgba(60,179,113,0.3)]" 
                                            style={{ filter: isLight ? 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' : 'none' }}
                                            alt={selectedToken.symbol} 
                                        />
                                    </div>
                                    <p className={`text-xl font-black tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>{selectedToken.symbol}</p>
                                    <p className="text-[10px] font-bold text-[#3CB371] uppercase tracking-[0.2em]">{balances[selectedToken.id]?.toFixed(2) || '0.00'} Available</p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-2">
                            <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Funding Amount</label>
                            <button onClick={() => setAmount(balances[selectedToken.id]?.toString())} className="text-[10px] font-black text-[#3CB371] uppercase hover:underline">Use Max</button>
                        </div>
                        <div className="relative group">
                            <input 
                                type="number" 
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className={`w-full py-6 px-8 rounded-[32px] text-4xl font-black transition-all outline-none border-2 border-transparent focus:border-[#3CB371]/30 ${isLight ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white shadow-2xl'}`}
                            />
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                <span className="text-xl font-black text-[#3CB371]">{selectedToken.symbol}</span>
                            </div>
                        </div>
                    </div>

                    {/* Quote & Results */}
                    <AnimatePresence>
                        {quote ? (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-[32px] border ${isLight ? 'bg-white border-black/5 shadow-md' : 'bg-[#151515] border-white/5'} flex flex-col gap-4`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Estimated Deposit</p>
                                        <p className="text-2xl font-black text-[#3CB371]">{quote.estimatedUsdc} USDC</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Net Fees</p>
                                        <p className="text-xs font-bold text-orange-500">{(parseFloat(quote.fee) + parseFloat(quote.spread)).toFixed(2)} USDC</p>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-white/5 w-full" />
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-[#3CB371]" />
                                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-40">Automated settlement on Arc Mainnet Node.</p>
                                </div>
                            </motion.div>
                        ) : (
                            <div className={`p-6 rounded-[32px] border border-dashed flex items-center gap-4 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                                <Info size={18} className="text-[#3CB371] shrink-0" />
                                <p className="text-[9px] font-bold uppercase leading-relaxed opacity-40">
                                    Funding your Trading Wallet converts any asset to USDC instantly for high-speed trade execution.
                                </p>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Action Button */}
                    <button 
                        onClick={handleFunding}
                        disabled={!quote || isConfirming}
                        className={`w-full py-6 rounded-[28px] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-xl ${(!quote || isConfirming) ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-[#3CB371] text-black hover:scale-[1.02] active:scale-[0.98] shadow-[#3CB371]/20'}`}
                    >
                        {isConfirming ? (
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCw className="animate-spin" size={18} />
                                Bridging Assets...
                            </div>
                        ) : quote ? `Fund ${quote.estimatedUsdc} USDC` : 'Enter Amount'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
