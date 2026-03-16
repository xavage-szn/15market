const axios = require('axios');

async function getTxHistory() {
    const address = '0x345014899b42bF9034D9475760609e64B1433A6a';
    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc`;

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            console.log('Recent Transactions:');
            response.data.result.forEach(tx => {
                console.log(`Hash: ${tx.hash}`);
                console.log(`From: ${tx.from}`);
                console.log(`To: ${tx.to}`);
                console.log(`Value: ${tx.value / 1e18} USDC`);
                console.log(`Time: ${new Date(tx.timeStamp * 1000).toISOString()}`);
                console.log('---');
            });
        } else {
            console.log('No transactions found or API error:', response.data.message);
        }
    } catch (error) {
        console.error('Error fetching tx history:', error.message);
    }
}

getTxHistory();
