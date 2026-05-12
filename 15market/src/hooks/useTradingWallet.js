import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';

export function useTradingWallet() {
    const { client } = useSmartWallets();
    const { user } = usePrivy();
    const { address: wagmiAddress } = useAccount();

    // The smart wallet client automatically uses the embedded wallet as the signer
    // and bypasses the UI prompt if Session Keys are configured or it's a sponsored transaction.
    
    const smartWallet = user?.linkedAccounts?.find(account => account.type === 'smart_wallet');
    
    const executeTrade = async (transactionRequest) => {
        if (!client) {
            throw new Error("Smart Wallet client is not available. Please ensure it is configured in the Privy Dashboard.");
        }
        
        try {
            console.log("🚀 [SMART WALLET] Executing trade via Smart Wallet without UI prompt...", transactionRequest);
            
            // `client.sendTransaction` will execute the transaction. 
            // Because this is a Smart Wallet client (e.g. ZeroDev/Safe via Privy), 
            // it will not prompt the user for a signature if configured correctly.
            const txHash = await client.sendTransaction(transactionRequest);
            console.log("✅ [SMART WALLET] Trade executed successfully! TX Hash:", txHash);
            
            return txHash;
        } catch (error) {
            console.error("❌ [SMART WALLET] Trade execution failed:", error);
            throw error;
        }
    };

    return {
        client,
        executeTrade,
        isSmartWalletReady: !!client,
        smartWalletAddress: smartWallet?.address || null,
        mainWalletAddress: wagmiAddress || user?.wallet?.address || null
    };
}
