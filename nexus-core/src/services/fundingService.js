const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');
const profiles = require('../profiles');

const IRIS_API_URL = 'https://iris-api-sandbox.circle.com/attestations';

const CCTP_CONFIG = {
    // MessageTransmitter addresses
    transmitters: {
        '43113': '0xa4202283e3cf3d726615b3a6e8b939462d7c078b', // Fuji
        '111155111': '0x7865f3c0f72783f6836a001d2938888e888e888e', // Sepolia (Example)
        'arc': '0x0000000000000000000000000000000000000000' // Your Arc Testnet Transmitter
    },
    // Domain IDs
    domains: {
        '43113': 1,
        '111155111': 0,
        'arc': 5 // Example Domain ID for Arc
    }
};

/**
 * FundingService
 * Handles multi-token funding quotes, swaps, and revenue distribution.
 */
class FundingService {
    constructor() {
        this.spread = 0.005; // 0.5% exchange rate spread
        this.fundingFee = 0.01; // 1% platform funding fee
    }

    /**
     * Get real-time exchange rates from a DEX aggregator or price feed.
     * For this implementation, we use a hybrid of Price Feeds + Spread.
     */
    async getQuote(fromToken, amount) {
        // Supported tokens and their approximate USD prices (placeholders for real oracles)
        const prices = {
            'MON': 1.0,  // Monad native (simulated 1:1 for testnet or real rate)
            'AVAX': 35.5,
            'ETH': 2800.0,
            'USDC': 1.0
        };

        const price = prices[fromToken.toUpperCase()] || 0;
        if (price === 0) throw new Error("Unsupported token");

        const rawValue = amount * price;
        const spreadAmount = rawValue * this.spread;
        const feeAmount = rawValue * this.fundingFee;
        
        const estimatedUsdc = rawValue - spreadAmount - feeAmount;

        return {
            rate: price * (1 - this.spread),
            estimatedUsdc: estimatedUsdc.toFixed(4),
            fee: feeAmount.toFixed(4),
            spread: spreadAmount.toFixed(4),
            expiry: Date.now() + 60000 // 60s validity
        };
    }

    /**
     * Finalize a deposit by crediting the user's Trading Wallet.
     * This is called after the backend verifies the incoming transaction on the source chain.
     */
    async creditTradingWallet(userAddr, usdcAmount, sourceTxHash, sessionAddress) {
        console.log(`[Funding] Crediting ${usdcAmount} USDC to Trading Wallet: ${sessionAddress} for user ${userAddr}`);
        
        // 1. Send USDC to the Trading Wallet (Session EOA) on Arc
        // In a real scenario, this uses the platform's hot wallet or Circle Programmable Wallets.
        // For now, we simulate the transfer and update the backend cache.
        
        // 2. Distribute Revenue via Nanopayments (Conceptual)
        // Here we would call the Circle Gateway API to stream the fee to the treasury.
        await this.distributeFees(usdcAmount * (this.fundingFee + this.spread));

        return {
            success: true,
            amount: usdcAmount,
            txHash: sourceTxHash
        };
    }

    async distributeFees(amount) {
        console.log(`[Nanopayments] Streaming ${amount.toFixed(6)} USDC to Treasury: ${config.TREASURY_ADDRESS}`);
        // Implementation would use @circle-fin/x402-batching
    }

    /**
     * Monitor a CCTP burn transaction, fetch attestation, and settle on Arc.
     */
    async monitorAndSettleCCTP(userAddr, txHash, fromChain, amount) {
        console.log(`[CCTP-Relayer] Starting process for ${txHash} on chain ${fromChain}`);

        try {
            // 1. Get Source Chain Provider
            // In a real app, these would come from config.js
            const rpcUrls = {
                '43113': 'https://api.avax-test.network/ext/bc/C/rpc',
                '111155111': 'https://ethereum-sepolia-rpc.publicnode.com'
            };
            const sourceProvider = new ethers.JsonRpcProvider(rpcUrls[fromChain]);
            
            // 2. Wait for transaction and extract message
            const receipt = await sourceProvider.waitForTransaction(txHash);
            
            // The message is emitted in the MessageSent event of the MessageTransmitter
            // We find the log and extract the 'message' bytes
            const messageSentTopic = ethers.id("MessageSent(bytes)");
            const log = receipt.logs.find(l => l.topics[0] === messageSentTopic);
            
            if (!log) throw new Error("CCTP MessageSent log not found");
            const messageBytes = ethers.AbiCoder.defaultAbiCoder().decode(['bytes'], log.data)[0];
            const messageHash = ethers.keccak256(messageBytes);

            console.log(`[CCTP-Relayer] Message Hash: ${messageHash}. Polling Iris API...`);

            // 3. Poll Iris API for Attestation
            let attestation = null;
            for (let i = 0; i < 60; i++) { // Poll for 10 minutes (10s intervals)
                try {
                    const res = await axios.get(`${IRIS_API_URL}/${messageHash}`);
                    if (res.data.status === 'complete') {
                        attestation = res.data.attestation;
                        break;
                    }
                } catch (e) {
                    // Not ready yet
                }
                await new Promise(r => setTimeout(r, 10000));
            }

            if (!attestation) throw new Error("Attestation timeout");
            console.log(`[CCTP-Relayer] Attestation received! Executing receiveMessage on Arc...`);

            // 4. Execute receiveMessage on Arc Testnet
            const arcProvider = new ethers.JsonRpcProvider(config.RPC_URL || 'http://localhost:8545');
            const relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY || process.env.SESSION_MASTER_SECRET, arcProvider);
            
            const transmitterAbi = ["function receiveMessage(bytes message, bytes attestation) external returns (bool)"];
            const transmitter = new ethers.Contract(CCTP_CONFIG.transmitters.arc, transmitterAbi, relayerWallet);

            const tx = await transmitter.receiveMessage(messageBytes, attestation);
            await tx.wait();

            console.log(`[CCTP-Relayer] Successfully settled on Arc! TX: ${tx.hash}`);

            // 5. Finalize in platform cache
            await this.creditTradingWallet(userAddr, amount, txHash, userAddr); // Simplified for demo
            
        } catch (err) {
            console.error(`[CCTP-Relayer] Settlement Failed:`, err.message);
        }
    }
}

module.exports = new FundingService();
