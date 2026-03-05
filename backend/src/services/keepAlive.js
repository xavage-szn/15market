const axios = require('axios');

/**
 * Keep-Alive Service
 * This service ensures that both the backend and frontend servers
 * do not "sleep" due to inactivity (common on free-tier hosting like Render/Vercel).
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://15market.online';
const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

function startKeepAlive() {
    console.log(`[StayAwake] Starting Keep-Alive Pulse (Interval: ${KEEP_ALIVE_INTERVAL / 1000}s)`);

    setInterval(async () => {
        const timestamp = new Date().toISOString();

        // 1. Ping the frontend
        try {
            await axios.get(FRONTEND_URL);
            // Don't log success every time to avoid log spam, only on error or start
        } catch (e) {
            console.warn(`[StayAwake] Failed to ping frontend at ${timestamp}: ${e.message}`);
        }

        // 2. Ping itself (backend health endpoint)
        // We ping both localhost and the production URL to ensure we hit the external proxy
        const PRODUCTION_BACKEND = "https://api.15market.online";
        const selfUrlLocal = `http://localhost:${process.env.PORT || 3010}/health`;
        const selfUrlProd = `${PRODUCTION_BACKEND}/health`;

        try {
            await axios.get(selfUrlLocal);
            await axios.get(selfUrlProd);
        } catch (e) {
            // Note: localhost might fail if the server isn't fully bound yet, which is fine
        }

    }, KEEP_ALIVE_INTERVAL);

    // Initial pulse after 30 seconds to allow server to boot
    setTimeout(async () => {
        try {
            await axios.get(FRONTEND_URL);
            console.log(`[StayAwake] Initial Pulse: Frontend Ping Successful`);
        } catch (e) {
            console.warn(`[StayAwake] Initial Pulse: Frontend Ping Failed: ${e.message}`);
        }
    }, 30000);
}

module.exports = { startKeepAlive };
