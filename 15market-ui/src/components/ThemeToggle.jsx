import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

export const ThemeToggle = ({ theme, onToggle }) => {
    const isDark = theme === 'dark';

    return (
        <motion.button
            onClick={onToggle}
            className="relative w-12 h-6 lg:w-16 lg:h-8 rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black"
            style={{
                backgroundColor: isDark ? '#1f2937' : '#e5e7eb'
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
            {/* Toggle Circle */}
            <motion.div
                className="absolute top-1 w-4 h-4 lg:w-6 lg:h-6 rounded-full shadow-lg flex items-center justify-center"
                style={{
                    backgroundColor: isDark ? '#3CB371' : '#f59e0b'
                }}
                animate={{
                    x: isDark ? (window.innerWidth < 1024 ? 24 : 32) : 0
                }}
                transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30
                }}
            >
                {isDark ? (
                    <Moon size={window.innerWidth < 1024 ? 10 : 14} className="text-white" />
                ) : (
                    <Sun size={window.innerWidth < 1024 ? 10 : 14} className="text-white" />
                )}
            </motion.div>

            {/* Background Icons */}
            <div className="absolute inset-0 flex items-center justify-between px-2">
                <Sun
                    size={window.innerWidth < 1024 ? 8 : 12}
                    className="transition-opacity duration-300"
                    style={{ opacity: isDark ? 0.3 : 0 }}
                />
                <Moon
                    size={window.innerWidth < 1024 ? 8 : 12}
                    className="transition-opacity duration-300"
                    style={{ opacity: isDark ? 0 : 0.3 }}
                />
            </div>
        </motion.button>
    );
};
