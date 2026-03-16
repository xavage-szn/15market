const { JsonRpcProvider } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function findDeposits() {
    const start = 32000000;
    const end = 32517852;

    console.log(`Scanning for deposits to contract between blocks ${start} and ${end}...`);

    for (let b = start; b <= end; b += 5000) {
        // We'll use getLogs to find transactions with value
        // Wait, getLogs doesn't find native transfers unless there's an event.
        // But the contract doesn't have a Deposit event, only BetPlaced.

        // Let's use ArcScan API for txlist
    }

    const axios = require('axios');
    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${CONTRACT}&startblock=${start}&endblock=${end}&sort=asc`;

    try {
        const res = await axios.get(url);
        if (res.data.status === '1') {
            res.data.result.forEach(tx => {
                if (tx.to.toLowerCase() === CONTRACT.toLowerCase() && parseInt(tx.value) > 0) {
                    console.log(`[Block ${tx.blockNumber}] Deposit: ${tx.value / 1e18} USDC from ${tx.from}`);
                    console.log(`Hash: ${tx.hash}`);
                }
            });
        }
    } catch (e) {
        console.error(e.message);
    }
}

findDeposits();
