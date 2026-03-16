const axios = require('axios');

async function checkWithdrawals() {
    const address = '0x345014899b42bF9034D9475760609e64B1433A6a';
    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`;

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            const withdrawMethodId = '0x2e1a7d4d'; // keccak256("withdraw(uint256)")
            // Wait, let's just check for any method that isn't placeBet or settleBet.
            // placeBet: 0xa8f635c9 (approx? let's just look at input)

            console.log('Transactions to Contract:');
            response.data.result.forEach(tx => {
                if (tx.input.startsWith('0x2e1a7d4d')) {
                    console.log(`Potential WITHDRAWAL!`);
                    console.log(`Hash: ${tx.hash}`);
                    console.log(`From: ${tx.from}`);
                    console.log(`Input: ${tx.input}`);
                    console.log(`Time: ${new Date(tx.timeStamp * 1000).toISOString()}`);
                    console.log('---');
                }
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkWithdrawals();
