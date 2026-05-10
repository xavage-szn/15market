import { createConnector } from 'wagmi';
import { TurnkeyClient } from '@turnkey/http';
import { WebauthnStamper } from '@turnkey/webauthn-stamper';
import { createEIP1193Provider } from "@turnkey/eip-1193-provider";


/**
 * Turnkey Connector for Wagmi
 * This connector allows Wagmi to interact with Turnkey's Embedded Wallets.
 */
export function turnkeyConnector({ organizationId, apiBaseUrl, rpId, getWallets }) {
    let provider = null;

    return createConnector((config) => ({
        id: 'turnkey',
        name: 'Turnkey',
        type: 'turnkey',

        async connect({ chainId } = {}) {
            console.log('🔗 [Turnkey] Connecting...');
            
            const wallets = await getWallets();
            
            if (!wallets || wallets.length === 0) {
                throw new Error('No Turnkey wallets found. Please log in first.');
            }

            const wallet = wallets[0];
            const accounts = wallet.accounts.map(a => a.address);

            console.log('✅ [Turnkey] Connected:', accounts[0]);

            return {
                accounts,
                chainId: chainId || 5042002,
            };
        },

        async disconnect() {
            console.log('🚪 [Turnkey] Disconnecting...');
            provider = null;
        },

        async getAccounts() {
            const wallets = await getWallets();
            return wallets ? wallets[0]?.accounts.map(a => a.address) : [];
        },

        async getChainId() {
            return 5042002; // Arc Testnet
        },

        async getProvider() {
            if (provider) return provider;

            console.log('🛠️ [Turnkey] Initializing EIP-1193 Provider...');
            const stamper = new WebauthnStamper({ rpId });
            const client = new TurnkeyClient({ baseUrl: apiBaseUrl }, stamper);
            
            // Get wallets to find the first one
            const wallets = await getWallets();
            const walletId = wallets?.[0]?.id || "81f5a651-62ea-5a27-bcad-a5ac69ece2a2"; // Fallback to default wallet

            if (!walletId) {
                console.warn('⚠️ [Turnkey] No wallet ID available for provider initialization.');
                return null;
            }

            provider = await createEIP1193Provider({
                turnkeyClient: client,
                organizationId,
                walletId,
                chains: [
                    {
                        chainId: '0x4ce942', // Arc Testnet (5042002 in hex)
                        rpcUrls: ['https://rpc.testnet.arc.network'],
                    }
                ]
            });

            return provider;
        },


        async isAuthorized() {
            const wallets = await getWallets();
            return !!(wallets && wallets.length > 0);
        },

        onAccountsChanged(accounts) {
            if (accounts.length === 0) config.emitter.emit('disconnect');
            else config.emitter.emit('change', { accounts });
        },

        onChainChanged(chainId) {
            config.emitter.emit('change', { chainId: Number(chainId) });
        },

        onDisconnect() {
            config.emitter.emit('disconnect');
        },
    }));
}
