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
    onRefill,
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
                </div>
            </div>

            <div className="flex flex-col items-end opacity-60">
                <span className="text-[6px] lg:text-[7px] font-black uppercase tracking-widest">Market</span>
                <span className="text-[7px] lg:text-[10px] font-mono font-black text-[#3CB371]">
                    ${(Math.floor(Number(price) * 100) / 100).toFixed(2)}
                </span>
            </div>
        </div>
    );

    const renderCallPut = () => (
        <div className={`relative flex items-center p-1 rounded-full border border-[#3CB371]/10 bg-white/5 backdrop-blur-3xl overflow-hidden pointer-events-auto`}>
            {/* Sliding Pill Background - Synchronized with Time Scroller geometry */}
            <motion.div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg transition-all`}
                initial={false}
                animate={{
                    x: direction === "UP" ? 0 : '100%',
                    backgroundColor: direction === "UP" ? '#3CB371' : '#FF4D4D',
                    boxShadow: direction === "UP" ? '0 0 20px rgba(60,179,113,0.3)' : '0 0 20px rgba(255,77,77,0.3)'
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />

            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("UP"); }}
                disabled={maintenanceMode}
                className={`flex-1 relative z-10 py-2.5 lg:py-3 flex items-center justify-center transition-all duration-300 rounded-full ${direction === "UP" ? "text-white" : "text-white/20 hover:text-white/40"}`}
            >
                <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest">CALL</span>
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("DOWN"); }}
                disabled={maintenanceMode}
                className={`flex-1 relative z-10 py-2.5 lg:py-3 flex items-center justify-center transition-all duration-300 rounded-full ${direction === "DOWN" ? "text-white" : "text-white/20 hover:text-white/40"}`}
            >
                <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest">PUT</span>
            </button>
        </div>
    );

    const renderTime = () => (
        <div className="flex flex-col gap-1 pointer-events-auto">
            <div className="flex items-center justify-between px-1">
                <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/60' : 'text-white opacity-30'}`}>Time</span>
                <span className="text-[6px] md:text-[7px] font-mono font-bold" style={{ color: '#3CB371' }}>
                    {duration === 5 ? '2.90x' : duration === 10 ? '2.40x' : '1.90x'}
                </span>
            </div>

            <div className="relative flex items-center p-0.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-3xl overflow-hidden">
                {/* 3-way Sliding Pill Background */}
                <motion.div
                    className="absolute top-0.5 bottom-0.5 w-[calc(33.33%-2px)] rounded-full bg-[#3CB371]"
                    style={{ boxShadow: isLight ? 'none' : '0 0 15px rgba(60,179,113,0.3)' }}
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
                <span className={`text-[6px] lg:text-[7px] font-bold ${sessionMode ? (isLight ? 'text-[#3CB371]' : 'text-yellow-400') : 'text-[#3CB371]'}`}>
                    ${(sessionMode ? sessionBalance : balance).toFixed(2)}
                </span>
            </div>
            <div className={`flex flex-col gap-2 py-1 lg:py-1.5 px-3 rounded-[12px] lg:rounded-[16px] border transition-all duration-300 ${isFocused ? (isLight ? 'bg-transparent border-[#3CB371]/20 shadow-none' : 'bg-white/10 border-[#3CB371]/30 shadow-[0_0_20px_rgba(60,179,113,0.1)]') : (isLight ? 'bg-transparent border-[#3CB371]/20' : 'bg-white/5 border-white/5')}`}>
                <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] md:text-sm font-black transition-opacity duration-300 ${isFocused ? 'opacity-40 text-[#3CB371]' : 'opacity-20'}`}>$</span>
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
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#3CB371] transition-all duration-150" style={{ width: `${sliderValue || 0}%`, boxShadow: '0 0 10px rgba(60, 179, 113, 0.4)' }} />
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-white shadow-lg border-2 border-[#3CB371] pointer-events-none transition-all duration-150 z-20"
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
                background: "#3CB371",
                color: "white",
            }}
        >
            <span className="relative z-10 flex items-center justify-center gap-2">
                {isExecuting && <div className="w-2 h-2 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                {maintenanceMode ? (tradingHalted ? "HALTED" : "PAUSED") : (isExecuting ? "SIGNING..." : (wallet?.connected || (sessionMode && sessionBalance > 0)) ? "CONFIRM" : "CONNECT WALLET")}
            </span>
        </motion.button>
    );

    return (
        <div className={containerClass}>
            {renderHeader()}
            {renderCallPut()}
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
