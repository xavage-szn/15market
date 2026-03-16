const { JsonRpcProvider, Contract, formatUnits } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const USDC_ERC20 = '0x3600000000000000000000000000000000000000';
const ABI = ["function balanceof(address) view returns (uint256)", "function decimals() view returns (uint8)"];

async function checkERC20() {
    try {
        const contract = new Contract(USDC_ERC20, ABI, provider);
        const decimals = await contract.decimals().catch(() => 18);
        const balance = await contract.balanceof(CONTRACT_ADDRESS).catch(() => 0n);

        console.log(`Contract ERC20 (0x36...) Balance: ${formatUnits(balance, decimals)}`);
    } catch (error) {
        console.log('Error or no ERC20 at 0x36...');
    }
}

checkERC20();
