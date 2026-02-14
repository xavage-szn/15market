
const pricing = require('shared-utils/pricing');

async function testPricing() {
    console.log("Testing Pricing Service...");
    const symbols = ['BTC', 'ETH', 'SOL', 'JUP'];

    for (const symbol of symbols) {
        try {
            const price = await pricing.getPrice(symbol);
            console.log(`${symbol} Price: ${price}`);
        } catch (err) {
            console.error(`${symbol} Failed: ${err.message}`);
        }
    }
}

testPricing();
