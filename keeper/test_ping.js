const fetch = require('node-fetch');

async function testPing() {
    const data = {
        id: "123456789",
        amount: 0.1,
        network: "solana",
        address: "9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe",
        expiry: Math.floor(Date.now() / 1000) + 60,
        entryPrice: 100,
        direction: 1,
        duration: 30,
        symbol: "SOL"
    };

    try {
        const res = await fetch('http://localhost:8080/trade-ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        console.log("Ping Result:", result);
    } catch (e) {
        console.error("Ping Error:", e.message);
    }
}

testPing();
