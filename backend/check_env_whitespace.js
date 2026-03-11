const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('--- ENV CHECK ---');
const cid = process.env.THIRDWEB_CLIENT_ID;
const sec = process.env.THIRDWEB_SECRET_KEY;

console.log('CLIENT_ID:', cid ? `'${cid}'` : 'MISSING', 'Length:', cid ? cid.length : 0);
console.log('SECRET_KEY:', sec ? `'${sec}'` : 'MISSING', 'Length:', sec ? sec.length : 0);

if (cid && cid.trim() !== cid) {
    console.log('⚠️ CLIENT_ID HAS WHITESPACE!');
}
if (sec && sec.trim() !== sec) {
    console.log('⚠️ SECRET_KEY HAS WHITESPACE!');
}
