import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

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
    activeMarket,
    liveOdds,
}) {
    const [isFocused, setIsFocused] = useState(false);
    const isLight = theme === 'light';
    const { login } = usePrivy();

    const symbol = activeMarket?.symbol?.toLowerCase() || 'eth';
    const currentOdds = liveOdds?.[symbol]?.[duration] || { LONG: 0.50, SHORT: 0.50 };
    
    // Calculate Payout
    const stakeAmt = parseFloat(amount) || 0;
    const selectedPrice = direction === "UP" ? currentOdds.LONG : currentOdds.SHORT;
    const estimatedShares = selectedPrice > 0 ? (stakeAmt / selectedPrice) : 0;
    const potentialPayout = estimatedShares; // because each share pays $1.00

    const containerClass = transparent
        ? "flex flex-col h-full gap-1 lg:gap-1 overflow-x-hidden"
        : `w-full min-h-0 h-auto lg:h-full p-2 lg:p-2.5 pb-3 lg:pb-4 rounded-[32px] glass-panel relative transition-all duration-300 flex flex-col gap-1.5 lg:gap-2 !overflow-visible !z-50 ${isLight ? 'static-panel-light' : ''}`;

    const renderHeader = () => (
        <div className="flex items-center justify-between pointer-events-auto mt-[3.5%]">
            <div className="flex items-center gap-2 lg:gap-2.5 pl-1">
                <div className="flex items-center gap-1">
                    <h2 className={`text-[9px] lg:text-xs font-black tracking-tighter uppercase ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                        TERMINAL
                    </h2>
                    <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#249C6C', boxShadow: `0 0 10px #249C6C` }} />
                </div>
            </div>

            <div className="flex items-center pr-1.5">
                <span className={`text-[9px] lg:text-xs font-mono font-black ${isLight ? 'text-black' : 'text-[#249C6C]'}`}>
                    ${(Math.floor(Number(price) * 100) / 100).toFixed(2)}
                </span>
            </div>
        </div>
    );

    const renderTime = () => (
        <div className="flex flex-col gap-1 pointer-events-auto shrink-0">
            <div className="flex items-center justify-between px-1">
                <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/60' : 'text-white opacity-30'}`}>Time</span>
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
                        className={`flex-1 relative z-10 py-1.5 lg:py-2 flex flex-col items-center justify-center transition-all duration-300 ${duration === d ? "text-white scale-110" : (isLight ? "text-black/40 hover:text-black/60" : "text-white/20 hover:text-white/40")}`}
                    >
                        <span className="text-[9px] lg:text-[10px] font-black tracking-tighter leading-none">{d}s</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderAmountBox = () => (
        <div className="flex flex-col gap-0.5 pointer-events-auto shrink-0">
            <div className="flex items-center justify-between px-1.5">
                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/70' : 'text-white/40'}`}>Amount</span>
                <span className={`text-[9px] lg:text-[11px] font-black ${isLight ? 'text-black' : 'text-yellow-400'}`}>
                    ${(sessionBalance || 0).toFixed(2)}
                </span>
            </div>
            <div className={`flex flex-col gap-1.5 py-0.5 lg:py-1 px-3 rounded-[12px] lg:rounded-[16px] border transition-all duration-300 ${isFocused ? (isLight ? 'bg-transparent border-[#249C6C]/20 shadow-none' : 'bg-white/10 border-[#249C6C]/30 shadow-[0_0_20px_rgba(36, 156, 108,0.1)]') : (isLight ? 'bg-transparent border-[#249C6C]/20' : 'bg-white/5 border-white/5')}`}>
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
            
            <div className="flex items-center justify-between px-1.5 mt-0.5">
                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/70' : 'text-white/40'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>Payout</span>
                <span className={`text-[9px] lg:text-[11px] font-black text-[#249C6C]`} style={{ fontFamily: '"Comfortaa", cursive' }}>
                    ${potentialPayout.toFixed(2)}
                </span>
            </div>
        </div>
    );

    const renderAmountSlider = () => (
        <div className="relative pt-1.5 pb-0.5 px-2 pointer-events-auto shrink-0">
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

    const handleAction = (dir) => {
        if (maintenanceMode || tradingHalted) return;
        if (!wallet?.connected) { login(); return; }
        setDirection(dir);
        executeTrade({ direction: dir });
    };

    const renderExecuteButtons = () => (
        <div className="flex w-[85%] mx-auto gap-2 pointer-events-auto shrink-0 mt-1">
            <button
                onClick={(e) => { e.stopPropagation(); handleAction("UP"); }}
                disabled={isExecuting || maintenanceMode || tradingHalted}
                className={`flex-1 flex flex-row items-center justify-center gap-1.5 py-2 lg:py-2.5 rounded-[16px] transition-all relative overflow-hidden group hover:brightness-110 active:brightness-95 ${isExecuting || maintenanceMode || tradingHalted ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ background: '#249C6C', color: 'white' }}
            >
                {isExecuting && direction === "UP" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                    <>
                        <span className="text-[12px] lg:text-[14px] font-black uppercase tracking-widest leading-none" style={{ fontFamily: '"Comfortaa", cursive' }}>YES</span>
                        <span className="text-[10px] lg:text-[12px] font-black opacity-80 leading-none" style={{ fontFamily: '"Comfortaa", cursive' }}>{Math.round(currentOdds.LONG * 100)}¢</span>
                    </>
                )}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); handleAction("DOWN"); }}
                disabled={isExecuting || maintenanceMode || tradingHalted}
                className={`flex-1 flex flex-row items-center justify-center gap-1.5 py-2 lg:py-2.5 rounded-[16px] transition-all relative overflow-hidden group hover:brightness-110 active:brightness-95 ${isExecuting || maintenanceMode || tradingHalted ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ background: '#FF4D4D', color: 'white' }}
            >
                {isExecuting && direction === "DOWN" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                    <>
                        <span className="text-[12px] lg:text-[14px] font-black uppercase tracking-widest leading-none" style={{ fontFamily: '"Comfortaa", cursive' }}>NO</span>
                        <span className="text-[10px] lg:text-[12px] font-black opacity-80 leading-none" style={{ fontFamily: '"Comfortaa", cursive' }}>{Math.round(currentOdds.SHORT * 100)}¢</span>
                    </>
                )}
            </button>
        </div>
    );

    return (
        <div className={containerClass} style={{ fontFamily: '"Comfortaa", cursive' }}>
            {renderHeader()}
            {renderTime()}
            {renderAmountBox()}
            {renderAmountSlider()}
            {renderExecuteButtons()}
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
