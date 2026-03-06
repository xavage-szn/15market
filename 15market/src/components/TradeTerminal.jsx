import React, { memo } from 'react';

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
    refillAmount,
    setRefillAmount,
    onRefill,
    onWithdraw,
    transparent = false,
    showManagement,
    setShowManagement,
    uiVersion = 'v1',
}) {
    const isLight = theme === 'light';

    const containerClass = transparent
        ? "flex flex-col gap-1 lg:gap-2"
        : `w-full h-full p-2 lg:p-3 rounded-2xl glass-panel relative transition-all duration-300 flex flex-col gap-1.5 lg:gap-2.5 ${isLight ? 'static-panel-light !shadow-xl' : ''}`;

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
                    ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        </div>
    );

    const renderCallPut = () => (
        <div className="grid grid-cols-2 gap-1 lg:gap-1 pointer-events-auto">
            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("UP"); }}
                disabled={maintenanceMode}
                className={`flex flex-col items-center justify-center py-1.5 lg:py-2 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "UP"
                    ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                    : (isLight ? 'bg-[#3CB371]/5 border-[#3CB371]/10 text-[#0a261a]/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                    }`}
                style={{
                    boxShadow: direction === "UP" ? `0 0 20px rgba(60, 179, 113, 0.2)` : 'none'
                }}
            >
                <span className="text-[7px] lg:text-[9px] font-black uppercase tracking-widest">Call</span>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); !maintenanceMode && setDirection("DOWN"); }}
                disabled={maintenanceMode}
                className={`flex flex-col items-center justify-center py-1.5 lg:py-2 rounded-xl border transition-all duration-300 active:scale-95 ${direction === "DOWN"
                    ? (isLight ? 'bg-[#FF7F50] text-white border-transparent' : 'bg-[#FF7F50]/20 border-[#FF7F50] text-[#FF7F50]')
                    : (isLight ? 'bg-[#3CB371]/5 border-[#3CB371]/10 text-[#0a261a]/40' : 'bg-white/[0.02] border-white/5 text-white/20 hover:text-white/40')
                    }`}
                style={{
                    boxShadow: direction === "DOWN" ? `0 0 20px rgba(255, 127, 80, 0.2)` : 'none'
                }}
            >
                <span className="text-[7px] lg:text-[9px] font-black uppercase tracking-widest">Put</span>
            </button>
        </div>
    );

    const renderTime = () => (
        <div className="flex flex-col gap-0.5 lg:gap-0.5 pointer-events-auto">
            <div className="flex items-center justify-between px-0.5">
                <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Time</span>
                <span className="text-[6px] lg:text-[7px] font-mono font-bold" style={{ color: '#3CB371' }}>
                    {duration === 5 ? '6.98x' : duration === 10 ? '4.98x' : '1.98x'}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-1 lg:gap-1">
                {[15, 10, 5].map(d => (
                    <button
                        key={d}
                        onClick={(e) => { e.stopPropagation(); setDuration(d); }}
                        className={`flex flex-col items-center justify-center py-0.5 rounded-full border transition-all duration-300 active:scale-95 ${duration === d
                            ? (isLight ? 'bg-[#3CB371] text-white border-transparent' : 'bg-[#3CB371]/20 border-[#3CB371] text-[#3CB371]')
                            : (isLight ? 'bg-[#f0f9f4] border-[#3CB371]/10 text-[#0a261a]/60 hover:bg-[#e6f4ed]' : 'bg-white/[0.03] border-white/5 text-white/40 hover:bg-white/5')
                            }`}
                    >
                        <span className="text-[9px] lg:text-xs font-black tracking-tighter">{d}s</span>
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
            <div className={`flex items-center gap-1.5 p-1 rounded-2xl border ${isLight ? 'bg-[#e6f4ed] border-[#3CB371]/10' : 'bg-white/5 border-white/5'}`}>
                <input
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    className={`w-full bg-transparent text-[10px] lg:text-sm font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'}`}
                />
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
        <button
            id="trade-confirm-button"
            onClick={(e) => { e.stopPropagation(); executeTrade(); }}
            disabled={isExecuting || maintenanceMode}
            className={`w-full py-2.5 lg:py-3 rounded-xl font-black text-[8px] lg:text-[10px] uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all pointer-events-auto
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
    );

    return (
        <div className={containerClass}>
            {renderHeader()}

            {sessionMode && showManagement && uiVersion !== 'v1' && (
                <div className={`px-2 py-1.5 lg:px-3 lg:py-2 rounded-xl border flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-300 ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className={`text-[5px] lg:text-[7px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Auto Balance</span>
                            <span className="text-[7px] lg:text-xs font-mono font-black text-[#3CB371]">
                                ${Number(sessionBalance).toFixed(2)} USDC
                            </span>
                        </div>
                    </div>

                    <div className={`mt-0.5 flex items-center gap-1 p-1 rounded-2xl border ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/5'}`}>
                        <input
                            type="number"
                            value={refillAmount}
                            onChange={(e) => setRefillAmount(e.target.value)}
                            placeholder="0.00"
                            className={`w-full bg-transparent text-[8px] lg:text-[10px] font-black outline-none ${isLight ? 'text-black placeholder:text-black/10' : 'text-white placeholder:text-white/10'}`}
                        />
                        <div className={`px-1 py-0.5 rounded text-[4px] lg:text-[6px] font-black uppercase tracking-tight ${isLight ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60'}`}>
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
