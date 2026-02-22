import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, X, Loader2, Info } from 'lucide-react';

function Toast({ message, type = 'success', onClose }) {
    useEffect(() => {
        // Don't auto-close if it's pending
        if (type === 'pending') return;

        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose, type]);

    const colors = {
        success: { bg: 'bg-[#3CB371]/10', border: 'border-[#3CB371]/50', icon: 'text-[#3CB371]', label: 'Success', Icon: CheckCircle },
        error: { bg: 'bg-[#FF7F50]/10', border: 'border-[#FF7F50]/50', icon: 'text-[#FF7F50]', label: 'Error', Icon: XCircle },
        pending: { bg: 'bg-blue-500/10', border: 'border-blue-500/50', icon: 'text-blue-400', label: 'Processing', Icon: Loader2 },
        info: { bg: 'bg-blue-500/10', border: 'border-blue-500/50', icon: 'text-blue-400', label: 'Info', Icon: Info }
    };

    const config = colors[type] || colors.success;
    const { Icon } = config;

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 right-6 z-[100] flex items-center gap-4 p-4 rounded-xl border ${config.border} ${config.bg} backdrop-blur-md shadow-2xl max-w-sm`}
        >
            <div className={type === 'pending' ? 'animate-spin' : ''}>
                <Icon className={config.icon} size={24} />
            </div>
            <div className="flex-1">
                <h4 className={`font-bold text-sm ${config.icon} uppercase tracking-wider`}>
                    {config.label}
                </h4>
                <p className="text-white/80 text-xs mt-1 leading-relaxed">
                    {message}
                </p>
            </div>
            {type !== 'pending' && (
                <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            )}
        </motion.div>
    );
};

export default Toast;
