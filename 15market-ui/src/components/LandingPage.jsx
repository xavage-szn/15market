import React from 'react';
import { motion } from 'framer-motion';
import { UnifiedWalletButton } from './UnifiedWalletButton';

const AuroraBackground = () => (
    <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
        <motion.div
            animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
                x: [-100, 100, -100],
                y: [-50, 50, -50],
            }}
            transition={{
                duration: 20,
                repeat: Infinity,
                ease: "linear"
            }}
            className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-[#3CB371]/20 blur-[120px]"
        />
        <motion.div
            animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.2, 0.4, 0.2],
                x: [100, -100, 100],
                y: [50, -50, 50],
            }}
            transition={{
                duration: 25,
                repeat: Infinity,
                ease: "linear"
            }}
            className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-[#3CB371]/10 blur-[100px]"
        />
        <div className="absolute inset-0 bg-[#050505]/40 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-[url('linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)')] bg-[size:5rem_5rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_20%,transparent_100%)] opacity-20" />
    </div>
);

export function LandingPage() {
    return (
        <div className="h-screen w-screen bg-[#050505] text-white overflow-hidden font-sans relative flex flex-col items-center selection:bg-[#3CB371]/30">
            <AuroraBackground />

            {/* Top Navigation - Minimal */}
            <nav className="w-full relative z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-8 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <img
                        src="/logo.png"
                        alt="15market"
                        className="h-10 md:h-14 w-auto drop-shadow-[0_0_20px_rgba(60,179,113,0.3)]"
                    />
                </motion.div>
            </nav>

            {/* Centered Hero */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-10 -mt-16">
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col items-center gap-12"
                >
                    <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-tight uppercase max-w-5xl">
                        ACCESS THE <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#3CB371] to-[#2d8a57] drop-shadow-[0_0_50px_rgba(60,179,113,0.4)]">
                            MOMENTUM MARKET.
                        </span>
                    </h1>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 1 }}
                        className="relative"
                    >
                        <div className="absolute -inset-10 bg-[#3CB371]/15 blur-[60px] rounded-full animate-pulse pointer-events-none" />
                        <div className="scale-125 md:scale-150 relative z-10 hover:scale-[1.3] md:hover:scale-[1.55] transition-transform duration-700">
                            <UnifiedWalletButton />
                        </div>
                    </motion.div>
                </motion.div>
            </main>

            {/* Minimal Footer */}
            <footer className="w-full relative z-20 px-6 py-10 flex items-center justify-center border-t border-white/[0.03] bg-[#050505]/50 backdrop-blur-md">
                <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.5em] text-white/20">
                    Built by 15Labs
                </span>
            </footer>
        </div>
    );
}

