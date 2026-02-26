const { ethers } = require('ethers');

async function check() {
    const rpc = "https://5042002.rpc.thirdweb.com";
    const provider = new ethers.JsonRpcProvider(rpc);

    try {
        const net = await provider.getNetwork();
        console.log("Chain ID:", net.chainId.toString());

        const addr = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
        const code = await provider.getCode(addr);
        console.log("Code length at address:", code.length);
    } catch (e) {
        console.log("Error:", e.message);
    }
}

check();
