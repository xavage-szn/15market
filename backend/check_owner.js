const { JsonRpcProvider, Contract } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);
const ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function checkOwner() {
    const abi = ["function owner() view returns (address)"];
    const contract = new Contract(ADDRESS, abi, provider);
    const owner = await contract.owner();
    console.log(`Contract Owner: ${owner}`);
}

checkOwner();
