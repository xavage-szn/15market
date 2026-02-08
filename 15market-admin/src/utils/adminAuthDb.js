import * as OTPAuth from 'otpauth';

/**
 * Admin Authentication Database & Logic
 * Handles credentials verification and TOTP (2FA) operations.
 */
export const AdminAuthDB = {
    /**
     * Verifies the username and password coordinates.
     * @param {string} username 
     * @param {string} password 
     * @returns {Promise<{success: boolean, message?: string, user?: {id: string, username: string}}>}
     */
    verifyCoordinates: async (username, password) => {
        // Root credentials
        const ROOT_USER = "xavageszn-root";
        const ROOT_PASS = "NORgate123+";

        if (username === ROOT_USER && password === ROOT_PASS) {
            return {
                success: true,
                user: { id: 'root_admin', username: 'Root Admin (xavageszn)', role: 'ROOT' }
            };
        }

        return {
            success: false,
            message: "INVALID AUTHENTICATION COORDINATES"
        };
    },

    /**
     * Retrieves the stored 2FA secret for a user.
     * @param {string} userId 
     * @returns {Promise<string|null>}
     */
    get2FASecret: async (userId) => {
        return localStorage.getItem(`15market_citadel_2fa_${userId}`);
    },

    /**
     * Stores the 2FA secret for a user.
     * @param {string} userId 
     * @param {string} secret 
     * @returns {Promise<void>}
     */
    set2FASecret: async (userId, secret) => {
        localStorage.setItem(`15market_citadel_2fa_${userId}`, secret);
    },

    /**
     * Generates a new random Base32 secret for TOTP.
     * @returns {string}
     */
    generateSecret: () => {
        const secret = new OTPAuth.Secret({ size: 20 });
        return secret.base32;
    },

    /**
     * Verifies a TOTP 2FA code against a secret.
     * @param {string} token 
     * @param {string} secret 
     * @returns {boolean}
     */
    verifyTOTP: (token, secret) => {
        if (!secret) return false;

        const totp = new OTPAuth.TOTP({
            issuer: "15Market",
            label: "Citadel",
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secret),
        });

        const delta = totp.validate({
            token: token.trim(),
            window: 1
        });

        return delta !== null;
    }
};
