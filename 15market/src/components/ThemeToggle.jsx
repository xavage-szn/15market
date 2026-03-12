import React from 'react';
import { motion } from 'framer-motion';

export function ThemeToggle({ theme, onToggle }) {
    const isDark = theme === 'dark';

    return (
        <motion.button
            onClick={onToggle}
            className="relative w-12 h-6 lg:w-16 lg:h-8 rounded-full p-1 transition-colors duration-500 focus:outline-none overflow-hidden"
            style={{
                backgroundColor: isDark ? '#0a1a12' : '#e6f4ed',
                boxShadow: isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 2px 4px rgba(60,179,113,0.1)'
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
            {/* Animated Background Magic */}
            <motion.div
                className="absolute inset-0 opacity-20"
                animate={{
                    background: isDark
                        ? 'radial-gradient(circle at 70% 50%, #3CB371 0%, transparent 70%)'
                        : 'radial-gradient(circle at 30% 50%, #FFD700 0%, transparent 70%)'
                }}
            />

            {/* Main Toggle Thumb */}
            <motion.div
                className="absolute w-4 h-4 lg:w-6 lg:h-6 rounded-full shadow-lg flex items-center justify-center z-10"
                animate={{
                    x: isDark ? (window.innerWidth < 1024 ? 24 : 32) : 0,
                    rotate: isDark ? 360 : 0,
                    backgroundColor: isDark ? '#3CB371' : '#f59e0b'
                }}
                transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                }}
            >
                <div className="relative w-full h-full flex items-center justify-center">
                    {/* Animated Sun/Moon Kit */}
                    <svg viewBox="0 0 24 24" fill="none" className="w-[70%] h-[70%] stroke-white stroke-[3]">
                        {/* Sun Rays (Hidden on Moon) */}
                        <motion.g animate={{ opacity: isDark ? 0 : 1, scale: isDark ? 0.5 : 1 }}>
                            <line x1="12" y1="1" x2="12" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" />
                            <line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </motion.g>

                        {/* Core Circle / Moon Mask */}
                        <motion.path
                            d="M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17Z"
                            animate={{
                                d: isDark
                                    ? "M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21ZM12 21C16.9706 21 21 16.9706 21 12C21 11.23858 19.7614 9 17 9C14.2386 9 12 11.23858 12 14C12 16.7614 14.2386 19 17 19C19.7614 19 21 16.7614 21 16C21 16.9706 16.9706 21 12 21Z"
                                    : "M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17Z"
                            }}
                            fill="white"
                        />
                    </svg>
                </div>
            </motion.div>
        </motion.button>
    );
};
