const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const TX_HASH = "0x03bd06ee5b23770abfeb42bce94e1ed75a3fc3d70057390c083b3308df15c23f";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function checkTx() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    const receipt = await provider.getTransactionReceipt(TX_HASH);

    console.log("\n=== TRANSACTION ANALYSIS ===\n");
    console.log(`TX Hash: ${TX_HASH}`);
    console.log(`Status: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ FAILED (REVERTED)'}`);
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

    if (receipt.status === 0) {
        console.log(`\n❌ THE TRANSACTION FAILED!`);
        console.log(`\nThis means:`);
        console.log(`  • The contract REJECTED the transaction`);
        console.log(`  • The stake was NOT deducted (it bounced back)`);
        console.log(`  • The bet was NOT placed on-chain`);
        console.log(`\nCommon reasons for failure:`);
        console.log(`  1. Bet ID already exists (duplicate nonce)`);
        console.log(`  2. Invalid parameters (direction, duration, etc.)`);
        console.log(`  3. Contract validation failed`);
        console.log(`  4. Insufficient value sent`);

        // Check the transaction input
        const tx = await provider.getTransaction(TX_HASH);
        console.log(`\nTransaction Details:`);
        console.log(`  From: ${tx.from}`);
        console.log(`  To: ${tx.to}`);
        console.log(`  Value: ${ethers.formatEther(tx.value)} USDC`);

        // Decode function call
        const ABI = ["function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"];
        const iface = new ethers.Interface(ABI);

        try {
            const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
            console.log(`\nDecoded Function Call:`);
            console.log(`  Function: ${decoded.name}`);
            console.log(`  Bet ID: ${decoded.args._betId.toString()}`);
            console.log(`  Direction: ${decoded.args._direction === 1 ? 'UP' : 'DOWN'} (${decoded.args._direction})`);
            console.log(`  Duration: ${decoded.args._duration.toString()}s`);
            console.log(`  Entry Price: ${Number(decoded.args._entryPrice) / 100000000}`);
            console.log(`  Market ID: ${decoded.args._marketId}`);
            console.log(`  Payout Address: ${decoded.args._payoutAddress}`);

            // Check if bet ID already exists
            const contractABI = [
                "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
            ];
            const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
            const existingBet = await contract.bets(decoded.args._betId);

            if (existingBet.user !== ethers.ZeroAddress) {
                console.log(`\n🔴 ROOT CAUSE: BET ID ALREADY EXISTS!`);
                console.log(`  The bet ID ${decoded.args._betId.toString()} is already taken.`);
                console.log(`  Existing bet owner: ${existingBet.user}`);
                console.log(`  This is why the transaction reverted.`);
                console.log(`\n💡 FIX: Use unique bet IDs (timestamp + random number)`);
            }
        } catch (e) {
            console.log(`\nCouldn't decode: ${e.message}`);
        }
    } else {
        console.log(`\n✅ Transaction succeeded - stake was deducted properly`);
    }
}

checkTx().catch(console.error);
