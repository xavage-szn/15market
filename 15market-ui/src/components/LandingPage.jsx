import React from 'react';
import { motion } from 'framer-motion';
import { UnifiedWalletButton } from './UnifiedWalletButton';
import { Shield, Zap, TrendingUp, Sparkles } from 'lucide-react';

const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15
        }
    }
};

export function LandingPage() {
    return (
        <div className="min-h-screen w-full bg-[#050505] text-white overflow-x-hidden font-sans relative selection:bg-[#3CB371]/30">
            {/* Minimalist Grid and Accent Glows */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[url('radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(60,179,113,0.15),rgba(255,255,255,0))')] blur-2xl" />
                <div className="absolute inset-0 bg-[url('radial-gradient(circle_at_bottom_left,rgba(60,179,113,0.05),transparent_40%)]" />
                <div className="absolute inset-0 bg-[url('linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)')] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_10%,transparent_100%)] opacity-20" />
            </div>

            {/* Navigation */}
            <nav className="relative z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-6 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="flex items-center gap-3"
                >
                    <img
                        src="/logo.png"
                        alt="15market"
                        className="h-10 md:h-14 w-auto drop-shadow-[0_0_15px_rgba(60,179,113,0.4)] transition-transform duration-500 hover:scale-105"
                    />
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <UnifiedWalletButton />
                </motion.div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 flex-col items-center justify-center pt-24 pb-32 px-6 md:pt-40 md:pb-48 text-center max-w-5xl mx-auto">
                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col items-center gap-8"
                >
                    {/* Pill Badge */}
                    <motion.div variants={fadeIn} className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#3CB371]/30 bg-[#3CB371]/5 backdrop-blur-md shadow-[0_0_20px_rgba(60,179,113,0.1)]">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3CB371] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3CB371]"></span>
                        </span>
                        <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-[#3CB371]">Live on Arc Testnet</span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1 variants={fadeIn} className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter leading-[1.05] text-white drop-shadow-2xl">
                        THE PRECISION <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3CB371] via-[#48c97f] to-[#3CB371] inline-block filter drop-shadow-[0_0_30px_rgba(60,179,113,0.4)]">
                            MARKET.
                        </span>
                    </motion.h1>

                    {/* Description */}
                    <motion.p variants={fadeIn} className="text-sm md:text-base text-white/50 max-w-2xl mx-auto leading-relaxed md:leading-loose uppercase font-black tracking-[0.2em] md:tracking-[0.3em] px-4">
                        Trade the pulse of global markets in <span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">15-second cycles</span>.<br />
                        Pure execution, instantly settled.
                    </motion.p>

                    {/* CTA Actions */}
                    <motion.div variants={fadeIn} className="mt-8 flex flex-col sm:flex-row items-center gap-6 relative">
                        <div className="absolute inset-0 bg-[#3CB371]/20 blur-[80px] rounded-full pointer-events-none -z-10 transition-opacity duration-1000 animate-pulse" />
                        <div className="transform scale-125 md:scale-150 hover:scale-[1.3] md:hover:scale-[1.55] transition-transform duration-500 ease-out origin-center">
                            <UnifiedWalletButton />
                        </div>
                    </motion.div>
                </motion.div>
            </main>

            {/* Features Showcase */}
            <section className="relative z-10 py-20 bg-gradient-to-b from-transparent to-[#0a0a0a] border-t border-white/5">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-100px" }}
                        variants={staggerContainer}
                        className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12"
                    >
                        {/* Box 1 */}
                        <motion.div variants={fadeIn} className="flex flex-col items-center text-center p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-[#3CB371]/30 transition-colors duration-500 group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-[#3CB371]/0 to-[#3CB371]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="w-16 h-16 rounded-2xl bg-[#3CB371]/10 flex items-center justify-center mb-6 border border-[#3CB371]/20 group-hover:scale-110 transition-transform duration-500">
                                <Zap className="text-[#3CB371] w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-widest mb-3 text-white drop-shadow-md">Instant Execution</h3>
                            <p className="text-xs text-white/40 uppercase tracking-widest leading-loose">Trades execute instantly with zero latency delay directly through our keeper nodes.</p>
                        </motion.div>

                        {/* Box 2 */}
                        <motion.div variants={fadeIn} className="flex flex-col items-center text-center p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-[#3CB371]/30 transition-colors duration-500 group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-[#3CB371]/0 to-[#3CB371]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="w-16 h-16 rounded-2xl bg-[#3CB371]/10 flex items-center justify-center mb-6 border border-[#3CB371]/20 group-hover:scale-110 transition-transform duration-500">
                                <Shield className="text-[#3CB371] w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-widest mb-3 text-white drop-shadow-md">On-Chain Verified</h3>
                            <p className="text-xs text-white/40 uppercase tracking-widest leading-loose">Every win and loss is definitively backed by immutable smart contracts on the Arc Network.</p>
                        </motion.div>

                        {/* Box 3 */}
                        <motion.div variants={fadeIn} className="flex flex-col items-center text-center p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-[#3CB371]/30 transition-colors duration-500 group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-[#3CB371]/0 to-[#3CB371]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="w-16 h-16 rounded-2xl bg-[#3CB371]/10 flex items-center justify-center mb-6 border border-[#3CB371]/20 group-hover:scale-110 transition-transform duration-500">
                                <TrendingUp className="text-[#3CB371] w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-widest mb-3 text-white drop-shadow-md">True Precision</h3>
                            <p className="text-xs text-white/40 uppercase tracking-widest leading-loose">Trade accurately to 4 decimal places. No spread, no slippage, pure Oracle consensus.</p>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-20 px-6 py-12 flex flex-col items-center justify-center bg-[#050505] border-t border-white/[0.02]">
                <img src="/logo.png" alt="15Labs" className="h-8 opacity-20 filter grayscale mb-6" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em] text-white/20">
                    Engineered by 15Labs
                </span>
            </footer>
        </div>
    );
}

