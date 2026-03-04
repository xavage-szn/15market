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

const WalletDeepLink = ({ icon, name, onClick }) => (
    <motion.button
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className="flex flex-col items-center gap-2 group"
    >
        <div className="w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center transition-all group-hover:bg-[#3CB371]/10 group-hover:border-[#3CB371]/30 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <img src={icon} alt={name} className="w-8 h-8 md:w-12 md:h-12 object-contain filter group-hover:drop-shadow-[0_0_15px_rgba(60,179,113,0.5)]" />
        </div>
        <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/40 group-hover:text-[#3CB371] transition-colors">{name}</span>
    </motion.button>
);

export function LandingPage() {
    const dAppUrl = "15market.online";

    const handleWalletClick = (wallet) => {
        const fullUrl = `https://${dAppUrl}`;
        let deepLink = "";

        switch (wallet) {
            case 'metamask':
                deepLink = `https://metamask.app.link/dapp/${dAppUrl}`;
                break;
            case 'okx':
                deepLink = `okx://main/web3/dapp/details?dappUrl=${encodeURIComponent(fullUrl)}`;
                break;
            case 'rabby':
                deepLink = `https://rabby.io/mobile`;
                break;
            default:
                break;
        }

        if (deepLink) {
            window.location.href = deepLink;
        }
    };

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
                        className="flex flex-col items-center gap-12"
                    >
                        {/* Specific Wallet Deep Links for Mobile */}
                        <div className="flex items-center gap-6 md:gap-10">
                            <WalletDeepLink
                                icon="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Design_Mark.svg"
                                name="MetaMask"
                                onClick={() => handleWalletClick('metamask')}
                            />
                            <WalletDeepLink
                                icon="https://www.okx.com/cdn-production/static/admin/20230524/104106560/okx-logo.png"
                                name="OKX Wallet"
                                onClick={() => handleWalletClick('okx')}
                            />
                            <WalletDeepLink
                                icon="https://rabby.io/assets/images/logo.png"
                                name="Rabby"
                                onClick={() => handleWalletClick('rabby')}
                            />
                        </div>

                        <div className="flex flex-col items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">or connect via</span>
                            <div className="scale-110 relative z-10 hover:scale-[1.15] transition-transform duration-700">
                                <UnifiedWalletButton />
                            </div>
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
