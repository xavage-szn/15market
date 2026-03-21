const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const MNEMONIC = process.env.MNEMONIC;

async function deriveUserWallet(userAddress) {
    if (!MNEMONIC) {
        throw new Error("Relayer Mnemonic not configured in .env");
    }

    // Standard BIP44 derivation path: m/44'/60'/0'/0/index
    // We use the last 4 bytes of the address as an index to ensure determinism
    const last4 = userAddress.slice(-8); 
    const index = parseInt(last4, 16) % 2000000; // Cap at 2M for safety
    
    const hdNode = ethers.HDNodeWallet.fromPhrase(MNEMONIC);
    const child = hdNode.derivePath(`m/44'/60'/0'/0/${index}`);
    
    return {
        wallet: child,
        address: child.address,
        index
    };
}

module.exports = { deriveUserWallet };
