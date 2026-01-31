/**
 * Wallet Cleanup Utilities
 * Handles proper cleanup of wallet connection states to prevent "previous request still active" errors
 */

/**
 * Clear all wallet connection states from localStorage and sessionStorage
 */
export const clearWalletStorage = () => {
    try {
        // Clear AppKit/Reown specific storage
        const keysToRemove = [];

        // Check localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
                key.includes('wc@2') ||
                key.includes('WALLETCONNECT') ||
                key.includes('wagmi') ||
                key.includes('reown') ||
                key.includes('appkit') ||
                key.includes('-modal')
            )) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.warn(`Failed to remove ${key}:`, e);
            }
        });

        // Clear sessionStorage
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (
                key.includes('wc@2') ||
                key.includes('WALLETCONNECT') ||
                key.includes('wagmi') ||
                key.includes('reown') ||
                key.includes('appkit')
            )) {
                sessionKeysToRemove.push(key);
            }
        }

        sessionKeysToRemove.forEach(key => {
            try {
                sessionStorage.removeItem(key);
            } catch (e) {
                console.warn(`Failed to remove ${key}:`, e);
            }
        });

        console.log('✅ Wallet storage cleared:', keysToRemove.length + sessionKeysToRemove.length, 'items');
    } catch (error) {
        console.error('Error clearing wallet storage:', error);
    }
};

/**
 * Disconnect all Solana wallet adapters
 */
export const disconnectSolanaWallets = async () => {
    try {
        const wallets = [
            window.solana,
            window.solflare,
            window.phantom,
            window.backpack,
            window.glow
        ];

        for (const wallet of wallets) {
            if (wallet?.disconnect) {
                try {
                    await wallet.disconnect();
                } catch (e) {
                    // Ignore errors, wallet might not be connected
                }
            }
        }

        console.log('✅ Solana wallets disconnected');
    } catch (error) {
        console.error('Error disconnecting Solana wallets:', error);
    }
};

/**
 * Full wallet reset - clears all states and disconnects all wallets
 */
export const fullWalletReset = async () => {
    try {
        console.log('🔄 Performing full wallet reset...');

        // 1. Disconnect Solana wallets
        await disconnectSolanaWallets();

        // 2. Clear storage
        clearWalletStorage();

        // 3. Small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log('✅ Full wallet reset complete');
        return true;
    } catch (error) {
        console.error('Error during full wallet reset:', error);
        return false;
    }
};

/**
 * Check if there are any pending wallet connection requests
 */
export const hasPendingWalletRequests = () => {
    try {
        // Check for WalletConnect pending requests
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('wc@2')) {
                const value = localStorage.getItem(key);
                if (value && value.includes('pending')) {
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking pending requests:', error);
        return false;
    }
};
