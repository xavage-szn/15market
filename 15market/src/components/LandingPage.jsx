import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UnifiedWalletButton } from "./UnifiedWalletButton";
import { ThemeToggle } from "./ThemeToggle";

const AnimatedIllustrationBackground = ({ theme }) => {
    const isLight = theme === 'light';
    return (
        <div className={`absolute inset-0 overflow-hidden z-0 pointer-events-none ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'} transition-colors duration-500`}>
            {/* Momentum Waves Illustration */}
            <svg className={`absolute inset-0 w-full h-full ${isLight ? 'opacity-40' : 'opacity-30'}`} viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3CB371" stopOpacity="0" />
                        <stop offset="50%" stopColor="#3CB371" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#3CB371" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {[...Array(6)].map((_, i) => (
                    <motion.path
                        key={i}
                        d={`M -100 ${400 + (i * 40)} Q 250 ${300 + (i * 20)} 500 ${400 + (i * 40)} T 1100 ${400 + (i * 40)}`}
                        stroke="url(#waveGrad)"
                        strokeWidth="2"
                        fill="none"
                        animate={{
                            d: [
                                `M -100 ${400 + (i * 40)} Q 250 ${300 + (Math.sin(i) * 50)} 500 ${400 + (i * 40)} T 1100 ${400 + (i * 40)}`,
                                `M -100 ${410 + (i * 40)} Q 250 ${400 + (Math.cos(i) * 50)} 500 ${390 + (i * 40)} T 1100 ${410 + (i * 40)}`,
                                `M -100 ${400 + (i * 40)} Q 250 ${300 + (Math.sin(i) * 50)} 500 ${400 + (i * 40)} T 1100 ${400 + (i * 40)}`,
                            ],
                        }}
                        transition={{
                            duration: 8 + (i * 2),
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                ))}
            </svg>

            {/* Data Streams */}
            <div className={`absolute inset-0 ${isLight ? 'opacity-30' : 'opacity-20'}`}>
                {[...Array(15)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ x: "-10%", y: `${Math.random() * 100}%`, opacity: 0 }}
                        animate={{
                            x: "110%",
                            opacity: [0, 1, 1, 0],
                        }}
                        transition={{
                            duration: 3 + Math.random() * 5,
                            repeat: Infinity,
                            delay: Math.random() * 10,
                            ease: "linear"
                        }}
                        className="absolute h-px w-32 bg-gradient-to-r from-transparent via-[#3CB371] to-transparent"
                    />
                ))}
            </div>

            {/* Cinematic Vignette & Grain */}
            <div className={`absolute inset-0 ${isLight ? 'bg-radial-vignette-light' : 'bg-radial-vignette'} pointer-events-none`} />
            <div 
                className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" 
                style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
                }} 
            />
        </div>
    );
};

export function LandingPage({ theme, onToggle }) {
    const isLight = theme === 'light';
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [displayText, setDisplayText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    
    const phrases = [
        "access the momentum market",
        "predict the direction of an asset and earn",
        "explore 15market"
    ];

    useEffect(() => {
        let timer;
        const currentPhrase = phrases[currentTextIndex];
        
        if (!isDeleting) {
            if (displayText.length < currentPhrase.length) {
                timer = setTimeout(() => {
                    setDisplayText(currentPhrase.substring(0, displayText.length + 1));
                }, 80);
            } else {
                timer = setTimeout(() => setIsDeleting(true), 2500);
            }
        } else {
            if (displayText.length > 0) {
                timer = setTimeout(() => {
                    setDisplayText(currentPhrase.substring(0, displayText.length - 1));
                }, 40);
            } else {
                setIsDeleting(false);
                setCurrentTextIndex((prev) => (prev + 1) % phrases.length);
            }
        }
        
        return () => clearTimeout(timer);
    }, [displayText, isDeleting, currentTextIndex]);

    return (
        <div className={`h-screen w-screen ${isLight ? 'bg-[#e2efea] text-[#0a261a]' : 'bg-[#050505] text-white'} overflow-hidden font-sans relative flex flex-col items-center selection:bg-[#3CB371]/30 transition-colors duration-500`}>
            <AnimatedIllustrationBackground theme={theme} />

            {/* Top Navigation - Minimal */}
            <nav className="w-full relative z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-8 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <img
                        src="/logo.SVG"
                        alt="15market"
                        className={`h-16 md:h-28 lg:h-32 w-auto drop-shadow-[0_0_30px_rgba(60,179,113,0.4)] ${isLight ? 'invert hue-rotate-180' : ''}`}
                    />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="flex items-center gap-4"
                >
                    <ThemeToggle theme={theme} onToggle={onToggle} />
                </motion.div>
            </nav>

            {/* Centered Hero */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-10 -mt-16">
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col items-center gap-6 md:gap-12"
                >
                    <div className="h-[120px] sm:h-[180px] md:h-[240px] flex items-center justify-center">
                        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-8xl font-black tracking-tighter leading-tight uppercase max-w-5xl">
                            <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#3CB371] to-[#2d8a57] inline-block filter drop-shadow-[0_0_20px_rgba(60,179,113,0.3)]">
                                {displayText}
                                <motion.span
                                    animate={{ opacity: [1, 0] }}
                                    transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                                    className="inline-block w-[2px] h-[0.8em] bg-[#3CB371] ml-2 -mb-1"
                                />
                            </span>
                        </h1>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 1 }}
                        className="flex flex-col items-center gap-12 relative"
                    >
                        {/* Animated Illustration pointing to Connect Wallet - ONLY when "explore 15market" */}
                        <AnimatePresence>
                            {currentTextIndex === 2 && !isDeleting && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.5, y: -20 }}
                                    animate={{ opacity: 1, scale: 1.25, y: [0, -10, 0] }}
                                    exit={{ opacity: 0, scale: 0.5, y: -20 }}
                                    transition={{
                                        duration: 3,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                    className="absolute -top-12 sm:-top-16 md:-top-24 scale-[0.8] sm:scale-100 md:scale-125 pointer-events-none"
                                >
                                    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <motion.path 
                                            d="M50 10V50M50 50L35 35M50 50L65 35" 
                                            stroke="#3CB371" 
                                            strokeWidth="6" 
                                            strokeLinecap="round" 
                                            strokeLinejoin="round" 
                                            animate={{ 
                                                strokeDasharray: ["0 100", "100 100"],
                                                opacity: [0.4, 1, 0.4]
                                            }}
                                            transition={{
                                                duration: 2,
                                                repeat: Infinity,
                                                ease: "easeInOut"
                                            }}
                                        />
                                        <circle cx="50" cy="70" r="8" fill="#3CB371" className="animate-pulse" />
                                    </svg>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex flex-col items-center gap-4">
                            <div className="scale-110 relative z-10 hover:scale-[1.15] transition-transform duration-700">
                                <UnifiedWalletButton theme={theme} />
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </main>

            {/* Minimal Footer */}
            <footer className={`w-full relative z-20 px-6 py-10 flex items-center justify-center border-t ${isLight ? 'border-[#3CB371]/10 bg-white/20' : 'border-white/[0.03] bg-[#050505]/50'} backdrop-blur-md`}>
                <span className={`text-[10px] md:text-xs font-black uppercase tracking-[0.5em] ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'}`}>
                    Built by 15Labs
                </span>
            </footer>
        </div>
    );
}
