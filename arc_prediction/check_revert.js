const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function analyzeLastFailed() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, [
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ], provider);

    console.log("Analyzing last failed transactions...");

    // Check some recent blocks
    const currentBlock = await provider.getBlockNumber();
    for (let i = currentBlock; i > currentBlock - 50; i--) {
        const block = await provider.getBlock(i, true);
        if (!block) continue;
        for (const tx of block.prefetchedTransactions || block.transactions) {
            const txHash = typeof tx === 'string' ? tx : tx.hash;
            const txData = typeof tx === 'string' ? await provider.getTransaction(txHash) : tx;

            if (txData && txData.to && txData.to.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
                const receipt = await provider.getTransactionReceipt(txHash);
                if (receipt.status === 0) {
                    console.log(`\n❌ Failed Tx: ${txHash}`);
                    console.log(`   From: ${txData.from}`);
                    console.log(`   Value: ${ethers.formatEther(txData.value)}`);

                    // Try to decode call
                    const iface = new ethers.Interface(["function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"]);
                    try {
                        const decoded = iface.parseTransaction({ data: txData.data });
                        console.log(`   Bet ID: ${decoded.args._betId}`);

                        // Check if bet ID already exists
                        const bet = await contract.bets(decoded.args._betId);
                        console.log(`   Bet user in contract: ${bet.user}`);
                        if (bet.user !== ethers.ZeroAddress) {
                            console.log("   🔴 REASON: Bet ID ALREADY EXISTS");
                        } else {
                            // Try to simulate
                            try {
                                await provider.call({
                                    from: txData.from,
                                    to: txData.to,
                                    data: txData.data,
                                    value: txData.value,
                                    blockTag: receipt.blockNumber - 1
                                });
                                console.log("   Simulation succeeded? (Wait, that's weird)");
                            } catch (simErr) {
                                console.log(`   🔴 REASON FROM SIMULATION: ${simErr.message}`);
                                if (simErr.data) console.log(`   Revert Data: ${simErr.data}`);
                            }
                        }
                    } catch (e) {
                        console.log("   Couldn't decode args");
                    }
                }
            }
        }
    }
}

analyzeLastFailed().catch(console.error);
