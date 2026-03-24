const { ethers } = require('ethers');
const path = require('path');
const blockchain = require('./blockchain');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_default_secret_fallback_v1";

/**
 * Derives a deterministic session wallet for a given user address.
 * No Mnemonic required - relies on SESSION_MASTER_SECRET for entropy.
 */
async function deriveUserWallet(userAddress) {
    if (!userAddress) {
        throw new Error("User address required for derivation");
    }

    const addr = userAddress.toLowerCase();
    
    // Create deterministic entropy from secret + user address
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    
    let wallet = new ethers.Wallet(privateKey);
    
    // Connect to blockchain provider if available
    try {
        if (blockchain.provider) {
            wallet = wallet.connect(blockchain.provider);
        } else {
            await blockchain._ensureReady();
            if (blockchain.provider) {
                wallet = wallet.connect(blockchain.provider);
            }
        }
    } catch (e) {
        console.warn("[Derivation] Could not connect wallet to provider:", e.message);
    }
    
    return {
        wallet: wallet,
        address: wallet.address,
        isSession: true
    };
}

module.exports = { deriveUserWallet };
