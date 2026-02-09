module.exports = {
    apps: [{
        name: "arc-keeper",
        script: "./arc-keeper/src/index.js",
        env: {
            NODE_ENV: "production",
            PORT: 3010
        }
    }]
}
