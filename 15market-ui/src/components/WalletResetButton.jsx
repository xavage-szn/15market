import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fullWalletReset } from '../utils/walletCleanup';

export const WalletResetButton = ({ theme, onReset }) => {
    const [isResetting, setIsResetting] = React.useState(false);

    const handleReset = async () => {
        if (isResetting) return;

        setIsResetting(true);
        try {
            await fullWalletReset();
            if (onReset) onReset();

            // Reload page after cleanup to ensure fresh state
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (error) {
            console.error('Reset failed:', error);
            setIsResetting(false);
        }
    };

    return (
        <button
            onClick={handleReset}
            disabled={isResetting}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${theme === 'light'
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
                } ${isResetting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title="Clear all wallet connection states and reload"
        >
            <RefreshCw size={14} className={isResetting ? 'animate-spin' : ''} />
            {isResetting ? 'Resetting...' : 'Reset Wallet'}
        </button>
    );
};
