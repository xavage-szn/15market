const { JsonRpcProvider } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const hashes = [
    '0x7ff4673936f5da80b440b27c2101dbaf40de434a5286b8fa49d94dc290a6bbd7',
    '0xde454da6435b5b3b657e8fb69d2f598776ed3d4b0aaa2d2ec53a7340bb890ef9'
];

async function checkFrom() {
    for (const hash of hashes) {
        try {
            const tx = await provider.getTransaction(hash);
            console.log(`Hash: ${hash}`);
            console.log(`From: ${tx.from}`);
        } catch (e) {
            console.error(e.message);
        }
    }
}

checkFrom();
