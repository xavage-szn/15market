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
            console.log('📂 [Turnkey] Available Wallets:', wallets.map(w => ({ id: w.id, name: w.name })));
            
            if (!wallets || wallets.length === 0) {
                console.error('❌ [Turnkey] Connect failed: No wallets available from Turnkey SDK.');
                throw new Error('No Turnkey wallets found. Please ensure you are logged in.');
            }

            // FILTER: Look for a wallet that is NOT a shared organization/managed wallet if possible
            // In many V2 setups, user-specific wallets have different naming or metadata
            // For now, we will log them and ensure we aren't picking an obviously shared one
            const wallet = wallets.find(w => !w.name.toLowerCase().includes('managed') && !w.name.toLowerCase().includes('admin')) || wallets[0];
            
            const accounts = wallet.accounts.map(a => a.address);

            console.log(`✅ [Turnkey] Connected to Wallet [${wallet.name}]:`, accounts[0]);

            return {
                accounts,
                chainId: chainId || 5042002,
            };
        },

        async disconnect() {
            console.log('🚪 [Turnkey] Disconnecting...');
            provider = null;
            if (typeof window !== 'undefined') {
                window.getTurnkeyWallets = () => [];
            }
        },

        async getAccounts() {
            const wallets = await getWallets();
            if (!wallets || wallets.length === 0) {
                console.warn('⚠️ [Turnkey] No accounts found. User has no wallets in this sub-org.');
                return [];
            }
            return wallets[0].accounts.map(a => a.address);
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
            const walletId = wallets?.[0]?.id;

            if (!walletId) {
                console.warn('⚠️ [Turnkey] No wallet available. User must be logged in through the Turnkey modal first.');
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
