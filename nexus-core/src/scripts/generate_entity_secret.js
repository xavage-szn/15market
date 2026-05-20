require('dotenv').config();
const crypto = require('crypto');

async function main() {
    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) {
        console.error('Error: CIRCLE_API_KEY not found in .env');
        process.exit(1);
    }

    console.log('----------------------------------------------------');
    console.log('CIRCLE ENTITY SECRET GENERATOR & ENCRYPTION TOOL');
    console.log('----------------------------------------------------');

    // 1. Generate a valid, secure 32-byte (256-bit) entity secret
    const rawSecretBytes = crypto.randomBytes(32);
    const rawSecretHex = rawSecretBytes.toString('hex');

    console.log('\n[1] Generated Secure 32-Byte Raw Entity Secret:');
    console.log('👉', rawSecretHex);
    console.log('\n(ACTION: Copy this line and replace CIRCLE_ENTITY_SECRET in your nexus-core/.env file with it)');

    // 2. Fetch the entity public key from Circle
    console.log('\n[2] Fetching active RSA public key from Circle...');
    const url = 'https://api.circle.com/v1/w3s/config/entity/publicKey';
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch public key');
        }

        const publicKeyPEM = data.data.publicKey;
        console.log('Public Key retrieved successfully!');

        // 3. Encrypt the raw entity secret using the fetched public key (RSA-OAEP)
        console.log('\n[3] Encrypting raw entity secret using RSA-OAEP with SHA-256...');
        const secretBuffer = Buffer.from(rawSecretHex, 'hex');
        
        const encrypted = crypto.publicEncrypt(
            {
                key: publicKeyPEM,
                oaepHash: 'sha256',
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
            },
            secretBuffer
        );

        const ciphertextBase64 = encrypted.toString('base64');

        console.log('\n====================================================');
        console.log('ENCRYPTED CIPHERTEXT (Paste this in Circle Console):');
        console.log('====================================================\n');
        console.log(ciphertextBase64);
        console.log('\n====================================================');
        console.log('\n(ACTION: Copy the entire block above and paste it into the "Encrypted Ciphertext" box in your Circle Developer Console to register it!)');
        
    } catch (e) {
        console.error('\nError fetching public key / encrypting secret:', e.message);
        console.log('\nTIP: Make sure your CIRCLE_API_KEY in .env is correct and active!');
    }
}

main();
