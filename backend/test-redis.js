require('dotenv').config({ path: './solana-keeper/.env' });
const redis = require('./shared/redis');
const Logger = require('./shared/logger');

const logger = new Logger('REDIS_TEST');

async function testConnection() {
    console.log('--- Redis Connection Test ---');
    console.log(`Target URL: ${process.env.REDIS_URL ? process.env.REDIS_URL.split('@')[1] : 'NOT FOUND'}`);

    const client = redis.connect();
    if (!client) {
        console.error('❌ Failed to initialize Redis client. Check if REDIS_URL is in .env');
        process.exit(1);
    }

    try {
        console.log('Waiting for connection...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
            client.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        console.log('✅ Connected! Testing SET/GET...');
        await redis.set('test_key', { status: 'working', timestamp: Date.now() });
        const result = await redis.get('test_key');

        if (result && result.status === 'working') {
            console.log('✅ Redis SET/GET successful!');
            console.log('Result:', result);
        } else {
            console.error('❌ Redis SET/GET failed or returned unexpected data.');
        }

    } catch (err) {
        console.error(`❌ Connection Test Failed: ${err.message}`);
        console.error('Hint: Make sure the password in your .env is correct and the endpoint is accessible.');
    } finally {
        if (client) client.disconnect();
        process.exit(0);
    }
}

testConnection();
