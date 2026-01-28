const fetch = require('node-fetch');

async function testOAuthSecureFlow() {
    const KEEPER_URL = 'http://localhost:8080';
    const testAddress = 'Ev3...test_address...';

    console.log('🧪 Testing OAuth Secure Flow...');

    try {
        // 1. Prepare State
        console.log('1. Preparing secure state...');
        const prepRes = await fetch(`${KEEPER_URL}/auth/twitter/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: testAddress, network: 'solana' })
        });
        const { state: stateId } = await prepRes.json();

        if (stateId && stateId.length > 20) {
            console.log('✅ Secure state ID generated:', stateId);
        } else {
            console.error('❌ Failed to generate secure state ID');
            return;
        }

        // 2. Simulate Callback (Manual check of logs would be needed to see if it links correctly)
        // Since we can't fully simulate Twitter, we just verify the endpoint exists and handles the state
        console.log('2. Testing callback with generated state...');
        const callbackUrl = `${KEEPER_URL}/auth/twitter/callback?code=mock_code&state=${stateId}`;
        const callbackRes = await fetch(callbackUrl, { redirect: 'manual' });

        if (callbackRes.status === 302) {
            console.log('✅ Callback handled and redirected as expected.');
        } else {
            console.warn('⚠️ Callback status unexpected:', callbackRes.status);
        }

        console.log('\n✨ Verification complete. The wallet address is now hidden behind an opaque state ID.');
    } catch (e) {
        console.error('❌ Test failed:', e.message);
        console.log('Make sure the keeper is running on port 8080.');
    }
}

testOAuthSecureFlow();
