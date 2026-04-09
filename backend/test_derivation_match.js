const { ethers } = require('ethers');
const crypto = require('crypto');

const secret = "15market_super_secure_master_secret_key_v1";
const addr = "0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C".toLowerCase();
const target = "0x1074E2461364f0842Fc60Ce0C85c950341F9E18f".toLowerCase();

function test(name, pk) {
    const wallet = new ethers.Wallet(pk);
    const result = wallet.address.toLowerCase();
    console.log(`[${name}] ${result} ${result === target ? 'MATCH!' : ''}`);
}

// Method 1: Current logic
test("Ethers.id", ethers.id(`${secret}:${addr}`));

// Method 2: crypto HMAC
const hmac = crypto.createHmac('sha256', secret).update(addr).digest('hex');
test("Crypto HMAC", '0x' + hmac);

// Method 3: Simple concat Hash
const hash = crypto.createHash('sha256').update(secret + addr).digest('hex');
test("Simple Concat Hash", '0x' + hash);

// Method 4: Ethers id without colon
test("Ethers.id (no colon)", ethers.id(secret + addr));

// Method 5: Default Salt + current logic
const defaultSecret = "15market_universal_session_salt_v1";
test("Default Salt + Ethers.id", ethers.id(`${defaultSecret}:${addr}`));
