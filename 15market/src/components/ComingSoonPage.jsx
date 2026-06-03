import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
// Placeholder: copy the generated mascot image to src/assets/mascot.png
import mascot from "../assets/mascot.png";

export default function ComingSoonPage({ onBack, theme }) {
  const isLight = theme === 'light';
  return (
    <div className={`w-full min-h-screen ${isLight ? 'bg-[#f8fcf9] text-[#0a261a]' : 'bg-[#05120d] text-white'} flex flex-col items-center justify-center p-4`} style={{ fontFamily: '"Comfortaa", cursive' }}>
      {/* Back button */}
      <button
        onClick={onBack}
        className={`absolute top-4 left-4 p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} transition-all`}
        title="Back"
      >
        <ArrowLeft size={24} className={isLight ? 'text-black' : 'text-white'} />
      </button>

      {/* Mascot */}
      <motion.img
        src={mascot}
        alt="Mascot"
        className="w-64 h-64 mb-8"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: [0, -5, 5, 0] }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Message */}
      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-wider mb-4 text-center">
        Coming Soon
      </h1>
      <p className={`text-center ${isLight ? 'text-black/70' : 'text-white/70'} max-w-md`}>We’re working hard to bring this feature to life. Stay tuned!</p>
    </div>
  );
}
