const axios = require('axios');

async function findPlaceBets() {
    const minBlock = 31400000;
    const maxBlock = 31405000;
    const contract = '0x345014899b42bF9034D9475760609e64B1433A6a';

    console.log(`Searching for placeBet (0x95e5af9d) calls in blocks ${minBlock} to ${maxBlock}...`);

    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${contract}&startblock=${minBlock}&endblock=${maxBlock}&sort=asc`;

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            const txs = response.data.result;
            txs.forEach(tx => {
                if (tx.input.startsWith('0x95e5af9d')) {
                    console.log(`[Block ${tx.blockNumber}] placeBet by ${tx.from} (Value: ${tx.value / 1e18} USDC)`);
                    console.log(`Hash: ${tx.hash}`);
                }
            });
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

findPlaceBets();
