const cache = require('../cache');

const ASSETS = {
    btc: { mexc: 'BTCUSDT', kraken: 'XXBTZUSD', binance: 'BTCUSDT' },
    eth: { mexc: 'ETHUSDT', kraken: 'XETHZUSD', binance: 'ETHUSDT' },
    sol: { mexc: 'SOLUSDT', kraken: 'SOLUSD', binance: 'SOLUSDT' },
};

function fetchWithTimeout(url, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal })
        .then(res => {
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .catch(e => {
            clearTimeout(timer);
            throw e;
        });
}

async function fetchMexc(symbol) {
    const d = await fetchWithTimeout(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`, 3000);
    const p = parseFloat(d.price);
    if (!p || isNaN(p)) throw new Error('Invalid MEXC price');
    return p;
}

async function fetchKraken(pair) {
    const d = await fetchWithTimeout(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, 3000);
    const key = Object.keys(d.result)[0];
    const p = parseFloat(d.result[key].c[0]);
    if (!p || isNaN(p)) throw new Error('Invalid Kraken price');
    return p;
}

async function fetchBinance(symbol) {
    const d = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, 3000);
    const p = parseFloat(d.price);
    if (!p || isNaN(p)) throw new Error('Invalid Binance price');
    return p;
}

async function fetchPriceForAsset(key) {
    // 1. MEXC (Primary — known working)
    try {
        const price = await fetchMexc(ASSETS[key].mexc);
        return { key, price, source: 'mexc' };
    } catch (e) {}

    // 2. Kraken (Secondary)
    try {
        const price = await fetchKraken(ASSETS[key].kraken);
        return { key, price, source: 'kraken' };
    } catch (e) {}

    // 3. Binance (Tertiary)
    try {
        const price = await fetchBinance(ASSETS[key].binance);
        return { key, price, source: 'binance' };
    } catch (e) {}

    return null;
}

async function pollPrices() {
    const keys = Object.keys(ASSETS);
    const results = await Promise.all(keys.map(key => fetchPriceForAsset(key)));

    const now = Date.now();
    for (const r of results) {
        if (r && r.price > 0) {
            cache.prices[r.key] = r.price;
            cache.priceMeta[r.key] = { updatedAt: now, source: r.source };

            if (!cache.priceHistory[r.key]) cache.priceHistory[r.key] = [];
            cache.priceHistory[r.key].push({ price: r.price, time: now });
            if (cache.priceHistory[r.key].length > 4800) cache.priceHistory[r.key].shift();
        }
    }

    return results.filter(Boolean);
}

function snapshotPrices() {
    const keys = Object.keys(cache.prices);
    for (const key of keys) {
        if (cache.prices[key] > 0) {
            cache.snapshotPrice(key);
        }
    }
}

let ioRef = null;
let pollInterval = null;
let snapshotInterval = null;

function start(io) {
    ioRef = io;
    console.log('[PriceService] Starting MEXC/Kraken/Binance price feed...');

    pollInterval = setInterval(async () => {
        try {
            const results = await pollPrices();
            if (ioRef) {
                for (const r of results) {
                    ioRef.emit('price', { key: r.key, price: r.price, ts: Date.now() });
                }
            }
        } catch (e) {
            console.error('[PriceService] Poll error:', e.message);
        }
    }, 1000);

    snapshotInterval = setInterval(snapshotPrices, 250);

    pollPrices().then(results => {
        console.log(`[PriceService] Initial poll: ${results.map(r => `${r.key}=${r.price}(${r.source})`).join(', ')}`);
        if (ioRef) {
            for (const r of results) {
                ioRef.emit('price', { key: r.key, price: r.price, ts: Date.now() });
            }
        }
    }).catch(e => {
        console.error('[PriceService] Initial poll failed:', e.message);
    });
}

function stop() {
    if (pollInterval) clearInterval(pollInterval);
    if (snapshotInterval) clearInterval(snapshotInterval);
    pollInterval = null;
    snapshotInterval = null;
}

module.exports = { start, stop, pollPrices, ASSETS };
