const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
console.log('--- ENV CHECK ---');
console.log('SESSION_MASTER_SECRET exists?', !!process.env.SESSION_MASTER_SECRET);
console.log('SESSION_MASTER_SECRET mask:', process.env.SESSION_MASTER_SECRET ? process.env.SESSION_MASTER_SECRET.slice(0, 5) : 'N/A');

