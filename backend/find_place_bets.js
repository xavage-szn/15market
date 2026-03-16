const axios = require('axios');

async function findPlaceBets() {
    const minBlock = 31400000;
    const maxBlock = 31403000;
    const contract = '0x345014899b42bF9034D9475760609e64B1433A6a';

    console.log(`Searching for placeBet calls in blocks ${minBlock} to ${maxBlock}...`);

    // Use ArcScan API to get all transactions for the contract
    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${contract}&startblock=${minBlock}&endblock=${maxBlock}&sort=asc`;

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            const txs = response.data.result;
            console.log(`Found ${txs.length} transactions`);

            txs.forEach(tx => {
                // placeBet selector is 0x4d2cbe13
                if (tx.input.startsWith('0x4d2cbe13')) {
                    console.log(`[Block ${tx.blockNumber}] placeBet by ${tx.from} (Value: ${tx.value / 1e18})`);
                    console.log(`Hash: ${tx.hash}`);
                } else if (tx.input.startsWith('0x9d540d33')) { // settleBet selector? let's check
                    // console.log(`[Block ${tx.blockNumber}] settleBet by ${tx.from}`);
                }
            });
        } else {
            console.log('No transactions found');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

findPlaceBets();
