import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Shield, Clock, Activity } from 'lucide-react';
import { UnifiedWalletButton } from './UnifiedWalletButton';

export const LandingPage = ({ currentNetwork, onNetworkChange }) => {
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

    const handleChainChange = (chainId) => {
        onNetworkChange(chainId);
        localStorage.setItem("15market_network", chainId);
    };

    return (
        <div
            className="h-[100dvh] w-screen bg-[#050505] text-white overflow-hidden font-sans flex flex-col relative"
            style={{
                '--theme-primary': currentTheme.primary,
                '--theme-glow': currentTheme.glow,
            }}
        >
            {/* Global Background Glow */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
                <div
                    className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] blur-[150px] rounded-full transition-all duration-1000"
                    style={{ backgroundColor: currentTheme.primary, opacity: 0.12 }}
                />
                <div
                    className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] blur-[150px] rounded-full transition-all duration-1000"
                    style={{ backgroundColor: currentTheme.primary, opacity: 0.08 }}
                />
            </div>

            {/* Navigation */}
            <nav className="relative z-[100] flex items-center justify-between px-6 md:px-12 py-4 md:py-6">
                <div className="flex items-center">
                    <img
                        src="/logo.png"
                        alt="15market"
                        className="h-12 md:h-16 w-auto transition-all duration-500"
                        style={{ filter: `drop-shadow(0 0 20px ${currentTheme.primary}40)` }}
                    />
                </div>
                <div className="flex items-center gap-4">
                    <UnifiedWalletButton
                        currentNetwork={currentNetwork}
                        onNetworkChange={handleChainChange}
                    />
                </div>
            </nav>

            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-10 -mt-10 md:-mt-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black border border-white/10 mb-6 md:mb-8 backdrop-blur-md"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: currentTheme.primary }} />
                        <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: currentTheme.primary }} />
                    </span>
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: currentTheme.primary }}>
                        BETA TESTING IS LIVE
                    </span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-5xl md:text-8xl font-[1000] tracking-tighter leading-[0.85] text-white mb-6"
                >
                    THE PRECISION <br />
                    <span style={{ textShadow: `0 0 60px ${currentTheme.primary}40` }}>MARKET.</span>
                </motion.div>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm md:text-lg text-white/40 max-w-lg mx-auto mb-8 md:mb-12 leading-relaxed"
                >
                    Predict the pulse of the market in 15-second windows.
                    <span className="block mt-2 font-bold tracking-tight" style={{ color: currentTheme.primary }}>
                        Direct Settlement. Zero Manipulation. Pure Speed.
                    </span>
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="relative group p-[2px] rounded-2xl bg-gradient-to-tr from-white/20 to-transparent">
                        <div className="absolute -inset-6 rounded-3xl blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" style={{ backgroundColor: currentTheme.primary }} />
                        <div className="relative scale-110 md:scale-125">
                            <UnifiedWalletButton
                                currentNetwork={currentNetwork}
                                onNetworkChange={handleChainChange}
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            localStorage.clear();
                            sessionStorage.clear();
                            window.location.reload();
                        }}
                        className="mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-white/20 hover:text-white/60 transition-colors"
                    >
                        Trouble connecting? Reset connection
                    </button>
                </motion.div>
            </main>

            {/* Features Bar - Compact */}
            <div className="relative z-10 px-6 pb-8 md:pb-12">
                <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-x-8 md:gap-x-16 gap-y-4">
                    <FeatureItem icon={<Clock size={16} />} text="15s Rounds" color={currentTheme.primary} />
                    <FeatureItem icon={<Shield size={16} />} text="No Manipulation" color={currentTheme.primary} />
                    <FeatureItem icon={<Activity size={16} />} text="Pyth Data" color={currentTheme.primary} />
                    <FeatureItem icon={<Zap size={16} />} text="Instant Payout" color={currentTheme.primary} />
                </div>
            </div>

            {/* Matrix background effect */}
            <div className="absolute inset-0 z-1 pointer-events-none opacity-20 overflow-hidden">
                <div className="absolute top-0 left-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-scan" style={{ animationDelay: '0s' }} />
                <div className="absolute top-0 left-2/4 w-[1px] h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-scan" style={{ animationDelay: '1.5s' }} />
                <div className="absolute top-0 left-3/4 w-[1px] h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-scan" style={{ animationDelay: '3s' }} />
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes scan {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100%); }
                }
                .animate-scan {
                    animation: scan 8s linear infinite;
                }
            `}} />
        </div>
    );
};

const FeatureItem = ({ icon, text, color }) => (
    <div className="flex items-center gap-2 group">
        <div className="p-1.5 rounded-lg transition-colors" style={{ backgroundColor: `${color}15`, color: color }}>
            {icon}
        </div>
        <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/30 group-hover:text-white/60 transition-colors">
            {text}
        </span>
    </div>
);
