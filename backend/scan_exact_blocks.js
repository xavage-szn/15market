const { JsonRpcProvider } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function scanBlocks() {
    const blocks = [31402164, 31402167, 31402192, 31402287];

    for (const b of blocks) {
        console.log(`Scanning block ${b}...`);
        try {
            const logs = await provider.getLogs({
                address: CONTRACT_ADDRESS,
                fromBlock: b,
                toBlock: b
            });
            console.log(`Found ${logs.length} logs`);
            logs.forEach(log => {
                console.log(`Tx: ${log.transactionHash}`);
                console.log(`Data: ${log.data}`);
                console.log(`Topics: ${JSON.stringify(log.topics)}`);
                console.log('---');
            });
        } catch (e) {
            console.error(`Error at block ${b}: ${e.message}`);
        }
    }
}

scanBlocks();
