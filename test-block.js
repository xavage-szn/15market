const { ethers } = require('ethers');
async function main() {
    const provider = new ethers.JsonRpcProvider('https://5042002.rpc.thirdweb.com');
    const block = await provider.getBlockNumber();
    console.log('Current Block:', block);
}
main();
