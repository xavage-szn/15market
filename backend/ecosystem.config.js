module.exports = {
    apps: [{
        name: "solana-keeper",
        script: "./solana-keeper/src/index.js",
        env: {
            NODE_ENV: "production",
            PORT: 3005
        }
    }, {
        name: "arc-keeper",
        script: "./arc-keeper/src/index.js",
        env: {
            NODE_ENV: "production",
            PORT: 3010
        }
    }]
}
