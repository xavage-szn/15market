const { JsonRpcProvider, formatEther } = require('ethers');

const RPCs = [
    "https://rpc.testnet.arc.network",
    "https://arc-testnet.drpc.org"
];

async function check() {
    for (const rpc of RPCs) {
        try {
            console.log(`Checking via ${rpc}...`);
            const provider = new JsonRpcProvider(rpc);
            const bal = await provider.getBalance('0x345014899b42bF9034D9475760609e64B1433A6a');
            console.log(`Balance: ${formatEther(bal)}`);
            process.exit(0);
        } catch (e) {
            console.warn(`Failed via ${rpc}: ${e.message}`);
        }
    }
}

check();
