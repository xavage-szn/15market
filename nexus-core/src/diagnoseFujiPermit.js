
const { ethers } = require('ethers');

async function diagnose() {
    const rpc = 'https://api.avax-test.network/ext/bc/C/rpc';
    const provider = new ethers.JsonRpcProvider(rpc);
    const usdcAddr = '0x5425890298aed601595a70AB815c96711a31Bc65';

    const abi = [
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
        'function name() view returns (string)',
        'function version() view returns (string)',
        'function nonces(address) view returns (uint256)',
        'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32) external',
        'function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32) external',
        'function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32) external',
        'function authorizationState(address,bytes32) view returns (bool)',
    ];
    const usdc = new ethers.Contract(usdcAddr, abi, provider);

    console.log('=== Fuji USDC Diagnostics ===');

    let contractName, contractVersion, domainSep;
    try {
        contractName = await usdc.name();
        console.log('Name:', contractName);
    } catch(e) { console.log('name() FAILED:', e.message); }

    try {
        contractVersion = await usdc.version();
        console.log('Version:', contractVersion);
    } catch(e) { console.log('version() FAILED:', e.message); }

    try {
        domainSep = await usdc.DOMAIN_SEPARATOR();
        console.log('DOMAIN_SEPARATOR:', domainSep);
    } catch(e) { console.log('DOMAIN_SEPARATOR() FAILED:', e.message); }

    // Try to reconstruct domain separator
    if (contractName && contractVersion && domainSep) {
        const candidates = [
            { name: contractName, version: contractVersion },
            { name: contractName, version: '1' },
            { name: contractName, version: '2' },
            { name: 'USDC', version: '2' },
            { name: 'USDC', version: '1' },
            { name: 'USD Coin', version: '2' },
            { name: 'USD Coin', version: '1' },
        ];
        
        let matchFound = false;
        for (const c of candidates) {
            try {
                // Standard EIP-712 domain hash with chainId
                const computed = ethers.TypedDataEncoder.hashDomain({
                    name: c.name,
                    version: c.version,
                    chainId: 43113,
                    verifyingContract: usdcAddr
                });
                const matches = computed === domainSep;
                console.log(`[chainId=43113] name="${c.name}" version="${c.version}" -> ${matches ? '** MATCH **' : 'no match'}`);
                if (matches) matchFound = true;
            } catch(e) {}

            // Without chainId (some contracts use this)
            try {
                const computed2 = ethers.TypedDataEncoder.hashDomain({
                    name: c.name,
                    version: c.version,
                    verifyingContract: usdcAddr
                });
                const matches2 = computed2 === domainSep;
                console.log(`[no chainId]   name="${c.name}" version="${c.version}" -> ${matches2 ? '** MATCH **' : 'no match'}`);
                if (matches2) matchFound = true;
            } catch(e) {}
        }
        if (!matchFound) {
            console.log('\n--- No standard domain match. This contract likely uses transferWithAuthorization (EIP-3009), NOT permit (EIP-2612). ---');
        }
    }

    // Check if transferWithAuthorization exists in bytecode (function selector)
    console.log('\n--- Checking EIP-3009 support (transferWithAuthorization) ---');
    // Selector for transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
    const twaSelector = '0xe3ee160e';
    const bytecode = await provider.getCode(usdcAddr);
    console.log('transferWithAuthorization in bytecode:', bytecode.includes(twaSelector.slice(2)));

    // Selector for permit
    const permitSelector = ethers.id('permit(address,address,uint256,uint256,uint8,bytes32,bytes32)').slice(0, 10);
    console.log('permit in bytecode:', bytecode.includes(permitSelector.slice(2)));
    console.log('Permit selector:', permitSelector);
}

diagnose().catch(console.error);
