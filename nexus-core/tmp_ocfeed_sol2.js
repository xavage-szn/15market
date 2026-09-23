// Throwaway: full dump + empirical reserve search for Raydium v4 SOL/USDC.
const https = require('https');
function rpcPost(url, body, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, timeout: timeoutMs }, (res) => {
            let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json')); } });
        });
        req.on('error', reject); req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.write(JSON.stringify(body)); req.end();
    });
}
async function main() {
    const solRes = await rpcPost('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', { encoding: 'base64' }],
    });
    const buf = Buffer.from(solRes.result.value.data[0], 'base64');
    console.log('len', buf.length);

    // aligned u64 scan
    const readU64 = (o) => buf.readBigUInt64LE(o);
    const getPrice = (coinRaw, pcRaw, cd, pd) => (Number(pcRaw) / 10 ** pd) / (Number(coinRaw) / 10 ** cd);

    const results = [];
    for (let o1 = 0; o1 <= buf.length - 8; o1 += 8) {
        const v1 = readU64(o1);
        if (v1 <= 0n) continue;
        for (let o2 = o1 + 8; o2 <= buf.length - 8; o2 += 8) {
            const v2 = readU64(o2);
            if (v2 <= 0n) continue;
            for (const [cd, pd] of [[9, 6], [8, 6], [6, 6], [9, 8], [12, 6]]) {
                const p = getPrice(v1, v2, cd, pd);
                if (p > 60 && p < 800) {
                    results.push({ o1, o2, cd, pd, p, v1: v1.toString(), v2: v2.toString() });
                }
            }
        }
    }
    // prefer pairs where coin value is reasonably large (real reserves) and pc >= coin
    results.sort((a, b) => {
        const av = Number(a.v1), bv = Number(b.v1);
        return (Number(b.v2) / Math.max(bv, 1) - Number(a.v2) / Math.max(av, 1)) || 0;
    });
    console.log('all aligned candidates with cd/pd in set:');
    for (const r of results.slice(0, 40)) {
        console.log(`  coin@${r.o1}=${r.v1} pc@${r.o2}=${r.v2} cd=${r.cd} pd=${r.pd} → ${r.p.toFixed(4)}`);
    }
    console.log('\n=== full account hex (8-byte words) ===');
    for (let o = 0; o < buf.length; o += 8) {
        console.log(`${String(o).padStart(4)}: ${buf.subarray(o, o + 8).toString('hex')}  (${buf.subarray(o, o + 8).toString('ascii').replace(/[^\x20-\x7e]/g, '.')})`);
    }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });