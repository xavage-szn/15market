const https = require('https');

const data = JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: ['0x8952B910BCcbaD768A8696F8e0e02B6D45D78386', 'latest'],
    id: 1
});

const options = {
    hostname: 'rpc.arc-testnet.gelato.digital',
    port: 443,
    path: '/',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const response = JSON.parse(body);
        const hex = response.result;
        const wei = BigInt(hex);
        console.log("Hex:", hex);
        console.log("Wei:", wei.toString());
        console.log("18 Decimals:", (Number(wei) / 1e18).toFixed(4));
        console.log("6 Decimals:", (Number(wei) / 1e6).toFixed(4));
    });
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
