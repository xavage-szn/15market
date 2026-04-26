module.exports = {
    apps: [
        {
            name: '15market-backend',
            script: 'nexus-core/src/index.js',
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
            name: '15market-price-frontend',
            script: 'nexus-core/src/price-frontend.js',
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                PORT: 3012,
                NODE_ENV: 'production'
            }
        },
        {
            name: '15market-price-backend',
            script: 'nexus-core/src/price-backend.js',
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
