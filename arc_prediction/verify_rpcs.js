const { ethers } = require('ethers');

const rpcs = [
    "https://5042002.rpc.thirdweb.com",
    "https://rpc.testnet.arc.network"
];

async function run() {
    for (const rpc of rpcs) {
        console.log(`\nChecking ${rpc}...`);
        try {
            const provider = new ethers.JsonRpcProvider(rpc);
            const net = await provider.getNetwork();
            console.log(`Chain ID: ${net.chainId.toString()}`);
            const blockNum = await provider.getBlockNumber();
            console.log(`Block Number: ${blockNum}`);
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

run();
