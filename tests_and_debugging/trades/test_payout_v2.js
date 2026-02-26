const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const rpc = "https://5042002.rpc.thirdweb.com";
    const pk = process.env.PRIVATE_KEY;
    // Hardcoded new address to avoid .env caching issues
    const contractAddress = "0x345014899b42bF9034D9475760609e64B1433A6a";

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pk, provider);

    console.log(`Wallet: ${wallet.address}`);
    console.log(`Contract: ${contractAddress}`);

    const abi = [
        "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
        "function settleBet(uint256 _betId, uint256 _exitPrice) external",
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    const contract = new ethers.Contract(contractAddress, abi, wallet);

    // 1. Place Bet
    const betId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100000);
    const amount = ethers.parseEther("0.1"); // 0.1 USDC/Coin
    const direction = 1; // UP
    const duration = 10; // 10 seconds
    const entryPrice = 50000000000n; // 500.00
    const marketId = 0; // BTC

    console.log(`\n1. Placing Bet ID: ${betId}...`);
    try {
        const tx = await contract.placeBet(betId, direction, duration, entryPrice, marketId, wallet.address, {
            value: amount,
            gasLimit: 600000
        });
        console.log(`Tx: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Bet Placed");
    } catch (e) {
        console.error("❌ Place Bet Failed:", e);
        return;
    }

    // Capture balance
    const balBefore = await provider.getBalance(wallet.address);
    console.log(`Balance Before Settle: ${ethers.formatEther(balBefore)}`);

    // 2. Wait
    console.log(`Waiting ${duration}s for expiry...`);
    await new Promise(r => setTimeout(r, (duration + 2) * 1000));

    // 3. Settle Win
    const exitPrice = 60000000000n;
    console.log(`\n2. Settling Bet...`);
    try {
        const tx2 = await contract.settleBet(betId, exitPrice, { gasLimit: 600000 });
        console.log(`Settle Tx: ${tx2.hash}`);
        const receipt = await tx2.wait();
        console.log("✅ Settle Confirmed");
    } catch (e) {
        console.error("❌ Settle Failed:", e);
    }

    // 4. Check Result
    const balAfter = await provider.getBalance(wallet.address);
    console.log(`Balance After Settle:  ${ethers.formatEther(balAfter)}`);
    console.log(`Diff: ${ethers.formatEther(balAfter - balBefore)}`);
}

main();
