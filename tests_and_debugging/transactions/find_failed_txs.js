const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function getRecentFailedTxs() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    console.log("🔍 Checking recent transactions to contract...\n");

    // Get recent block
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    // Check last 100 blocks for transactions to our contract
    const startBlock = currentBlock - 100;

    console.log(`Scanning blocks ${startBlock} to ${currentBlock}...\n`);

    for (let i = currentBlock; i >= startBlock; i--) {
        const block = await provider.getBlock(i, true);
        if (!block || !block.transactions) continue;

        for (const txHash of block.transactions) {
            try {
                const tx = await provider.getTransaction(txHash);
                if (tx && tx.to && tx.to.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
                    const receipt = await provider.getTransactionReceipt(txHash);

                    if (receipt.status === 0) {
                        console.log(`❌ FAILED TX: ${txHash}`);
                        console.log(`   Block: ${receipt.blockNumber}`);
                        console.log(`   From: ${tx.from}`);
                        console.log(`   Value: ${ethers.formatEther(tx.value)} USDC`);
                        console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);

                        // Try to decode the function call
                        const ABI = ["function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"];
                        const iface = new ethers.Interface(ABI);

                        try {
                            const decoded = iface.parseTransaction({ data: tx.data });
                            console.log(`   Bet ID: ${decoded.args._betId.toString()}`);
                            console.log(`   Direction: ${decoded.args._direction}`);
                            console.log(`   Duration: ${decoded.args._duration.toString()}`);
                            console.log(`   Entry Price: ${Number(decoded.args._entryPrice) / 100000000}`);
                            console.log(`   Market ID: ${decoded.args._marketId}`);
                            console.log(`   Payout Address: ${decoded.args._payoutAddress}`);

                            // Check if bet ID exists
                            const contractABI = ["function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"];
                            const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
                            const bet = await contract.bets(decoded.args._betId);

                            if (bet.user !== ethers.ZeroAddress) {
                                console.log(`   ⚠️  REASON: Bet ID already exists (owned by ${bet.user})`);
                            } else {
                                console.log(`   ⚠️  REASON: Unknown (bet ID is available)`);
                            }
                        } catch (e) {
                            console.log(`   Couldn't decode: ${e.message}`);
                        }
                        console.log('');
                    }
                }
            } catch (e) {
                // Skip errors
            }
        }
    }

    console.log("✅ Scan complete");
}

getRecentFailedTxs().catch(console.error);
