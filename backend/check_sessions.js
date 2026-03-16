const { ethers } = require('ethers');

const SESSION_MASTER_SECRET = "15market_super_secure_master_secret_key_v1";

async function deriveUserWallet(userAddress) {
    if (!userAddress) return null;
    const addr = userAddress.toLowerCase();
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
}

async function check() {
    const addresses = [
        "0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C", // Root
        "0x1074E2461364f0842Fc60Ce0C85c950341F9E18f", // Suspicious 1
        "0x2C2A74EA3c85f5Df6E5D9402540140f25d9fFa0d", // Suspicious 2
        "0x70e3fb28e1794bb91d5bceb7d66b731d0c61af8e", // Funding source
    ];

    for (const addr of addresses) {
        const session = await deriveUserWallet(addr);
        console.log(`${addr} -> Session: ${session}`);
    }
}

check();
