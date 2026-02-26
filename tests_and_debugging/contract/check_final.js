const { ethers } = require('ethers');

async function check() {
    const rpc = "https://5042002.rpc.thirdweb.com";
    const addr = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

    console.log(`Checking ${addr} on ${rpc}...`);
    const provider = new ethers.JsonRpcProvider(rpc);

    try {
        const code = await provider.getCode(addr);
        console.log("Code length:", code.length);

        const abi = [
            "function owner() view returns (address)",
            "function getUserCount() view returns (uint256)"
        ];
        const contract = new ethers.Contract(addr, abi, provider);

        const owner = await contract.owner();
        const count = await contract.getUserCount();
        console.log("✅ Contract found!");
        console.log("Owner:", owner);
        console.log("User Count:", count.toString());

        const bal = await provider.getBalance(addr);
        console.log("Contract Balance:", ethers.formatUnits(bal, 18), "USDC");
    } catch (e) {
        console.error("❌ Check failed:", e.message);
    }
}

check();
