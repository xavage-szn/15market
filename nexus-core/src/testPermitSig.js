const { ethers } = require('ethers');

async function testPermit() {
    const rpc = 'https://api.avax-test.network/ext/bc/C/rpc';
    const provider = new ethers.JsonRpcProvider(rpc);
    
    // Create a random wallet for testing
    const wallet = ethers.Wallet.createRandom().connect(provider);
    console.log('Testing with wallet:', wallet.address);

    const usdcAddr = '0x5425890298aed601595a70AB815c96711a31Bc65';
    const relayer = '0x094604E6bA1E98756b0de29a9E2285Ead0c443Fd';

    const abi = [
        'function nonces(address) view returns (uint256)',
        'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32) external'
    ];
    const usdc = new ethers.Contract(usdcAddr, abi, provider);

    const nonce = await usdc.nonces(wallet.address);
    console.log('Nonce:', nonce.toString());

    const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 43113,
        verifyingContract: usdcAddr
    };

    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
        ]
    };

    const amount = ethers.parseUnits('2', 6);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const value = {
        owner: wallet.address,
        spender: relayer,
        value: amount,
        nonce: nonce,
        deadline: deadline
    };

    console.log('Signing...');
    const signature = await wallet.signTypedData(domain, types, value);
    const sig = ethers.Signature.from(signature);

    console.log('Signature:', sig);

    console.log('Testing staticCall to permit...');
    try {
        await usdc.permit.staticCall(
            wallet.address,
            relayer,
            amount,
            deadline,
            sig.v,
            sig.r,
            sig.s
        );
        console.log('staticCall successful! The signature is perfectly valid.');
    } catch (e) {
        console.error('staticCall failed:', e.reason || e.shortMessage || e.message);
    }
}

testPermit().catch(console.error);
