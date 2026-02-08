import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Globe } from 'lucide-react';

export const NetworkSwitcher = ({ currentNetwork, onNetworkChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const networks = [
        { id: 'arc', name: 'Arc Network', icon: '🔵', color: '#3CB371', comingSoon: false },
        { id: 'base', name: 'Base', icon: '🔵', color: '#0052FF', comingSoon: true },
    ];

    const current = networks.find(n => n.id === currentNetwork) || networks[0];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 backdrop-blur-md transition-all duration-200 group"
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs">{current.icon}</span>
                    <span className="text-white text-xs font-black uppercase tracking-widest">{current.name}</span>
                </div>
                <ChevronDown size={14} className={`text-white/40 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full right-0 mt-2 w-56 bg-[#0D0D0D]/95 border border-white/10 rounded-2xl p-2 backdrop-blur-xl z-[100] shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                    >
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Select Network</div>
                        {networks.map((net) => (
                            <button
                                key={net.id}
                                disabled={net.comingSoon}
                                onClick={() => {
                                    if (!net.comingSoon) {
                                        onNetworkChange(net.id);
                                        setIsOpen(false);
                                    }
                                }}
                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 group ${currentNetwork === net.id
                                    ? 'bg-white/10 border border-white/10'
                                    : net.comingSoon
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm">{net.icon}</span>
                                    <div className="flex flex-col items-start">
                                        <span className="text-white text-xs font-bold">{net.name}</span>
                                        {net.comingSoon && <span className="text-[9px] text-blue-400 uppercase font-black tracking-tighter">Coming Soon</span>}
                                    </div>
                                </div>
                                {currentNetwork === net.id && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-current" style={{ backgroundColor: net.color }} />
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
