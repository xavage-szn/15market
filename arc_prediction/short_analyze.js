const { ethers } = require('ethers');
const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const TX_HASH = "0x03bd06ee5b23770abfeb42bce94e1ed75a3fc3d70057390c083b3308df15c23f";
async function analyze() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const tx = await provider.getTransaction(TX_HASH);
    const receipt = await provider.getTransactionReceipt(TX_HASH);
    console.log("STATUS:" + receipt.status);
    console.log("LIMIT:" + tx.gasLimit.toString());
    console.log("USED:" + receipt.gasUsed.toString());
    console.log("VALUE:" + tx.value.toString());
}
analyze().catch(console.error);
