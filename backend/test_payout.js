const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const rpc = "https://5042002.rpc.thirdweb.com"; // Force Thirdweb
    const pk = process.env.PRIVATE_KEY;
    const contractAddress = process.env.ARC_CONTRACT_ADDRESS;

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
    const betId = Date.now();
    const amount = ethers.parseEther("0.1"); // 0.1 USDC/Coin
    const direction = 1; // UP
    const duration = 10; // 10 seconds
    const entryPrice = 50000000000n; // 500.00
    const marketId = 0; // BTC

    console.log(`\n1. Placing Bet ID: ${betId} (Amount: 0.1, Dir: UP, Entry: 500.00)...`);
    try {
        const tx = await contract.placeBet(betId, direction, duration, entryPrice, marketId, wallet.address, {
            value: amount,
            gasLimit: 500000
        });
        console.log(`Tx: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Bet Placed");
    } catch (e) {
        console.error("❌ Place Bet Failed:", e);
        return;
    }

    // Capture balance before settle
    const balBefore = await provider.getBalance(wallet.address);
    console.log(`\nBalance Before Settle: ${ethers.formatEther(balBefore)}`);

    // 2. Wait
    console.log(`Waiting ${duration}s for expiry...`);
    await new Promise(r => setTimeout(r, (duration + 2) * 1000));

    // 3. Settle Win (Price = 600.00 > 500.00)
    const exitPrice = 60000000000n;
    console.log(`\n2. Settling Bet with Winning Price (600.00)...`);
    try {
        const tx2 = await contract.settleBet(betId, exitPrice, { gasLimit: 500000 });
        console.log(`Settle Tx: ${tx2.hash}`);
        const receipt = await tx2.wait();
        console.log("✅ Settle Confirmed");
    } catch (e) {
        console.error("❌ Settle Failed:", e);
        // Check revert reason if possible
        if (e.data) console.log("Revert Data:", e.data);
    }

    // 4. Check Result
    const balAfter = await provider.getBalance(wallet.address);
    console.log(`\nBalance After Settle:  ${ethers.formatEther(balAfter)}`);
    console.log(`Diff: ${ethers.formatEther(balAfter - balBefore)}`);

    const betInfo = await contract.bets(betId);
    console.log(`\nBet Status: Settled=${betInfo.settled}, Won=${betInfo.won}`);
}

main();
