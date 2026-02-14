import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shield, Clock, Activity, ArrowRight, MousePointer2 } from 'lucide-react';
import { UnifiedWalletButton } from './UnifiedWalletButton';

const NeuralPulseBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resize);
        resize();

        const particles = [];
        const particleCount = 40;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(60, 179, 113, 0.15)';
            ctx.strokeStyle = 'rgba(60, 179, 113, 0.05)';

            particles.forEach((p, i) => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 200) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-0 pointer-events-none opacity-40"
            style={{ filter: 'blur(1px)' }}
        />
    );
};

export const LandingPage = () => {
    const primaryColor = '#3CB371';

    return (
        <div className="h-[100dvh] w-screen bg-[#050505] text-white overflow-hidden font-sans flex flex-col relative selection:bg-[#3CB371]/30">
            {/* Background Layers */}
            <NeuralPulseBackground />
            <div className="absolute inset-0 bg-radial-gradient from-[#3CB371]/5 to-transparent pointer-events-none z-0" />

            {/* Navigation */}
            <nav className="relative z-[100] flex items-center justify-between px-6 py-4 md:px-12 md:py-8 glass-nav shrink-0">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center"
                >
                    <img
                        src="/logo.png"
                        alt="15market"
                        className="h-16 md:h-24 w-auto drop-shadow-[0_0_20px_rgba(60,179,113,0.3)]"
                    />
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hidden md:flex items-center gap-8"
                >
                    <div className="flex items-center gap-6">
                        <NavLink label="Protocol" />
                        <NavLink label="Markets" />
                        <NavLink label="Docs" />
                    </div>
                    <div className="h-6 w-[1px] bg-white/10" />
                    <UnifiedWalletButton />
                </motion.div>
                <div className="md:hidden">
                    <UnifiedWalletButton />
                </div>
            </nav>

            {/* Hero Main */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-10 -mt-12 md:-mt-20">
                {/* Status Pill */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass-pill mb-12"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3CB371] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3CB371]" />
                    </span>
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-[#3CB371]">
                        Arc Mainnet Beta Live
                    </span>
                </motion.div>

                {/* Main Headline */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="mb-8"
                >
                    <h1 className="text-huge">
                        THE PRECISION <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3CB371] to-[#48c97f] drop-shadow-[0_0_40px_rgba(60,179,113,0.3)]">
                            MARKET.
                        </span>
                    </h1>
                </motion.div>

                {/* Description */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-[10px] md:text-sm text-white/40 max-w-xl mx-auto mb-12 leading-relaxed uppercase font-black tracking-[0.4em] px-4"
                >
                    Trade the pulse of global markets in <span className="text-white">15-second cycles</span>.
                    Pure execution, instantly settled on Arc.
                </motion.p>

                {/* Call to Action Container */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="relative"
                >
                    <div className="absolute -inset-12 bg-[#3CB371]/10 blur-[60px] rounded-full animate-pulse-soft pointer-events-none" />
                    <div className="flex flex-col items-center gap-6 relative z-10">
                        <div className="scale-125 md:scale-150">
                            <UnifiedWalletButton />
                        </div>

                        <p className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#3CB371]/60">
                            <MousePointer2 size={12} className="animate-bounce" />
                            Connect any wallet to enter
                        </p>
                    </div>
                </motion.div>
            </main>

            {/* Bottom Utility Bar */}
            <footer className="relative z-20 px-6 py-8 md:py-12 glass-nav">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-12 overflow-x-auto no-scrollbar w-full md:w-auto justify-center">
                        <FeatureItem icon={<Clock size={16} />} text="15s Cycles" />
                        <FeatureItem icon={<Shield size={16} />} text="Non-Custodial" />
                        <FeatureItem icon={<Zap size={16} />} text="Instant Settled" />
                        <FeatureItem icon={<Activity size={16} />} text="Oracle Driven" />
                    </div>

                    <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-white/20 whitespace-nowrap">
                        <span>Built on Arc</span>
                        <div className="h-3 w-[1px] bg-white/10" />
                        <span>Powered by Pyth</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const NavLink = ({ label }) => (
    <a href="#" className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-[#3CB371] transition-colors">
        {label}
    </a>
);

const FeatureItem = ({ icon, text }) => (
    <div className="flex items-center gap-3 group whitespace-nowrap">
        <div className="p-2 rounded-xl bg-white/5 text-[#3CB371] border border-white/5 group-hover:border-[#3CB371]/30 transition-all">
            {icon}
        </div>
        <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white transition-colors">
                {text}
            </span>
        </div>
    </div>
);
