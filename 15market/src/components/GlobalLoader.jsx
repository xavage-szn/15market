import React from 'react';
import { motion } from 'framer-motion';

const GlobalLoader = ({ theme = 'dark', progress = 0 }) => {
    const isLight = theme === 'light';
    const dotThresholds = [0.33, 0.66, 1.0];
    
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden ${isLight ? 'bg-[#249C6C]' : 'bg-[#050505]'}`}
        >
            <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            
            <div className="relative flex flex-col items-center gap-0">
                {/* Logo */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="flex items-center"
                >
                    <img 
                        src={theme === 'light' ? "/goblogo.png" : "/gowlogo.png"} 
                        alt="15market" 
                        className="h-[72px] md:h-[100px] w-auto" 
                        style={isLight ? { filter: 'brightness(0)' } : {}}
                    />
                </motion.div>

                {/* Divider Lines (//) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="flex items-center gap-0 -translate-y-14 md:-translate-y-20 -ml-2 z-10 relative"
                >
                    <motion.span 
                        animate={{ 
                            opacity: [0.3, 1, 0.3],
                            color: isLight 
                                ? ['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.9)', 'rgba(0,0,0,0.9)'] 
                                : ['#ffffff', '#ffffff', '#ffffff']
                        }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className="text-3xl md:text-4xl font-light select-none"
                    >
                        /
                    </motion.span>
                    <motion.span 
                        animate={{ 
                            opacity: [1, 0.3, 1],
                            color: isLight 
                                ? ['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.9)', 'rgba(0,0,0,0.9)'] 
                                : ['#ffffff', '#ffffff', '#ffffff']
                        }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className="text-3xl md:text-4xl font-light select-none -ml-1"
                    >
                        /
                    </motion.span>
                </motion.div>

                {/* Progress Dots - light up as health check progresses */}
                <div className="flex items-center gap-1.5 -translate-y-2">
                    {dotThresholds.map((threshold, i) => {
                        const lit = progress >= threshold;
                        return (
                            <motion.div
                                key={i}
                                animate={{
                                    scale: lit ? 1.2 : 1,
                                    opacity: lit ? 1 : 0.2,
                                    backgroundColor: lit
                                        ? (isLight ? '#000000' : '#ffffff')
                                        : (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)')
                                }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className={`w-[5px] h-[5px] rounded-full ${lit && !isLight ? 'shadow-[0_0_10px_rgba(255,255,255,0.5)]' : ''} ${lit && isLight ? 'shadow-[0_0_10px_rgba(0,0,0,0.15)]' : ''}`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Bottom progress bar linked to health check */}
            <motion.div 
                className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-50"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.min(progress * 100, 100)}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
            />
        </motion.div>
    );
};

export default GlobalLoader;
