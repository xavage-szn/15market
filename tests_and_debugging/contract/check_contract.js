const { ethers } = require('ethers');
const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const bal = await provider.getBalance(CONTRACT_ADDRESS);
    console.log("CONTRACT_BAL:" + bal.toString());
    const owner = await new ethers.Contract(CONTRACT_ADDRESS, ["function owner() view returns (address)"], provider).owner();
    console.log("OWNER:" + owner);
}
check().catch(console.error);
