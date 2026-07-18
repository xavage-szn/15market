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

export default function SuccessOverlay({ show, title = 'WITHDRAWAL SUCCESSFUL', subtitle, amount, onDone }) {
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
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Content */}
      <motion.div
        className="relative flex flex-col items-center gap-5 px-10 py-10 rounded-[28px] border border-white/10 shadow-2xl"
        style={{ background: 'linear-gradient(145deg, #0d1f15 0%, #133a2a 100%)' }}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25, delay: 0.05 }}
      >
        {/* Logo */}
        <motion.img
          src="/gowlogo.png"
          alt="15Market"
          className="w-14 h-14 object-contain"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
        />

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

        {/* Amount */}
        {amount !== undefined && amount !== null && (
          <motion.p
            className="text-[#249C6C] font-bold text-2xl md:text-3xl"
            style={{ fontFamily: '"Comfortaa", cursive' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.35 }}
          >
            {typeof amount === 'number' ? `$${amount.toFixed(2)}` : amount}
          </motion.p>
        )}

        {/* Subtitle */}
        {subtitle && (
          <motion.p
            className="text-white/50 text-[10px] md:text-xs uppercase tracking-[0.2em] text-center"
            style={{ fontFamily: '"Comfortaa", cursive' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65, duration: 0.3 }}
          >
            {subtitle}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}
