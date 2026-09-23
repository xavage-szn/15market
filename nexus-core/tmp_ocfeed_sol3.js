const bs58 = require('bs58');
const b58decode = bs58.default ? bs58.default.decode : bs58.decode;
const b58encode = bs58.default ? bs58.default.encode : bs58.encode;
const https = require('https');
function rpcPost(url, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
            let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        });
        req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('timeout')));
        req.write(JSON.stringify(body)); req.end();
    });
}
const SOL_MINT_STR = 'So11111111111111111111111111111111111111112';
const USDC_MINT_STR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WBTC_MINT_STR = '7vQ3TYUNtUtwLxBjP1mz9UPkYjw1zeBVMkP9qnLN7D6w';

(async () => {
const sol = b58decode(SOL_MINT_STR);
    const usdc = b58decode(USDC_MINT_STR);
    console.log('SOL mint bytes hex:', Buffer.from(sol).toString('hex'));
    console.log('USDC mint bytes hex:', Buffer.from(usdc).toString('hex'));

    const res = await rpcPost('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', { encoding: 'base64' }],
    });
    const buf = Buffer.from(res.result.value.data[0], 'base64');
    const hex = buf.toString('hex');
    const find = (b) => { const h = Buffer.from(b).toString('hex'); const out = []; let i = hex.indexOf(h); while (i !== -1) { out.push(i / 2); i = hex.indexOf(h, i + 1); } return out; };
    console.log('SOL mint @', find(sol));
    console.log('USDC mint @', find(usdc));

    // find all 32-byte pubkeys equal to SOL in the account (should be 1-2)
    const pc = buf.toString('hex');
    const mkBase58 = (offset) => b58encode(buf.subarray(offset, offset + 32));
    console.log('base58 @32  ', mkBase58(32));
    console.log('base58 @64  ', mkBase58(64));
    console.log('base58 @96  ', mkBase58(96));
    console.log('base58 @128 ', mkBase58(128));
    console.log('base58 @160 ', mkBase58(160));
    console.log('base58 @192 ', mkBase58(192));
    console.log('base58 @400 ', mkBase58(400));
    console.log('base58 @432 ', mkBase58(432));
})();
