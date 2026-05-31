import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

function Toast({ message, type = 'success', onClose, onClick, isSmallScreen }) {
    useEffect(() => {
        const duration = 3000;
        const timer = setTimeout(() => {
            onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [onClose]);

    const palette = {
        success: { bg: '#249C6C' },
        error: { bg: '#FF4D4D' },
        pending: { bg: '#249C6C' },
        info: { bg: '#249C6C' },
    };
    const config = palette[type] || palette.success;
    const isSuccess = type === 'success';

    const bgColor = config.bg;

    return (
        <motion.div
            initial={{ x: '110%' }}
            animate={{ x: '10%' }}
            exit={{ x: '110%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`fixed right-0 z-[9999] overflow-hidden rounded-full ${isSmallScreen ? 'bottom-[9vh]' : 'bottom-6'}`}
            onClick={() => {
                if (onClick) onClick();
            }}
            style={{
                width: isSmallScreen ? 'calc(242px + 3.3vw)' : '242px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
        >
            <div
                style={{
                    backgroundColor: bgColor,
                    color: '#FFFFFF',
                    width: '330px',
                }}
                className={`flex items-center gap-3 py-3 lg:py-3.5 pl-5 pr-10 rounded-full ${onClick ? 'cursor-pointer' : ''}`}
            >
                <motion.div
                    key={isSuccess ? 'check' : 'x'}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.15 }}
                    className="flex-shrink-0"
                >
                    {isSuccess ? (
                        <Check size={18} strokeWidth={3} />
                    ) : (
                        <X size={18} strokeWidth={3} />
                    )}
                </motion.div>

                <span style={{ fontFamily: '"Comfortaa", cursive' }} className="font-black text-[10px] lg:text-[11px] uppercase tracking-[0.3em] leading-tight whitespace-nowrap">
                    {message}
                </span>
            </div>
        </motion.div>
    );
};

export default Toast;
