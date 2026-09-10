import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, ArrowUp, ArrowDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';

const LOGO_MAP = {
  eth: '/ethusdc.png',
  btc: '/btc.png',
  sol: '/sol.png',
  mon: '/monad.png',
  avax: '/avax.png',
};

const SYMBOL_COLORS = {
  ETH: '#627EEA',
  BTC: '#F7931A',
  SOL: '#9945FF',
  MON: '#00D4AA',
  AVAX: '#E84142',
};

function getSymbolColor(sym) {
  const key = (sym || '').toUpperCase().replace('USDT', '');
  return SYMBOL_COLORS[key] || '#6B7280';
}

function getLogo(sym) {
  const key = (sym || '').toLowerCase().replace('usdt', '');
  return LOGO_MAP[key] || null;
}

export default function TradeShareCard({ isOpen, onClose, trade, userProfile, theme }) {
  const cardRef = useRef(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const isWin = trade?.status === 'WON' || trade?.payout > 0;
  const isUp = trade?.direction === 'UP';
  const sym = (trade?.symbol || '').toUpperCase().replace('USDT', '');
  const username = userProfile?.username || 'Trader';
  const address = trade?.userPublicKey || trade?.owner || '';
  const truncatedAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  const txHash = trade?.tx || trade?.txHash || trade?.stakeTxHash || '';
  const tradeId = trade?.id || trade?.nonce || '';
  const logoSrc = getLogo(sym);

  useEffect(() => {
    if (isOpen && trade) {
      const verifyUrl = `https://15market.com/verify/${tradeId}`;
      QRCode.toDataURL(verifyUrl, {
        width: 100,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M'
      }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
    }
  }, [isOpen, trade, tradeId]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, backgroundColor: '#0a0a0a' });
      const link = document.createElement('a');
      link.download = `15market-${isWin ? 'win' : 'loss'}-${tradeId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleNativeShare = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#0a0a0a' });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `15market-${isWin ? 'win' : 'loss'}.png`, { type: 'image/png' });
      if (navigator.share) {
        await navigator.share({ files: [file], title: `15market ${isWin ? 'Win' : 'Loss'}` });
      }
    } catch (err) {
      handleDownload();
    }
  };

  if (!trade) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[520px]"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: '"Comfortaa", cursive' }}
          >
            <button
              onClick={onClose}
              className="absolute -top-3 -right-3 z-20 w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <X size={18} />
            </button>

            {/* Landscape Card */}
            <div
              ref={cardRef}
              className="relative rounded-3xl"
              style={{
                width: 520,
                height: 300,
                background: 'linear-gradient(145deg, #0a0a0a 0%, #111118 40%, #0a0a0a 100%)',
                fontFamily: '"Comfortaa", cursive'
              }}
            >
              {/* Ambient Glow */}
              <div
                className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-[100px] opacity-25"
                style={{ backgroundColor: isWin ? '#17A364' : '#EF5350' }}
              />
              <div
                className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-[100px] opacity-15"
                style={{ backgroundColor: isWin ? '#17A364' : '#EF5350' }}
              />





              {/* Weave Pattern - Upper Right */}
              <div className="absolute top-2 right-2 pointer-events-none select-none z-0">
                <svg width="110" height="110" viewBox="0 0 110 110" className="opacity-[0.07]">
                  {isWin ? (
                    <>
                      {/* Tight upward weave - bullish */}
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <g key={i}>
                          <path
                            d={`M${10 + i * 13} 105 C${10 + i * 13} 85, ${20 + i * 13} 75, ${10 + i * 13} 60 C${10 + i * 13} 45, ${20 + i * 13} 35, ${10 + i * 13} 15 C${10 + i * 13} 5, ${15 + i * 13} 0, ${15 + i * 13} 0`}
                            fill="none"
                            stroke="#17A364"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          <path
                            d={`M${16 + i * 13} 105 C${16 + i * 13} 85, ${6 + i * 13} 75, ${16 + i * 13} 60 C${16 + i * 13} 45, ${6 + i * 13} 35, ${16 + i * 13} 15 C${16 + i * 13} 5, ${11 + i * 13} 0, ${11 + i * 13} 0`}
                            fill="none"
                            stroke="#17A364"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </g>
                      ))}
                      {/* Upward arrows woven in */}
                      {[20, 50, 80].map((y, i) => (
                        <path
                          key={`arrow-${i}`}
                          d={`M${30 + i * 20} ${y + 8} L${30 + i * 20} ${y} M${24 + i * 20} ${y + 5} L${30 + i * 20} ${y} L${36 + i * 20} ${y + 5}`}
                          fill="none"
                          stroke="#17A364"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      {/* Frayed broken weave - bearish */}
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <g key={i} opacity="0.6">
                          <path
                            d={`M${10 + i * 13} 105 C${10 + i * 13} 85, ${20 + i * 13} 75, ${10 + i * 13} 65`}
                            fill="none"
                            stroke="#EF5350"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          <path
                            d={`M${16 + i * 13} 105 C${16 + i * 13} 85, ${6 + i * 13} 75, ${16 + i * 13} 65`}
                            fill="none"
                            stroke="#EF5350"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          {/* Broken frayed ends */}
                          <line
                            x1={10 + i * 13}
                            y1={65}
                            x2={10 + i * 13 + (i % 2 === 0 ? 4 : -4)}
                            y2={58}
                            stroke="#EF5350"
                            strokeWidth="2"
                            strokeLinecap="round"
                            opacity="0.5"
                          />
                          <line
                            x1={16 + i * 13}
                            y1={65}
                            x2={16 + i * 13 + (i % 2 === 0 ? -3 : 5)}
                            y2={56}
                            stroke="#EF5350"
                            strokeWidth="2"
                            strokeLinecap="round"
                            opacity="0.4"
                          />
                        </g>
                      ))}
                      {/* Scattered loose threads */}
                      <line x1="35" y1="40" x2="42" y2="32" stroke="#EF5350" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
                      <line x1="60" y1="35" x2="55" y2="28" stroke="#EF5350" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
                      <line x1="80" y1="45" x2="88" y2="38" stroke="#EF5350" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
                    </>
                  )}
                </svg>
              </div>

              {/* Top Row */}
              <div className="relative z-10 flex items-center justify-between px-7 pt-5">
                <div className="w-0 h-0">
                  <img src="/gowlogo.png" alt="15market" className="h-[80px] w-auto brightness-0 invert absolute left-7 -top-1" style={{ pointerEvents: 'none' }} />
                </div>
              </div>

              {/* Main Content */}
              <div className="relative z-10 flex items-stretch gap-4 px-7 pt-12 pb-2">
                {/* Left: Asset + Amount + Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  {/* Asset with big logo */}
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex items-center justify-center">
                      {logoSrc ? (
                        <img src={logoSrc} alt={sym} className="w-12 h-12 object-contain brightness-0 invert" />
                      ) : (
                        <span className="text-white font-black text-2xl">{sym}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-white text-[17px] font-bold">{sym}/USDC</div>
                      <div className="flex items-center gap-2">
                        {isUp ? <ArrowUp size={13} className="text-[#17A364]" /> : <ArrowDown size={13} className="text-[#EF5350]" />}
                        <span className={`text-[13px] font-bold ${isUp ? 'text-[#17A364]' : 'text-[#EF5350]'}`}>
                          {isUp ? 'YES' : 'NO'}
                        </span>
                        <span className="text-white/15 text-[10px]">|</span>
                        <span className="text-white/40 text-[12px] font-bold">{trade.duration || 15}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Big Amount */}
                  <div className="my-2">
                    <div
                      className="text-[52px] font-black leading-none tracking-tighter"
                      style={{
                        color: isWin ? '#17A364' : '#EF5350',
                        textShadow: isWin ? '0 0 30px rgba(23,163,100,0.3)' : '0 0 30px rgba(239,83,80,0.3)'
                      }}
                    >
                      {isWin ? '+' : '-'}${Number(isWin ? (trade.payout || 0) : (trade.amount || 0)).toFixed(2)}
                    </div>
                  </div>

                  {/* Details Row */}
                  <div className="flex items-center gap-0 px-1 py-1 mt-auto">
                    <div className="flex-1">
                      <div className="text-white/25 text-[8px] font-bold uppercase tracking-widest">Stake</div>
                      <div className="text-white text-[13px] font-bold">${Number(trade.amount || 0).toFixed(2)}</div>
                    </div>
                    <div className="w-px h-5 bg-white/10 mx-3" />
                    <div className="flex-1">
                      <div className="text-white/25 text-[8px] font-bold uppercase tracking-widest">Entry</div>
                      <div className="text-white text-[13px] font-bold">${Number(trade.entryPrice || 0).toFixed(2)}</div>
                    </div>
                    <div className="w-px h-5 bg-white/10 mx-3" />
                    <div className="flex-1">
                      <div className="text-white/25 text-[8px] font-bold uppercase tracking-widest">Exit</div>
                      <div className="text-white text-[13px] font-bold">${Number(trade.exitPrice || trade.settlementPrice || 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                {/* Right spacer for banner */}
                <div className="w-[130px] shrink-0" />
              </div>

              {/* Vertical Banner - Straight rectangle, no rounded corners */}
              <div
                className="absolute right-[52px] top-0 bottom-0 w-[90px] overflow-hidden"
                style={{
                  background: isWin
                    ? 'linear-gradient(180deg, #17A364 0%, #0d6b42 100%)'
                    : 'linear-gradient(180deg, #EF5350 0%, #c62828 100%)'
                }}
              >
                {/* Carbon fibre texture */}
                <div className="absolute inset-0 opacity-[0.15] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
              </div>

              {/* QR Code with outline - cuts the banner */}
              <div className="absolute right-[28px] top-1/2 -translate-y-[48%] z-20 flex flex-col items-center">
                {/* QR outline border */}
                <div
                  className="rounded-2xl p-[3px]"
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: '2px solid rgba(255,255,255,0.2)',
                  }}
                >
                  {/* QR white background */}
                  <div className="bg-white rounded-xl p-2 shadow-xl" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Verify" className="w-[88px] h-[88px]" />
                    ) : (
                      <div className="w-[88px] h-[88px] bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400 text-[10px]">QR</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* TRADE ID below QR on banner */}
                <div className="mt-2 text-center">
                  <div className="text-white/80 text-[6px] font-bold tracking-widest uppercase">Trade ID</div>
                  <div className="flex flex-col items-center gap-px mt-1">
                    {(() => {
                      const id = String(tradeId || '');
                      const chunks = [];
                      for (let i = 0; i < id.length; i += 4) {
                        chunks.push(id.slice(i, i + 4));
                      }
                      return chunks.map((chunk, i) => (
                        <div key={i} className="text-white text-[10px] font-black tracking-[0.12em]" style={{ fontFamily: '"Courier New", monospace' }}>
                          {chunk}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Bottom Bar */}
              <div className="absolute bottom-0 left-0 right-0 px-7 pb-4 flex items-center justify-center">
                <div className="text-white/15 text-[8px]">
                  {trade.timestamp ? new Date(trade.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </div>
              </div>

              {/* Border */}
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{ border: `1px solid ${isWin ? 'rgba(23,163,100,0.12)' : 'rgba(239,83,80,0.12)'}` }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={handleNativeShare}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[12px] font-bold text-white transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: '#17A364', fontFamily: '"Comfortaa", cursive' }}
              >
                <Share2 size={14} />
                Share
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 transition-all hover:scale-105 active:scale-95"
                style={{ fontFamily: '"Comfortaa", cursive' }}
              >
                <Download size={14} />
                Save Card
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
