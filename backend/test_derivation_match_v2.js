const { ethers } = require('ethers');

const secret = "15market_super_secure_master_secret_key_v1";
const addr = "0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C"; // Case preserved
const target = "0x1074E2461364f0842Fc60Ce0C85c950341F9E18f".toLowerCase();

function test(name, pk) {
    try {
        const wallet = new ethers.Wallet(pk);
        const result = wallet.address.toLowerCase();
        console.log(`[${name}] ${result} ${result === target ? 'MATCH!' : ''}`);
    } catch (e) { }
}

test("Keccak256(secret:addr)", ethers.keccak256(ethers.toUtf8Bytes(`${secret}:${addr}`)));
test("Keccak256(secret:addr.lower)", ethers.keccak256(ethers.toUtf8Bytes(`${secret}:${addr.toLowerCase()}`)));
test("Keccak256(addr:secret)", ethers.keccak256(ethers.toUtf8Bytes(`${addr}:${secret}`)));
test("Ethers.id(addr:secret)", ethers.id(`${addr}:${secret}`));
test("Ethers.id(addr.lower:secret)", ethers.id(`${addr.toLowerCase()}:${secret}`));

// Maybe the secret itself is the problem?
const altSecret1 = "15market_universal_session_salt_v1";
test("AltSecret1 + id(addr:secret)", ethers.id(`${addr.toLowerCase()}:${altSecret1}`));
test("AltSecret1 + id(secret:addr)", ethers.id(`${altSecret1}:${addr.toLowerCase()}`));
