const fetch = require("node-fetch");
const { PublicKey } = require("@solana/web3.js");

const ASSET_SOURCES = {
    'SOL': {
        pyth: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        pythAddr: "J83w4f982ckqwsU2W27n4Y3j9n9mxayUM6Lte38Tndt4", // Devnet SOL/USD
        binance: "SOLUSDT",
        mexc: "SOLUSDT"
    },
    'BTC': {
        pyth: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f8dc41b5b",
        pythAddr: "HovUqBbncy1KWvOrV97MZy9pGU7NqNRT54Qp8A61n7K6", // Devnet BTC/USD
        binance: "BTCUSDT",
        mexc: "BTCUSDT"
    },
    'ETH': {
        pyth: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        pythAddr: "EdXn21kdSXB9iFmPnRKo7jnfSdfpZHXrjSbtZ78VUnfV", // Devnet ETH/USD
        binance: "ETHUSDT",
        mexc: "ETHUSDT"
    }
};

async function fetchBinance(symbol) {
    try {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { timeout: 3000 });
        const data = await response.json();
        const price = parseFloat(data.price);
        if (!isNaN(price)) return price;
        return null;
    } catch (e) {
        return null;
    }
}

async function fetchMEXC(symbol) {
    try {
        const response = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`, { timeout: 3000 });
        const data = await response.json();
        const price = parseFloat(data.price);
        if (!isNaN(price)) return price;
        return null;
    } catch (e) {
        return null;
    }
}

async function fetchPyth(id) {
    try {
        const response = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}`, { timeout: 3000 });
        const data = await response.json();
        const p = data.parsed?.[0]?.price;
        if (!p) return null;
        return parseFloat(p.price) * Math.pow(10, p.expo);
    } catch (e) {
        return null;
    }
}

async function fetchPythOnChain(symbol) {
    try {
        const { connection } = require("./config");
        const config = ASSET_SOURCES[symbol];
        if (!config || !config.pythAddr) return null;

        // Ensure we use a clean string
        const pubkey = new PublicKey(config.pythAddr.trim());
        const info = await connection.getAccountInfo(pubkey);
        if (!info) return null;

        // Pyth price account parsing (minimal)
        const price = info.data.readBigInt64LE(208);
        const expo = info.data.readInt32LE(216);
        return Number(price) * Math.pow(10, expo);
    } catch (e) {
        return null;
    }
}

async function getConsensusPrice(symbol) {
    const config = ASSET_SOURCES[symbol];
    if (!config) return null;

    const results = await Promise.allSettled([
        fetchPyth(config.pyth),
        fetchBinance(config.binance),
        fetchMEXC(config.mexc),
        fetchPythOnChain(symbol)
    ]);

    const prices = results
        .filter(r => r.status === 'fulfilled' && r.value !== null && !isNaN(r.value))
        .map(r => r.value);

    if (prices.length === 0) {
        console.warn(`[ARBITER] 🔴 ALL price sources failed for ${symbol}!`);
        return null;
    }

    // Return average of available prices
    const sum = prices.reduce((a, b) => a + b, 0);
    return sum / prices.length;
}

module.exports = { getConsensusPrice };
