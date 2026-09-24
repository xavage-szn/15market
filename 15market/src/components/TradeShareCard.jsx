import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, ArrowUp, ArrowDown, Copy, Check } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved'

  const handleCopyTradeId = (e) => {
    e?.stopPropagation?.();
    const idToCopy = String(trade?.id || trade?.nonce || '');
    if (!idToCopy) return;
    navigator.clipboard?.writeText(idToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

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
      import('qrcode').then(QRCode => {
        QRCode.default.toDataURL(verifyUrl, {
          width: 100,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M'
        }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
      }).catch(() => setQrDataUrl(''));
    }
    return () => { setSaveState(null); };
  }, [isOpen, trade, tradeId]);

  const captureCard = async () => {
    const el = cardRef.current;
    if (!el) return null;

    const { toPng } = await import('html-to-image');

    const imgs = el.querySelectorAll('img');
    const conversions = Array.from(imgs).map(img => {
      if (img.src && !img.src.startsWith('data:')) {
        return fetch(img.src)
          .then(r => r.blob())
          .then(blob => new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => { img.src = reader.result; resolve(); };
            reader.readAsDataURL(blob);
          }))
          .catch(() => {});
      }
      return Promise.resolve();
    });
    await Promise.all(conversions);
    await new Promise(r => setTimeout(r, 100));

    const s = el.style;
    const saved = {
      width: s.width, height: s.height, aspectRatio: s.aspectRatio,
      borderRadius: s.borderRadius, transform: s.transform,
    };
    s.width = '520px';
    s.height = '300px';
    s.aspectRatio = 'auto';
    s.borderRadius = '0';
    s.transform = 'none';

    await new Promise(r => setTimeout(r, 100));

    try {
      return await toPng(el, {
        width: 520,
        height: 300,
        pixelRatio: 2,
        backgroundColor: '#0a0a0a',
        cacheBust: true,
        filter: (node) => !node.classList?.contains('copy-id-btn'),
      });
    } finally {
      Object.assign(s, saved);
    }
  };

  const handleDownload = async () => {
    if (saveState) return;
    setSaveState('saving');
    try {
      const dataUrl = await captureCard();
      if (!dataUrl) { setSaveState(null); return; }
      const link = document.createElement('a');
      link.download = `15market-${isWin ? 'win' : 'loss'}-${tradeId}.png`;
      link.href = dataUrl;
      link.click();
      setSaveState('saved');
      setTimeout(() => { setSaveState(null); onClose(); }, 1500);
    } catch {
      setSaveState(null);
    }
  };

  const handleNativeShare = async () => {
    if (saveState) return;
    setSaveState('saving');
    try {
      const dataUrl = await captureCard();
      if (!dataUrl) { setSaveState(null); return; }
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `15market-${isWin ? 'win' : 'loss'}.png`, { type: 'image/png' });
        if (navigator.share) {
          await navigator.share({ files: [file], title: `15market ${isWin ? 'Win' : 'Loss'}` });
          setSaveState('saved');
          setTimeout(() => { setSaveState(null); onClose(); }, 1500);
          return;
        }
      } catch {}
      // Fallback: download directly
      const link = document.createElement('a');
      link.download = `15market-${isWin ? 'win' : 'loss'}-${tradeId}.png`;
      link.href = dataUrl;
      link.click();
      setSaveState('saved');
      setTimeout(() => { setSaveState(null); onClose(); }, 1500);
    } catch {
      setSaveState(null);
    }
  };

  if (!trade) return null;

  const accent = isWin ? '#00FF88' : '#FF1744';
  const accentMid = isWin ? '#17A364' : '#D50000';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
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
              className="relative rounded-3xl overflow-hidden"
              style={{
                width: '100%',
                aspectRatio: '520 / 300',
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

              {/* Background SVG */}
              <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden rounded-3xl opacity-[0.45]">
                <svg width="100%" height="100%" viewBox="0 0 520 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                  <defs>
                    <radialGradient id="fadedCyberAura" cx="60%" cy="20%" r="60%">
                      <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
                      <stop offset="45%" stopColor={accentMid} stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="fadedTraceGrad" x1="140" y1="20" x2="480" y2="90" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor={accent} stopOpacity="0" />
                      <stop offset="35%" stopColor={accent} stopOpacity="0.45" />
                      <stop offset="70%" stopColor={accentMid} stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="sciFiLogoSideMask" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#000000" stopOpacity="1" />
                      <stop offset="24%" stopColor="#000000" stopOpacity="1" />
                      <stop offset="40%" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="85%" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="sciFiDownwardMask" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="30%" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="55%" stopColor="#ffffff" stopOpacity="0.3" />
                      <stop offset="72%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                    <mask id="deepFadedSciFiMask">
                      <rect x="0" y="0" width="520" height="300" fill="url(#sciFiDownwardMask)" />
                      <rect x="0" y="0" width="520" height="300" fill="url(#sciFiLogoSideMask)" style={{ mixBlendMode: 'multiply' }} />
                    </mask>
                  </defs>
                  <g mask="url(#deepFadedSciFiMask)">
                    <ellipse cx="270" cy="50" rx="230" ry="110" fill="url(#fadedCyberAura)" />
                    <g opacity="0.07">
                      {[15, 35, 60, 90, 125, 160].map((y, idx) => (
                        <line key={`faded-hgrid-${idx}`} x1="130" y1={y} x2="490" y2={y} stroke={accent} strokeWidth="0.5" />
                      ))}
                      {[90, 140, 190, 240, 290, 340, 390, 440].map((x, idx) => (
                        <line key={`faded-vgrid-${idx}`} x1={x} y1="0" x2={x + 55} y2="165" stroke={accent} strokeWidth="0.5" />
                      ))}
                    </g>
                    <g opacity="0.35">
                      <path d="M 140 25 L 195 25 L 225 55 L 350 55 L 380 25 L 475 25" stroke="url(#fadedTraceGrad)" strokeWidth="1" fill="none" />
                      <path d="M 160 70 L 210 70 L 230 90 L 320 90 L 345 65 L 430 65" stroke="url(#fadedTraceGrad)" strokeWidth="0.75" strokeDasharray="4 6" fill="none" />
                    </g>
                  </g>
                </svg>
              </div>

              {/* Top Row - Logo */}
              <div className="absolute top-0 left-0 right-0 z-10 px-[4%] pt-[4%]">
                <img src="/gowlogo.png" alt="15market" className="h-[50px] sm:h-[80px] w-auto brightness-0 invert" style={{ pointerEvents: 'none' }} />
              </div>

              {/* Main Content */}
              <div className="relative z-10 flex items-stretch h-full">
                {/* Left: Asset + Amount + Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-center pl-[4%] pr-[30%] pt-[18%] pb-[4%]">
                  {/* Asset logo + ticker */}
                  <div className="flex items-center gap-2 mb-[2%]">
                    {logoSrc ? (
                      <img src={logoSrc} alt={sym} className="h-[30px] sm:h-[50px] w-auto object-contain brightness-0 invert" />
                    ) : (
                      <span className="text-white font-black text-lg sm:text-2xl">{sym}</span>
                    )}
                    <div>
                      <div className="text-white text-[10px] sm:text-[15px] font-bold">{sym}/USDC</div>
                      <div className="flex items-center gap-1.5">
                        {isUp ? <ArrowUp size={9} className="text-[#17A364]" /> : <ArrowDown size={9} className="text-[#EF5350]" />}
                        <span className={`text-[9px] sm:text-[12px] font-bold ${isUp ? 'text-[#17A364]' : 'text-[#EF5350]'}`}>
                          {isUp ? 'YES' : 'NO'}
                        </span>
                        <span className="text-white/15 text-[7px]">|</span>
                        <span className="text-white/40 text-[8px] sm:text-[11px] font-bold">{trade.duration || 15}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Big Amount */}
                  <div className="my-[1%]">
                    <div
                      className="text-[28px] sm:text-[52px] font-black leading-none tracking-tighter"
                      style={{
                        color: isWin ? '#17A364' : '#EF5350',
                        textShadow: isWin ? '0 0 30px rgba(23,163,100,0.3)' : '0 0 30px rgba(239,83,80,0.3)'
                      }}
                    >
                      {isWin ? '+' : '-'}${Number(isWin ? (trade.payout || 0) : (trade.amount || 0)).toFixed(2)}
                    </div>
                  </div>

                  {/* Details Row */}
                  <div className="flex items-center gap-0 mt-auto">
                    <div className="flex-1">
                      <div className="text-white/25 text-[5px] sm:text-[8px] font-bold uppercase tracking-widest">Stake</div>
                      <div className="text-white text-[8px] sm:text-[13px] font-bold">${Number(trade.amount || 0).toFixed(2)}</div>
                    </div>
                    <div className="w-px h-3 sm:h-5 bg-white/10 mx-1.5 sm:mx-3" />
                    <div className="flex-1">
                      <div className="text-white/25 text-[5px] sm:text-[8px] font-bold uppercase tracking-widest">Entry</div>
                      <div className="text-white text-[8px] sm:text-[13px] font-bold">${Number(trade.entryPrice || 0).toFixed(2)}</div>
                    </div>
                    <div className="w-px h-3 sm:h-5 bg-white/10 mx-1.5 sm:mx-3" />
                    <div className="flex-1">
                      <div className="text-white/25 text-[5px] sm:text-[8px] font-bold uppercase tracking-widest">Exit</div>
                      <div className="text-white text-[8px] sm:text-[13px] font-bold">${Number(trade.exitPrice || trade.settlementPrice || 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                {/* Vertical Banner */}
                <div
                  className="absolute right-[28%] sm:right-[28%] top-0 bottom-0 w-[50px] sm:w-[90px] overflow-hidden flex flex-col items-center"
                  style={{
                    background: isWin
                      ? 'linear-gradient(180deg, #17A364 0%, #0d6b42 100%)'
                      : 'linear-gradient(180deg, #EF5350 0%, #c62828 100%)',
                    boxShadow: '-10px 0 30px rgba(0,0,0,0.7), 10px 0 30px rgba(0,0,0,0.7)',
                  }}
                >
                  <div className="absolute inset-0 opacity-[0.15] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                  <div className="pt-2 sm:pt-3 -mt-[6.2%] text-center z-10 select-none">
                    <span
                      className="text-white font-black text-[8px] sm:text-[13px] tracking-[0.22em] uppercase drop-shadow-sm"
                      style={{
                        fontFamily: '"Comfortaa", cursive',
                        filter: isWin ? 'drop-shadow(0 0 10px rgba(23,163,100,0.8))' : 'drop-shadow(0 0 10px rgba(239,83,80,0.8))'
                      }}
                    >
                      {isWin ? 'WON' : 'LOST'}
                    </span>
                  </div>
                </div>

                {/* QR Code */}
                <div
                  className="absolute right-[12%] sm:right-[14%] top-1/2 translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
                  style={{ fontFamily: '"Comfortaa", cursive' }}
                >
                  <div className="rounded-xl sm:rounded-2xl p-[2px] sm:p-[3px]" style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                    <div className="bg-white rounded-lg sm:rounded-xl p-1.5 sm:p-2 shadow-xl" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="Verify" className="w-[40px] h-[40px] sm:w-[88px] sm:h-[88px]" />
                      ) : (
                        <div className="w-[40px] h-[40px] sm:w-[88px] sm:h-[88px] bg-gray-100 rounded-lg flex items-center justify-center">
                          <span className="text-gray-400 text-[6px] sm:text-[10px]">QR</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 sm:mt-2 text-center w-full">
                    <div className="text-white/80 text-[4px] sm:text-[7px] font-bold tracking-widest uppercase" style={{ fontFamily: '"Comfortaa", cursive' }}>
                      Trade ID
                    </div>
                    <div className="flex flex-col items-center gap-0 mt-0.5 w-full">
                      {(() => {
                        const id = String(tradeId || '');
                        const chunks = [];
                        for (let i = 0; i < id.length; i += 4) chunks.push(id.slice(i, i + 4));
                        return chunks.map((chunk, i) => (
                          <div key={i} className="text-white text-[7px] sm:text-[13px] font-black tracking-[0.16em] leading-tight" style={{ fontFamily: '"Comfortaa", cursive' }}>
                            {chunk}
                          </div>
                        ));
                      })()}
                    </div>
                    {trade.timestamp && (
                      <div className="text-white/70 text-[4px] sm:text-[7px] font-bold tracking-widest mt-0.5 sm:mt-1.5 uppercase" style={{ fontFamily: '"Comfortaa", cursive' }}>
                        {new Date(trade.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                    <button
                      onClick={handleCopyTradeId}
                      className="copy-id-btn mt-0.5 sm:mt-1.5 inline-flex items-center justify-center gap-0.5 text-white/80 hover:text-white transition-all active:scale-95 bg-white/10 hover:bg-white/20 px-1.5 sm:px-2 py-0.5 rounded-full"
                      title="Copy Trade ID"
                    >
                      {copied ? (
                        <>
                          <Check size={6} className="text-white" />
                          <span className="text-[4px] sm:text-[7px] font-bold tracking-wider uppercase text-white">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={6} className="text-white/80" />
                          <span className="text-[4px] sm:text-[7px] font-bold tracking-wider uppercase text-white/80">Copy ID</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Save Confirmation Overlay */}
              <AnimatePresence>
                {saveState === 'saved' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-3xl"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                    >
                      <Check size={48} className="text-[#17A364]" strokeWidth={3} />
                    </motion.div>
                    <motion.span
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-white text-[14px] font-bold mt-3"
                      style={{ fontFamily: '"Comfortaa", cursive' }}
                    >
                      Saved!
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 mt-4 sm:mt-5">
              <button
                onClick={handleNativeShare}
                disabled={!!saveState}
                className="flex items-center gap-2 px-5 sm:px-6 py-2 sm:py-2.5 rounded-full text-[11px] sm:text-[12px] font-bold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: '#17A364', fontFamily: '"Comfortaa", cursive' }}
              >
                {saveState === 'saving' ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <Share2 size={13} />
                )}
                Share
              </button>
              <button
                onClick={handleDownload}
                disabled={!!saveState}
                className="flex items-center gap-2 px-5 sm:px-6 py-2 sm:py-2.5 rounded-full bg-white/10 text-white text-[11px] sm:text-[12px] font-bold hover:bg-white/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{ fontFamily: '"Comfortaa", cursive' }}
              >
                {saveState === 'saving' ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <Download size={13} />
                )}
                Save Card
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
