const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('--- Environment Context ---');
console.log('CWD:', process.cwd());
console.log('__dirname:', __dirname);
console.log('.env path trying to load:', path.join(__dirname, '.env'));
console.log('.env exists:', fs.existsSync(path.join(__dirname, '.env')));

console.log('--- Key Variables ---');
console.log('THIRDWEB_CLIENT_ID:', process.env.THIRDWEB_CLIENT_ID ? 'LOADED' : 'MISSING');
console.log('THIRDWEB_CLIENT_ID Value:', process.env.THIRDWEB_CLIENT_ID);
console.log('THIRDWEB_SECRET_KEY:', process.env.THIRDWEB_SECRET_KEY ? 'LOADED' : 'MISSING');
console.log('SESSION_MASTER_SECRET:', process.env.SESSION_MASTER_SECRET ? 'LOADED' : 'MISSING');
