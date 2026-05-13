import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UnifiedWalletButton } from "./UnifiedWalletButton";
import { ThemeToggle } from "./ThemeToggle";

const LandingBackground = ({ theme }) => {
    const isLight = theme === 'light';
    const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className={`absolute inset-0 overflow-hidden z-0 pointer-events-none ${isLight ? 'bg-[#f0f8f4]' : 'bg-[#050505]'} transition-colors duration-500`}>
            {/* Mouse Follow Glow */}
            <motion.div
                animate={{
                    x: mousePos.x - 200,
                    y: mousePos.y - 200,
                }}
                transition={{ type: "spring", damping: 50, stiffness: 100, mass: 0.5 }}
                className="absolute w-[400px] h-[400px] rounded-full blur-[80px] opacity-[0.35] pointer-events-none"
                style={{
                    background: `radial-gradient(circle, #3CB371 0%, transparent 70%)`,
                }}
            />

            {/* Cinematic Vignette & Grain */}
            <div className={`absolute inset-0 ${isLight ? 'bg-radial-vignette-light' : 'bg-radial-vignette'} pointer-events-none`} />
            <div 
                className="absolute inset-0 opacity-[0.07] pointer-events-none mix-blend-screen bg-[#3CB371] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" 
            />
        </div>
    );
};

const RisingBalance = () => {
    const [val, setVal] = useState(15.00);
    useEffect(() => {
        const i = setInterval(() => setVal(v => v + Math.random() * 0.15), 100);
        return () => clearInterval(i);
    }, []);
    return (
        <motion.span 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="ml-3 sm:ml-6 text-white bg-[#3CB371] px-3 py-1 rounded-lg shadow-[0_0_20px_rgba(60,179,113,0.4)]"
        >
            ${val.toFixed(2)}
        </motion.span>
    );
};

export function LandingPage({ theme, onToggle }) {
    const isLight = theme === 'light';
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [displayText, setDisplayText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    
    const phrases = [
        "access high frequency markets",
        "trade the trend in real time",
        "earn profits"
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
            <LandingBackground theme={theme} />

            {/* Top Navigation - Minimal */}
            <nav className="w-full relative z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-8 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <img
                        src={isLight ? "/goblogo.png" : "/gowlogo.png"}
                        alt="15market"
                        className={`h-16 md:h-28 lg:h-32 w-auto drop-shadow-[0_0_30px_rgba(60,179,113,0.4)]`}
                    />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="flex items-center gap-4"
                >
                    {/* Theme Toggle removed from landing per request */}
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
                            </span>
                            {currentTextIndex === 2 && displayText === "earn profits" && <RisingBalance />}
                            <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                                className="inline-block w-[2px] h-[0.8em] bg-[#3CB371] ml-2 -mb-1"
                            />
                        </h1>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 1 }}
                        className="flex flex-col items-center gap-12 relative"
                    >
                        {/* Removed Arrow Animation as requested */}

                        <div className="flex flex-col items-center gap-4">
                            <div className="scale-110 relative z-10 hover:scale-[1.15] transition-transform duration-700">
                                <UnifiedWalletButton theme={theme} />
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </main>

        </div>
    );
}
