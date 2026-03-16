const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const hashes = [
    '0xa7e63aca97e8d93906e3b3e537c19083892f3f16ed785c35f05aa95533ff6083',
    '0xb6718377e885670c607cbf3a2a7f8e2248ced4b921329e32bb2bacaf090a12d8',
    '0x6a0c274e07612643ea397ed2a5fff16e9bb99e261c07d987b9d4d38274be6315',
    '0x5563dc6ddc182a30fccb249911896e0e10056db092951b4ec66f6d927da3fafe',
    '0xdb33e1e4a5e82e2a310075f3d37e8fbb1114acc48810e4680264befc222b0689',
    '0x5445188ec86d2e450f6f42a4449ae3ffed891e3de905bdffe2e1c5d84b0d6b2b'
];

async function checkHashes() {
    for (const hash of hashes) {
        try {
            const receipt = await provider.getTransactionReceipt(hash);
            const tx = await provider.getTransaction(hash);
            if (!receipt || !tx) {
                console.log(`Hash: ${hash} - Not found or pending`);
                continue;
            }

            // Value in tx is usually 0 because they are calls.
            // Payouts are internal. We need to look at logs or use trace if available.
            // But we can check internal transfers if we had a better tool.
            // Since we don't, let's look at logs for "BetSettled"

            console.log(`Hash: ${hash}`);
            console.log(`From: ${tx.from}`);
            console.log(`Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);

            // Parse logs
            receipt.logs.forEach(log => {
                // BetSettled topic: 0x... (I'll just check if it matches the event)
                // Actually, I can just see the log data.
                console.log(`Log Data: ${log.data}`);
            });
            console.log('---');
        } catch (e) {
            console.error(`Error for ${hash}:`, e.message);
        }
    }
}

checkHashes();
