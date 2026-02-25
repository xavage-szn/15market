import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UnifiedWalletButton } from './UnifiedWalletButton';

function NeuralPulseBackground() {
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

export function LandingPage() {
    const primaryColor = '#3CB371';

    return (
        <div className="h-[100dvh] w-screen bg-[#050505] text-white overflow-hidden font-sans flex flex-col relative selection:bg-[#3CB371]/30">
            {/* Background Layers */}
            <NeuralPulseBackground />
            <div className="absolute inset-0 bg-radial-gradient from-[#3CB371]/5 to-transparent pointer-events-none z-0" />

            {/* Navigation */}
            <nav className="relative z-[100] flex items-center justify-between px-6 py-4 md:px-12 md:py-8 shrink-0">
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
                >
                    <UnifiedWalletButton />
                </motion.div>
            </nav>

            {/* Hero Main */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-10 -mt-12 md:-mt-20">
                {/* Status Pill */}


                {/* Main Headline */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="mb-8"
                >
                    <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-huge font-black tracking-tighter leading-none">
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


                    </div>
                </motion.div>
            </main>

            {/* Footer — Trademark Only */}
            <footer className="relative z-20 px-6 py-6 md:py-8 flex items-center justify-center">
                <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-white/20">
                    Built by 15Labs
                </span>
            </footer>
        </div>
    );
};

