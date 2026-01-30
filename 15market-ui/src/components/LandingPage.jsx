import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Zap, Shield, Clock, Activity } from 'lucide-react';
import { UnifiedWalletButton } from './UnifiedWalletButton';
import { useAppKitAccount, useDisconnect } from '@reown/appkit/react';

export const LandingPage = ({ currentNetwork, onNetworkChange }) => {
    const [scrollY, setScrollY] = useState(0);
    // const [selectedChain, setSelectedChain] = useState(() => localStorage.getItem("15market_network") || "solana");
    const { scrollYProgress } = useScroll();
    const { isConnected } = useAppKitAccount();
    const { disconnect } = useDisconnect();

    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -100]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

    // Theme colors based on selected chain
    const themeColors = {
        solana: {
            primary: '#3CB371',
            glow: 'rgba(60, 179, 113, 0.08)',
            glowBottom: 'rgba(60, 179, 113, 0.05)',
            selection: '#3CB371'
        },
        arc: {
            primary: '#3B82F6',
            glow: 'rgba(59, 130, 246, 0.08)',
            glowBottom: 'rgba(59, 130, 246, 0.05)',
            selection: '#3B82F6'
        }
    };

    const currentTheme = themeColors[currentNetwork] || themeColors.solana;

    // Use parent handler
    const handleChainChange = (chainId) => {
        onNetworkChange(chainId);
        localStorage.setItem("15market_network", chainId); // Keep persisting for consistency
    };

    return (
        <div
            className="min-h-screen bg-transparent text-white overflow-x-hidden font-sans transition-all duration-500"
            style={{
                '--theme-primary': currentTheme.primary,
                '--theme-glow': currentTheme.glow,
                '--theme-glow-bottom': currentTheme.glowBottom,
            }}
        >
            {/* Global Background Glow */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
                <div
                    className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] blur-[150px] rounded-full transition-all duration-1000"
                    style={{ backgroundColor: currentTheme.primary, opacity: 0.08 }}
                />
                <div
                    className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] blur-[150px] rounded-full transition-all duration-1000"
                    style={{ backgroundColor: currentTheme.primary, opacity: 0.05 }}
                />
            </div>

            {/* Navigation */}
            <nav className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between px-6 md:px-12 py-4 bg-transparent backdrop-blur-sm shadow-none">
                <div className="flex items-center">
                    <img
                        src="/logo.png"
                        alt="15market"
                        className="h-16 w-auto transition-all duration-500"
                        style={{
                            filter: `drop-shadow(0 0 15px ${currentTheme.primary}30)`
                        }}
                    />
                </div>
                <div className="flex items-center gap-8">
                    <UnifiedWalletButton
                        currentNetwork={currentNetwork}
                        onNetworkChange={handleChainChange}
                    />
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-40 md:pt-48 pb-32 px-6 flex flex-col items-center text-center z-10">
                <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-5xl w-full flex flex-col items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black border border-white/10 mb-10 backdrop-blur-md"
                    >
                        <span className="relative flex h-2 w-2">
                            <span
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 transition-colors duration-500"
                                style={{ backgroundColor: currentTheme.primary }}
                            />
                            <span
                                className="relative inline-flex rounded-full h-2 w-2 transition-colors duration-500"
                                style={{ backgroundColor: currentTheme.primary }}
                            />
                        </span>
                        <span
                            className="text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-500"
                            style={{ color: currentTheme.primary }}
                        >
                            System Operational
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-7xl font-black tracking-tighter leading-[0.9] text-white mb-6 px-4"
                    >
                        THE PRECISION <br />
                        <span className="text-white drop-shadow-[0_0_50px_rgba(60,179,113,0.2)]">MARKET.</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-base md:text-lg text-white/40 max-w-xl mx-auto mb-10 leading-relaxed px-6"
                    >
                        Decide the direction of an asset in a 15 seconds or lesser time window.
                        <span
                            className="block mt-4 font-medium tracking-wide transition-colors duration-500"
                            style={{ color: currentTheme.primary }}
                        >
                            Select your chain and connect your wallet to start trading.
                        </span>
                    </motion.p>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6 z-50 relative">
                        {/* Connect Button - More Presentable */}
                        <div className="relative group">
                            {/* Glow Effect */}
                            <div
                                className="absolute -inset-4 rounded-2xl opacity-30 blur-xl transition-all duration-500 group-hover:opacity-50"
                                style={{ backgroundColor: currentTheme.primary }}
                            />

                            {/* Connect Button */}
                            <div className="relative scale-110">
                                <UnifiedWalletButton
                                    currentNetwork={currentNetwork}
                                    onNetworkChange={handleChainChange}
                                />
                            </div>
                        </div>

                        {/* Helper Text */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-xs text-white/30 uppercase tracking-[0.2em] font-bold"
                        >
                            Choose Network • Connect Wallet • Start Trading
                        </motion.p>
                    </motion.div>
                </motion.div>

                {/* VISUAL COMPONENT */}
                <motion.div
                    initial={{ opacity: 0, y: 80, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="mt-16 w-full max-w-5xl relative perspective-1000"
                >
                    <div className="relative group overflow-hidden rounded-[32px]">
                        {/* 3D Mockup Image */}
                        <img
                            src="/mockup.png"
                            alt="15market App Mockup"
                            className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105"
                            style={{
                                filter: `drop-shadow(0 20px 40px ${currentTheme.primary}20)`
                            }}
                        />

                        {/* Overlay Glow */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                    </div>
                </motion.div>

                {/* Helper Text */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-xs text-white/30 uppercase tracking-[0.2em] font-bold mt-8"
                >
                    Choose Network • Connect Wallet • Start Trading
                </motion.p>
            </section>

            {/* Features */}
            <section className="py-24 relative z-10 bg-transparent">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <FeatureBox icon={<Clock size={20} />} title="15 Seconds" desc="Lightning-fast rounds. Enter and exit positions in just 15 seconds." />
                    <FeatureBox icon={<Shield size={20} />} title="No Manipulation" desc="ZERO artificial spread. Pure market forces determining your outcome." />
                    <FeatureBox icon={<Activity size={20} />} title="Pure Pyth Feed" desc="Direct on-chain integration with Pyth Network for high-fidelity data." />
                    <FeatureBox icon={<Zap size={20} />} title="Fast Settlement" desc="Automated smart contract payouts immediately upon completion." />
                </div>
            </section>

            <footer className="py-12 flex flex-col items-center gap-6 bg-transparent">
                <img src="/logo.png" className="h-14 w-auto opacity-80" alt="15Market" />
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: `${currentTheme.primary}99` }}>Built by 15Solutions</p>
            </footer>
        </div>
    );
};

const FeatureBox = ({ icon, title, desc }) => {
    const currentColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary') || '#3CB371';

    return (
        <div
            className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 transition-colors duration-500 group"
            style={{
                '--hover-border': `${currentColor}30`
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = `${currentColor}30`}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
        >
            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 transition-all duration-300"
                style={{
                    backgroundColor: `${currentColor}10`,
                    color: currentColor
                }}
            >
                {icon}
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
            <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
        </div>
    );
};
