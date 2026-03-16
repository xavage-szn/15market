const { JsonRpcProvider } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function findBetPlaced() {
    const betId = '0x00000000000000000000000000000000000000000000000000064cbede1a3b43'; // 1773232514022211
    const topic0 = '0x9c255f3c87d1ec7cd88c7a0566c11f2f984c73051a1b121c7e233be6d4600f3a';

    console.log(`Searching for BetPlaced for ID ${betId} across history...`);

    // Let's try to find it in 50k block chunks
    for (let i = 0; i < 20; i++) {
        const to = 31410000 - (i * 10000);
        const from = to - 10000;
        try {
            const logs = await provider.getLogs({
                address: CONTRACT_ADDRESS,
                topics: [topic0, betId],
                fromBlock: from,
                toBlock: to
            });
            if (logs.length > 0) {
                console.log(`FOUND! Block ${logs[0].blockNumber}`);
                return;
            }
        } catch (e) { }
    }
    console.log('Not found in last 200k blocks');
}

findBetPlaced();
