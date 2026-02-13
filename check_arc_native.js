const { ethers } = require("ethers");
const ARC_RPC = "https://rpc.arc-testnet.gelato.digital";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const network = await provider.getNetwork();
    console.log("Network:", network.name, network.chainId.toString());

    // Check a known address balance (e.g. the contract)
    const ARC_CONTRACT_ADDRESS = "0x8952B910BCcbaD768A8696F8e0e02B6D45D78386";
    const balWei = await provider.getBalance(ARC_CONTRACT_ADDRESS);
    console.log("Raw Balance:", balWei.toString());
    console.log("Formatted 18:", ethers.formatUnits(balWei, 18));
    console.log("Formatted 6:", ethers.formatUnits(balWei, 6));
}

check();
