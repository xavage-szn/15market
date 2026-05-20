import { useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useMemo } from 'react';

/**
 * useTradingWallet
 *
 * Detects the Privy ERC-4337 smart wallet (backed by Pimlico paymaster)
 * alongside the standard EOA embedded wallet.
 *
 * Architecture:
 *   eoaWallet.address   → Platform identity + session wallet seed (UNCHANGED)
 *   smartWallet.address → CCTP executor on source chains (Monad/Fuji/Sepolia)
 *
 * The smart wallet pays gas in USDC via the Pimlico paymaster configured
 * on the Privy dashboard. No native tokens (MON, AVAX, ETH) needed.
 */
export function useTradingWallet() {
    const { wallets } = useWallets();
    const { address: wagmiAddress } = useAccount();

    // Privy ERC-4337 smart wallet — walletClientType is 'smart_wallet' in v3
    const smartWallet = useMemo(() => {
        if (!wallets || !Array.isArray(wallets)) return null;
        return wallets.find(w =>
            w.walletClientType === 'smart_wallet' ||
            w.walletClientType === 'kernel' ||
            w.walletClientType === 'safe'
        ) || null;
    }, [wallets]);

    // Privy embedded EOA wallet — still the user's platform identity
    const eoaWallet = useMemo(() => {
        if (!wallets || !Array.isArray(wallets)) return null;
        return wallets.find(w => w.walletClientType === 'privy') || null;
    }, [wallets]);

    return {
        smartWallet,
        smartWalletAddress: smartWallet?.address || null,
        eoaWallet,
        isSmartWalletReady: !!(smartWallet?.address),
        mainWalletAddress: wagmiAddress || eoaWallet?.address || null,
    };
}
