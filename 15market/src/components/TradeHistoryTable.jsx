import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ExternalLink, ArrowUp, ArrowDown, Share2, Search, CheckCircle, XCircle } from 'lucide-react';

function formatTime(ms) {
  if (!ms) return '---';
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const SYMBOL_COLORS = {
  ETH: { bg: 'bg-[#627EEA]', light: '#627EEA' },
  BTC: { bg: 'bg-[#F7931A]', light: '#F7931A' },
  SOL: { bg: 'bg-[#9945FF]', light: '#9945FF' },
  MON: { bg: 'bg-[#00D4AA]', light: '#00D4AA' },
  AVAX: { bg: 'bg-[#E84142]', light: '#E84142' },
};

function getSymbolColor(sym) {
  const key = (sym || '').toUpperCase().replace('USDT', '');
  return SYMBOL_COLORS[key] || { bg: 'bg-gray-500', light: '#6B7280' };
}

export default function TradeHistoryTable({ tradeHistory = [], activeTrades = [], theme, onViewReceipt, onShare, isExpanded, onToggleExpand }) {
  const hasRealTrades = [...activeTrades, ...tradeHistory].length > 0;
  const [verifyId, setVerifyId] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

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

  // ─── EXPANDED VIEW: Full-height list with asset logos + verifier ───

  const handleVerify = async () => {
    if (!verifyId.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { KEEPER_URL_ARC } = await import('../constants');
      const res = await fetch(`${KEEPER_URL_ARC}/trade/${verifyId.trim()}`);
      if (res.ok) {
        const data = await res.json();
        setVerifyResult(data);
      } else {
        setVerifyResult({ error: 'Trade not found' });
      }
    } catch {
      setVerifyResult({ error: 'Failed to verify' });
    }
    setVerifying(false);
  };

  if (isExpanded) {
    return (
      <div className="w-full h-full flex flex-col font-['Comfortaa',cursive]">
        <div className="flex items-center justify-between mb-3 px-1 shrink-0">
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

        {/* Trade Verifier */}
        <div className={`mb-3 px-3 py-3 rounded-2xl shrink-0 ${isLight ? 'bg-gray-50 border border-gray-200' : 'bg-white/5 border border-white/10'}`}>
          <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
            Verify a Trade
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={verifyId}
              onChange={(e) => setVerifyId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              placeholder="Enter Trade ID..."
              className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold outline-none ${isLight ? 'bg-white border border-gray-200 text-[#111827] placeholder-gray-400 focus:border-[#17A364]' : 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[#17A364]'}`}
            />
            <button
              onClick={handleVerify}
              disabled={verifying || !verifyId.trim()}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold text-white transition-all ${verifying ? 'opacity-50' : 'hover:scale-105 active:scale-95'}`}
              style={{ backgroundColor: '#17A364' }}
            >
              {verifying ? '...' : 'Verify'}
            </button>
          </div>
          {verifyResult && (
            <div className={`mt-2 px-3 py-2 rounded-xl text-[11px] font-bold ${verifyResult.error ? 'bg-red-500/10 text-red-500' : 'bg-[#17A364]/10 text-[#17A364]'}`}>
              {verifyResult.error ? (
                <div className="flex items-center gap-1.5"><XCircle size={12} /> {verifyResult.error}</div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5"><CheckCircle size={12} /> Trade Verified</div>
                  <div className="text-[10px] opacity-70">
                    {verifyResult.symbol} | {verifyResult.direction === 'UP' ? 'YES' : 'NO'} | ${Number(verifyResult.amount || 0).toFixed(2)} | {verifyResult.status}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
          {displayTrades.map((trade, idx) => {
            const isWin = trade.status === 'WON' || (trade.payout > 0);
            const isLost = trade.status === 'LOST' || (trade.status === 'RESOLVED' && trade.payout === 0);
            const isActive = !isWin && !isLost && trade.status !== 'CANCELLED';
            const isUp = trade.direction === 'UP';
            const sym = (trade.symbol || '').toUpperCase().replace('USDT', '');
            const colors = getSymbolColor(sym);
            const txHash = trade.tx || trade.txHash || trade.stakeTxHash;
            const hasTx = txHash && String(txHash).startsWith('0x') && String(txHash).length > 10;

            return (
              <div
                key={trade.id || idx}
              onClick={() => onShare?.(trade)}
                className={`group flex items-center cursor-pointer px-3 py-3 rounded-xl mb-1 transition-all hover:scale-[1.005] ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5'}`}
              >
                {/* Asset Logo */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-black text-[10px] tracking-tight"
                  style={{ backgroundColor: colors.light }}
                >
                  {sym.slice(0, 3)}
                </div>

                {/* Direction + Symbol */}
                <div className="flex items-center gap-1.5 ml-3 shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isUp ? 'bg-[#17A364]/15' : 'bg-[#EF4444]/15'}`}>
                    {isUp ? (
                      <ArrowUp size={11} className="text-[#17A364]" />
                    ) : (
                      <ArrowDown size={11} className="text-[#EF4444]" />
                    )}
                  </div>
                  <span className={`text-[12px] font-black ${isUp ? 'text-[#17A364]' : 'text-[#EF4444]'}`}>
                    {isUp ? 'YES' : 'NO'}
                  </span>
                  <span className={`text-[11px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                    {sym}
                  </span>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Details — spread right */}
                <div className="flex items-center gap-6">
                  {/* Stake */}
                  <div className="flex flex-col items-end">
                    <span className={`text-[9px] font-medium ${isLight ? 'text-gray-400' : 'text-white/30'}`}>Stake</span>
                    <span className={`text-[13px] font-black tabular-nums ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                      ${Number(trade.amount).toFixed(2)}
                    </span>
                  </div>

                  {/* Outcome */}
                  <div className="flex flex-col items-end">
                    <span className={`text-[9px] font-medium ${isLight ? 'text-gray-400' : 'text-white/30'}`}>Outcome</span>
                    {isActive ? (
                      <span className="text-[12px] font-black text-yellow-500 animate-pulse">PENDING</span>
                    ) : isWin ? (
                      <span className="text-[13px] font-black text-[#17A364]">
                        +${Number(trade.payout || 0).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[13px] font-black text-[#EF4444]">
                        -${Number(trade.amount || 0).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Time */}
                  <div className="flex flex-col items-end">
                    <span className={`text-[9px] font-medium ${isLight ? 'text-gray-400' : 'text-white/30'}`}>Time</span>
                    <span className={`text-[11px] font-bold tabular-nums ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                      {formatTime(trade.timestamp)}
                    </span>
                  </div>

                  {/* Share + ArcScan */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onShare?.(trade); }}
                    className={`shrink-0 p-1.5 rounded-full transition-all ${isLight ? 'text-[#17A364] hover:bg-[#17A364]/10' : 'text-[#17A364] hover:bg-[#17A364]/15'}`}
                    title="Share Card"
                  >
                    <Share2 size={14} />
                  </button>
                  {hasTx && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`shrink-0 p-1.5 rounded-full transition-all ${isLight ? 'text-[#17A364] hover:bg-[#17A364]/10' : 'text-[#17A364] hover:bg-[#17A364]/15'}`}
                      title="View on ArcScan"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
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
              onClick={() => onShare?.(trade)}
              className={`inline-flex items-center gap-4 cursor-pointer shrink-0 border-r ${isLight ? 'border-[#E9E9E9]' : 'border-white/10'} pr-6`}
            >
              <span className={`text-[36px] font-black tracking-tighter ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                {trade.symbol}
              </span>
              <div className="flex flex-col gap-1 justify-center">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Pos:</span>
                    <span className={`text-[12px] font-black ${trade.direction === 'UP' ? 'text-[#17A364]' : 'text-[#EF5350]'}`}>
                      {trade.direction === 'UP' ? 'YES' : 'NO'}
                    </span>
                  </span>
                  <span className="text-white/20 text-[10px]">|</span>
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Stake:</span>
                    <span className={`text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                      ${Number(trade.amount).toFixed(2)}
                    </span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onShare?.(trade); }}
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${isLight ? 'text-[#249C6C] hover:bg-[#249C6C]/10' : 'text-[#17A364] hover:bg-[#17A364]/10'}`}
                    title="Share Card"
                  >
                    <Share2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Out:</span>
                    {isActive ? (
                      <span className="text-[12px] font-black text-yellow-500 animate-pulse">PENDING</span>
                    ) : (
                      <span className={`text-[12px] font-black ${isWin ? 'text-[#17A364]' : 'text-[#EF5350]'}`}>
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
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${isLight ? 'text-[#249C6C] hover:bg-[#249C6C]/10' : 'text-[#17A364] hover:bg-[#17A364]/10'}`}
                          title="View on ArcScan"
                        >
                          <ExternalLink size={12} />
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
