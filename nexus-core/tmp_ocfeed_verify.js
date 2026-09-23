// Throwaway verification script for the OCFeed sources.
// Ethereum mainnet: Uniswap V3 dynamic pool discovery (WBTC/USDC, WETH/USDC).
// Solana: Raydium v4 SOL/USDC reserve decode.
const https = require('https');

const EVM_RPC = process.env.OC_ETH_RPC || 'https://ethereum-rpc.publicnode.com';
const EVM_RPCS = [process.env.OC_ETH_RPC, 'https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://eth.drpc.org', 'https://rpc.ankr.com/eth'].filter(Boolean);

async function ethCallBatch(calls, attempts = 3) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        for (const url of EVM_RPCS) {
            try {
                return await rpcPost(url, calls, 12000);
            } catch (e) {
                console.log(`  · ${url} attempt ${attempt}: ${e.message}`);
            }
        }
    }
    throw new Error('all eth rpcs failed');
}

function rpcPost(url, body, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
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

const Q96 = 2 ** 96;
const UNI_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27ead9083C756Cc2';
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const GET_POOL = '0x1698ee82'; // getPool(address,address,uint24)
const SLOT0 = '0x3850c7bd';     // slot0()
const TOKEN0 = '0x0dfe1681';
const TOKEN1 = '0xd21220a7';
const FEES = [3000, 500, 100];

// Step 1: discover pools from the factory (single batch)
const discoveryCalls = [];
const discoveryMeta = {};
let id = 0;
const addDiscovery = (to, data, tag) => { const i = id++; discoveryMeta[i] = tag; discoveryCalls.push({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to, data }, 'latest'] }); return i; };

for (const asset of ['btc', 'eth']) {
    const a = asset === 'btc' ? WBTC : WETH;
    for (const fee of FEES) {
        addDiscovery(UNI_V3_FACTORY, GET_POOL + '00'.repeat(12) + a.slice(2) + '00'.repeat(12) + USDC.slice(2) + '00'.repeat(29) + fee.toString(16).padStart(6, '0'), { asset, fee });
    }
}

// Step 2: per-pool slot0/token0/token1 (single batch)
const poolCalls = [];
const poolMeta = {};
const poolByFee = {}; // `${asset}:${fee}` -> addr
const addPoolCall = (addr, data, tag) => { const i = poolCalls.length; poolCalls.push({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: addr, data }, 'latest'] }); poolMeta[i] = { addr, tag }; return i; };

async function main() {
    // Discovery
    let raw;
    raw = await ethCallBatch(discoveryCalls);
    const byId = new Map(raw.map((r) => [r.id, r]));
    console.log('· discovery response sample:', JSON.stringify(raw).slice(0, 600));
    for (const [i, r] of byId.entries()) {
        if (!r.result) continue;
        const m = discoveryMeta[i];
        const addr = '0x' + r.result.slice(26);
        if (addr === '0x0000000000000000000000000000000000000000') continue;
        poolByFee[`${m.asset}:${m.fee}`] = addr;
    }
    console.log('Discovered pools:');
    for (const key of Object.keys(poolByFee)) console.log('  ', key, poolByFee[key]);

    // Pool reads
    for (const [key, addr] of Object.entries(poolByFee)) {
        const [asset, fee] = key.split(':');
        addPoolCall(addr, SLOT0, { asset, fee, kind: 'slot0' });
        addPoolCall(addr, TOKEN0, { asset, fee, kind: 'token0' });
        addPoolCall(addr, TOKEN1, { asset, fee, kind: 'token1' });
    }

    let rawPool;
    rawPool = await ethCallBatch(poolCalls);
    console.log('· pool batch raw:', JSON.stringify(rawPool).slice(0, 400));
    const poolById = new Map(rawPool.map((r) => [r.id, r]));
    const info = {};
    for (const [i, r] of poolById.entries()) {
        const m = poolMeta[i];
        if (!r.result) continue;
        const key = `${m.asset}:${m.fee}`;
        info[key] = info[key] || {};
        info[key][m.kind] = r.result;
        info[key].fee = m.fee;
        info[key].addr = m.addr;
    }

    console.log('\n=== EVM price math ===');
    const t0Name = (a) => a.toLowerCase() === WBTC.toLowerCase() ? 'WBTC' : a.toLowerCase() === WETH.toLowerCase() ? 'WETH' : a.toLowerCase() === USDC.toLowerCase() ? 'USDC' : a.slice(0, 10);
    for (const key of ['btc:3000', 'btc:500', 'eth:3000', 'eth:500']) {
        const [asset, fee] = key.split(':');
        const p = info[key];
        if (!p) continue;
        if (!p.slot0) { console.log(` ${asset} ${fee}: no slot0`); continue; }
        const sqrt = BigInt(p.slot0.slice(0, 66));
        if (sqrt === 0n) { console.log(` ${asset} ${fee} ${p.addr.slice(0, 10)}…: no liquidity`); continue; }
        const t0 = '0x' + p.token0.slice(26);
        const t1 = '0x' + p.token1.slice(26);
        const dec0 = asset === 'btc' ? 8 : 18;
        const dec1 = 6;
        const price = ((Number(sqrt) / Q96) ** 2) * 10 ** (dec0 - dec1);
        console.log(` ${asset} fee ${fee} ${p.addr.slice(0, 10)}… ${t0Name(t0)}/${t0Name(t1)} → ${price.toFixed(4)} USD  (sqrt=${sqrt.toString()})`);
    }

    // Solana Raydium
    console.log('\n=== SOL (Raydium v4 SOL/USDC 58oQChx...) ===');
    const SOL_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana.publicnode.com', 'https://api.blockstackpbc.com'];
    const solCalls = {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', { encoding: 'base64' }],
    };
    let solRes = null;
    for (const url of SOL_RPCS) {
        try { solRes = await rpcPost(url, solCalls, 12000); console.log(`  · sol rpc ok: ${url}`); break; }
        catch (e) { console.log(`  · sol rpc fail ${url}: ${e.message}`); }
    }
    const data = solRes?.result?.value?.data?.[0];
    if (!data) { console.log('  no account data:', JSON.stringify(solRes).slice(0, 300)); return; }
    const buf = Buffer.from(data, 'base64');
    console.log('  account len', buf.length);
    console.log('  owner', solRes.result.value.owner);
    console.log('  first 64 bytes:', buf.subarray(0, 64).toString('hex'));
    const base58 = (bytes) => {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let bi = bytes.reduce((acc, b) => acc * 256n + BigInt(b), 0n);
        let s = '';
        while (bi > 0n) { s = ALPHABET[Number(bi % 58n)] + s; bi = bi / 58n; }
        return (s || '1');
    };
    for (const o of [32, 64, 96, 128]) {
        const bytes = [...buf.subarray(o, o + 32)];
        console.log(`  pubkey@${o}:`, base58(bytes));
    }
    console.log('  bytes 380-470:', buf.subarray(380, 470).toString('hex'));
    const tryOffsets = [[392, 393, 400, 432, 'classic v4'], [81, 82, 400, 432, 'alt1'], [392, 393, 512, 520, 'alt2']];
    for (const [cd, pd, ca, pa, name] of tryOffsets) {
        const coinDec = buf.readUInt8(cd), pcDec = buf.readUInt8(pd);
        const coinAmt = Number(buf.readBigUInt64LE(ca)), pcAmt = Number(buf.readBigUInt64LE(pa));
        if (pcDec > 0 && pcDec <= 12 && coinDec > 0 && coinDec <= 12) {
            console.log(`  [${name}] coinDec=${coinDec} pcDec=${pcDec} coinAmt=${coinAmt} pcAmt=${pcAmt} → ${((pcAmt / 10 ** pcDec) / (coinAmt / 10 ** coinDec)).toFixed(4)}`);
        } else {
            console.log(`  [${name}] bad decimals coinDec=${coinDec} pcDec=${pcDec}`);
        }
    }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });