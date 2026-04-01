const axios = require('axios');

async function getPrice(symbol) {
    try {
        const timestamp = Date.now();
        const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT&_t=${timestamp}`);
        if (!response.data || !response.data.price) return null;
        return parseFloat(response.data.price);
    } catch (e) {
        console.error(`[Pricing] Error fetching ${symbol}:`, e.message);
        return null;
    }
}

module.exports = { getPrice };
