const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const b58decode = bs58.default ? bs58.default.decode : bs58.decode;
const b58encode = bs58.default ? bs58.default.encode : bs58.encode;
const https = require('https');
function rpcPost(url, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
            let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        });
        req.on('error', reject); req.setTimeout(12000, () => req.destroy(new Error('timeout')));
        req.write(JSON.stringify(body)); req.end();
    });
}
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const POOL = '8s9FCcWcB3oXvGmDNk6KHsMNCmX9SbY7WjGDHLB1SPFD';

(async () => {
    const res = await rpcPost('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [POOL, { encoding: 'base64' }],
    });
    const value = res.result && res.result.value;
    if (!value) { console.log('NO ACCOUNT for', POOL); process.exit(0); }
    const buf = Buffer.from(value.data[0], 'base64');
    console.log('pool len', buf.length, 'owner', value.owner);

    const solm = b58encode(Buffer.from(b58decode('So11111111111111111111111111111111111111112')));
    const usdcm = b58encode(Buffer.from(b58decode('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')));
    const findMint = (mintHex) => { const idx = []; let i = buf.indexOf(Buffer.from(mintHex, 'hex')); while (i !== -1) { idx.push(i); i = buf.indexOf(Buffer.from(mintHex, 'hex'), i + 1); } return idx; };
    const solIdx = findMint(Buffer.from(b58decode('So11111111111111111111111111111111111111112')).toString('hex'));
    const usdcIdx = findMint(Buffer.from(b58decode('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toString('hex'));
    console.log('SOL mint at', solIdx, 'USDC mint at', usdcIdx);

    // classic-v4 style decode attempt
    const u64 = (o) => Number(buf.readBigUInt64LE(o));
    const coinDec = buf[392], pcDec = buf[393];
    console.log('classic dec 392/393 =', coinDec, pcDec);
    console.log('classic reserves @400 @432 =', u64(400), u64(432));

    // ATA vault derivation
    async function vault(mintStr) {
        const [pk] = await PublicKey.findProgramAddress(
            [new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8').toBuffer(), TOKEN_PROGRAM.toBuffer(), new PublicKey(mintStr).toBuffer()],
            ATA_PROGRAM
        );
        const r = await rpcPost('https://api.mainnet-beta.solana.com', { jsonrpc: '2.0', id: 2, method: 'getTokenAccountBalance', params: [pk.toBase58()] });
        return { vault: pk.toBase58(), bal: r.result && r.result.value };
    }
    const sv = await vault('So11111111111111111111111111111111111111112');
    const uv = await vault('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    console.log('S vault', JSON.stringify(sv));
    console.log('U vault', JSON.stringify(uv));
    if (sv.bal && uv.bal && uv.bal.uiAmount) {
        console.log('ATA-reserve price =', (uv.bal.uiAmount / sv.bal.uiAmount).toFixed(4));
    }
})();