const { ethers } = require('ethers');
const http = require('http');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

async function test() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const abi = [
        "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
    ];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    const betId = Math.floor(Date.now() / 1000);
    const amount = ethers.parseEther("1.0"); // 1 ARC
    const direction = 0; // UP
    const duration = 60;
    const entryPrice = 50000;
    const marketId = 0;
    const payoutAddress = wallet.address;

    console.log(`[Test] Placing bet ${betId} for 1.0 ARC...`);
    const tx = await contract.placeBet(betId, direction, duration, entryPrice, marketId, payoutAddress, { value: amount });
    process.stdout.write(`[Test] TX sent: ${tx.hash}. Waiting for confirmation...`);
    await tx.wait();
    console.log(`\n[Test] Bet confirmed!`);

    console.log("[Test] Waiting 5 seconds for network sync...");
    await new Promise(r => setTimeout(r, 5000));

    const exitPrice = 55000; // Guaranteed win (UP, exit > entry)
    console.log(`[Test] POSTing to backend /settle for bet ${betId} with exitPrice ${exitPrice}...`);
    
    const postData = JSON.stringify({ id: betId, exitPrice });
    const options = {
        hostname: 'localhost',
        port: 3010,
        path: '/settle',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            console.log("[Test] Backend Settle Response:", body);
            
            // Check session balance
            http.get(`http://localhost:3010/session/balance/${wallet.address}`, (res2) => {
                let body2 = '';
                res2.on('data', d => body2 += d);
                res2.on('end', () => {
                    console.log("[Test] NEW Session Balance:", JSON.parse(body2).balance);
                    process.exit(0);
                });
            });
        });
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
        process.exit(1);
    });

    req.write(postData);
    req.end();
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
