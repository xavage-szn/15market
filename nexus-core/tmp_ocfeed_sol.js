// Throwaway: find Raydium v4 SOL/USDC reserve offsets empirically + fix EVM math.
const https = require('https');

function rpcPost(url, body, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0, 200))); } });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    // ---- Solana: fetch pool account ----
    const SOL_RESOURCE = 'https://api.mainnet-beta.solana.com';
    const solRes = await rpcPost(SOL_RESOURCE, {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', { encoding: 'base64' }],
    });
    const data = solRes?.result?.value?.data?.[0];
    const buf = Buffer.from(data, 'base64');
    console.log('owner:', solRes.result.value.owner, 'len:', buf.length);

    // Locate the mint bytes (SOL and USDC base58 → bytes) anywhere in the account.
    const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const b58ToBytes = (s) => {
        let bi = 0n;
        for (const ch of s) bi = bi * 58n + BigInt(BASE58_ALPHABET.indexOf(ch));
        const bytes = new Array(32).fill(0);
        let i = 31;
        while (bi > 0n && i >= 0) { bytes[i--] = Number(bi % 256n); bi >>= 8n; }
        return Buffer.from(bytes);
    };
    const SOL_MINT = b58ToBytes('So11111111111111111111111111111111111111112'); // wSOL
    const USDC_MINT = b58ToBytes('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const hex = buf.toString('hex');
    const findMint = (mint) => {
        const h = mint.toString('hex');
        const hits = [];
        let idx = hex.indexOf(h);
        while (idx !== -1) { hits.push(idx / 2); idx = hex.indexOf(h, idx + 1); }
        return hits;
    };
    console.log('SOL mint @', findMint(SOL_MINT));
    console.log('USDC mint @', findMint(USDC_MINT));

    // Empirically scan for the reserve pair + decimals that yields a sane SOL/USDC price.
    const u64s = [];
    for (let o = 0; o + 8 <= buf.length; o++) u64s.push({ o, v: buf.readBigUInt64LE(o) });
    const candidates = [];
    for (let i = 0; i < u64s.length; i++) {
        for (let j = i + 1; j < u64s.length; j++) {
            const a = u64s[i], b = u64s[j];
            if (a.v <= 0n || b.v <= 0n) continue;
            if (b.o - a.o > 96) continue; // reserve offsets are close together
            for (let cd = 0; cd <= 12; cd++) {
                for (let pd = 0; pd <= 12; pd++) {
                    const av = Number(a.v) / 10 ** cd;
                    const bv = Number(b.v) / 10 ** pd;
                    const price = bv / av; // coin(base)=a / pc(quote)=b → b/a
                    if (price > 60 && price < 800) {
                        candidates.push({ coinO: a.o, pcO: b.o, cd, pd, price, coinUnits: av, pcUnits: bv });
                    }
                }
            }
        }
    }
    candidates.sort((x, y) => Math.abs(x.price - 150) - Math.abs(y.price - 150));
    console.log('top candidates (coin,pc side = first,second):');
    for (const c of candidates.slice(0, 15)) {
        console.log(`  coin@${c.coinO} pc@${c.pcO} cd=${c.cd} pd=${c.pd} → ${c.price.toFixed(4)} USD (coin ${c.coinUnits.toFixed(0)} / pc ${c.pcUnits.toFixed(0)})`);
    }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });