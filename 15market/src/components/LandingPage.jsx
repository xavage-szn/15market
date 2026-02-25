import { motion } from "framer-motion";
import { UnifiedWalletButton } from "./UnifiedWalletButton";

const AnimatedIllustrationBackground = () => (
    <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none bg-[#050505]">
        {/* Momentum Waves Illustration */}
        <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 1000 1000" preserveAspectRatio="none">
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
        <div className="absolute inset-0 opacity-20">
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
        <div className="absolute inset-0 bg-radial-vignette pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
    </div>
);

export function LandingPage() {
    return (
        <div className="h-screen w-screen bg-[#050505] text-white overflow-hidden font-sans relative flex flex-col items-center selection:bg-[#3CB371]/30">
            <AnimatedIllustrationBackground />

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
                        className="h-24 md:h-32 w-auto drop-shadow-[0_0_30px_rgba(60,179,113,0.4)]"
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
                        <motion.span
                            animate={{
                                scale: [1, 1.02, 1],
                                opacity: [0.8, 1, 0.8],
                                filter: ["drop-shadow(0 0 20px rgba(60,179,113,0.3))", "drop-shadow(0 0 50px rgba(60,179,113,0.5))", "drop-shadow(0 0 20px rgba(60,179,113,0.3))"]
                            }}
                            transition={{
                                duration: 4,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="inline-block text-transparent bg-clip-text bg-gradient-to-b from-[#3CB371] to-[#2d8a57]"
                        >
                            MOMENTUM MARKET.
                        </motion.span>
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

