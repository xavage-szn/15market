const { ethers } = require('ethers');
require('dotenv').config();

const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET;
if (!SESSION_MASTER_SECRET) {
  console.error('SESSION_MASTER_SECRET env var is required (no hardcoded default). Set it before running this script.');
  process.exit(1);
}
const ARC_RPC = "https://5042002.rpc.thirdweb.com";

async function checkSession(userAddress) {
    const addr = userAddress.toLowerCase();
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`User Address: ${userAddress}`);
    console.log(`Derived Session Address: ${wallet.address}`);

    const bal = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(bal)} USDC`);

    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    console.log(`Nonce (pending): ${nonce}`);
}

const user = process.argv[2] || "0x0123456789ABCDEF0123456789ABCDEF01234567"; // Placeholder
checkSession(user);
