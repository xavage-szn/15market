const https = require('https');

const URLS = [
    'https://15market.online',
    'https://api.15market.online/health'
];

async function ping(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            console.log(`[${new Date().toISOString()}] Ping ${url}: ${res.statusCode}`);
            resolve();
        }).on('error', (err) => {
            console.error(`[${new Date().toISOString()}] Ping ${url} ERROR:`, err.message);
            resolve();
        });
    });
}

async function start() {
    console.log("🚀 Starting Keep-Alive Pinger...");
    while (true) {
        for (const url of URLS) {
            await ping(url);
        }
        // Wait 2 minutes
        await new Promise(r => setTimeout(r, 120000));
    }
}

start();
