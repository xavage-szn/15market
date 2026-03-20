const { ethers, FetchRequest } = require('ethers');

async function testRPC(url, name) {
    const start = Date.now();
    try {
        const fetchReq = new FetchRequest(url);
        fetchReq.timeout = 10000;
        const provider = new ethers.JsonRpcProvider(fetchReq, 5042002, { staticNetwork: true });
        const block = await provider.getBlockNumber();
        const elapsed = Date.now() - start;
        console.log(name + ': ' + elapsed + 'ms (Block: ' + block + ') OK');
        return elapsed;
    } catch (e) {
        const elapsed = Date.now() - start;
        console.log(name + ': FAILED after ' + elapsed + 'ms - ' + e.message);
        return Infinity;
    }
}

async function main() {
    console.log('=== ARC TESTNET RPC SPEED TEST ===');
    console.log('Testing 3 rounds per RPC...');

    const rpcs = [
        { url: 'https://5042002.rpc.thirdweb.com', name: 'ThirdWeb' },
        { url: 'https://rpc.testnet.arc.network', name: 'Arc Official' },
        { url: 'https://arc-testnet.drpc.org', name: 'dRPC' },
        { url: 'https://arc-testnet.alt.technology', name: 'Alt.Tech' }
    ];

    const results = {};

    for (const rpc of rpcs) {
        console.log('\n--- ' + rpc.name + ' (' + rpc.url + ') ---');
        const times = [];
        for (let i = 0; i < 3; i++) {
            const t = await testRPC(rpc.url, 'Round ' + (i + 1));
            times.push(t);
        }
        const valid = times.filter(t => t !== Infinity);
        const avg = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 'N/A';
        console.log('Average: ' + avg + 'ms');
        results[rpc.name] = { avg, times, url: rpc.url };
    }

    console.log('\n=== getFeeData Speed Test ===');
    for (const rpc of rpcs) {
        const start = Date.now();
        try {
            const fetchReq = new FetchRequest(rpc.url);
            fetchReq.timeout = 10000;
            const provider = new ethers.JsonRpcProvider(fetchReq, 5042002, { staticNetwork: true });
            const feeData = await provider.getFeeData();
            console.log(rpc.name + ' getFeeData: ' + (Date.now() - start) + 'ms - gasPrice: ' + (feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei' : 'null'));
        } catch (e) {
            console.log(rpc.name + ' getFeeData: FAILED (' + (Date.now() - start) + 'ms) - ' + e.message);
        }
    }

    console.log('\n=== getTransactionCount Speed Test ===');
    const testAddr = '0x345014899b42bF9034D9475760609e64B1433A6a';
    for (const rpc of rpcs) {
        const start = Date.now();
        try {
            const fetchReq = new FetchRequest(rpc.url);
            fetchReq.timeout = 10000;
            const provider = new ethers.JsonRpcProvider(fetchReq, 5042002, { staticNetwork: true });
            const count = await provider.getTransactionCount(testAddr);
            console.log(rpc.name + ' getTransactionCount: ' + (Date.now() - start) + 'ms');
        } catch (e) {
            console.log(rpc.name + ' getTransactionCount: FAILED (' + (Date.now() - start) + 'ms)');
        }
    }

    console.log('\n=== RECOMMENDATION ===');
    const sorted = Object.entries(results)
        .filter(([_, v]) => v.avg !== 'N/A')
        .sort((a, b) => a[1].avg - b[1].avg);

    if (sorted.length > 0) {
        console.log('Fastest RPC: ' + sorted[0][0] + ' (' + sorted[0][1].avg + 'ms avg) -> ' + sorted[0][1].url);
    }
}

main().catch(console.error);
