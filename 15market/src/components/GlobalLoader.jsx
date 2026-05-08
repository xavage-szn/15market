import React from 'react';
import { motion } from 'framer-motion';

const GlobalLoader = ({ theme = 'dark' }) => {
    const isLight = theme === 'light';
    
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden ${isLight ? 'bg-[#c8eadd]' : 'bg-[#050505]'}`}
        >
            {/* Branded Background Texture - DARK MODE ONLY */}
            {!isLight && (
                <div className="absolute inset-0 opacity-[0.07] pointer-events-none mix-blend-screen bg-[#3CB371] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            )}
            
            <div className="relative flex items-center gap-0">
                {/* 1. Logo */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="flex items-center"
                >
                    <img 
                        src="/logo.png" 
                        alt="15market" 
                        className={`h-[72px] md:h-[100px] w-auto drop-shadow-[0_0_30px_rgba(60,179,113,0.3)] ${isLight ? 'brightness-0' : 'brightness-0 invert'}`} 
                    />
                </motion.div>

                {/* 2. Divider Lines (//) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="flex items-center gap-0 translate-y-1.5 -ml-2 z-10 relative"
                >
                    <motion.span 
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className="text-3xl md:text-4xl font-light text-[#3CB371] select-none"
                    >
                        /
                    </motion.span>
                    <motion.span 
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className="text-3xl md:text-4xl font-light text-[#3CB371] select-none -ml-1"
                    >
                        /
                    </motion.span>
                </motion.div>

                {/* 3. Loading Text */}
                <div className="flex items-baseline ml-1.5 gap-1">
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.4 }}
                        className={`text-[17px] font-medium ${isLight ? 'text-[#0a261a]' : 'text-white'} tracking-tight`}
                        style={{ fontFamily: '"Comfortaa", cursive' }}
                    >
                        Loading
                    </motion.span>
                    <div className="flex items-baseline gap-1 ml-0.5">
                        {[0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                animate={{ 
                                    opacity: [0.2, 1, 0.2],
                                }}
                                transition={{ 
                                    repeat: Infinity, 
                                    duration: 1.5, 
                                    delay: 1 + (i * 0.2),
                                    ease: "easeInOut" 
                                }}
                                className={`w-[5px] h-[5px] rounded-full ${isLight ? 'bg-[#0a261a]' : 'bg-white'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Subtle Progress bar at the bottom */}
            <motion.div 
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "100%", opacity: 0.5 }}
                transition={{ duration: 3, ease: "easeInOut" }}
                className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-[#3CB371] to-transparent"
            />
        </motion.div>
    );
};

export default GlobalLoader;
