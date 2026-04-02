import { Buffer } from 'buffer';
import crypto from 'crypto';

/**
 * 15MARKET SECURE TRANSIT CLIENT
 * Handles application-layer encryption for sensitive API communication.
 */
class VaultClient {
    constructor() {
        this.sessionKey = null;
        this.handshakeComplete = false;
        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Initializes a secure session with the backend.
     */
    async handshake(apiBaseUrl) {
        try {
            console.log('[Vault] Initiating secure handshake...');
            const response = await fetch(`${apiBaseUrl}/vault/handshake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp: Date.now() })
            });
            
            const data = await response.json();
            if (data.success && data.sessionSecret) {
                this.sessionKey = data.sessionSecret;
                this.sessionId = data.sessionId;
                this.handshakeComplete = true;
                console.log('[Vault] Secure handshake established.');
                return true;
            }
            return false;
        } catch (e) {
            console.error('[Vault] Handshake failed:', e.message);
            return false;
        }
    }

    /**
     * Derives a 32-byte key from the session secret
     */
    _deriveKey(secret) {
        return crypto.createHash('sha256').update(String(secret)).digest();
    }

    /**
     * Encrypts a payload for transport
     */
    encryptPayload(data) {
        if (!this.handshakeComplete) return data;
        
        try {
            const key = this._deriveKey(this.sessionKey);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
            encrypted += cipher.final('base64');
            
            const tag = cipher.getAuthTag().toString('base64');
            return {
                _encrypted: true,
                payload: `${iv.toString('base64')}:${tag}:${encrypted}`
            };
        } catch (e) {
            console.error('[Vault] Failed to encrypt payload:', e.message);
            return data;
        }
    }

    /**
     * Decrypts a response from the backend
     */
    decryptResponse(encData) {
        if (!this.handshakeComplete || !encData || !encData.payload) return encData;

        try {
            const key = this._deriveKey(this.sessionKey);
            const parts = encData.payload.split(':');
            if (parts.length !== 3) throw new Error('Invalid transit format');

            const iv = Buffer.from(parts[0], 'base64');
            const tag = Buffer.from(parts[1], 'base64');
            const ciphertext = parts[2];

            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (e) {
            console.error('[Vault] Failed to decrypt response:', e.message);
            return encData;
        }
    }
}

export default new VaultClient();
