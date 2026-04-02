const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * 15MARKET SECURITY VAULT
 * Handles AES-256-GCM encryption/decryption for sensitive environment variables.
 */
class VaultService {
    constructor() {
        // The master passphrase should ideally be set in the shell environment, 
        // not the .env file, for maximum security.
        this.masterKey = process.env.SYSTEM_PASSPHRASE || '15market_default_system_salt_2026';
        this.algorithm = 'aes-256-gcm';
        this.key = this._deriveKey(this.masterKey);
    }

    /**
     * Derives a 32-byte key from the passphrase using SHA-256
     */
    _deriveKey(passphrase) {
        return crypto.createHash('sha256').update(String(passphrase)).digest();
    }

    /**
     * Encrypts a string into a vault-formatted string: ENC:v1:iv:tag:ciphertext
     */
    encrypt(text) {
        if (!text) return null;
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const tag = cipher.getAuthTag().toString('base64');
        return `ENC:v1:${iv.toString('base64')}:${tag}:${encrypted}`;
    }

    /**
     * Decrypts a vault-formatted string. Returns original if not encrypted.
     */
    decrypt(vaultString) {
        if (!vaultString || !vaultString.startsWith('ENC:v1:')) {
            return vaultString; // Return as-is if not a vault string
        }

        try {
            const parts = vaultString.split(':');
            if (parts.length !== 5) throw new Error('Invalid vault format');

            const iv = Buffer.from(parts[2], 'base64');
            const tag = Buffer.from(parts[3], 'base64');
            const ciphertext = parts[4];

            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            console.error('[Vault] Decryption failed. Incorrect SYSTEM_PASSPHRASE?');
            return null;
        }
    }

    /**
     * Redacts sensitive strings for safe logging (e.g. 0x123...abc)
     */
    mask(text) {
        if (!text || typeof text !== 'string') return '[REDACTED]';
        if (text.startsWith('ENC:v1:')) return '[ENCRYPTED_VAULT_DATA]';
        if (text.length <= 8) return '****';
        return `${text.slice(0, 4)}...${text.slice(-4)}`;
    }

    /**
     * Convenience helper to get a decrypted env variable
     */
    get(envKey) {
        const val = process.env[envKey];
        if (!val) return null;
        return this.decrypt(val);
    }

    /**
     * Application Layer Transport Encryption (For frontend-backend handshake)
     */
    encryptForTransport(data, sessionKey) {
        const transitKey = this._deriveKey(sessionKey);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, transitKey, iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const tag = cipher.getAuthTag().toString('base64');
        return `${iv.toString('base64')}:${tag}:${encrypted}`;
    }

    /**
     * Application Layer Transport Decryption
     */
    decryptForTransport(transitPayload, sessionKey) {
        const transitKey = this._deriveKey(sessionKey);
        const parts = transitPayload.split(':');
        if (parts.length !== 3) throw new Error('Invalid transit format');

        const iv = Buffer.from(parts[0], 'base64');
        const tag = Buffer.from(parts[1], 'base64');
        const ciphertext = parts[2];

        const decipher = crypto.createDecipheriv(this.algorithm, transitKey, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

module.exports = new VaultService();
