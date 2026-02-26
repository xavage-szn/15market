const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function scan() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const iface = new ethers.Interface([
        "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
    ]);

    const currentBlock = await provider.getBlockNumber();
    console.log(`Scanning last 100 blocks starting from ${currentBlock}...`);

    for (let i = currentBlock; i > currentBlock - 100; i--) {
        const receipt = await provider.getBlock(i, true);
        if (!receipt) continue;
        for (const tx of receipt.transactions) {
            const txReceipt = await provider.getTransactionReceipt(tx.hash);
            if (txReceipt && txReceipt.status === 1 && txReceipt.to && txReceipt.to.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
                console.log(`Found successful tx: ${tx.hash}`);
                txReceipt.logs.forEach(log => {
                    try {
                        const parsed = iface.parseLog(log);
                        console.log(`BetPlaced Event: ID=${parsed.args.id}`);
                    } catch (e) { }
                });
            }
        }
    }
    console.log("Scan complete.");
}

scan();
