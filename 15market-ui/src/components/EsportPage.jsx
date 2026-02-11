import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export const EsportPage = ({ onBack }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[#050505] relative overflow-hidden"
        >
            {/* Background Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#3CB371] opacity-5 blur-[150px] rounded-full pointer-events-none" />

            {/* Back Button */}
            <button
                onClick={onBack}
                className="absolute top-8 left-8 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group z-50"
            >
                <ArrowLeft className="group-hover:-translate-x-1 transition-transform text-white" />
            </button>

            <div className="relative z-10 flex flex-col items-center text-center">
                {/* Logo Animation */}
                <motion.div
                    animate={{
                        y: [0, -10, 0],
                        rotate: [0, 5, -5, 0]
                    }}
                    transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="mb-8 relative"
                >
                    <div className="absolute inset-0 bg-[#3CB371] blur-[60px] opacity-20" />
                    <img src="/logo.png" alt="15market" className="h-48 lg:h-60 w-auto relative z-10 drop-shadow-[0_0_50px_rgba(60,179,113,0.3)]" />

                    {/* Stamp Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 2, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: -12 }}
                        transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 20 }}
                        className="absolute -bottom-6 -right-12 bg-[#3CB371] text-black font-black text-xs px-4 py-2 rounded-full border-2 border-black shadow-[0_10px_30px_rgba(60,179,113,0.4)] uppercase tracking-widest transform rotate-[-12deg]"
                    >
                        Coming Soon
                    </motion.div>
                </motion.div>

                <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4">
                    ESPORTS <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3CB371] to-white">ARENA</span>
                </h1>

                <p className="text-white/40 max-w-lg text-lg font-medium leading-relaxed mb-12">
                    The future of decentralized esports betting is loading. Predict outcomes on your favorite matches instantly with 15Market speed.
                </p>

                <div className="flex gap-4">
                    <div className="h-12 px-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-white/20">
                        League of Legends
                    </div>
                    <div className="h-12 px-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-white/20">
                        CS:GO 2
                    </div>
                    <div className="h-12 px-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-white/20">
                        Dota 2
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
