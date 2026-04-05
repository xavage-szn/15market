const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Master secret used for all session address derivations
const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_universal_session_salt_v1";

/**
 * Deterministically derives a session wallet for a user.
 * Given the same userAddress and SESSION_MASTER_SECRET, this will always return the same address.
 */
function deriveUserWallet(userAddress) {
    if (!userAddress) throw new Error("Target address required");
    
    const addr = userAddress.toLowerCase();
    
    // Low-level deterministic path: secret + address -> hash -> private key
    // This is virtually impossible to crack but perfectly repeatable for the same user.
    const salt = ethers.id(`${SESSION_MASTER_SECRET}:${addr}`);
    const wallet = new ethers.Wallet(salt);

    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        wallet: wallet
    };
}

module.exports = { deriveUserWallet };
