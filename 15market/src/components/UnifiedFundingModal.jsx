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
    onSuccess 
}) {
    const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
    const [amount, setAmount] = useState("");
    const [isQuoting, setIsQuoting] = useState(false);
    const [quote, setQuote] = useState(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [showTokenSelector, setShowTokenSelector] = useState(false);
    const [balances, setBalances] = useState({});

    // Fetch Balances for all tokens (Simulated for this demo, in real-world use wagmi/viem)
    useEffect(() => {
        if (!isOpen) return;
        const fetchBalances = async () => {
            // Simulated balances for research demonstration
            setBalances({
                'usdc': 1250.45,
                'mon': 500.0,
                'avax': 12.5,
                'eth': 1.2
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

    const handleFunding = async () => {
        if (!amount || !quote) return;

        setIsConfirming(true);
        notify("Initiating Bridge & Swap...", "pending");

        try {
            // 1. Simulate the Transaction from the Main Wallet
            // In real world: const tx = await sendTransaction({ to: BRIDGE_ADDR, value: amount })
            const mockTxHash = `0x${Math.random().toString(16).slice(2)}...${Math.random().toString(16).slice(-4)}`;
            
            await new Promise(r => setTimeout(r, 2000)); // Simulate chain confirmation

            // 2. Notify Backend to verify and credit
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
                notify(`Successfully funded Trading Wallet with ${quote.estimatedUsdc} USDC!`, "success");
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
                className={`w-full md:max-w-xl relative z-10 rounded-t-[40px] md:rounded-[40px] border-t md:border overflow-hidden ${isLight ? 'bg-white border-black/5 shadow-2xl' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'}`}
            >
                {/* Header Section */}
                <div className={`p-6 border-b flex items-center justify-between ${isLight ? 'bg-black/[0.02] border-black/5' : 'bg-white/[0.02] border-white/5'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#3CB371]/10 flex items-center justify-center">
                            <Zap className="text-[#3CB371]" size={20} />
                        </div>
                        <div>
                            <h3 className={`text-lg font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Unified Funding</h3>
                            <p className="text-[10px] font-bold text-[#3CB371] uppercase tracking-widest">Main Wallet → Trading Wallet</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-black/5 text-black/40' : 'hover:bg-white/5 text-white/40'}`}>
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6 max-h-[80dvh] overflow-y-auto custom-scrollbar">
                    {/* Token Selection & Balance */}
                    <div>
                        <label className={`text-[10px] font-black uppercase tracking-widest block mb-3 ${isLight ? 'text-black/40' : 'text-white/40'}`}>Select Source Asset</label>
                        <div className="grid grid-cols-1 gap-3">
                            <button 
                                onClick={() => setShowTokenSelector(!showTokenSelector)}
                                className={`w-full p-5 rounded-[24px] border-2 flex items-center justify-between transition-all ${showTokenSelector ? 'border-[#3CB371]' : (isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-transparent')}`}
                            >
                                <div className="flex items-center gap-4">
                                    <img src={selectedToken.icon} className="w-8 h-8 rounded-full shadow-lg" alt={selectedToken.symbol} />
                                    <div className="text-left">
                                        <p className={`text-base font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>{selectedToken.name}</p>
                                        <p className="text-[10px] font-bold text-[#3CB371] uppercase">Balance: {balances[selectedToken.id]?.toFixed(2) || '0.00'} {selectedToken.symbol}</p>
                                    </div>
                                </div>
                                <ChevronDown className={`transition-transform duration-300 ${showTokenSelector ? 'rotate-180' : ''}`} />
                            </button>
                            
                            <AnimatePresence>
                                {showTokenSelector && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }} 
                                        animate={{ height: 'auto', opacity: 1 }} 
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden flex flex-col gap-2"
                                    >
                                        {SUPPORTED_TOKENS.map(token => (
                                            <button 
                                                key={token.id}
                                                onClick={() => { setSelectedToken(token); setShowTokenSelector(false); }}
                                                className={`p-4 rounded-2xl flex items-center justify-between transition-all ${selectedToken.id === token.id ? 'bg-[#3CB371]/10 border border-[#3CB371]/30' : (isLight ? 'hover:bg-black/5' : 'hover:bg-white/5')}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <img src={token.icon} className="w-6 h-6 rounded-full" alt={token.symbol} />
                                                    <span className={`text-[11px] font-black uppercase ${selectedToken.id === token.id ? 'text-[#3CB371]' : (isLight ? 'text-black' : 'text-white')}`}>{token.name}</span>
                                                </div>
                                                <span className="text-[10px] font-bold opacity-40">{balances[token.id]?.toFixed(2)}</span>
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Amount to Fund</label>
                            <button 
                                onClick={() => setAmount(balances[selectedToken.id]?.toString())}
                                className="text-[10px] font-black text-[#3CB371] uppercase tracking-widest hover:underline"
                            >
                                Max Available
                            </button>
                        </div>
                        <div className="relative group">
                            <input 
                                type="number" 
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className={`w-full py-6 px-8 rounded-[32px] text-4xl font-black transition-all outline-none border-2 border-transparent focus:border-[#3CB371]/30 ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white'}`}
                            />
                            <div className="absolute right-8 top-1/2 -translate-y-1/2">
                                <span className="text-xl font-black text-[#3CB371]">{selectedToken.symbol}</span>
                            </div>
                        </div>
                    </div>

                    {/* Flow Diagram */}
                    <div className="flex items-center justify-center gap-4 py-4">
                        <div className="flex flex-col items-center gap-2">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isLight ? 'bg-black text-white' : 'bg-white text-black'}`}>
                                <Wallet size={20} />
                            </div>
                            <span className="text-[8px] font-black uppercase opacity-40">Main Wallet</span>
                        </div>
                        <motion.div animate={{ x: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-[#3CB371]">
                            <ArrowRight size={20} />
                        </motion.div>
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-[#3CB371] text-black flex items-center justify-center shadow-lg shadow-[#3CB371]/20">
                                <Zap size={20} />
                            </div>
                            <span className="text-[8px] font-black uppercase text-[#3CB371]">Trading Wallet</span>
                        </div>
                    </div>

                    {/* Quote Results */}
                    <AnimatePresence>
                        {quote && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }} 
                                animate={{ opacity: 1, scale: 1 }}
                                className={`p-6 rounded-3xl border ${isLight ? 'bg-[#3CB371]/5 border-[#3CB371]/20' : 'bg-[#3CB371]/5 border-[#3CB371]/10'}`}
                            >
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Estimated Output</span>
                                        <span className="text-2xl font-black text-[#3CB371]">{quote.estimatedUsdc} USDC</span>
                                    </div>
                                    
                                    <div className="h-[1px] bg-[#3CB371]/10 w-full" />
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Exchange Rate</p>
                                            <p className={`text-xs font-bold ${isLight ? 'text-black' : 'text-white'}`}>1 {selectedToken.symbol} ≈ {quote.rate.toFixed(2)} USDC</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Total Fees (incl. Spread)</p>
                                            <p className="text-xs font-bold text-orange-500">{(parseFloat(quote.fee) + parseFloat(quote.spread)).toFixed(2)} USDC</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#3CB371]/10">
                                        <ShieldCheck size={12} className="text-[#3CB371]" />
                                        <p className="text-[8px] font-bold uppercase tracking-wide opacity-40">Exchange spread applied for high-speed automated settlement.</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Action Button */}
                    <button 
                        onClick={handleFunding}
                        disabled={!quote || isConfirming}
                        className={`w-full py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-xl ${(!quote || isConfirming) ? 'bg-white/10 text-white/20 cursor-not-allowed' : 'bg-[#3CB371] text-black hover:scale-[1.02] active:scale-[0.98] shadow-[#3CB371]/20'}`}
                    >
                        {isConfirming ? (
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCw className="animate-spin" size={18} />
                                Processing Bridge...
                            </div>
                        ) : quote ? `Fund ${quote.estimatedUsdc} USDC` : 'Enter Amount'}
                    </button>

                    {/* Warning Footer */}
                    <div className={`p-4 rounded-2xl border border-dashed flex gap-3 ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                        <Info size={16} className="text-[#3CB371] shrink-0" />
                        <p className="text-[9px] font-bold uppercase leading-relaxed opacity-40">
                            By funding your Trading Wallet, you authorize the platform to swap your deposited assets to USDC. Assets are settled on the Arc Network for zero-latency trading.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
