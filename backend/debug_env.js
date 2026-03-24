const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
console.log('--- ENV CHECK ---');
console.log('MNEMONIC exists?', !!process.env.MNEMONIC);
console.log('MNEMONIC length:', process.env.MNEMONIC ? process.env.MNEMONIC.length : 0);
console.log('MNEMONIC start:', process.env.MNEMONIC ? process.env.MNEMONIC.slice(0, 10) : 'N/A');
