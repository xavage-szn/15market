const { ethers } = require('ethers');
const pk = "0x49c0ad169baa96838b88441b562997e0dcf93b9df952bdf0a3176a71f2edd66a";
const wallet = new ethers.Wallet(pk);
console.log("Wallet address:", wallet.address);
