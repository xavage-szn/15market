module.exports = {
    apps: [
        {
            name: '15market-backend',
            script: 'backend/src/index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                PORT: 3010,
                NODE_ENV: 'production'
            }
        },
        {
            name: 'keep-alive',
            script: 'keep-alive.js',
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
