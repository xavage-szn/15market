const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const TX_HASH = "0x03bd06ee5b23770abfeb42bce94e1ed75a3fc3d70057390c083b3308df15c23f";

async function run() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const tx = await provider.getTransaction(TX_HASH);
    const iface = new ethers.Interface(["function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"]);
    const decoded = iface.parseTransaction({ data: tx.data });
    console.log("BET_ID:" + decoded.args._betId.toString());
    console.log("DIRECTION:" + decoded.args._direction);
    console.log("DURATION:" + decoded.args._duration.toString());
    console.log("ENTRY_PRICE:" + decoded.args._entryPrice.toString());
}

run().catch(console.error);
