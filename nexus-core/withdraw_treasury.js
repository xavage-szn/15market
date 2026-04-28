const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = "https://rpc.testnet.arc.network";
const TREASURY_CONTRACT = "0x345014899b42bF9034D9475760609e64B1433A6a";
const TARGET_WALLET = "0x1074E2461364f0842Fc60Ce0C85c950341F9E18f";
const AMOUNT_USDC = "200.0";

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Operator Address: ${wallet.address}`);
    const contract = new ethers.Contract(TREASURY_CONTRACT, [
        "function withdraw(uint256 _amount) external",
        "function owner() view returns (address)"
    ], wallet);

    const nonce = await provider.getTransactionCount(wallet.address);
    const gasPrice = ethers.parseUnits("500", "gwei");

    // 1. Withdraw from Contract to Operator
    console.log(`Withdrawing ${AMOUNT_USDC} USDC from Treasury Contract to Operator... (Nonce: ${nonce})`);
    try {
        const withdrawTx = await contract.withdraw(ethers.parseUnits(AMOUNT_USDC, 18), {
            gasPrice,
            nonce
        });
        console.log(`Withdrawal TX Sent: ${withdrawTx.hash}`);
        await withdrawTx.wait();
        console.log("Withdrawal Confirmed!");
    } catch (err) {
        console.warn("Withdrawal Failed (might already be in wallet):", err.message);
    }

    // 2. Send from Operator to Target
    console.log(`Sending ${AMOUNT_USDC} USDC from Operator to ${TARGET_WALLET}... (Nonce: ${nonce + 1})`);
    const sendTx = await wallet.sendTransaction({
        to: TARGET_WALLET,
        value: ethers.parseUnits(AMOUNT_USDC, 18),
        gasPrice,
        nonce: nonce + 1
    });
    console.log(`Transfer TX Sent: ${sendTx.hash}`);
    await sendTx.wait();
    console.log("Transfer Confirmed! Successfully sent 200 USDC.");
}

main().catch(console.error);
