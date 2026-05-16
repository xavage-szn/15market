import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WalletConnectionLoading = ({ onFinish, theme = 'dark' }) => {
    const isLight = theme === 'light';
    const [dots, setDots] = useState([]);

    useEffect(() => {
        const timer = setTimeout(() => {
            onFinish();
        }, 1200); // Exactly 1.2s
        return () => clearTimeout(timer);
    }, [onFinish]);

    // Ball drop logic for the three dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => {
                if (prev.length >= 3) return []; // Reset loop
                return [...prev, Date.now()];
            });
        }, 600);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden ${isLight ? 'bg-white' : 'bg-[#050505]'}`}
        >
            <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            
            <div className="relative flex items-center gap-0">
                {/* 1. Logo Fades Up */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="flex items-center"
                >
                    <img src={isLight ? "/goblogo.png" : "/gowlogo.png"} alt="15market" className="h-[72px] md:h-[100px] w-auto drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" />
                </motion.div>

                {/* 2. Two Lines (//) Fade In from Right */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                    className="flex items-center gap-0 -translate-y-14 md:-translate-y-20 -ml-2 z-10 relative"
                >
                    <motion.span 
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className={`text-3xl md:text-4xl font-light select-none ${isLight ? 'text-black/90' : 'text-white/90'}`}
                    >
                        /
                    </motion.span>
                    <motion.span 
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className={`text-3xl md:text-4xl font-light select-none -ml-1 ${isLight ? 'text-black/90' : 'text-white/90'}`}
                    >
                        /
                    </motion.span>
                </motion.div>

                {/* 3. "Loading" Types In */}
                <div className="flex items-baseline ml-1.5 gap-1">
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.4, duration: 0.4 }}
                        className={`text-[17px] font-medium tracking-tight ${isLight ? 'text-black' : 'text-white'}`}
                        style={{ fontFamily: '"Comfortaa", cursive' }}
                    >
                        Loading
                    </motion.span>
                    <div className="flex items-baseline gap-1 ml-0.5">
                        {[0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                animate={{ 
                                    opacity: [0.2, 1, 0.2],
                                }}
                                transition={{ 
                                    repeat: Infinity, 
                                    duration: 1.5, 
                                    delay: 1.6 + (i * 0.2),
                                    ease: "easeInOut" 
                                }}
                                className={`w-[5px] h-[5px] rounded-full ${isLight ? 'bg-black/40 shadow-[0_0_8px_rgba(0,0,0,0.1)]' : 'bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.3)]'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Subtle Progress bar at the bottom */}
            <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.2, ease: "linear" }}
                className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent ${isLight ? 'via-black' : 'via-white'} to-transparent opacity-50`}
            />
        </motion.div>
    );
};

export default WalletConnectionLoading;
