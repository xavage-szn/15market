const { ethers } = require('ethers');
const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const TX_HASH = "0x03bd06ee5b23770abfeb42bce94e1ed75a3fc3d70057390c083b3308df15c23f";
async function run() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const tx = await provider.getTransaction(TX_HASH);
    console.log("FROM:" + tx.from);
    const bal = await provider.getBalance(tx.from);
    console.log("BAL:" + bal.toString());
}
run().catch(console.error);
