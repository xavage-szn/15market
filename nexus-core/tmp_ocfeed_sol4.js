const bs58 = require('bs58');
const b58decode = bs58.default ? bs58.default.decode : bs58.decode;
const https = require('https');
function rpcPost(url, body, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
            let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        });
        req.on('error', reject); req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.write(JSON.stringify(body)); req.end();
    });
}
const SOL_MINT = b58decode('So11111111111111111111111111111111111111112');
const USDC_MINT = b58decode('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

(async () => {
    const res = await rpcPost('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [POOL, { encoding: 'base64' }],
    });
    const buf = Buffer.from(res.result.value.data[0], 'base64');

    const candidates = [];
    for (let o = 0; o + 32 <= buf.length; o += 32) {
        const pk = bs58.default ? bs58.default.encode(buf.subarray(o, o + 32)) : null;
        if (pk) candidates.push({ offset: o, pubkey: pk });
    }
    console.log('candidate pubkeys (32-aligned):', candidates.map((c) => `${c.offset}:${c.pubkey.slice(0, 6)}`).join(' '));

    const multi = await rpcPost('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 2, method: 'getMultipleAccounts',
        params: [[...candidates.map((c) => c.pubkey)], { encoding: 'jsonParsed' }],
    });
    const infos = multi.result?.value || [];
    let solVault = null, usdcVault = null;
    for (let i = 0; i < infos.length; i++) {
        const info = infos[i];
        if (!info) continue;
        const parsed = info.data && info.data.parsed;
        if (parsed && parsed.type === 'account' && parsed.info.mint) {
            const mintB58 = parsed.info.mint;
            if (mintB58 === 'So11111111111111111111111111111111111111112') solVault = { cand: candidates[i], ui: parsed.info.tokenAmount.uiAmount, mint: mintB58 };
            if (mintB58 === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') usdcVault = { cand: candidates[i], ui: parsed.info.tokenAmount.uiAmount, mint: mintB58 };
        }
    }
    console.log('SOL vault:', JSON.stringify(solVault));
    console.log('USDC vault:', JSON.stringify(usdcVault));
    if (solVault && usdcVault && usdcVault.ui > 0) {
        console.log('SOL/USDC reserve price =', (usdcVault.ui / solVault.ui).toFixed(4), 'USD');
    }
})();