import React, { memo } from 'react';


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
    hasProfile
}) => {
    const isArc = currentNetwork === 'arc';
    const isWrongNetwork = isArc && chainId !== 5042002;
    const isLight = theme === 'light';
    return (
        <div className={`col-span-1 lg:col-span-7 p-1.5 lg:p-6 rounded-[24px] lg:rounded-[32px] border relative overflow-hidden transition-colors duration-300 ${isLight ? '!bg-white border-black/5 !shadow-[0_30px_60px_-10px_rgba(0,0,0,0.4)]' : 'bg-[#050505] border-white/10'}`}>

            {/* Header: Title + Controls */}
            <div className="flex items-center justify-between mb-3 lg:mb-6">
                {/* Left: Title */}
                <div>
                    <h3 className="text-[8px] lg:text-lg font-black tracking-tight flex items-center gap-1 uppercase">
                        <span>Terminal</span>
                        <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full animate-pulse" style={{ backgroundColor: GREEN, boxShadow: `0 0 10px ${GREEN}` }} />
                    </h3>
                    <p className={`hidden lg:block text-[10px] font-bold tracking-widest uppercase ${isLight ? 'text-black/30' : 'text-white/20'}`}>Engine @ {activeTrade ? "Polling" : "Ready"}</p>
                </div>

                {/* Right: Controls (Price + Auto Signer) */}
                <div className="flex items-center gap-1 lg:gap-2 mr-3 lg:mr-0 px-0.5">
                    {/* Price Badge */}
                    <div className={`flex flex-col items-end px-1.5 py-0.5 lg:px-4 lg:py-2 rounded-lg border transition-all ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`}>
                        <span className={`text-[5px] lg:text-[8px] uppercase tracking-wider font-bold opacity-50`}>Price</span>
                        <span className="text-[7.5px] lg:text-base font-mono font-black" style={{ color: GREEN }}>${Number(price).toFixed(4)}</span>
                    </div>

                    {/* Auto Signer Toggle */}
                    <div
                        onClick={() => setSessionMode(!sessionMode)}
                        className="flex lg:hidden items-center gap-1 px-2 py-1.5 rounded-md border cursor-pointer transition-all active:scale-95"
                        style={{
                            backgroundColor: sessionMode ? `${GREEN}15` : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'),
                            borderColor: sessionMode ? `${GREEN}40` : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)')
                        }}
                    >
                        <div className="flex flex-col items-end leading-[1.0]">
                            <span className={`text-[6px] uppercase tracking-wider font-bold opacity-50`}>Auto</span>
                            <span className={`text-[8px] font-black ${sessionMode ? '' : 'opacity-40'}`} style={{ color: sessionMode ? GREEN : 'inherit' }}>
                                {sessionMode ? sessionBalance.toFixed(1) : 'OFF'}
                            </span>
                        </div>
                        <div className="w-5 h-2.5 rounded-full relative transition-colors duration-300"
                            style={{ backgroundColor: sessionMode ? GREEN : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)') }}
                        >
                            <div className={`absolute top-[0.6px] w-1.6 h-1.6 rounded-full bg-white shadow-sm transition-all duration-300 ${sessionMode ? 'right-[0.6px]' : 'left-[0.6px]'}`} />
                        </div>
                    </div>
                    {/* Desktop Auto Signer (Hidden on Mobile) */}
                    <div
                        onClick={() => setSessionMode(!sessionMode)}
                        className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all active:scale-95"
                        style={{
                            backgroundColor: sessionMode ? `${GREEN}15` : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'),
                            borderColor: sessionMode ? `${GREEN}40` : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)')
                        }}
                    >
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] uppercase tracking-wider font-bold opacity-50">Auto</span>
                            <span className={`text-xs font-black ${sessionMode ? '' : 'opacity-40'}`} style={{ color: sessionMode ? GREEN : 'inherit' }}>
                                {sessionMode ? sessionBalance.toFixed(2) : 'OFF'}
                            </span>
                        </div>
                        <div className="w-8 h-4 rounded-full relative transition-colors duration-300"
                            style={{ backgroundColor: sessionMode ? GREEN : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)') }}
                        >
                            <div className={`absolute top-[1px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-300 ${sessionMode ? 'right-[1px]' : 'left-[1px]'}`} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3 lg:space-y-4">
                <div className="flex gap-2 lg:gap-3">
                    <button
                        onClick={() => setDirection("buy")}
                        className="flex-1 py-2 lg:py-4 rounded-xl text-[10px] lg:text-sm font-black transition-all duration-300"
                        style={{
                            backgroundColor: direction === "buy" ? GREEN : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)'),
                            color: isLight && direction !== "buy" ? 'rgba(0,0,0,0.6)' : 'white',
                            borderColor: direction === "buy" ? 'transparent' : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'),
                            borderWidth: direction === "buy" ? 0 : 1,
                            boxShadow: direction === "buy" ? `0 10px 20px ${GREEN}4d` : 'none',
                            transform: direction === "buy" ? 'scale(1.01)' : 'scale(1)'
                        }}
                    >
                        <span className="hidden lg:inline">CALL / UP</span>
                        <span className="lg:hidden">UP</span>
                    </button>
                    <button
                        onClick={() => setDirection("sell")}
                        className="flex-1 py-2 lg:py-4 rounded-xl text-[10px] lg:text-sm font-black transition-all duration-300"
                        style={{
                            backgroundColor: direction === "sell" ? CORAL : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)'),
                            color: isLight && direction !== "sell" ? 'rgba(0,0,0,0.6)' : 'white',
                            borderColor: direction === "sell" ? 'transparent' : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'),
                            borderWidth: direction === "sell" ? 0 : 1,
                            boxShadow: direction === "sell" ? `0 10px 20px ${CORAL}4d` : 'none',
                            transform: direction === "sell" ? 'scale(1.01)' : 'scale(1)'
                        }}
                    >
                        <span className="hidden lg:inline">PUT / DOWN</span>
                        <span className="lg:hidden">DOWN</span>
                    </button>
                </div>

                {/* Duration Selector */}
                <div className={`border rounded-xl p-1.5 lg:p-4 ${isLight ? 'bg-white/50 border-black/5' : 'bg-black/40 border-white/5'}`}>
                    <div className="flex justify-between items-center mb-1 lg:mb-3">
                        <span className={`text-[7px] font-bold uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Duration</span>
                        <span className="text-[7px] font-mono" style={{ color: GREEN }}>
                            {duration === 5 ? "6.98x" : duration === 10 ? "4.98x" : "1.98x"}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => setDuration(15)}
                            className="py-2.5 lg:py-3 rounded-lg text-[10px] lg:text-xs font-black transition-all duration-300"
                            style={{
                                backgroundColor: duration === 15 ? GREEN : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)'),
                                color: duration === 15 ? 'white' : (isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'),
                                border: duration === 15 ? 'none' : (isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.05)'),
                                boxShadow: duration === 15 ? `0 0 20px ${GREEN}66` : 'none'
                            }}
                        >
                            <div className="text-xs lg:text-lg mb-0.5">15s</div>
                            <div className="text-[7px] lg:text-[8px] opacity-60">1.98x</div>
                        </button>
                        <button
                            onClick={() => setDuration(10)}
                            className={`py-2.5 lg:py-3 rounded-lg text-[10px] lg:text-xs font-black transition-all duration-300 ${duration === 10
                                ? "bg-[#FF8C00] text-white shadow-[0_0_20px_rgba(255,140,0,0.4)]"
                                : (isLight ? "bg-black/5 border border-black/10 text-black/40 hover:bg-black/10" : "bg-black/40 border border-white/5 text-white/40 hover:bg-white/5")
                                }`}
                        >
                            <div className="text-xs lg:text-lg mb-0.5">10s</div>
                            <div className="text-[7px] lg:text-[8px] opacity-60">4.98x</div>
                        </button>
                        <button
                            onClick={() => setDuration(5)}
                            className={`py-2.5 lg:py-3 rounded-lg text-[10px] lg:text-xs font-black transition-all duration-300 ${duration === 5
                                ? "bg-[#FF4444] text-white shadow-[0_0_20px_rgba(255,68,68,0.4)]"
                                : (isLight ? "bg-black/5 border border-black/10 text-black/40 hover:bg-black/10" : "bg-black/40 border border-white/5 text-white/40 hover:bg-white/5")
                                }`}
                        >
                            <div className="text-xs lg:text-lg mb-0.5">5s</div>
                            <div className="text-[7px] lg:text-[8px] opacity-60">6.98x</div>
                        </button>
                    </div>
                </div>

                <div className={`border rounded-xl p-2 lg:p-4 ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/60 border-white/5'}`}>
                    <div className="flex justify-between items-center mb-1">
                        <span className={`text-[7px] lg:text-[8px] font-bold uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Stake Amount</span>
                        <span className={`text-[7px] lg:text-[8px] font-mono ${isLight ? 'text-black/40' : 'text-white/20'}`}>
                            Bal: {(sessionMode ? sessionBalance : balance).toFixed(3)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={amount}
                            onChange={handleAmountChange}
                            placeholder="0.00"
                            className={`w-full bg-transparent text-lg font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/5'}`}
                        />
                        <span className={`text-[8px] font-black ${isLight ? 'text-black/30' : 'text-white/20'}`}>{currentNetwork === 'solana' ? 'SOL' : 'USDC'}</span>
                    </div>
                </div>

                <div className="px-1 mb-2">
                    <input type="range" min="0" max="100" value={sliderValue} onChange={handleSliderChange} className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${isLight ? 'bg-black/10' : 'bg-white/10'}`} style={{ accentColor: GREEN }} />
                </div>

                <div className="px-1 flex justify-between items-center mb-1">
                    <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Potential Payout</span>
                    <span className="text-xs font-black tabular-nums" style={{ color: direction === "sell" ? CORAL : GREEN }}>
                        {amount ? (parseFloat(amount) * (duration === 5 ? 6.98 : (duration === 10 ? 4.98 : 1.98))).toFixed(4) : "0.000"} {currentNetwork === 'solana' ? 'SOL' : 'USDC'}
                    </span>
                </div>

                <button
                    id="trade-confirm-button"
                    onClick={isWrongNetwork ? () => switchChain({ chainId: 5042002 }) : executeTrade}
                    disabled={isExecuting}
                    className={`w-full py-2.5 lg:py-4 rounded-xl font-black text-xs lg:text-lg tracking-tight transition-all 
            ${isExecuting
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:brightness-110 active:scale-[0.99] shadow-xl"} 
            ${((!isWrongNetwork && (!direction || !amount || Number(amount) < parseFloat(minStake))) || (!wallet.connected && (!sessionMode || sessionBalance < (Number(amount) + 0.005)))) ? "grayscale opacity-60" : ""}`}
                    style={{ background: isWrongNetwork ? "#3B82F6" : (direction === "sell" ? CORAL : GREEN), color: "white" }}
                >
                    {isExecuting ? "EXECUTING..." :
                        isWrongNetwork ? "SWITCH" :
                            !hasProfile ? "SETUP PROFILE" :
                                (wallet.connected || (sessionMode && sessionBalance > 0)) ? "CONFIRM" : "CONNECT"}
                </button>

                {sessionMode && (
                    <div className={`flex flex-col gap-3 p-4 rounded-xl border ${isLight ? 'bg-black/[0.03] border-black/5' : 'bg-white/[0.03] border-white/5'}`}>
                        <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Auto-Sign Refill</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[14px] font-mono font-black" style={{ color: GREEN }}>{refillAmount}</span>
                                <span className={`text-[8px] font-black uppercase ${isLight ? 'text-black/40' : 'text-white/20'}`}>{currentNetwork === 'solana' ? 'SOL' : 'USDC'}</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {["0.05", "0.1", "0.5", "1.0", "2.0", "5.0"].map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => setRefillAmount(amt)}
                                    className="flex-1 min-w-[45px] py-1.5 rounded-lg border transition-all font-black text-[9px]"
                                    style={{
                                        backgroundColor: refillAmount === amt ? GREEN : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)'),
                                        color: refillAmount === amt ? (isLight ? 'white' : 'black') : (isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.2)'),
                                        borderColor: refillAmount === amt ? GREEN : (isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'),
                                        boxShadow: refillAmount === amt ? `0 0 15px ${GREEN}4d` : 'none'
                                    }}
                                >
                                    {amt}
                                </button>
                            ))}
                        </div>

                        <div className="px-1 py-1">
                            <input
                                type="range"
                                min="0.01"
                                max="10.0"
                                step="0.01"
                                value={refillAmount}
                                onChange={(e) => setRefillAmount(e.target.value)}
                                className={`w-full h-1 rounded-lg appearance-none cursor-pointer transition-all ${isLight ? 'bg-black/10' : 'bg-white/10'}`}
                                style={{ accentColor: GREEN }}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className={`flex items-center gap-3 p-1 rounded-xl border ${isLight ? 'bg-white/50 border-black/5' : 'bg-black/20 border-white/5'}`}>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={refillAmount}
                                    onChange={(e) => setRefillAmount(e.target.value)}
                                    className="flex-1 bg-transparent px-3 py-2 text-sm font-black text-[#3CB371] outline-none placeholder:text-white/10"
                                    placeholder="Enter refill amount..."
                                />
                                <span className={`pr-3 text-[8px] font-black uppercase ${isLight ? 'text-black/40' : 'text-white/20'}`}>{currentNetwork === 'solana' ? 'SOL' : 'USDC'}</span>
                            </div>

                            <button
                                onClick={() => hasProfile ? onRefill(refillAmount) : null}
                                disabled={!hasProfile}
                                className={`w-full py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border transition-all duration-300 active:scale-[0.98] hover:brightness-110 ${!hasProfile ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
                                style={{
                                    backgroundColor: `${GREEN}cc`,
                                    color: isLight ? 'white' : 'black',
                                    borderColor: `${GREEN}`,
                                    boxShadow: hasProfile ? `0 10px 20px ${GREEN}33` : 'none'
                                }}
                            >
                                {hasProfile ? "Refill Auto-Signer (0.5% Fee)" : "Setup Profile to Refill"}
                            </button>
                        </div>
                        <div className="mt-2 text-center">
                            <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest italic">
                                Total Sweep available in dashboard
                            </p>
                        </div>
                    </div>
                )}

            </div >
        </div >
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
