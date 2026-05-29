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
    onDeposit,
    onWithdraw,
    transparent = false,
    uiVersion = 'v1',
}) {
    const [isFocused, setIsFocused] = useState(false);
    const isLight = theme === 'light';

    const containerClass = transparent
        ? "flex flex-col h-full gap-1 lg:gap-1.5 overflow-y-auto no-scrollbar"
        : `w-full min-h-0 h-auto lg:h-full p-2 lg:p-2.5 rounded-[32px] glass-panel relative transition-all duration-300 flex flex-col gap-1.5 lg:gap-2 ${isLight ? 'static-panel-light' : ''}`;

    const renderHeader = () => (
        <div className="flex items-center justify-between pointer-events-auto mb-0.5">
            <div className="flex items-center gap-2 lg:gap-2.5">
                <div className="flex items-center gap-1">
                    <h2 className={`text-[9px] lg:text-xs font-black tracking-tighter uppercase ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                        TERMINAL
                    </h2>
                    <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#249C6C', boxShadow: `0 0 10px #249C6C` }} />
                </div>
            </div>

            <div className="flex flex-col items-end opacity-60">
                <span className="text-[6px] lg:text-[7px] font-black uppercase tracking-widest">Market</span>
                <span className={`text-[8px] lg:text-[11px] font-mono font-black ${isLight ? 'text-black' : 'text-[#249C6C]'}`}>
                    ${(Math.floor(Number(price) * 100) / 100).toFixed(2)}
                </span>
            </div>
        </div>
    );

    const renderLongShort = () => (
        <div className={`relative w-full flex items-center p-1 rounded-full border border-[#249C6C]/10 bg-white/5 backdrop-blur-3xl overflow-hidden pointer-events-auto`}>
            {/* Sliding Pill Background - Synchronized with Time Scroller geometry */}
            <motion.div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg transition-all`}
                initial={false}
                animate={{
                    x: direction === "UP" ? 0 : '100%',
                    backgroundColor: direction === "UP" ? '#249C6C' : '#FF4D4D',
                    boxShadow: direction === "UP" ? '0 0 20px rgba(36, 156, 108,0.3)' : '0 0 20px rgba(255,77,77,0.3)'
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />

            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("UP"); }}
                disabled={maintenanceMode}
                className={`flex-1 relative z-10 py-2.5 lg:py-3 flex items-center justify-center transition-all duration-300 rounded-full ${direction === "UP" ? "text-white" : "text-white/20 hover:text-white/40"}`}
            >
                <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest">LONG</span>
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("DOWN"); }}
                disabled={maintenanceMode}
                className={`flex-1 relative z-10 py-2.5 lg:py-3 flex items-center justify-center transition-all duration-300 rounded-full ${direction === "DOWN" ? "text-white" : "text-white/20 hover:text-white/40"}`}
            >
                <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest">SHORT</span>
            </button>
        </div>
    );

    const renderTime = () => (
        <div className="flex flex-col gap-1 pointer-events-auto">
            <div className="flex items-center justify-between px-1">
                <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/60' : 'text-white opacity-30'}`}>Time</span>
                <span className={`text-[9px] md:text-[11px] font-mono font-black ${isLight ? 'text-black' : 'text-[#249C6C]'}`}>
                    {duration === 5 ? '2.90x' : duration === 10 ? '2.40x' : '1.90x'}
                </span>
            </div>

            <div className="relative w-full flex items-center p-0.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-3xl overflow-hidden">
                {/* 3-way Sliding Pill Background */}
                <motion.div
                    className="absolute top-0.5 bottom-0.5 w-[calc(33.33%-2px)] rounded-full bg-[#249C6C]"
                    style={{ boxShadow: isLight ? 'none' : '0 0 15px rgba(36, 156, 108,0.3)' }}
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
                        className={`flex-1 relative z-10 py-2 lg:py-2.5 flex flex-col items-center justify-center transition-all duration-300 ${duration === d ? "text-white scale-110" : (isLight ? "text-black/40 hover:text-black/60" : "text-white/20 hover:text-white/40")}`}
                    >
                        <span className="text-[9px] lg:text-[10px] font-black tracking-tighter leading-none">{d}s</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderAmountBox = () => (
        <div className="flex flex-col gap-0.5 pointer-events-auto">
            <div className="flex items-center justify-between px-1.5 mb-0.5">
                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/70' : 'text-white/40'}`}>Amount</span>
                <span className={`text-[9px] lg:text-[11px] font-black ${isLight ? 'text-black' : 'text-yellow-400'}`}>
                    ${(sessionBalance || 0).toFixed(2)}
                </span>
            </div>
            <div className={`flex flex-col gap-2 py-1 lg:py-1.5 px-3 rounded-[12px] lg:rounded-[16px] border transition-all duration-300 ${isFocused ? (isLight ? 'bg-transparent border-[#249C6C]/20 shadow-none' : 'bg-white/10 border-[#249C6C]/30 shadow-[0_0_20px_rgba(36, 156, 108,0.1)]') : (isLight ? 'bg-transparent border-[#249C6C]/20' : 'bg-white/5 border-white/5')}`}>
                <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] md:text-sm font-black transition-opacity duration-300 ${isFocused ? 'opacity-40 text-[#249C6C]' : 'opacity-20'}`}>$</span>
                    <input
                        type="number"
                        value={amount}
                        onChange={handleAmountChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                        placeholder="0.00"
                        className={`w-full bg-transparent force-transparent-bg text-sm md:text-base font-black outline-none border-none transition-all focus:!ring-0 focus:!shadow-none focus:!border-none focus:!outline-none ${isLight ? 'text-black placeholder:text-black/30' : 'text-white placeholder:text-white/10'}`}
                    />
                </div>
            </div>
        </div>
    );

    const renderAmountSlider = () => (
        <div className="relative pt-2 pb-1 px-2 pointer-events-auto">
            <div className="relative h-1.5">
                <div className={`absolute inset-0 rounded-full ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#249C6C] transition-all duration-150" style={{ width: `${sliderValue || 0}%`, boxShadow: '0 0 10px rgba(36, 156, 108, 0.4)' }} />
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-white shadow-lg border-2 border-[#249C6C] pointer-events-none transition-all duration-150 z-20"
                    style={{ left: `calc(${sliderValue || 0}% - ${(sliderValue || 0) > 50 ? 8 : 6}px)` }}
                />
                <input type="range" min="0" max="100" step="1" value={sliderValue || 0} onChange={handleSliderChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" />
            </div>
        </div>
    );

    const renderConfirm = () => (
        <motion.button
            id="trade-confirm-button"
            onClick={(e) => { e.stopPropagation(); executeTrade(); }}
            disabled={isExecuting || maintenanceMode || tradingHalted}
            className={`w-full py-3 lg:py-3.5 rounded-full font-black text-[10px] lg:text-[11px] uppercase tracking-[0.3em] transition-all pointer-events-auto relative overflow-hidden group hover:brightness-125 active:brightness-95
            ${(isExecuting || maintenanceMode || tradingHalted) ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
            style={{
                background: "#249C6C",
                color: "white",
            }}
        >
            <span className="relative z-10 flex items-center justify-center gap-2">
                {isExecuting && <div className="w-2 h-2 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                {maintenanceMode ? (tradingHalted ? "HALTED" : "PAUSED") : (isExecuting ? "SIGNING..." : (wallet?.connected && sessionBalance > 0) ? "CONFIRM" : (wallet?.connected ? "FUND WALLET" : "CONNECT WALLET"))}
            </span>
        </motion.button>
    );

    return (
        <div className={containerClass} style={{ fontFamily: '"Comfortaa", cursive' }}>
            {renderHeader()}
            {renderLongShort()}
            {renderTime()}
            {renderAmountBox()}
            {renderAmountSlider()}
            <div className="w-full">
                {renderConfirm()}
            </div>
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
