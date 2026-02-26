const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const TX_HASH = "0x03bd06ee5b23770abfeb42bce94e1ed75a3fc3d70057390c083b3308df15c23f";

async function getRevertReason() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const tx = await provider.getTransaction(TX_HASH);
    if (!tx) {
        console.log("Tx not found");
        return;
    }

    try {
        await provider.call({
            to: tx.to,
            from: tx.from,
            nonce: tx.nonce,
            gasLimit: tx.gasLimit,
            gasPrice: tx.gasPrice,
            data: tx.data,
            value: tx.value,
            blockTag: tx.blockNumber
        });
        console.log("Simulation succeeded?");
    } catch (err) {
        console.log("Revert Reason Error Object:", err);
        if (err.data) {
            console.log("Revert Data:", err.data);
            // Try to decode common errors
            if (err.data.startsWith('0x08c379a0')) { // Error(string)
                const reason = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + err.data.substring(10));
                console.log("Decoded Reason:", reason[0]);
            }
        }
    }
}

getRevertReason().catch(console.error);
