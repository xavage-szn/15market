import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, ExternalLink } from 'lucide-react';

function formatTime(ms) {
  if (!ms) return '---';
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function TradeHistoryTable({ tradeHistory = [], activeTrades = [], theme, onViewReceipt, isExpanded, onToggleExpand }) {
  const hasRealTrades = [...activeTrades, ...tradeHistory].length > 0;

  const merged = [...activeTrades, ...tradeHistory];
  const seen = new Set();
  const displayTrades = hasRealTrades
    ? merged.filter((trade) => {
        const key = String(trade.id || trade.tx || trade.nonce || JSON.stringify(trade));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    : [
        { id: 'mock-1', timestamp: Date.now() - 5000, symbol: 'ETH', direction: 'UP', amount: 10.00, payout: 16.39, status: 'WON' },
        { id: 'mock-2', timestamp: Date.now() - 20000, symbol: 'BTC', direction: 'DOWN', amount: 8.50, payout: 0, status: 'LOST' },
        { id: 'mock-3', timestamp: Date.now() - 35000, symbol: 'SOL', direction: 'UP', amount: 12.00, payout: 19.68, status: 'WON' },
        { id: 'mock-4', timestamp: Date.now() - 50000, symbol: 'ETH', direction: 'DOWN', amount: 6.00, payout: 0, status: 'LOST' },
      ];

  const scrollRef = useRef(null);
  const isLight = theme === 'light';

  const scroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
    }
  };

  // ─── EXPANDED VIEW: Vertical full-height list ───
  if (isExpanded) {
    return (
      <div className="w-full h-full flex flex-col font-['Comfortaa',cursive]">
        <div className="flex items-center justify-between mb-2 px-1 shrink-0">
          <div className={`text-[12px] font-bold uppercase tracking-wide ${isLight ? 'text-[#111827]' : 'text-white'}`}>
            TRADE HISTORY
          </div>
          <button
            onClick={onToggleExpand}
            className={`flex items-center gap-1 text-[10px] font-bold ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-white/30 hover:text-white/60'}`}
          >
            collapse
            <ChevronDown size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
          {displayTrades.map((trade, idx) => {
            const isWin = trade.status === 'WON' || (trade.payout > 0);
            const isLost = trade.status === 'LOST' || (trade.status === 'RESOLVED' && trade.payout === 0);
            const isActive = !isWin && !isLost && trade.status !== 'CANCELLED';
            const isOdd = idx % 2 === 1;

            return (
              <div
                key={trade.id || idx}
                onClick={() => onViewReceipt?.(trade)}
                className={`flex items-center gap-4 cursor-pointer px-3 py-2.5 transition-colors ${isLight ? (isOdd ? 'bg-gray-100' : 'bg-white') : (isOdd ? 'bg-white/5' : 'bg-white/[0.02]')}`}
              >
                <span className={`text-[16px] font-black tracking-tighter min-w-[50px] ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                  {trade.symbol}
                </span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <span className={`text-[10px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Pos:</span>
                      <span className={`text-[11px] font-black ${trade.direction === 'UP' ? 'text-[#17A364]' : 'text-[#EF4444]'}`}>
                        {trade.direction === 'UP' ? 'YES' : 'NO'}
                      </span>
                    </span>
                    <span className="text-white/20 text-[8px]">|</span>
                    <span className="inline-flex items-center gap-1">
                      <span className={`text-[10px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Stake:</span>
                      <span className={`text-[11px] font-bold ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                        ${Number(trade.amount).toFixed(2)}
                      </span>
                    </span>
                    <span className="text-white/20 text-[8px]">|</span>
                    <span className="inline-flex items-center gap-1">
                      {isActive ? (
                        <span className="text-[11px] font-black text-yellow-500 animate-pulse">PENDING</span>
                      ) : (
                        <span className={`text-[11px] font-black ${isWin ? 'text-[#17A364]' : 'text-[#EF4444]'}`}>
                          {isWin ? `Won $${Number(trade.payout || 0).toFixed(2)}` : `Lost -$${Number(trade.amount || 0).toFixed(2)}`}
                        </span>
                      )}
                    </span>
                    {(() => {
                      const txHash = trade.tx || trade.txHash || trade.stakeTxHash;
                      if (txHash && String(txHash).startsWith('0x') && String(txHash).length > 10) {
                        return (
                          <>
                            <span className="text-white/20 text-[8px]">|</span>
                            <a
                              href={`https://testnet.arcscan.app/tx/${txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${isLight ? 'text-blue-500 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'}`}
                              title="View on ArcScan"
                            >
                              explorer
                              <ExternalLink size={9} />
                            </a>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <span className={`text-[10px] font-medium ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                    {formatTime(trade.timestamp)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── COLLAPSED VIEW: Horizontal scroll strip ───
  return (
    <div className="w-full h-full font-['Comfortaa',cursive]">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className={`text-[12px] font-bold uppercase tracking-wide ${isLight ? 'text-[#111827]' : 'text-white'}`}>
          TRADE HISTORY
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleExpand}
            className={`flex items-center gap-1 text-[10px] font-bold ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-white/30 hover:text-white/60'}`}
          >
            view all
            <ChevronUp size={12} />
          </button>
          <button onClick={() => scroll('left')} className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-500' : 'bg-white/10 hover:bg-white/20 text-white/50'}`}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scroll('right')} className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-500' : 'bg-white/10 hover:bg-white/20 text-white/50'}`}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex items-center gap-5 px-1 overflow-x-auto scrollbar-none whitespace-nowrap"
      >
        {displayTrades.map((trade, idx) => {
          const isWin = trade.status === 'WON' || (trade.payout > 0);
          const isLost = trade.status === 'LOST' || (trade.status === 'RESOLVED' && trade.payout === 0);
          const isActive = !isWin && !isLost && trade.status !== 'CANCELLED';

          return (
            <div 
              key={trade.id || idx}
              onClick={() => onViewReceipt?.(trade)}
              className={`inline-flex items-center gap-4 cursor-pointer shrink-0 border-r ${isLight ? 'border-[#E9E9E9]' : 'border-white/10'} pr-6`}
            >
              <span className={`text-[28px] font-black tracking-tighter ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                {trade.symbol}
              </span>
              <div className="flex flex-col gap-1 justify-center">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Position:</span>
                    <span className={`text-[12px] font-black ${trade.direction === 'UP' ? 'text-[#17A364]' : 'text-[#EF4444]'}`}>
                      {trade.direction === 'UP' ? 'YES' : 'NO'}
                    </span>
                  </span>
                  <span className={`text-white/20 text-[10px]`}>|</span>
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Stake:</span>
                    <span className={`text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                      ${Number(trade.amount).toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Outcome:</span>
                    {isActive ? (
                      <span className="text-[12px] font-black text-yellow-500 animate-pulse">PENDING</span>
                    ) : (
                      <span className={`text-[12px] font-black ${isWin ? 'text-[#17A364]' : 'text-[#EF4444]'}`}>
                        {isWin ? `Won $${Number(trade.payout || 0).toFixed(2)}` : `Lost -$${Number(trade.amount || 0).toFixed(2)}`}
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] font-medium ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                    {formatTime(trade.timestamp)}
                  </span>
                  {(() => {
                    const txHash = trade.tx || trade.txHash || trade.stakeTxHash;
                    if (txHash && String(txHash).startsWith('0x') && String(txHash).length > 10) {
                      return (
                        <a
                          href={`https://testnet.arcscan.app/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${isLight ? 'text-blue-500 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'}`}
                          title="View on ArcScan"
                        >
                          <ExternalLink size={10} />
                        </a>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
