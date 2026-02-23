const { ethers } = require('ethers');
const RPC = "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1";
const ADDR = "0x345014899b42bF9034D9475760609e64B1433A6a";

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC);
    const bal = await provider.getBalance(ADDR);
    console.log(`CONTRACT_BALANCE=${ethers.formatEther(bal)}`);
}
main().catch(err => console.error(err));
