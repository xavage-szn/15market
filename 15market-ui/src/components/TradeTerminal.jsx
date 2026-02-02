import React, { memo } from 'react';
import { Zap } from 'lucide-react';

const TradeTerminalComponent = ({
    activeTrade,
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
    sliderValue,
    handleSliderChange,
    executeTrade,
    minStake,
    timerActive,
    isExecuting,
    wallet,
    refillAmount,
    setRefillAmount,
    onRefill,
    onWithdraw,
    CORAL,
    GREEN,
    currentNetwork,
    chainId,
    switchChain,
    evmSessionWallet,
    sessionKeypair,
    theme,
    hasProfile,
    activeMarket
}) => {
    const isArc = currentNetwork === 'arc';
    const isWrongNetwork = isArc && chainId !== 5042002;
    const isLight = theme === 'light';

    return (
        <div className={`w-full h-full p-2 lg:p-5 rounded-2xl glass-panel relative transition-all duration-300 flex flex-col gap-2 lg:gap-4 ${isLight ? 'static-panel-light !shadow-xl' : ''}`}>

            {/* Header: Title + Engine Status + Right Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 lg:gap-6">
                    <div className="flex items-center gap-1">
                        <h2 className={`text-[10px] lg:text-lg font-black tracking-tighter uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                            TERMINAL
                        </h2>
                        <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: GREEN, boxShadow: `0 0-10px ${GREEN}` }} />
                    </div>

                    {/* Auto Sign Toggle - Now on the same line as Terminal */}
                    <div className="flex items-center gap-1 lg:gap-2">
                        <span className={`text-[5px] lg:text-[7px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Auto</span>
                        <button
                            onClick={() => setSessionMode(!sessionMode)}
                            className={`w-5 border lg:w-8 h-2.5 lg:h-4 rounded-full relative transition-all duration-300 ${sessionMode ? 'bg-[#3CB371] border-transparent' : (isLight ? 'bg-black/10 border-black/10' : 'bg-white/10 border-white/10')}`}
                        >
                            <div className={`absolute top-0.5 left-0.5 w-1.5 h-1.5 lg:w-3 lg:h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${sessionMode ? 'translate-x-3 lg:translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    {/* Market Price - Box Removed */}
                    <div className="flex flex-col items-end">
                        <span className="text-[5px] lg:text-[6px] font-black opacity-30 uppercase tracking-widest">Market</span>
                        <span className="text-[7px] lg:text-[10px] font-mono font-black" style={{ color: GREEN }}>
                            ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
            </div>

            {/* CALL / PUT Buttons */}
            <div className="grid grid-cols-2 gap-1 lg:gap-2">
                <button
                    onClick={() => setDirection("buy")}
                    className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "buy"
                        ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                        : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                        }`}
                    style={{
                        boxShadow: direction === "buy" ? `0 0 20px ${GREEN}33` : 'none'
                    }}
                >
                    <span className="text-[7px] lg:text-[10px] font-black uppercase tracking-widest">Call</span>
                </button>
                <button
                    onClick={() => setDirection("sell")}
                    className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "sell"
                        ? (isLight ? 'bg-[#FF7F50] text-white border-transparent' : 'bg-[#FF7F50]/20 border-[#FF7F50] text-[#FF7F50]')
                        : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                        }`}
                    style={{
                        boxShadow: direction === "sell" ? `0 0 20px ${CORAL}33` : 'none'
                    }}
                >
                    <span className="text-[7px] lg:text-[10px] font-black uppercase tracking-widest">Put</span>
                </button>
            </div>

            {/* Duration Selector */}
            <div className="flex flex-col gap-1 lg:gap-2">
                <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Time</span>
                    <span className="text-[6px] lg:text-[8px] font-mono font-bold" style={{ color: GREEN }}>
                        {duration === 5 ? '6.98x' : duration === 10 ? '4.98x' : '1.98x'}
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-1 lg:gap-2">
                    {[15, 10, 5].map(d => (
                        <button
                            key={d}
                            onClick={() => setDuration(d)}
                            className={`flex flex-col items-center justify-center py-1.5 lg:py-3 rounded-xl border transition-all duration-300 active:scale-95 ${duration === d
                                ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                                : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.03] border-white/5 text-white/40 hover:bg-white/5')
                                }`}
                        >
                            <span className="text-[10px] lg:text-base font-black tracking-tighter">{d}s</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Stake Amount */}
            <div className="flex flex-col gap-1 lg:gap-2">
                <div className="flex items-center justify-between px-1">
                    <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Stake</span>
                    <span className={`text-[6px] lg:text-[8px] font-bold opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>{(sessionMode ? sessionBalance : balance).toFixed(1)}</span>
                </div>
                <div className={`flex items-center gap-1.5 p-1.5 lg:p-2.5 rounded-xl border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/5'}`}>
                    <input
                        type="number"
                        value={amount}
                        onChange={handleAmountChange}
                        placeholder="0.00"
                        className={`w-full bg-transparent text-xs lg:text-lg font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'}`}
                    />
                    <div className={`px-1 lg:px-1.5 py-0.5 rounded-md text-[5px] lg:text-[8px] font-black uppercase tracking-tight ${isLight ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60'}`}>
                        {currentNetwork === 'solana' ? 'SOL' : 'USDC'}
                    </div>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderValue}
                    onChange={handleSliderChange}
                    className={`w-full h-0.5 lg:h-1 rounded-lg appearance-none cursor-pointer ${isLight ? 'bg-black/10' : 'bg-white/10'}`}
                    style={{ accentColor: GREEN }}
                />
            </div>

            {/* Action Button */}
            <button
                id="trade-confirm-button"
                onClick={isWrongNetwork ? () => switchChain({ chainId: 5042002 }) : executeTrade}
                disabled={isExecuting}
                className={`w-full py-2.5 lg:py-3.5 rounded-xl font-black text-[8px] lg:text-[10px] uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all 
                ${isExecuting ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.99] shadow-xl"}`}
                style={{
                    background: isWrongNetwork ? "#3B82F6" : (direction === "sell" ? CORAL : GREEN),
                    color: "white",
                    boxShadow: `0 5px 15px ${isWrongNetwork ? "#3B82F633" : (direction === "sell" ? CORAL + '33' : GREEN + '33')}`
                }}
            >
                {isExecuting ? "Wait" : (wallet.connected || (sessionMode && sessionBalance > 0)) ? "Confirm" : "Connect"}
            </button>
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
