
require('dotenv').config();
const { ethers } = require('ethers');
const path = require('path');
const ArcABI = require(path.join(__dirname, '../arc_prediction/artifacts/contracts/ArcPrediction.sol/ArcPrediction.json'));

const RPC = "https://rpc.testnet.arc.network";
const ADDR = "0x041e80256b3C72a0e16d78753F28f14A40d78c08";

async function check() {
    console.log(`Connecting to ${RPC}...`);
    const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });

    try {
        const block = await provider.getBlockNumber();
        console.log(`Current Block: ${block}`);
    } catch (e) {
        console.error("RPC Connection Failed:", e.message);
        return;
    }

    const contract = new ethers.Contract(ADDR, ArcABI.abi, provider);

    try {
        const nextId = await contract.nextBetId();
        console.log(`nextBetId: ${nextId.toString()}`);

        const userCount = await contract.getUserCount().catch(e => "failed: " + e.message);
        console.log(`getUserCount: ${userCount}`);

        // Scan volume manually if needed
        let totalVol = 0;
        const count = Number(nextId);
        for (let i = 0; i < Math.min(count, 50); i++) {
            const b = await contract.bets(i);
            totalVol += parseFloat(ethers.formatEther(b.amount));
        }
        console.log(`Sample Volume (first 50): ${totalVol}`);

    } catch (e) {
        console.error("Contract Call Failed:", e.message);
    }
}

check();
