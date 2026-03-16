const { JsonRpcProvider } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function findBetPlaced() {
    const betId = '0x00000000000000000000000000000000000000000000000000064cbede1a3b43';
    const topic0 = '0x9c255f3c87d1ec7cd88c7a0566c11f2f984c73051a1b121c7e233be6d4600f3a';

    console.log(`Searching for BetPlaced for ID ${betId} in 10k range...`);

    try {
        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            topics: [topic0, betId],
            fromBlock: 31393000,
            toBlock: 31403000
        });

        console.log(`Found ${logs.length} logs`);
        logs.forEach(log => {
            console.log(`Block: ${log.blockNumber}`);
            console.log(`Tx: ${log.transactionHash}`);
            console.log(`Data: ${log.data}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

findBetPlaced();
