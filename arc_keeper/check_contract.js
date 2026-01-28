require('dotenv').config();
const { ethers } = require('ethers');
const ARC_RPC = "https://rpc.quicknode.testnet.arc.network";
const CONTRACT_ADDRESS = "0x43f36AC1Fd85E2BC15e4ebB39BCB61d2619d23bB";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const code = await provider.getCode(CONTRACT_ADDRESS);
    console.log("Contract Code Length:", code.length);
    if (code === '0x') {
        console.error("NO CONTRACT AT THIS ADDRESS!");
    } else {
        const abi = ["function nextBetId() view returns (uint256)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
        try {
            const nextId = await contract.nextBetId();
            console.log("Next Bet ID:", nextId.toString());
        } catch (e) {
            console.error("Failed to call nextBetId:", e.message);
        }
    }
}
check();
