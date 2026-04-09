const http = require('http');

function test() {
    const address = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    const url = 'http://localhost:3010/balance/' + address;
    
    http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log('Balance result:', data);
        });
    }).on('error', (err) => {
        console.error('Fetch failed:', err.message);
    });
}
test();
