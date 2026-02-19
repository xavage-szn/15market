const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const TX_HASH = "0x03bd06ee5b23770abfeb42bce94e1ed75a3fc3d70057390c083b3308df15c23f";

async function analyze() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const tx = await provider.getTransaction(TX_HASH);
    const receipt = await provider.getTransactionReceipt(TX_HASH);

    console.log("Transaction Details:");
    console.log("  Hash:", tx.hash);
    console.log("  Status:", receipt.status);
    console.log("  Gas Limit:", tx.gasLimit.toString());
    console.log("  Gas Used:", receipt.gasUsed.toString());
    console.log("  Value (Wei):", tx.value.toString());
    console.log("  Value (Eth):", ethers.formatEther(tx.value));

    const iface = new ethers.Interface(["function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"]);
    try {
        const decoded = iface.parseTransaction({ data: tx.data });
        console.log("Arguments:");
        console.log("  _betId:", decoded.args[0].toString());
        console.log("  _direction:", decoded.args[1]);
        console.log("  _duration:", decoded.args[2].toString());
        console.log("  _entryPrice:", decoded.args[3].toString());
        console.log("  _marketId:", decoded.args[4]);
        console.log("  _payoutAddress:", decoded.args[5]);
    } catch (e) {
        console.log("Failed to decode arguments:", e.message);
    }
}

analyze().catch(console.error);
