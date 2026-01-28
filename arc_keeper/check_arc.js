const { ethers } = require('ethers');
require('dotenv').config({ path: './.env' });


const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function check() {
    try {
        const fetchRequest = new ethers.FetchRequest(ARC_RPC);
        fetchRequest.timeout = 30000;
        const arcNetwork = new ethers.Network("arc-testnet", 5042002);
        const provider = new ethers.JsonRpcProvider(fetchRequest, arcNetwork, {
            staticNetwork: true,
            batchMaxCount: 1
        });
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log("Keeper Address:", wallet.address);

        const balance = await provider.getBalance(wallet.address);
        console.log("Keeper Balance:", ethers.formatEther(balance), "ARC");

        const code = await provider.getCode(CONTRACT_ADDRESS);
        console.log("Contract Code Length:", code.length);
        if (code === '0x') {
            console.error("CONTRACT NOT DEPLOYED AT", CONTRACT_ADDRESS);
        } else {
            console.log("Contract is deployed.");
        }
    } catch (e) {
        console.error("Check failed:", e.message);
    }
}

check();
