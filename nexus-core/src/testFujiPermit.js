const { ethers } = require('ethers');

async function main() {
    const rpc = 'https://api.avax-test.network/ext/bc/C/rpc';
    const provider = new ethers.JsonRpcProvider(rpc);
    const usdcAddr = '0x5425890298aed601595a70AB815c96711a31Bc65';
    // Use any address for testing
    const testAddr = '0x92e55d6b455d8181938acf0b5be8e6c22edc1319';

    const abi = [
        'function nonces(address) view returns (uint256)',
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
        'function name() view returns (string)',
        'function version() view returns (string)',
        'function decimals() view returns (uint8)',
    ];
    const usdc = new ethers.Contract(usdcAddr, abi, provider);

    console.log('--- Fuji USDC Permit Prereqs ---');
    try { console.log('name:', await usdc.name()); } catch(e) { console.log('name FAILED:', e.shortMessage || e.message); }
    try { console.log('version:', await usdc.version()); } catch(e) { console.log('version FAILED:', e.shortMessage || e.message); }
    try { console.log('decimals:', await usdc.decimals()); } catch(e) { console.log('decimals FAILED'); }
    try { 
        const n = await usdc.nonces(testAddr);
        console.log('nonces(testAddr):', n.toString()); 
    } catch(e) { console.log('nonces FAILED:', e.shortMessage || e.message); }

    // --- Try staticCall of permit with dummy sig to see if function exists ---
    console.log('\n--- Static-calling permit with dummy/expired params ---');
    const permitAbi = ['function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)'];
    const usdcPermit = new ethers.Contract(usdcAddr, permitAbi, provider);
    try {
        await usdcPermit.permit.staticCall(
            testAddr, testAddr, 0n, 0n, 27, ethers.ZeroHash, ethers.ZeroHash
        );
        console.log('staticCall returned without revert - permit exists');
    } catch(e) {
        const reason = e.reason || e.shortMessage || e.message || '';
        console.log('staticCall reverted with:', reason);
        if (reason.toLowerCase().includes('eip2612') || reason.toLowerCase().includes('expired') || reason.toLowerCase().includes('invalid')) {
            console.log('=> permit() DOES EXIST on Fuji USDC');
        } else {
            console.log('=> permit() likely does NOT exist (generic revert)');
        }
    }

    // --- Verify domain separator computation ---
    console.log('\n--- Domain Separator Check ---');
    const onChain = await usdc.DOMAIN_SEPARATOR();
    const name = await usdc.name().catch(() => 'USDC');
    const version = await usdc.version().catch(() => '2');
    const computed = ethers.TypedDataEncoder.hashDomain({
        name, version, chainId: 43113, verifyingContract: usdcAddr
    });
    console.log('On-chain  :', onChain);
    console.log('Computed  :', computed);
    console.log('Match     :', onChain === computed);
}

main().catch(console.error);
