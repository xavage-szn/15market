const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const KEEPER_ADDRESS = '0x094604E6bA1E98756b0de29a9E2285Ead0c443Fd';

async function checkBalances() {
    try {
        const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
        const keeperBalance = await provider.getBalance(KEEPER_ADDRESS);

        console.log(`Contract (${CONTRACT_ADDRESS}) Balance: ${formatEther(contractBalance)} USDC`);
        console.log(`Keeper (${KEEPER_ADDRESS}) Balance: ${formatEther(keeperBalance)} USDC`);

        // Also check if there's any ERC20 balance if for some reason it's not native
        // But likely it is native.
    } catch (error) {
        console.error('Error fetching balances:', error);
    }
}

checkBalances();
