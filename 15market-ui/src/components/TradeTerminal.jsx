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
        <div className={`w-full p-2 lg:p-4 rounded-xl border relative transition-colors duration-300 flex flex-col gap-4 ${isLight ? 'static-panel-light !shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]' : 'bg-[#050505] border-white/10'}`}>

            {/* Header: Title + Controls */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse`} style={{ backgroundColor: GREEN, boxShadow: `0 0 8px ${GREEN}` }} />
                        <h2 className={`text-[10px] lg:text-xs font-black tracking-[0.2em] uppercase ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                            {activeMarket?.symbol || 'SOL'} TERMINAL
                        </h2>
                    </div>

                    {/* Auto Signer Toggle */}
                    <button
                        onClick={() => setSessionMode(!sessionMode)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${sessionMode
                            ? 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371] shadow-[0_0_15px_rgba(60,179,113,0.1)]'
                            : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
                    >
                        <Zap size={14} className={sessionMode ? 'fill-current' : ''} />
                        <span className="text-[10px] font-black uppercase tracking-wider">
                            Auto Signer: {sessionMode ? 'ON' : 'OFF'}
                        </span>
                    </button>
                </div>

                {/* Live Price Feed */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'} lg:flex-col lg:py-5 lg:rounded-2xl lg:justify-center`}>
                    <div className="flex flex-col lg:items-center">
                        <span className="text-[8px] lg:text-[10px] font-black opacity-30 uppercase tracking-[0.2em] lg:mb-1">Live {activeMarket?.symbol || 'SOL'}/USD</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl lg:text-4xl font-black font-mono tracking-tighter" style={{ color: GREEN }}>
                                ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                            <div className="flex items-center gap-1 px-1 py-0.5 rounded-[4px] text-[7px] font-black animate-pulse lg:hidden" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
                                LIVE
                            </div>
                        </div>
                    </div>
                    <div className="hidden lg:flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black animate-pulse mt-2" style={{ backgroundColor: `${GREEN}33`, color: GREEN }}>
                        LIVE FEED ACTIVE
                    </div>
                </div>
            </div>


            <div className="space-y-2">
                <div className="flex gap-2">
                    <button
                        onClick={() => setDirection("buy")}
                        className="flex-1 py-1.5 lg:py-2.5 rounded-lg text-[10px] lg:text-xs font-black transition-all duration-300 active:scale-95"
                        style={{
                            backgroundColor: direction === "buy" ? GREEN : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)'),
                            color: isLight && direction !== "buy" ? 'rgba(0,0,0,0.6)' : 'white',
                            borderColor: direction === "buy" ? 'transparent' : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'),
                            borderWidth: direction === "buy" ? 0 : 1,
                            boxShadow: direction === "buy" ? `0 5px 15px ${GREEN}4d` : 'none',
                        }}
                    >
                        CALL
                    </button>
                    <button
                        onClick={() => setDirection("sell")}
                        className="flex-1 py-1.5 lg:py-2.5 rounded-lg text-[10px] lg:text-xs font-black transition-all duration-300 active:scale-95"
                        style={{
                            backgroundColor: direction === "sell" ? CORAL : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)'),
                            color: isLight && direction !== "sell" ? 'rgba(0,0,0,0.6)' : 'white',
                            borderColor: direction === "sell" ? 'transparent' : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'),
                            borderWidth: direction === "sell" ? 0 : 1,
                            boxShadow: direction === "sell" ? `0 5px 15px ${CORAL}4d` : 'none',
                        }}
                    >
                        PUT
                    </button>
                </div>

                {/* Duration Selector */}
                <div className={`border rounded-lg p-1.5 lg:p-2 ${isLight ? 'bg-white/50 border-black/5' : 'bg-black/40 border-white/5'}`}>
                    <div className="flex justify-between items-center mb-1">
                        <span className={`text-[6px] font-bold uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Duration</span>
                        <span className="text-[6px] font-mono" style={{ color: GREEN }}>
                            {duration === 5 ? "6.98x" : duration === 10 ? "4.98x" : "1.98x"}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {[15, 10, 5].map(d => (
                            <button
                                key={d}
                                onClick={() => setDuration(d)}
                                className={`py-1.5 lg:py-2 rounded text-[9px] lg:text-[10px] font-black transition-all duration-300 ${duration === d
                                    ? (d === 15 ? `bg-[${GREEN}] text-white` : d === 10 ? "bg-[#FF8C00] text-white" : "bg-[#FF4444] text-white")
                                    : (isLight ? "bg-black/5 text-black/40" : "bg-black/40 text-white/40")
                                    }`}
                                style={duration === 15 && d === 15 ? { backgroundColor: GREEN } : {}}
                            >
                                {d}s
                            </button>
                        ))}
                    </div>
                </div>

                <div className={`border rounded-lg p-1.5 lg:p-2 ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/60 border-white/5'}`}>
                    <div className="flex justify-between items-center mb-0.5">
                        <span className={`text-[6px] lg:text-[7px] font-bold uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Stake Amount</span>
                        <span className={`text-[6px] lg:text-[7px] font-mono ${isLight ? 'text-black/40' : 'text-white/20'}`}>
                            Bal: {(sessionMode ? sessionBalance : balance).toFixed(3)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={amount}
                            onChange={handleAmountChange}
                            placeholder="0.00"
                            className={`w-full bg-transparent text-sm lg:text-base font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/5'}`}
                        />
                        <span className={`text-[7px] font-black ${isLight ? 'text-black/30' : 'text-white/20'}`}>{currentNetwork === 'solana' ? 'SOL' : 'USDC'}</span>
                    </div>
                </div>

                <div className="px-1 mb-1">
                    <input type="range" min="0" max="100" value={sliderValue} onChange={handleSliderChange} className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${isLight ? 'bg-black/10' : 'bg-white/10'}`} style={{ accentColor: GREEN }} />
                </div>

                <div className="px-1 flex justify-between items-center mb-0.5">
                    <span className={`text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Px</span>
                    <span className="text-[9px] font-black tabular-nums" style={{ color: direction === "sell" ? CORAL : GREEN }}>
                        {amount ? (parseFloat(amount) * (duration === 5 ? 6.98 : (duration === 10 ? 4.98 : 1.98))).toFixed(4) : "0.000"} {currentNetwork === 'solana' ? 'SOL' : 'USDC'}
                    </span>
                </div>

                <button
                    id="trade-confirm-button"
                    onClick={isWrongNetwork ? () => switchChain({ chainId: 5042002 }) : executeTrade}
                    disabled={isExecuting}
                    className={`w-full py-2 lg:py-2.5 rounded-lg font-black text-[10px] lg:text-sm tracking-tight transition-all 
            ${isExecuting ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.99] shadow-lg"}`}
                    style={{ background: isWrongNetwork ? "#3B82F6" : (direction === "sell" ? CORAL : GREEN), color: "white" }}
                >
                    {isExecuting ? "..." : (wallet.connected || (sessionMode && sessionBalance > 0)) ? "CONFIRM TRADE" : "CONNECT"}
                </button>
            </div>
        </div >
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
