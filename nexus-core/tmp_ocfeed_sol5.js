const { PublicKey } = require('@solana/web3.js');
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
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const OWNER = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

async function main() {
    const { data: { programId: ACTUAL_OWNER } = {} } = await rpcPost('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', { encoding: 'jsonParsed' }],
    }).catch(() => ({}));
    const owner = ACTUAL_OWNER ? new PublicKey(ACTUAL_OWNER) : OWNER;
    console.log('pool owner program:', owner.toBase58());

    async function derive(mintStr) {
        const mint = new PublicKey(mintStr);
        const [pk] = await PublicKey.findProgramAddress(
            [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
            ATA_PROGRAM
        );
        const res = await rpcPost('https://api.mainnet-beta.solana.com', {
            jsonrpc: '2.0', id: 2, method: 'getTokenAccountBalance', params: [pk.toBase58()],
        });
        return { vault: pk.toBase58(), bal: res.result && res.result.value };
    }
    const sol = await derive('So11111111111111111111111111111111111111112');
    const usdc = await derive('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    console.log('SOL vault ', JSON.stringify(sol));
    console.log('USDC vault', JSON.stringify(usdc));
    if (sol.bal && usdc.bal && usdc.bal.uiAmount) {
        const price = usdc.bal.uiAmount / sol.bal.uiAmount;
        console.log('SOL/USDC reserve price =', price.toFixed(4), 'USD  (solReserves=', sol.bal.uiAmount, 'usdcReserves=', usdc.bal.uiAmount, ')');
    }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });