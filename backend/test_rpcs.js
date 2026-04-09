const { ethers } = require('ethers');

async function test() {
    const address = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    const rpcs = [
        "https://rpc.testnet.arc.network",
        "https://arc-testnet.drpc.org",
        "https://5042002.rpc.thirdweb.com"
    ];

    for (const rpc of rpcs) {
        console.log(`Testing RPC: ${rpc}`);
        try {
            const provider = new ethers.JsonRpcProvider(rpc);
            const start = Date.now();
            const balance = await provider.getBalance(address);
            const end = Date.now();
            console.log(`Success! Balance: ${ethers.formatEther(balance)} ARC. Time: ${end-start}ms`);
        } catch (e) {
            console.error(`Failed for ${rpc}: ${e.message}`);
        }
    }
}
test();
