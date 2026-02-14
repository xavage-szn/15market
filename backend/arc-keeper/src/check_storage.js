
const fs = require('fs');
const path = require('path');

const storagePath = path.resolve(__dirname, '../storage.json');
try {
    const data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    console.log("Total History Count:", data.history.length);
    console.log("Recent 5 Trades:");
    data.history.slice(0, 5).forEach(h => {
        console.log(`- ID: ${h.id} | User: ${h.owner} | Status: ${h.status} | Amount: ${h.amount} ${h.currency}`);
    });

    const activeBets = Object.keys(data.activeBets);
    console.log("Total Active Bets:", activeBets.length);
    if (activeBets.length > 0) {
        console.log("Recent 5 Active:");
        activeBets.slice(0, 5).forEach(id => {
            const b = data.activeBets[id];
            console.log(`- ID: ${id} | User: ${b.user} | Expiry: ${new Date(b.expiry * 1000).toLocaleString()}`);
        });
    }
} catch (e) {
    console.error("Error reading storage:", e.message);
}
