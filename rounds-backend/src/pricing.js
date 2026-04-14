const axios = require('axios');

async function getPrice(symbol) {
    const assetsSymbol = symbol.length < 5 ? `${symbol.toUpperCase()}USDT` : symbol.toUpperCase();
    const timestamp = Date.now();
    
    // Concurrent fetch from multiple sources for high reliability
    const sources = [
        `https://api.binance.com/api/v3/ticker/price?symbol=${assetsSymbol}&_t=${timestamp}`,
        `https://api.mexc.com/api/v3/ticker/price?symbol=${assetsSymbol}&_t=${timestamp}`
    ];

    const fetchPrice = async (url) => {
        const res = await axios.get(url, { timeout: 2000 });
        if (res.data && res.data.price) return parseFloat(res.data.price);
        throw new Error("Invalid price data");
    };

    try {
        // Return the fastest successful response
        const price = await Promise.any(sources.map(url => fetchPrice(url)));
        return price;
    } catch (e) {
        console.error(`[Pricing] Concurrent fetch failed for ${symbol}:`, e.message);
        const IS_LOCAL = process.env.NODE_ENV !== 'production';
        if (IS_LOCAL) {
            const mocks = { BTC: 65000, ETH: 3500, SOL: 150 };
            const cleanSym = symbol.toUpperCase().replace('USDT', '');
            return mocks[cleanSym] || 1.0;
        }
        return null;
    }
}

module.exports = { getPrice };
