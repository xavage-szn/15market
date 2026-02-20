import React, { memo } from 'react';

function TradeTerminalComponent({
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
    sliderValue = 0, // Added sliderValue prop
    executeTrade,
    isExecuting,
    wallet,
    theme,
    maintenanceMode = false,
    refillAmount,
    setRefillAmount,
    onRefill,
    onWithdraw,
}) {
    const isLight = theme === 'light';
    const [showManagement, setShowManagement] = React.useState(false);

    return (
        <div className={`w-full h-full p-2 lg:p-5 rounded-2xl glass-panel relative transition-all duration-300 flex flex-col gap-2 lg:gap-4 ${isLight ? 'static-panel-light !shadow-xl' : ''}`}>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 lg:gap-6">
                    <div className="flex items-center gap-1">
                        <h2 className={`text-[10px] lg:text-lg font-black tracking-tighter uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                            TERMINAL
                        </h2>
                        <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#3CB371', boxShadow: `0 0 10px #3CB371` }} />
                    </div>

                    <div className="flex items-center gap-1 lg:gap-2">
                        <div className="flex flex-col">
                            <span className={`text-[5px] lg:text-[7px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Auto</span>
                        </div>
                        <button
                            onClick={() => setSessionMode()}
                            title={sessionMode ? `Auto-Signer Active (${sessionBalance.toFixed(4)} USDC) - Click to use Main Wallet` : "Auto-Signer Inactive - Click to activate"}
                            className={`w-5 border lg:w-8 h-2.5 lg:h-4 rounded-full relative transition-all duration-300 cursor-pointer hover:opacity-80 ${sessionMode ? 'bg-[#3CB371] border-transparent' : (isLight ? 'bg-black/10 border-black/10' : 'bg-white/10 border-white/10')}`}
                        >
                            <div className={`absolute top-0.5 left-0.5 w-1.5 h-1.5 lg:w-3 lg:h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${sessionMode ? 'translate-x-3 lg:translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    <div className="flex flex-col items-end">
                        <span className="text-[5px] lg:text-[6px] font-black opacity-30 uppercase tracking-widest">Market</span>
                        <span className="text-[7px] lg:text-[10px] font-mono font-black" style={{ color: '#3CB371' }}>
                            ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Auto-Signer Management Panel */}
            {sessionMode && (
                <div className={`p-2 lg:p-3 rounded-xl border flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-300 ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Auto Balance</span>
                            </div>
                            <span className="text-[8px] lg:text-sm font-mono font-black text-[#3CB371]">
                                ${Number(sessionBalance).toFixed(4)} USDC
                            </span>
                        </div>
                        <button
                            onClick={() => setShowManagement(!showManagement)}
                            className={`p-1 rounded-md transition-all ${isLight ? 'hover:bg-black/5' : 'hover:white/5'} ${showManagement ? 'rotate-180' : ''}`}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>
                    </div>

                    {showManagement && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            {/* Brand Refill Input */}
                            <div className={`mt-1 flex items-center gap-1.5 p-1.5 rounded-lg border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/5'}`}>
                                <input
                                    type="number"
                                    value={refillAmount}
                                    onChange={(e) => setRefillAmount(e.target.value)}
                                    placeholder="0.00"
                                    className={`w-full bg-transparent text-[9px] lg:text-xs font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'}`}
                                />
                                <div className={`px-1 py-0.5 rounded text-[5px] lg:text-[6px] font-black uppercase tracking-tight ${isLight ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60'}`}>
                                    USDC
                                </div>
                            </div>

                            {/* Refill Slider */}
                            <div className="relative pt-1 pb-2 px-1">
                                <div className="relative h-1 rounded-full overflow-hidden bg-white/10">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-[#3CB371] transition-all duration-150"
                                        style={{ width: `${Math.min(100, (parseFloat(refillAmount || 0) / (balance || 1)) * 100)}%` }}
                                    />
                                    <input
                                        type="range" min="0" max="100" step="1"
                                        value={Math.min(100, (parseFloat(refillAmount || 0) / (balance || 1)) * 100)}
                                        onChange={(e) => balance > 0 && setRefillAmount(((balance * e.target.value) / 100).toFixed(4))}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                </div>
                                <div className="flex justify-between mt-1 opacity-40">
                                    <span className="text-[5px] font-mono">0%</span>
                                    <span className="text-[5px] font-mono">50%</span>
                                    <span className="text-[5px] font-mono">100%</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => onRefill(refillAmount)}
                                    disabled={isExecuting}
                                    className={`py-1.5 lg:py-2 rounded-lg bg-[#3CB371] text-white text-[7px] lg:text-[9px] font-black uppercase tracking-widest hover:brightness-110 transition-all ${isExecuting ? 'opacity-50' : ''}`}
                                >
                                    Deposit
                                </button>
                                <button
                                    onClick={() => onWithdraw(refillAmount)}
                                    disabled={isExecuting}
                                    className={`py-1.5 lg:py-2 rounded-lg border border-[#3CB371]/30 text-[#3CB371] text-[7px] lg:text-[9px] font-black uppercase tracking-widest hover:bg-[#3CB371]/10 transition-all ${isExecuting ? 'opacity-50' : ''}`}
                                >
                                    Withdraw
                                </button>
                            </div>
                            <div className="flex items-center justify-center gap-1 opacity-20">
                                <div className="w-1 h-1 rounded-full bg-[#3CB371]" />
                                <span className={`text-[5px] lg:text-[7px] font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Zero Fees Applied</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-1 lg:gap-2">
                <button
                    onClick={() => !maintenanceMode && setDirection("UP")}
                    disabled={maintenanceMode}
                    className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "UP"
                        ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                        : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                        }`}
                    style={{
                        boxShadow: direction === "UP" ? `0 0 20px rgba(60, 179, 113, 0.2)` : 'none'
                    }}
                >
                    <span className="text-[7px] lg:text-[10px] font-black uppercase tracking-widest">Call</span>
                </button>
                <button
                    onClick={() => !maintenanceMode && setDirection("DOWN")}
                    disabled={maintenanceMode}
                    className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "DOWN"
                        ? (isLight ? 'bg-[#FF7F50] text-white border-transparent' : 'bg-[#FF7F50]/20 border-[#FF7F50] text-[#FF7F50]')
                        : (isLight ? 'bg-black/5 border-black/5 text-black/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                        }`}
                    style={{
                        boxShadow: direction === "DOWN" ? `0 0 20px rgba(255, 127, 80, 0.2)` : 'none'
                    }}
                >
                    <span className="text-[7px] lg:text-[10px] font-black uppercase tracking-widest">Put</span>
                </button>
            </div>

            <div className="flex flex-col gap-1 lg:gap-2">
                <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Time</span>
                    <span className="text-[6px] lg:text-[8px] font-mono font-bold" style={{ color: '#3CB371' }}>
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

            <div className="flex flex-col gap-1 lg:gap-2">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Stake</span>
                        <div className="flex items-center gap-1.5 ml-2">
                            <div className="flex items-center gap-1">
                                <div className={`w-1 h-1 rounded-full ${!sessionMode ? 'bg-[#3CB371] shadow-[0_0_5px_#3CB371]' : 'bg-white/10'}`} />
                                <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-tighter ${!sessionMode ? 'text-[#3CB371]' : 'opacity-20'}`}>Main: ${balance.toFixed(2)}</span>
                            </div>
                            <div className="w-px h-2 bg-white/10" />
                            <div className="flex items-center gap-1">
                                <div className={`w-1 h-1 rounded-full ${sessionMode ? 'bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.5)]' : 'bg-white/10'}`} />
                                <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-tighter ${sessionMode ? 'text-yellow-400' : 'opacity-20'}`}>Auto: ${sessionBalance.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    <span className={`text-[6px] lg:text-[8px] font-bold ${sessionMode ? 'text-yellow-400' : 'text-[#3CB371]'}`}>
                        Selected: ${(sessionMode ? sessionBalance : balance).toFixed(2)}
                    </span>
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
                        USDC
                    </div>
                </div>
                <div className="relative pt-4 pb-2 px-1">
                    <div className="relative h-1.5 lg:h-2">
                        {/* Custom Track Background */}
                        <div className={`absolute inset-0 rounded-full ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />

                        {/* Custom Progress Fill */}
                        <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
                            style={{
                                width: `${sliderValue || 0}%`,
                                background: '#3CB371',
                                boxShadow: '0 0 10px rgba(60, 179, 113, 0.3)'
                            }}
                        />

                        {/* Transparent input for interaction */}
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={sliderValue || 0}
                            onChange={handleSliderChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
                        />

                        {/* Custom Thumb Visual */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg pointer-events-none z-20 transition-all duration-150"
                            style={{
                                left: `${sliderValue || 0}%`,
                                backgroundColor: '#3CB371'
                            }}
                        />
                    </div>

                    <div className="flex justify-between mt-3 px-0.5 relative">
                        {[0, 25, 50, 75, 100].map((pct) => (
                            <div key={pct} className="flex flex-col items-center gap-1.5 relative z-10">
                                <div className={`w-0.5 h-1.5 rounded-full ${pct <= (sliderValue || 0) ? 'bg-[#3CB371]' : (isLight ? 'bg-black/20' : 'bg-white/10')}`} />
                                <span className={`text-[6px] lg:text-[8px] font-black tracking-tighter transition-colors ${pct <= (sliderValue || 0) ? (isLight ? 'text-black' : 'text-white') : (isLight ? 'text-black/30' : 'text-white/20')}`}>
                                    {pct}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <button
                id="trade-confirm-button"
                onClick={executeTrade}
                disabled={isExecuting || maintenanceMode}
                className={`w-full py-2.5 lg:py-3.5 rounded-xl font-black text-[8px] lg:text-[10px] uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all 
                ${(isExecuting || maintenanceMode) ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.99] shadow-xl"}`}
                style={{
                    background: maintenanceMode ? "#333" : (direction === "DOWN" ? '#FF7F50' : '#3CB371'),
                    color: "white",
                    boxShadow: maintenanceMode ? "none" : `0 5px 15px ${direction === "DOWN" ? 'rgba(255, 127, 80, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                    cursor: maintenanceMode ? "not-allowed" : "pointer"
                }}
            >
                {maintenanceMode ? "PAUSED" : (isExecuting ? "Wait" : (wallet?.connected || (sessionMode && sessionBalance > 0)) ? "Confirm" : "Connect")}
            </button>
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
