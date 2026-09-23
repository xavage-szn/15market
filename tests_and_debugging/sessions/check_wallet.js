const { ethers } = require('ethers');
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error('PRIVATE_KEY env var is required (no hardcoded key in the repo). Set it before running this script.');
  process.exit(1);
}
const wallet = new ethers.Wallet(pk);
console.log("Wallet address:", wallet.address);
