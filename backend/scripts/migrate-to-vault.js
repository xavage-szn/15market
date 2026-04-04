const vault = require('../src/services/vault');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SENSITIVE_KEYS = [
    'PRIVATE_KEY',
    'SESSION_MASTER_SECRET',
    'ADMIN_TOKEN',
    'REDIS_URL'
];

console.log("\n--- 🛡️ 15MARKET ENCRYPTION MIGRATOR ---");

console.log("Use these encrypted values in your .env file:\n");

SENSITIVE_KEYS.forEach(key => {
    const value = process.env[key];
    if (value) {
        const encrypted = vault.encrypt(value);
        console.log(`${key}="${encrypted}"`);
    } else {
        console.log(`${key} (Not found in .env)`);
    }
});

console.log("\n--- 🛡️ SECURITY WARNING ---");
console.log("Once you update your .env with these values, the backend will NEED the correct SYSTEM_PASSPHRASE environment variable set to unlock them.");
