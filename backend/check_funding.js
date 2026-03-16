const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const TARGET = '0x2C2A74EA3c85f5Df6E5D9402540140f25d9fFa0d';

async function checkFunding() {
    console.log(`Checking funding for ${TARGET}...`);
    // txlist for the user to see where they got money to bet
    const axios = require('axios');
    const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${TARGET}&startblock=0&endblock=99999999&sort=asc&page=1&offset=10`;

    try {
        const response = await axios.get(url);
        if (response.data.status === '1' && response.data.result.length > 0) {
            const firstTx = response.data.result[0];
            console.log(`First Tx Hash: ${firstTx.hash}`);
            console.log(`From: ${firstTx.from}`);
            console.log(`Value: ${firstTx.value / 1e18} USDC`);
            console.log(`Time: ${new Date(firstTx.timeStamp * 1000).toISOString()}`);
        } else {
            console.log('No funding tx found in txlist');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkFunding();
