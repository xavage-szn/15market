import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WalletConnectionLoading = ({ onFinish }) => {
    const [dots, setDots] = useState([]);

    useEffect(() => {
        const timer = setTimeout(() => {
            onFinish();
        }, 5500); // Slightly more than 5s to ensure clean exit
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
            className="fixed inset-0 z-[9999] bg-[#050505] flex items-center justify-center overflow-hidden"
        >
            {/* Background Grain/Texture for Premium Feel */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            
            <div className="relative flex items-center gap-4 md:gap-8">
                {/* 1. Logo Fades Up */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="flex items-center"
                >
                    <img src="/logo.SVG" alt="15market" className="h-12 md:h-16 lg:h-20 w-auto drop-shadow-[0_0_30px_rgba(60,179,113,0.3)]" />
                </motion.div>

                {/* 2. Two Lines (//) Fade In from Right */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                    className="flex items-center gap-1"
                >
                    <motion.span 
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="text-4xl md:text-6xl font-thin text-[#3CB371] italic"
                    >
                        /
                    </motion.span>
                    <motion.span 
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="text-4xl md:text-6xl font-thin text-[#3CB371] italic"
                    >
                        /
                    </motion.span>
                </motion.div>

                {/* 3. "Loading" Types In */}
                <div className="flex items-baseline gap-1">
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.4, duration: 0.4 }}
                        className="text-2xl md:text-4xl font-black text-white uppercase tracking-[0.2em]"
                    >
                        {"LOADING".split("").map((char, i) => (
                            <motion.span
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.4 + (i * 0.1) }}
                            >
                                {char}
                            </motion.span>
                        ))}
                    </motion.span>

                    {/* 4. Three dots dropping like balls */}
                    <div className="flex items-center gap-2 ml-2 h-8">
                        <AnimatePresence>
                            {[0, 1, 2].map((i) => (
                                <motion.div
                                    key={i}
                                    initial={{ y: -40, opacity: 0 }}
                                    animate={{ 
                                        y: 0, 
                                        opacity: 1,
                                        transition: { 
                                            delay: 2.5 + (i * 0.3),
                                            type: "spring",
                                            stiffness: 300,
                                            damping: 10
                                        }
                                    }}
                                    className="w-2 h-2 rounded-full bg-[#3CB371] shadow-[0_0_10px_rgba(60,179,113,0.8)]"
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Subtle Progress bar at the bottom */}
            <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 5, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-[#3CB371] to-transparent opacity-50"
            />
        </motion.div>
    );
};

export default WalletConnectionLoading;
