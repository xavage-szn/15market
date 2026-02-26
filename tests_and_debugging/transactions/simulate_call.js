const { ethers } = require('ethers');
const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
async function run() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const iface = new ethers.Interface(["function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"]);

    // Test data from failed tx
    const betId = 1771379933394n;
    const direction = 1;
    const duration = 5;
    const entryPrice = 197787000000n;
    const marketId = 1;
    const payout = "0x68541a5e5Ec55b6Da085763214C22DC83f43B2Ed";
    const value = ethers.parseEther("2.5021");

    console.log("Simulating placeBet...");
    try {
        const result = await provider.call({
            to: CONTRACT_ADDRESS,
            from: payout,
            data: iface.encodeFunctionData("placeBet", [betId, direction, duration, entryPrice, marketId, payout]),
            value: value
        });
        console.log("Result:", result);
    } catch (e) {
        console.log("Error:", e.message);
        if (e.data) console.log("Data:", e.data);
    }
}
run();
