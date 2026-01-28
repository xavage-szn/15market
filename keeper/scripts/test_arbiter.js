const { getConsensusPrice } = require("../src/arbiter");

async function testArbiter() {
    const assets = ['SOL', 'BTC', 'ETH'];

    for (const asset of assets) {
        console.log(`Testing price for ${asset}...`);
        const price = await getConsensusPrice(asset);
        if (price) {
            console.log(`✅ Success: ${asset} price is ${price}`);
        } else {
            console.error(`❌ Failure: Could not fetch price for ${asset}`);
        }
    }
}

testArbiter();
