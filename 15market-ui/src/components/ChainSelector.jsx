import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const ChainSelector = ({ selectedChain, onChainChange }) => {
    const chains = [
        {
            id: 'solana',
            name: 'Solana',
            icon: '◎',
            color: '#3CB371',
            angle: -45 // Left position
        },
        {
            id: 'arc',
            name: 'Arc Network',
            icon: '⚡',
            color: '#3B82F6',
            angle: 45 // Right position
        },
    ];

    const [isDragging, setIsDragging] = useState(false);
    const currentChain = chains.find(c => c.id === selectedChain);
    const knobRotation = currentChain?.angle || -45;

    const handleChainSelect = (chainId) => {
        if (chainId !== selectedChain) {
            onChainChange(chainId);
        }
    };

    return (
        <div className="flex flex-col items-center gap-8 mb-8">
            {/* Knob Container */}
            <motion.div
                className="relative"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
            >
                {/* LED Indicators */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-16 w-80 justify-center">
                    {chains.map((chain) => {
                        const isActive = chain.id === selectedChain;
                        return (
                            <div key={chain.id} className="flex flex-col items-center gap-2">
                                {/* LED Light */}
                                <div className="relative">
                                    <motion.div
                                        className="w-4 h-4 rounded-full border-2 transition-all duration-300"
                                        style={{
                                            borderColor: isActive ? chain.color : '#ffffff20',
                                            backgroundColor: isActive ? chain.color : '#0a0a0a',
                                            boxShadow: isActive ? `0 0 20px ${chain.color}, 0 0 40px ${chain.color}80` : 'none',
                                        }}
                                        animate={{
                                            scale: isActive ? [1, 1.2, 1] : 1,
                                        }}
                                        transition={{
                                            duration: 1.5,
                                            repeat: isActive ? Infinity : 0,
                                            ease: "easeInOut"
                                        }}
                                    />
                                    {/* LED Glow Ring */}
                                    {isActive && (
                                        <motion.div
                                            className="absolute inset-0 rounded-full"
                                            style={{
                                                backgroundColor: chain.color,
                                                opacity: 0.3,
                                            }}
                                            animate={{
                                                scale: [1, 2, 1],
                                                opacity: [0.3, 0, 0.3],
                                            }}
                                            transition={{
                                                duration: 1.5,
                                                repeat: Infinity,
                                                ease: "easeOut"
                                            }}
                                        />
                                    )}
                                </div>
                                {/* Chain Label */}
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-2xl">{chain.icon}</span>
                                    <span
                                        className={`text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${isActive ? 'text-white' : 'text-white/30'
                                            }`}
                                        style={{
                                            color: isActive ? chain.color : undefined
                                        }}
                                    >
                                        {chain.name}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Knob Base */}
                <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-4 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.8),inset_0_2px_10px_rgba(255,255,255,0.1)]">
                    {/* Knob Rotation Indicator Track */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="#ffffff10"
                            strokeWidth="2"
                            strokeDasharray="10 5"
                        />
                    </svg>

                    {/* Rotating Knob */}
                    <motion.div
                        className="absolute inset-2 rounded-full bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] border-2 border-white/20 shadow-[0_5px_15px_rgba(0,0,0,0.5),inset_0_-2px_10px_rgba(0,0,0,0.5)] cursor-pointer select-none"
                        animate={{ rotate: knobRotation }}
                        transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseDown={() => setIsDragging(true)}
                        onMouseUp={() => setIsDragging(false)}
                        style={{
                            boxShadow: `0 5px 15px rgba(0,0,0,0.5), inset 0 -2px 10px rgba(0,0,0,0.5), 0 0 30px ${currentChain?.color}40`
                        }}
                    >
                        {/* Knob Grip Lines */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {[...Array(8)].map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute w-0.5 h-8 bg-white/20 rounded-full"
                                    style={{
                                        transform: `rotate(${i * 45}deg) translateY(-35px)`,
                                    }}
                                />
                            ))}
                        </div>

                        {/* Center Indicator Pointer */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-6 rounded-full transition-all duration-300"
                            style={{
                                backgroundColor: currentChain?.color,
                                boxShadow: `0 0 10px ${currentChain?.color}, 0 0 20px ${currentChain?.color}80`
                            }}
                        />

                        {/* Center Button */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div
                                className="w-8 h-8 rounded-full bg-gradient-to-br border-2 transition-all duration-300"
                                style={{
                                    borderColor: currentChain?.color,
                                    background: `radial-gradient(circle at 30% 30%, ${currentChain?.color}40, #0a0a0a)`,
                                    boxShadow: `0 0 15px ${currentChain?.color}60, inset 0 2px 5px rgba(255,255,255,0.1)`
                                }}
                            >
                                <div className="w-full h-full flex items-center justify-center text-lg">
                                    {currentChain?.icon}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Click Areas for Chain Selection */}
                    <div className="absolute inset-0">
                        {chains.map((chain) => (
                            <button
                                key={chain.id}
                                onClick={() => handleChainSelect(chain.id)}
                                className="absolute w-16 h-16 opacity-0 cursor-pointer"
                                style={{
                                    top: '50%',
                                    left: chain.angle < 0 ? '0%' : 'auto',
                                    right: chain.angle > 0 ? '0%' : 'auto',
                                    transform: 'translateY(-50%)',
                                }}
                                aria-label={`Select ${chain.name}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Position Markers */}
                <div className="absolute top-1/2 -left-8 w-3 h-0.5 bg-white/20 -translate-y-1/2" />
                <div className="absolute top-1/2 -right-8 w-3 h-0.5 bg-white/20 -translate-y-1/2" />
            </motion.div>

            {/* Status Display */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={selectedChain}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-3 px-6 py-3 rounded-full border backdrop-blur-xl"
                    style={{
                        borderColor: `${currentChain?.color}40`,
                        backgroundColor: `${currentChain?.color}10`,
                    }}
                >
                    <div className="relative flex h-2 w-2">
                        <span
                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                            style={{ backgroundColor: currentChain?.color }}
                        />
                        <span
                            className="relative inline-flex rounded-full h-2 w-2"
                            style={{ backgroundColor: currentChain?.color }}
                        />
                    </div>
                    <span className="text-xs font-black uppercase tracking-wider text-white/80">
                        Ready to connect to {currentChain?.name}
                    </span>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
