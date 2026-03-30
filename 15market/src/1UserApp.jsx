const MobileBottomHistoryPane = ({ isOpen, onToggle, tradeHistory, theme, setSelectedPnLTrade, setIsPnLOpen, userProfile }) => {
  const isDark = theme !== 'light';

  return (
    <motion.div
      initial={false}
      animate={{
        y: isOpen ? 0 : 'calc(100% - 56px)',
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 z-[110] flex flex-col pointer-events-none"
      style={{ height: '80vh' }}
    >
      <div className={`
        w-full h-full pointer-events-auto
        backdrop-blur-xl border-t border-x rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.3)]
        transition-all duration-500 flex flex-col overflow-hidden
        ${isDark
          ? 'bg-[#0a0a0a]/90 border-white/10'
          : 'bg-[#d4e6dc]/90 border-[#3CB371]/20'}
      `}>
        {/* Horizontal Toggle Handle Bar */}
        <div
          onClick={onToggle}
          className={`
            w-full h-14 flex items-center justify-center cursor-pointer 
            transition-all duration-300 relative shrink-0 border-t
            ${isDark 
              ? 'bg-[#0a0a0a]/95 border-[#3CB371]/40 shadow-[0_-15px_40px_rgba(60,179,113,0.2)]' 
              : 'bg-[#f0f9f4]/95 border-[#3CB371]/30 shadow-[0_-10px_30px_rgba(60,179,113,0.1)]'}
          `}
        >
          {/* Branded "Glow Line" at the top edge */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#3CB371] to-transparent opacity-60" />
          
          <div className="flex items-center justify-center gap-3 w-full -translate-y-3">
            <History size={16} className="text-[#3CB371]" style={{ filter: 'drop-shadow(0 0 10px rgba(60,179,113,0.6))' }} />
            <span className={`text-[12px] font-black uppercase tracking-[0.25em] bg-gradient-to-r from-[#48c97f] to-[#1e5a38] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(60,179,113,0.4)]`}>
              TRADE HISTORY ({userProfile?.stats?.totalTrades || tradeHistory.length})
            </span>
            {isOpen ? <ChevronDown size={14} className="text-[#3CB371]/60" /> : <ChevronUp size={14} className="text-[#3CB371]/60" />}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-12 flex flex-col gap-2">
          {tradeHistory.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
              <History size={48} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No history yet</p>
            </div>
          ) : (
            tradeHistory.slice(0, 50).map((trade) => {
              const isWin = trade.status === 'WON';
              const isLoss = trade.status === 'LOST';

              return (
                <div
                  key={trade.id}
                  className={`
                    p-4 rounded-2xl border transition-all active:scale-[0.98]
                    ${isDark ? 'bg-white/5 border-white/5' : 'bg-[#cce0d5] border-[#3CB371]/10 shadow-sm'}
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`
                        text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter
                        ${trade.direction === 'UP' ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}
                      `}>
                        {trade.direction}
                      </div>
                      <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>{trade.symbol || 'BTC'}</span>
                    </div>
                    <span className={`text-xs font-black ${isWin ? 'text-[#3CB371]' : isLoss ? 'text-[#FF7F50]' : (isDark ? 'text-white/40' : 'text-[#0a261a]/40')}`}>
                      {isWin ? `+$${Number(trade.payout || 0).toFixed(2)}` : trade.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[10px] opacity-40">
                      ${Number(trade.entryPrice).toFixed(2)} • {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedPnLTrade(trade); setIsPnLOpen(true); }}
                        className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5 text-white/40' : 'bg-black/5 text-black/40'}`}
                      >
                        <Share2 size={12} />
                      </button>
                      <a
                        href={`https://testnet.arcscan.app/tx/${trade.tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5 text-white/40' : 'bg-black/5 text-black/40'}`}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
};
