const { ethers } = require("ethers");
require("dotenv").config();

async function check() {
    const rpc = "https://5042002.rpc.thirdweb.com";
    const provider = new ethers.JsonRpcProvider(rpc);
    // Directly use the address user confirmed
    const addr = "0x345014899b42bF9034D9475760609e64B1433A6a";

    console.log(`Checking code at ${addr} on ${rpc}...`);
    try {
        const code = await provider.getCode(addr);
        console.log(`Code size: ${code.length}`);
        if (code === "0x") {
            console.log("⚠️  NO CODE! Address is NOT a contract.");
        } else {
            console.log("✅ Contract code found.");
            // Balance Check
            const bal = await provider.getBalance(addr);
            console.log(`Balance: ${ethers.formatEther(bal)} ARC`);
        }
    } catch (e) {
        console.error("Check failed:", e);
    }
}
check();
