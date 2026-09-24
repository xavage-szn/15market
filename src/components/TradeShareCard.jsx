import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, ArrowUp, ArrowDown, Copy, Check } from 'lucide-react';

const LOGO_MAP = { eth: '/ethusdc.png', btc: '/btc.png', sol: '/sol.png', mon: '/monad.png', avax: '/avax.png' };
const SYMBOL_COLORS = { ETH: '#627EEA', BTC: '#F7931A', SOL: '#9945FF', MON: '#00D4AA', AVAX: '#E84142' };
const getLogo = (symbol) => LOGO_MAP[String(symbol || '').toLowerCase().replace('usdt', '')] || null;

// html-to-image can race image loading, especially on mobile. Inline local images before
// cloning the node so the exported canvas contains the exact same pixels as the card.
const inlineImage = async (img) => {
  const src = img.getAttribute('src');
  if (!src || src.startsWith('data:') || /^blob:/i.test(src)) return null;
  try {
    const response = await fetch(new URL(src, window.location.href).href, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
};

export default function TradeShareCard({ isOpen, onClose, trade, userProfile }) {
  const cardRef = useRef(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const isWin = trade?.status === 'WON' || Number(trade?.payout) > 0;
  const isUp = trade?.direction === 'UP';
  const sym = String(trade?.symbol || '').toUpperCase().replace('USDT', '');
  const logoSrc = getLogo(sym);
  const tradeId = trade?.id || trade?.nonce || '';
  const address = trade?.userPublicKey || trade?.owner || '';

  useEffect(() => {
    if (!isOpen || !trade) return;
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(`https://15market.com/verify/${tradeId}`, {
      width: 100, margin: 1, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: 'M'
    })).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [isOpen, trade, tradeId]);

  const handleCopyTradeId = (event) => {
    event?.stopPropagation?.();
    navigator.clipboard?.writeText(String(tradeId)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const captureCard = async () => {
    const element = cardRef.current;
    if (!element) return null;
    const { toPng } = await import('html-to-image');
    const style = element.style;
    const savedStyle = { width: style.width, height: style.height, aspectRatio: style.aspectRatio, borderRadius: style.borderRadius, transform: style.transform };
    const images = [...element.querySelectorAll('img')];
    const originalSources = images.map((img) => img.getAttribute('src'));
    style.width = '520px'; style.height = '300px'; style.aspectRatio = 'auto'; style.borderRadius = '0'; style.transform = 'none';
    try {
      // Decode every image and replace local URLs with data URLs. This avoids missing
      // logos caused by a clone occurring before the browser has decoded the image.
      await Promise.all(images.map(async (img) => {
        if (!img.complete) await new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); });
        try { await img.decode?.(); } catch {}
        const dataUrl = await inlineImage(img);
        if (dataUrl) img.src = dataUrl;
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return await toPng(element, {
        width: 520, height: 300, pixelRatio: 2, backgroundColor: '#0a0a0a', cacheBust: true,
        imagePlaceholder: '', filter: (node) => !node.classList?.contains('copy-id-btn')
      });
    } finally {
      images.forEach((img, index) => { if (originalSources[index]) img.src = originalSources[index]; });
      Object.assign(style, savedStyle);
    }
  };

  const handleDownload = async () => {
    const dataUrl = await captureCard();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `15market-${isWin ? 'win' : 'loss'}-${tradeId}.png`;
    link.href = dataUrl; link.click();
  };

  const handleNativeShare = async () => {
    try {
      const dataUrl = await captureCard();
      if (!dataUrl) return handleDownload();
      const blob = await (await fetch(dataUrl)).blob();
      if (navigator.share) await navigator.share({ files: [new File([blob], `15market-${isWin ? 'win' : 'loss'}.png`, { type: 'image/png' })], title: `15market ${isWin ? 'Win' : 'Loss'}` });
      else handleDownload();
    } catch { handleDownload(); }
  };

  if (!trade) return null;
  const accent = isWin ? '#17A364' : '#EF5350';
  const truncated = address ? `${String(address).slice(0, 6)}...${String(address).slice(-4)}` : '';
  return <AnimatePresence>{isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.85)' }} onClick={onClose}>
    <motion.div initial={{ scale: .9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .9, opacity: 0, y: 20 }} className="relative w-full max-w-[520px]" onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'Comfortaa, cursive' }}>
      <button onClick={onClose} className="absolute -top-3 -right-3 z-20 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"><X size={18} /></button>
      <div ref={cardRef} className="relative rounded-3xl overflow-hidden" style={{ width: '100%', aspectRatio: '520 / 300', background: 'linear-gradient(145deg,#0a0a0a,#111118 40%,#0a0a0a)' }}>
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-[100px] opacity-25" style={{ backgroundColor: accent }} />
        <div className="absolute top-0 left-0 z-10"><img src="/gowlogo.png" alt="15market" className="h-[80px] w-auto brightness-0 invert" /></div>
        <div className="relative z-10 flex items-stretch gap-4 px-4 pt-11 pb-2 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center"><img src={logoSrc || ''} alt={sym} className="h-[109px] w-auto object-contain brightness-0 invert" onError={(e) => { e.currentTarget.style.display = 'none'; }} />{!logoSrc && <span className="text-white font-black text-2xl">{sym}</span>}</div>
              <div><div className="text-white text-[17px] font-bold">{sym}/USDC</div><div className="flex items-center gap-2">{isUp ? <ArrowUp size={13} color="#17A364" /> : <ArrowDown size={13} color="#EF5350" />}<span className="text-[13px] font-bold" style={{ color: isUp ? '#17A364' : '#EF5350' }}>{isUp ? 'YES' : 'NO'}</span><span className="text-white/40 text-[12px] font-bold">{trade.duration || 15}s</span></div></div>
            </div>
            <div><div className="text-[52px] font-black leading-none" style={{ color: accent }}>{isWin ? '+' : '-'}${Number(isWin ? trade.payout || 0 : trade.amount || 0).toFixed(2)}</div><div className="flex gap-5 px-1 py-1 mt-5 text-white"><div><div className="text-white/30 text-[8px] uppercase">Stake</div><b>${Number(trade.amount || 0).toFixed(2)}</b></div><div><div className="text-white/30 text-[8px] uppercase">Entry</div><b>${Number(trade.entryPrice || 0).toFixed(2)}</b></div><div><div className="text-white/30 text-[8px] uppercase">Exit</div><b>${Number(trade.exitPrice || trade.settlementPrice || 0).toFixed(2)}</b></div></div></div>
          </div>
          <div className="absolute right-[52px] top-0 bottom-0 w-[90px] flex flex-col items-center pt-3" style={{ background: `linear-gradient(180deg,${accent},${isWin ? '#0d6b42' : '#c62828'})` }}><b className="text-white text-[13px] tracking-[.22em]">{isWin ? 'WON' : 'LOST'}</b><div className="absolute top-1/2 -translate-y-1/2 bg-white rounded-xl p-2">{qrDataUrl ? <img src={qrDataUrl} alt="Verify" className="w-[88px] h-[88px]" /> : <div className="w-[88px] h-[88px]" />}</div><div className="absolute bottom-5 text-center text-white"><div className="text-[7px] uppercase">Trade ID</div><div className="text-[12px] font-black tracking-widest">{String(tradeId).slice(0, 12)}</div><div className="text-[8px] opacity-70">{truncated}</div><button className="copy-id-btn mt-2 text-[7px]" onClick={handleCopyTradeId}>{copied ? <Check size={8} /> : <Copy size={8} />} {copied ? 'COPIED' : 'COPY ID'}</button></div></div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 mt-5"><button onClick={handleNativeShare} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#17A364' }}><Share2 size={14} />Share</button><button onClick={handleDownload} className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/10 text-white text-xs font-bold"><Download size={14} />Save Card</button></div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
