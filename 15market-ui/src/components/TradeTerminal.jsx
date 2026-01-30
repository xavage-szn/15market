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
        <div className={`w-full p-4 lg:p-5 rounded-2xl glass-panel relative transition-all duration-300 flex flex-col gap-4 ${isLight ? 'static-panel-light !shadow-xl' : ''}`}>

            {/* Header: Title + Engine Status + Right Controls */}
            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-0">
                    <div className="flex items-center gap-1.5">
                        <h2 className={`text-lg font-black tracking-tighter uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                            TERMINAL
                        </h2>
                        <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: GREEN, boxShadow: `0 0 10px ${GREEN}` }} />
                    </div>
                    <span className={`text-[8px] font-black tracking-[0.3em] uppercase opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>
                        ENGINE • READY
                    </span>
                </div>

                <div className="flex flex-col items-end gap-2">
                    {/* Market Price Box */}
                    <div className={`px-2 py-1 rounded-lg border flex flex-col items-end min-w-[80px] ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/5'}`}>
                        <span className="text-[6px] font-black opacity-30 uppercase tracking-widest">Market</span>
                        <span className="text-[10px] font-mono font-black" style={{ color: GREEN }}>
                            ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>

                    {/* Auto Sign Toggle */}
                    <div className="flex items-center gap-2">
                        <span className={`text-[7px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Auto-Sign</span>
                        <button
                            onClick={() => setSessionMode(!sessionMode)}
                            className={`w-8 h-4 rounded-full relative transition-all duration-300 ${sessionMode ? 'bg-[#3CB371]' : (isLight ? 'bg-black/10' : 'bg-white/10')}`}
                        >
                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${sessionMode ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* CALL / PUT Buttons */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => setDirection("buy")}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "buy"
                        ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                        : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                        }`}
                    style={{
                        boxShadow: direction === "buy" ? `0 0 30px ${GREEN}33` : 'none'
                    }}
                >
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Call / Up</span>
                </button>
                <button
                    onClick={() => setDirection("sell")}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "sell"
                        ? (isLight ? 'bg-[#FF7F50] text-white border-transparent' : 'bg-[#FF7F50]/20 border-[#FF7F50] text-[#FF7F50]')
                        : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                        }`}
                    style={{
                        boxShadow: direction === "sell" ? `0 0 30px ${CORAL}33` : 'none'
                    }}
                >
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Put / Down</span>
                </button>
            </div>

            {/* Duration Selector */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Duration</span>
                    <span className="text-[8px] font-mono font-bold" style={{ color: GREEN }}>1.98x</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {[15, 10, 5].map(d => (
                        <button
                            key={d}
                            onClick={() => setDuration(d)}
                            className={`flex flex-col items-center justify-center py-3 rounded-xl border transition-all duration-300 active:scale-95 ${duration === d
                                ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                                : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.03] border-white/5 text-white/40 hover:bg-white/5')
                                }`}
                        >
                            <span className="text-sm lg:text-base font-black tracking-tighter">{d}s</span>
                            <span className="text-[6px] font-bold opacity-60 uppercase tracking-widest">{d === 15 ? '1.98x' : d === 10 ? '4.9x' : '6.9x'}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Stake Amount */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Stake</span>
                    <span className={`text-[8px] font-bold opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Bal: {(sessionMode ? sessionBalance : balance).toFixed(2)}</span>
                </div>
                <div className={`flex items-center gap-3 p-2.5 rounded-xl border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/5'}`}>
                    <input
                        type="number"
                        value={amount}
                        onChange={handleAmountChange}
                        placeholder="0.00"
                        className={`w-full bg-transparent text-lg font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'}`}
                    />
                    <div className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tight ${isLight ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60'}`}>
                        {currentNetwork === 'solana' ? 'SOL' : 'USDC'}
                    </div>
                </div>
                <div className="px-1">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderValue}
                        onChange={handleSliderChange}
                        className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${isLight ? 'bg-black/10' : 'bg-white/10'}`}
                        style={{ accentColor: GREEN }}
                    />
                </div>
            </div>

            {/* Action Button */}
            <button
                id="trade-confirm-button"
                onClick={isWrongNetwork ? () => switchChain({ chainId: 5042002 }) : executeTrade}
                disabled={isExecuting}
                className={`w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] transition-all 
                ${isExecuting ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.99] shadow-xl"}`}
                style={{
                    background: isWrongNetwork ? "#3B82F6" : (direction === "sell" ? CORAL : GREEN),
                    color: "white",
                    boxShadow: `0 10px 30px ${isWrongNetwork ? "#3B82F633" : (direction === "sell" ? CORAL + '33' : GREEN + '33')}`
                }}
            >
                {isExecuting ? "Initiating..." : (wallet.connected || (sessionMode && sessionBalance > 0)) ? "Confirm Order" : "Connect"}
            </button>
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
