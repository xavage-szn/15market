const axios = require('axios');

async function getRecentDeposits() {
    const address = '0x345014899b42bF9034D9475760609e64B1433A6a';
    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&startblock=32000000&endblock=99999999&page=1&offset=50&sort=desc`;

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            console.log('Recent Incoming/Called Transactions:');
            response.data.result.forEach(tx => {
                if (tx.to.toLowerCase() === address.toLowerCase()) {
                    console.log(`Hash: ${tx.hash}`);
                    console.log(`From: ${tx.from}`);
                    console.log(`Value: ${tx.value / 1e18} USDC`);
                    console.log(`Time: ${new Date(tx.timeStamp * 1000).toISOString()}`);
                    console.log('---');
                }
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getRecentDeposits();
