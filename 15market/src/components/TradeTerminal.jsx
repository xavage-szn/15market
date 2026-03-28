import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

function TradeTerminalComponent({
    mode,
    sessionMode,
    setSessionMode,
    price,
    sessionBalance,
    direction,
    setDirection,
    duration,
    setDuration,
    amount,
    handleAmountChange,
    balance,
    handleSliderChange,
    sliderValue = 0,
    executeTrade,
    isExecuting,
    wallet,
    theme,
    maintenanceMode = false,
    tradingHalted = false,
    refillAmount,
    setRefillAmount,
    onRefill,
    onWithdraw,
    transparent = false,
    showManagement,
    setShowManagement,
    uiVersion = 'v1',
}) {
    const [isFocused, setIsFocused] = useState(false);
    const isLight = theme === 'light';

    const containerClass = transparent
        ? "flex flex-col h-full justify-between gap-1 lg:gap-2 overflow-y-auto no-scrollbar"
        : `w-full min-h-0 h-auto lg:h-full p-1.5 md:p-2 lg:p-3 rounded-2xl glass-panel relative transition-all duration-300 flex flex-col gap-1 lg:gap-1.5 lg:gap-2.5 ${isLight ? 'static-panel-light !shadow-xl' : ''}`;

    const renderHeader = () => (
        <div className="flex items-center justify-between pointer-events-auto mb-0.5">
            <div className="flex items-center gap-2 lg:gap-2.5">
                <div className="flex items-center gap-1">
                    <h2 className={`text-[9px] lg:text-xs font-black tracking-tighter uppercase ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                        TERMINAL
                    </h2>
                    <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#3CB371', boxShadow: `0 0 10px #3CB371` }} />
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={(e) => { e.stopPropagation(); setSessionMode(); }}
                        className={`w-5 lg:w-7 h-2.5 lg:h-3.5 rounded-full relative transition-all duration-300 cursor-pointer ${sessionMode ? 'bg-[#3CB371]' : (isLight ? 'bg-[#3CB371]/10' : 'bg-white/10')}`}
                    >
                        <div className={`absolute top-0.5 left-0.5 w-1.5 lg:w-2.5 h-1.5 lg:h-2.5 rounded-full bg-white transition-all duration-300 ${sessionMode ? 'translate-x-2.5 lg:translate-x-3.5' : 'translate-x-0'}`} />
                    </button>
                    <span className={`text-[5px] lg:text-[7px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Auto</span>
                    {sessionMode && uiVersion !== 'v1' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowManagement(!showManagement); }}
                            className={`p-0.5 rounded-md transition-all duration-300 ${isLight ? 'hover:bg-[#3CB371]/5' : 'hover:bg-white/5'} ${showManagement ? 'rotate-180' : ''}`}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col items-end">
                <span className="text-[5px] lg:text-[6px] font-black opacity-30 uppercase tracking-widest">Market</span>
                <span className="text-[7px] lg:text-[10px] font-mono font-black text-[#3CB371]">
                    ${(Math.floor(Number(price) * 100) / 100).toFixed(2)}
                </span>
            </div>
        </div>
    );

    const renderCallPut = () => (
        <div className={`relative flex items-center p-1 rounded-full border border-[#3CB371]/10 bg-white/5 backdrop-blur-3xl overflow-hidden pointer-events-auto`}>
            {/* Sliding Pill Background */}
            <motion.div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-[0_0_15px_rgba(60,179,113,0.3)] transition-all`}
                initial={false}
                animate={{ 
                    x: direction === "UP" ? 4 : 'calc(100% + 4px)',
                    background: direction === "UP" ? 'linear-gradient(to bottom right, #48c97f, #1e5a38)' : 'linear-gradient(to bottom right, #FF7F50, #D2691E)'
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
            
            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("UP"); }}
                disabled={maintenanceMode}
                className={`flex-1 relative z-10 py-1.5 lg:py-2 flex items-center justify-center gap-2 transition-all duration-300 ${direction === "UP" ? "text-white scale-110" : "text-white/20 hover:text-white/40"}`}
            >
                <TrendingUp size={12} className={direction === "UP" ? "text-white" : "text-[#3CB371]/60"} />
                <span className="text-[7px] lg:text-[9px] font-black uppercase tracking-widest">Call</span>
            </button>
            
            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("DOWN"); }}
                disabled={maintenanceMode}
                className={`flex-1 relative z-10 py-1.5 lg:py-2 flex items-center justify-center gap-2 transition-all duration-300 ${direction === "DOWN" ? "text-white scale-110" : "text-white/20 hover:text-white/40"}`}
            >
                <TrendingDown size={12} className={direction === "DOWN" ? "text-white" : "text-[#FF7F50]/60"} />
                <span className="text-[7px] lg:text-[9px] font-black uppercase tracking-widest">Put</span>
            </button>
        </div>
    );

    const renderTime = () => (
        <div className="flex flex-col gap-1 pointer-events-auto">
            <div className="flex items-center justify-between px-1">
                <span className={`text-[6px] md:text-[7px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Time</span>
                <span className="text-[6px] md:text-[7px] font-mono font-bold" style={{ color: '#3CB371' }}>
                    {duration === 5 ? '6.98x' : duration === 10 ? '4.98x' : '1.98x'}
                </span>
            </div>
            
            <div className="relative flex items-center p-0.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-3xl overflow-hidden">
                {/* 3-way Sliding Pill Background */}
                <motion.div
                    className="absolute top-0.5 bottom-0.5 w-[calc(33.33%-2px)] rounded-full bg-[#3CB371] shadow-[0_0_15px_rgba(60,179,113,0.3)] transition-all"
                    initial={false}
                    animate={{ 
                        x: duration === 15 ? 1 : duration === 10 ? 'calc(100% + 1px)' : 'calc(200% + 1px)',
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
                
                {[15, 10, 5].map(d => (
                    <button
                        key={d}
                        onClick={(e) => { e.stopPropagation(); setDuration(d); }}
                        className={`flex-1 relative z-10 py-1.5 flex flex-col items-center justify-center transition-all duration-300 ${duration === d ? "text-white scale-110" : "text-white/20 hover:text-white/40"}`}
                    >
                        <span className="text-[9px] lg:text-xs font-black tracking-tighter leading-none">{d}s</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderStake = () => (
        <div className="flex flex-col gap-0.5 lg:gap-0.5 pointer-events-auto">
            <div className="flex items-center justify-between px-1">
                <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Stake</span>
                <span className={`text-[6px] lg:text-[7px] font-bold ${sessionMode ? (isLight ? 'text-[#3CB371]' : 'text-yellow-400') : 'text-[#3CB371]'}`}>
                    ${(sessionMode ? sessionBalance : balance).toFixed(2)}
                </span>
            </div>
            <div className={`flex flex-col gap-2 p-3 rounded-[32px] border transition-all duration-300 ${isFocused ? (isLight ? 'bg-[#d4e6dc] border-[#3CB371]/30 shadow-lg' : 'bg-white/10 border-[#3CB371]/30 shadow-[0_0_20px_rgba(60,179,113,0.1)]') : (isLight ? 'bg-[#cce0d5] border-[#3CB371]/15' : 'bg-white/5 border-white/5')}`}>
                <div className="flex items-center gap-1 md:gap-1.5 transition-all">
                    <span className={`text-[10px] md:text-sm font-black transition-opacity duration-300 ${isFocused ? 'opacity-40 text-[#3CB371]' : 'opacity-20'}`}>$</span>
                    <input
                        type="number"
                        value={amount}
                        onChange={handleAmountChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                        placeholder="0.00"
                        className={`w-full bg-transparent text-sm md:text-base font-black outline-none transition-all ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'} ${isFocused ? 'tracking-tight translate-x-1' : ''}`}
                    />
                </div>
            </div>
            <div className="relative pt-3 pb-1 px-1">
                <div className="relative h-1.5">
                    <div className={`absolute inset-0 rounded-full ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-[#3CB371] transition-all duration-150" style={{ width: `${sliderValue || 0}%`, boxShadow: '0 0 10px rgba(60, 179, 113, 0.4)' }} />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-white shadow-lg border-2 border-[#3CB371] pointer-events-none transition-all duration-150 z-20"
                        style={{ left: `calc(${sliderValue || 0}% - ${(sliderValue || 0) > 50 ? 8 : 6}px)` }}
                    />
                    <input type="range" min="0" max="100" step="1" value={sliderValue || 0} onChange={handleSliderChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" />
                </div>
            </div>
        </div>
    );

    const renderConfirm = () => (
        <motion.button
            id="trade-confirm-button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); executeTrade(); }}
            disabled={isExecuting || maintenanceMode}
            className={`w-full py-2.5 lg:py-3.5 rounded-full font-black text-[9px] lg:text-[11px] uppercase tracking-[0.3em] transition-all pointer-events-auto relative overflow-hidden group hover:brightness-110
            ${(isExecuting || maintenanceMode) ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
            style={{
                background: maintenanceMode ? "#333" : (direction === "DOWN" ? 'linear-gradient(to right, #FF7F50, #D2691E)' : 'linear-gradient(to right, #3CB371, #2E8B57)'),
                color: "white",
            }}
        >
            <span className="relative z-10 flex items-center justify-center gap-2">
                {isExecuting && <div className="w-2 h-2 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                {maintenanceMode ? (tradingHalted ? "HALTED" : "PAUSED") : (isExecuting ? "SIGNING..." : (wallet?.connected || (sessionMode && sessionBalance > 0)) ? `CONFIRM ${direction || ''}` : "CONNECT WALLET")}
            </span>
        </motion.button>
    );

    return (
        <div className={containerClass}>
            {renderHeader()}

            {sessionMode && showManagement && uiVersion !== 'v1' && (
                <div className={`px-2 py-1.5 lg:px-4 lg:py-2 rounded-[22px] border flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-300 ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className={`text-[5px] lg:text-[7px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Auto Balance</span>
                            <span className="text-[7px] lg:text-xs font-mono font-black text-[#3CB371]">
                                ${Number(sessionBalance).toFixed(2)} USDC
                            </span>
                        </div>
                    </div>

                    <div className={`mt-0.5 flex items-center gap-1 p-1 rounded-full border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/5'}`}>
                        <input
                            type="number"
                            value={refillAmount}
                            onChange={(e) => setRefillAmount(e.target.value)}
                            placeholder="0.00"
                            className={`w-full bg-transparent text-[8px] lg:text-[10px] font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'}`}
                        />
                        <div className={`px-2 py-0.5 rounded-full text-[4px] lg:text-[6px] font-black uppercase tracking-tight ${isLight ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60'}`}>
                            USDC
                        </div>
                    </div>

                    <div className="relative pt-1.5 pb-1 px-1">
                        <div className="relative h-1 lg:h-1.5">
                            <div className={`absolute inset-0 rounded-full ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                            <div
                                className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
                                style={{
                                    width: `${Math.min(100, (parseFloat(refillAmount || 0) / (balance || 1)) * 100)}%`,
                                    background: '#3CB371',
                                    boxShadow: '0 0 10px rgba(60, 179, 113, 0.4)'
                                }}
                            />
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 lg:w-3 lg:h-3 bg-white rounded-full shadow-md border border-gray-200 pointer-events-none transition-all duration-150"
                                style={{ left: `calc(${Math.min(100, (parseFloat(refillAmount || 0) / (balance || 1)) * 100)}% - 4px)` }}
                            />
                            <input
                                type="range" min="0" max="100" step="1"
                                value={Math.min(100, (parseFloat(refillAmount || 0) / (balance || 1)) * 100)}
                                onChange={(e) => balance > 0 && setRefillAmount(((balance * e.target.value) / 100).toFixed(2))}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                        <button
                            onClick={() => onRefill(refillAmount)}
                            disabled={isExecuting}
                            className={`py-1.5 lg:py-2 rounded-full bg-[#3CB371] text-white text-[7px] lg:text-[8px] font-black uppercase tracking-widest hover:brightness-110 transition-all ${isExecuting ? 'opacity-50' : ''}`}
                        >
                            Deposit
                        </button>
                        <button
                            onClick={() => onWithdraw(refillAmount)}
                            disabled={isExecuting}
                            className={`py-1.5 lg:py-2 rounded-full border border-[#3CB371]/30 text-[#3CB371] text-[7px] lg:text-[8px] font-black uppercase tracking-widest hover:bg-[#3CB371]/10 transition-all ${isExecuting ? 'opacity-50' : ''}`}
                        >
                            Withdraw
                        </button>
                    </div>
                </div>
            )}

            {renderCallPut()}
            {renderTime()}
            {renderStake()}
            {renderConfirm()}
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
