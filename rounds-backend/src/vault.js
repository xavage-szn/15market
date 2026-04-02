const crypto = require('crypto');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
        
        // --- 🔒 MACHINE LOCK: Derive part of the salt from unique system hardware ---
        this.machineSeed = this._getMachineSeed();
        this.key = this._deriveKey(this.masterKey, this.machineSeed);
    }

    /**
     * Generates a unique, deterministic hardware seed for this specific machine.
     * Supports Render.com Service IDs and manual overrides for easy migration.
     */
    _getMachineSeed() {
        try {
            // 1. Priority: Manual override (Useful for generating production keys locally)
            if (process.env.FORCE_MACHINE_SEED) return process.env.FORCE_MACHINE_SEED;

            // 2. Render.com: Use the Stable Service ID
            if (process.env.RENDER_SERVICE_ID) return `RENDER:${process.env.RENDER_SERVICE_ID}`;

            // 3. Local Hardware Fallback (MACs + Hostname)
            const hostname = os.hostname();
            const platform = os.platform();
            const interfaces = os.networkInterfaces();
            
            const macs = Object.values(interfaces)
                .flat()
                .filter(i => i.mac && i.mac !== '00:00:00:00:00:00')
                .map(i => i.mac)
                .sort()
                .join('|');

            return crypto.createHash('sha256')
                .update(`${hostname}:${platform}:${macs}`)
                .digest('hex');
        } catch (e) {
            return 'default_fallback_seed_v1';
        }
    }

    /**
     * Derives a 32-byte key from the passphrase and machine seed using SHA-256
     */
    _deriveKey(passphrase, seed) {
        return crypto.createHash('sha256')
            .update(`${String(passphrase)}:LOCK:${seed}`)
            .digest();
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
        if (!vaultString || !vaultString.trim().toUpperCase().startsWith('ENC:V1:')) {
            return vaultString; // Return as-is if not a vault string
        }

        try {
            const parts = vaultString.trim().split(':');
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
