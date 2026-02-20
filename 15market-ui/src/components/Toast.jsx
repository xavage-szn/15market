import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, X } from 'lucide-react';

function Toast({ message, type = 'success', onClose }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const isSuccess = type === 'success';
    const bgColor = isSuccess ? 'bg-[#3CB371]/10' : 'bg-[#FF7F50]/10';
    const borderColor = isSuccess ? 'border-[#3CB371]/50' : 'border-[#FF7F50]/50';
    const iconColor = isSuccess ? 'text-[#3CB371]' : 'text-[#FF7F50]';
    const Icon = isSuccess ? CheckCircle : XCircle;

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-6 right-6 z-[100] flex items-center gap-4 p-4 rounded-xl border ${borderColor} ${bgColor} backdrop-blur-md shadow-2xl max-w-sm`}
        >
            <Icon className={iconColor} size={24} />
            <div className="flex-1">
                <h4 className={`font-bold text-sm ${iconColor} uppercase tracking-wider`}>
                    {isSuccess ? 'Success' : 'Error'}
                </h4>
                <p className="text-white/80 text-xs mt-1 leading-relaxed">
                    {message}
                </p>
            </div>
            <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            >
                <X size={16} />
            </button>
        </motion.div>
    );
};

export default Toast;
