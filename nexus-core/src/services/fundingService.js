require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');
const profiles = require('../profiles');

// Circle IRIS Attestation API (testnet sandbox)
const IRIS_API_URL = 'https://iris-api-sandbox.circle.com/v1/attestations';

/**
 * CCTP V1 Testnet: Complete chain routing table
 * Source chain burns USDC → destination chain mints USDC.
 * The destination chain must be different from the source.
 * All MessageTransmitter addresses from Circle's official docs.
 *
 * Domains: Eth Sepolia=0, Fuji=1, OP Sepolia=2, Arb Sepolia=3, Solana Devnet=5, Base Sepolia=6, Polygon Amoy=7
 */
const CCTP_CHAINS = {
    // Ethereum Sepolia (domain 0) → bridges TO Avalanche Fuji (domain 1)
    '111155111': {
        name: 'Ethereum Sepolia',
        domain: 0,
        rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        // Default destination when sending FROM this chain
        defaultDest: '43113'
    },
    // Avalanche Fuji (domain 1) → bridges TO Ethereum Sepolia (domain 0)
    '43113': {
        name: 'Avalanche Fuji',
        domain: 1,
        rpc: 'https://api.avax-test.network/ext/bc/C/rpc',
        tokenMessenger: '0xeb08f243E5d3FCFF26A9E38Ae5520A669f4019d0',
        messageTransmitter: '0xa9fB1b3009DCb79E2fe346c16a604B8Fa8aE0a79',
        usdc: '0x5425890298aed601595a70AB815c96711a31Bc65',
        defaultDest: '111155111'
    },
    // OP Sepolia (domain 2) → bridges TO Ethereum Sepolia (domain 0)
    '11155420': {
        name: 'OP Sepolia',
        domain: 2,
        rpc: 'https://sepolia.optimism.io',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
        defaultDest: '111155111'
    },
    // Arbitrum Sepolia (domain 3) → bridges TO Ethereum Sepolia (domain 0)
    '421614': {
        name: 'Arbitrum Sepolia',
        domain: 3,
        rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872',
        usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
        defaultDest: '111155111'
    },
    // Base Sepolia (domain 6) → bridges TO Ethereum Sepolia (domain 0)
    '84532': {
        name: 'Base Sepolia',
        domain: 6,
        rpc: 'https://sepolia.base.org',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        defaultDest: '111155111'
    },
    // Polygon Amoy (domain 7) → bridges TO Ethereum Sepolia (domain 0)
    '80002': {
        name: 'Polygon Amoy',
        domain: 7,
        rpc: 'https://rpc-amoy.polygon.technology',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        usdc: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
        defaultDest: '111155111'
    }
};

/**
 * FundingService
 * Handles multi-token funding quotes, CCTP burn/mint relay, and balance crediting.
 */
class FundingService {
    constructor() {
        this.spread = 0.005;    // 0.5% exchange rate spread
        this.fundingFee = 0.01; // 1% platform funding fee

        // Pre-warm relayer wallets for each destination chain
        this.destWallets = {};
        this.destProviders = {};
        try {
            const pk = process.env.RELAYER_PRIVATE_KEY || process.env.SESSION_MASTER_SECRET;
            if (pk) {
                const normalizedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
                for (const [chainId, chainCfg] of Object.entries(CCTP_CHAINS)) {
                    const p = new ethers.JsonRpcProvider(chainCfg.rpc);
                    this.destProviders[chainId] = p;
                    this.destWallets[chainId] = new ethers.Wallet(normalizedPk, p);
                }
                const sampleAddr = Object.values(this.destWallets)[0]?.address;
                console.log(`[CCTP-Relayer] Warmed up for ${Object.keys(CCTP_CHAINS).length} chains. Relayer: ${sampleAddr}`);
            } else {
                console.warn('[CCTP-Relayer] No RELAYER_PRIVATE_KEY found. Auto-relay will be skipped.');
            }
        } catch (e) {
            console.error('[CCTP-Relayer] Warm-up failed:', e.message);
        }
    }

    /**
     * Returns a simple funding quote.
     */
    async getQuote(fromToken, amount) {
        const mockPrices = { 'ETH': 3500, 'AVAX': 35, 'MON': 2.5, 'USDC': 1, 'SOL': 150 };
        const price = mockPrices[fromToken.toUpperCase()] || 1;
        const rawUsdc = amount * price;
        const fee = rawUsdc * this.fundingFee;
        const estimatedUsdc = (rawUsdc - fee).toFixed(2);
        return { estimatedUsdc, fee: fee.toFixed(2), price };
    }

    /**
     * Credits a user's platform trading balance (in-memory + DB).
     */
    async creditTradingWallet(userAddr, amount, txHash, walletAddress) {
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return { success: false, error: 'Invalid amount' };

        console.log(`[FundingService] Crediting ${amountNum} USDC to ${userAddr} (tx: ${txHash})`);

        try {
            await profiles.creditBalance(userAddr, amountNum, txHash);
        } catch (e) {
            console.warn(`[FundingService] Profile credit error (non-fatal): ${e.message}`);
        }

        return { success: true, credited: amountNum, txHash };
    }

    async distributeFees(amount) {
        console.log(`[Nanopayments] Streaming ${amount.toFixed(6)} USDC to Treasury`);
    }

    /**
     * Core CCTP Relay: Monitor a burn tx, get attestation from IRIS, and
     * execute receiveMessage on the CORRECT destination chain.
     *
     * @param {string} userAddr       - User's platform address
     * @param {string} txHash         - Burn transaction hash on source chain
     * @param {string} fromChainId    - Source chain ID (e.g. '111155111' for Sepolia)
     * @param {string} amount         - USDC amount credited to user
     * @param {string} destChainId    - Destination chain ID (optional, auto-resolved from CCTP_CHAINS)
     */
    async monitorAndSettleCCTP(userAddr, txHash, fromChainId, amount, destChainId) {
        const sourceConfig = CCTP_CHAINS[fromChainId];
        if (!sourceConfig) {
            console.error(`[CCTP-Relayer] Unsupported source chain: ${fromChainId}`);
            return;
        }

        // Resolve destination chain — use override if provided, otherwise use the default
        const destId = destChainId || sourceConfig.defaultDest;
        const destConfig = CCTP_CHAINS[destId];
        if (!destConfig) {
            console.error(`[CCTP-Relayer] Unsupported destination chain: ${destId}`);
            return;
        }

        console.log(`[CCTP-Relayer] Monitoring ${sourceConfig.name} → ${destConfig.name} | TX: ${txHash}`);

        try {
            // Step 1: Get tx receipt from source chain with retry loop
            const sourceProvider = new ethers.JsonRpcProvider(sourceConfig.rpc);
            let receipt = null;

            for (let attempt = 0; attempt < 30; attempt++) {
                try {
                    receipt = await sourceProvider.getTransactionReceipt(txHash);
                    if (receipt) break;
                } catch (e) { /* retry */ }
                await new Promise(r => setTimeout(r, 5000));
            }

            if (!receipt) {
                console.error(`[CCTP-Relayer] Receipt timeout for ${txHash}`);
                return;
            }

            if (receipt.status === 0) {
                console.error(`[CCTP-Relayer] TX reverted on-chain: ${txHash}. Cannot relay.`);
                return;
            }

            console.log(`[CCTP-Relayer] Receipt confirmed (status: ${receipt.status}, logs: ${receipt.logs.length})`);

            // Step 2: Extract CCTP MessageSent log
            const messageSentTopic = ethers.id('MessageSent(bytes)');
            const log = receipt.logs.find(l => l.topics && l.topics[0] === messageSentTopic);

            if (!log) {
                console.error(`[CCTP-Relayer] No MessageSent log found in TX ${txHash}. Not a valid CCTP burn.`);
                console.error('[CCTP-Relayer] Log topics found:', receipt.logs.map(l => l.topics?.[0]).filter(Boolean));
                return;
            }

            const messageBytes = ethers.AbiCoder.defaultAbiCoder().decode(['bytes'], log.data)[0];
            const messageHash = ethers.keccak256(messageBytes);
            console.log(`[CCTP-Relayer] Message Hash: ${messageHash}. Polling IRIS...`);

            // Step 3: Poll Circle IRIS Attestation API until complete
            let attestation = null;
            for (let i = 0; i < 72; i++) { // 72 × 10s = 12 minutes max
                try {
                    const irisRes = await axios.get(`${IRIS_API_URL}/${messageHash}`);
                    if (irisRes.data?.status === 'complete' && irisRes.data?.attestation) {
                        attestation = irisRes.data.attestation;
                        console.log(`[CCTP-Relayer] Attestation received after ${i * 10}s`);
                        break;
                    }
                    console.log(`[CCTP-Relayer] IRIS status: ${irisRes.data?.status || 'pending'} (attempt ${i + 1}/72)`);
                } catch (e) {
                    if (e.response?.status !== 404) {
                        console.warn(`[CCTP-Relayer] IRIS API error: ${e.message}`);
                    }
                }
                await new Promise(r => setTimeout(r, 10000));
            }

            if (!attestation) {
                console.error('[CCTP-Relayer] Attestation timeout after 12 minutes');
                return;
            }

            // Step 4: Call receiveMessage on the DESTINATION chain's MessageTransmitter
            const relayerWallet = this.destWallets[destId];
            if (!relayerWallet) {
                console.error(`[CCTP-Relayer] No relayer wallet for destination chain ${destId}`);
                return;
            }

            const transmitterAbi = [
                'function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool)'
            ];
            const transmitter = new ethers.Contract(
                destConfig.messageTransmitter,
                transmitterAbi,
                relayerWallet
            );

            console.log(`[CCTP-Relayer] Calling receiveMessage on ${destConfig.name} (${destConfig.messageTransmitter})`);
            const mintTx = await transmitter.receiveMessage(messageBytes, attestation);
            const mintReceipt = await mintTx.wait();

            console.log(`[CCTP-Relayer] ✅ USDC minted on ${destConfig.name}! TX: ${mintTx.hash}`);

            // Step 5: Credit the user's platform trading balance
            await this.creditTradingWallet(userAddr, amount, mintTx.hash, userAddr);

        } catch (err) {
            console.error(`[CCTP-Relayer] Settlement failed:`, err.message);
        }
    }
}

module.exports = new FundingService();
