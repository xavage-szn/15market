const { ethers } = require('ethers');

const sig = "placeBet(uint256,uint8,uint256,uint256,uint8,address)";
const selector = ethers.id(sig).slice(0, 10);
console.log(`Selector for ${sig}: ${selector}`);

const sig2 = "settleBet(uint256,uint256)";
const selector2 = ethers.id(sig2).slice(0, 10);
console.log(`Selector for ${sig2}: ${selector2}`);
