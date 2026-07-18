import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

const CheckmarkSVG = () => (
  <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
    <motion.circle
      cx="36" cy="36" r="32"
      stroke="#249C6C"
      strokeWidth="3"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
    <motion.path
      d="M22 36 L32 46 L50 26"
      stroke="#249C6C"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
    />
  </svg>
);

export default function SuccessOverlay({ show, title = 'WITHDRAWAL SUCCESSFUL', onDone }) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      if (onDone) onDone();
    }, 3000);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Backdrop blur only */}
      <motion.div
        className="absolute inset-0 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Close button — same dashed X as wallet disconnect */}
      <motion.button
        onClick={onDone}
        className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors cursor-pointer z-[10001]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <svg width="21" height="21" viewBox="0 0 12 12" fill="none">
          <path d="M1 1L11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
          <path d="M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
        </svg>
      </motion.button>

      {/* Content — no card, just animation + text over blur */}
      <motion.div
        className="relative flex flex-col items-center gap-5"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25, delay: 0.05 }}
      >
        {/* Animated Checkmark */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.25 }}
        >
          <CheckmarkSVG />
        </motion.div>

        {/* Title */}
        <motion.p
          style={{ fontFamily: '"Comfortaa", cursive' }}
          className="text-white font-black text-sm md:text-base uppercase tracking-[0.25em] text-center leading-snug"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.35 }}
        >
          {title}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
