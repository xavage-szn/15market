const path = require('path');
const fs = require('fs');

// First, check if .env is loaded correctly by blockchain.js
// We'll peek into how blockchain.js loads it
const backendRoot = __dirname;
const envPath = path.join(backendRoot, '.env');
console.log('Checking .env at:', envPath);
console.log('File exists:', fs.existsSync(envPath));

const blockchainPath = path.join(backendRoot, 'src', 'services', 'blockchain.js');
// Load blockchain.js - it should call dotenv.config inside
require(blockchainPath);

console.log('--- Environment Check ---');
console.log('THIRDWEB_CLIENT_ID:', process.env.THIRDWEB_CLIENT_ID);
console.log('THIRDWEB_SECRET_KEY:', process.env.THIRDWEB_SECRET_KEY ? 'EXISTS' : 'MISSING');

const clientId = process.env.THIRDWEB_CLIENT_ID;
const thirdwebUrl = clientId
    ? `https://5042002.rpc.thirdweb.com/${clientId}`
    : "https://5042002.rpc.thirdweb.com";
console.log('Final Derived URL:', thirdwebUrl);
