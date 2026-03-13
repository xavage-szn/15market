import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ theme, onToggle }) {
    const isDark = theme === 'dark';

    return (
        <motion.button
            onClick={onToggle}
            className={`
                relative h-10 w-20 rounded-2xl overflow-hidden border transition-all duration-500
                ${isDark
                    ? 'bg-black/40 border-white/10 shadow-[inner_0_2px_10px_rgba(0,0,0,0.5)]'
                    : 'bg-[#e6f4ed] border-[#3CB371]/20 shadow-[inner_0_2px_10px_rgba(60,179,113,0.1)]'}
            `}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />

            {/* Track Icons */}
            <div className="absolute inset-0 flex items-center justify-between px-2.5">
                <Sun size={14} className={`${isDark ? 'text-white/20' : 'text-[#3CB371]'} transition-colors duration-500`} />
                <Moon size={14} className={`${isDark ? 'text-[#3CB371]' : 'text-black/10'} transition-colors duration-500`} />
            </div>

            {/* Branded Thumb */}
            <motion.div
                className={`
                    absolute top-1 left-1 bottom-1 w-8 rounded-xl shadow-lg flex items-center justify-center
                    ${isDark ? 'bg-[#3CB371]' : 'bg-[#3CB371]'}
                `}
                animate={{
                    x: isDark ? 40 : 0,
                    boxShadow: isDark
                        ? '0 0 15px rgba(60, 179, 113, 0.5), inset 0 0 10px rgba(255,255,255,0.4)'
                        : '0 0 10px rgba(60, 179, 113, 0.3), inset 0 0 10px rgba(255,255,255,0.4)'
                }}
                transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30
                }}
            >
                <motion.div
                    animate={{ rotate: isDark ? 180 : 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {isDark ? (
                        <Moon size={16} className="text-black font-bold fill-black" />
                    ) : (
                        <Sun size={16} className="text-white font-bold fill-white" />
                    )}
                </motion.div>
            </motion.div>

            {/* Neon Pulse Line (Hidden in Light Mode) */}
            {isDark && (
                <motion.div
                    className="absolute bottom-0 left-0 h-[1px] bg-[#3CB371] opacity-50"
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 2, repeat: Infinity }}
                />
            )}
        </motion.button>
    );
};
    );
};
