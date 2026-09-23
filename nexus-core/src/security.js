const crypto = require('crypto');
const { ethers } = require('ethers');

// ─── ENCRYPTION AT REST ─────────────────────────────────────────────────────
// Uses AES-256-GCM for symmetric encryption of private keys at rest.
// The encryption key is derived from a separate env var, never from SESSION_MASTER_SECRET.

const ENCRYPTION_KEY = process.env.KEY_ENCRYPTION_SECRET;
const ALGO = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
  console.warn('[Security] KEY_ENCRYPTION_SECRET not set. Private keys will NOT be encrypted at rest. Set this in production!');
}

function _getKey() {
  if (!ENCRYPTION_KEY) return null;
  // Derive a 32-byte key from the env secret
  return crypto.scryptSync(ENCRYPTION_KEY, '15market-key-derivation-v1', 32);
}

/**
 * Encrypt a plaintext string (e.g. private key) for storage.
 * Returns base64 string: iv(16) + authTag(16) + ciphertext
 */
function encryptSecret(plaintext) {
  const key = _getKey();
  if (!key) return plaintext; // No encryption configured — return as-is with warning

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt an encrypted string back to plaintext.
 * If the string doesn't look encrypted (not base64 of expected length), returns as-is.
 */
function decryptSecret(ciphertext) {
  const key = _getKey();
  if (!key) return ciphertext;

  try {
    const buf = Buffer.from(ciphertext, 'base64');
    // Minimum: 16 (iv) + 16 (tag) + 1 (data) = 33 bytes
    if (buf.length < 33) return ciphertext;

    const iv = buf.slice(0, 16);
    const authTag = buf.slice(16, 32);
    const encrypted = buf.slice(32);

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    // If decryption fails, it might already be plaintext (migration period)
    return ciphertext;
  }
}

/**
 * Check if a value appears to be encrypted (base64, correct length pattern).
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length >= 33 && buf.toString('base64') === value;
  } catch {
    return false;
  }
}

// ─── ADMIN AUTH MIDDLEWARE ──────────────────────────────────────────────────
// Server-side admin authentication using HMAC-signed bearer tokens.
// Tokens are short-lived (5 min) and bound to a session nonce.

const ADMIN_SECRET = process.env.ADMIN_API_SECRET;
const adminSessions = new Map(); // token -> { createdAt, ip }

if (!ADMIN_SECRET) {
  console.warn('[Security] ADMIN_API_SECRET not set. Admin endpoints are UNPROTECTED. Set this in production!');
}

/**
 * Generate a short-lived admin session token.
 * Called by a server-side login endpoint (not exposed publicly).
 */
function generateAdminToken(ip) {
  if (!ADMIN_SECRET) return null;
  const nonce = crypto.randomBytes(24).toString('hex');
  const payload = `${Date.now()}:${ip}:${nonce}`;
  const signature = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  const token = Buffer.from(`${payload}:${signature}`).toString('base64');
  adminSessions.set(token, { createdAt: Date.now(), ip });
  return token;
}

/**
 * Express middleware: protects admin endpoints.
 * Requires: Authorization: Bearer <token>
 */
function requireAdminAuth(req, res, next) {
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: 'Admin auth not configured. Set ADMIN_API_SECRET.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const token = authHeader.slice(7);
  const session = adminSessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }

  // Token expires after 5 minutes
  if (Date.now() - session.createdAt > 5 * 60 * 1000) {
    adminSessions.delete(token);
    return res.status(401).json({ error: 'Admin session expired' });
  }

  // Verify HMAC integrity
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 4) return res.status(401).json({ error: 'Malformed token' });

    const [ts, ip, nonce, signature] = parts;
    const payload = `${ts}:${ip}:${nonce}`;
    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return res.status(401).json({ error: 'Invalid admin token signature' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Token verification failed' });
  }

  next();
}

// ─── DEPOSIT TX VERIFICATION ────────────────────────────────────────────────

/**
 * Verify that a transaction hash corresponds to a real on-chain transfer
 * of the expected amount from the user to the expected destination.
 *
 * @param {ethers.JsonRpcProvider} provider - RPC provider
 * @param {string} txHash - Transaction hash to verify
 * @param {string} expectedFrom - Expected sender address (lowercase)
 * @param {string} expectedTo - Expected recipient address (lowercase)
 * @param {number} expectedAmount - Expected amount in USDC (human-readable)
 * @param {object} opts - { decimals: number, tolerance: number (default 0.01) }
 * @returns {Promise<{verified: boolean, reason?: string, actualAmount?: number}>}
 */
async function verifyDepositTx(provider, txHash, expectedFrom, expectedTo, expectedAmount, opts = {}) {
  const { decimals = 18, tolerance = 0.01 } = opts;

  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { verified: false, reason: 'Transaction not found or not yet confirmed' };
    if (receipt.status !== 1) return { verified: false, reason: 'Transaction reverted on-chain' };

    const tx = await provider.getTransaction(txHash);
    if (!tx) return { verified: false, reason: 'Transaction data not available' };

    const allowedRecipients = Array.isArray(expectedTo)
      ? expectedTo.map(a => a?.toLowerCase())
      : [expectedTo?.toLowerCase()];

    // For native ETH/ARC transfers
    if (!tx.data || tx.data === '0x') {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();
      const value = parseFloat(ethers.formatEther(tx.value));

      if (from !== expectedFrom.toLowerCase()) {
        return { verified: false, reason: `Sender mismatch: expected ${expectedFrom}, got ${tx.from}` };
      }
      if (!allowedRecipients.includes(to)) {
        return { verified: false, reason: `Recipient mismatch: expected ${allowedRecipients.join(' or ')}, got ${tx.to}` };
      }
      if (Math.abs(value - expectedAmount) > tolerance) {
        return { verified: false, reason: `Amount mismatch: expected ${expectedAmount}, got ${value}` };
      }
      return { verified: true, actualAmount: value };
    }

    // For ERC-20 transfers — decode the transfer(to, amount) call
    // Common function selector: 0xa9059cbb
    if (tx.data.startsWith('0xa9059cbb')) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256'],
        '0x' + tx.data.slice(10)
      );
      const to = decoded[0]?.toLowerCase();
      const amountRaw = decoded[1];
      const amount = parseFloat(ethers.formatUnits(amountRaw, decimals));

      if (tx.from?.toLowerCase() !== expectedFrom.toLowerCase()) {
        return { verified: false, reason: `Sender mismatch` };
      }
      if (!allowedRecipients.includes(to)) {
        return { verified: false, reason: `Recipient mismatch: expected ${allowedRecipients.join(' or ')}, got ${to}` };
      }
      if (Math.abs(amount - expectedAmount) > tolerance) {
        return { verified: false, reason: `Amount mismatch: expected ${expectedAmount}, got ${amount}` };
      }
      return { verified: true, actualAmount: amount };
    }

    return { verified: false, reason: 'Unrecognized transaction format' };
  } catch (e) {
    if (process.env.PAYOUT_INLINE_FALLBACK === 'true' || config.PAYOUT_INLINE_FALLBACK) {
      console.warn(`[Security] RPC unreachable during deposit verification (${e.message}), granting optimistic credit due to fallback setting`);
      return { verified: true, actualAmount: expectedAmount, fallback: true };
    }
    return { verified: false, reason: `Verification error: ${e.message}` };
  }
}

// ─── RATE LIMITING (simple in-memory) ───────────────────────────────────────

const rateLimitBuckets = new Map();

/**
 * Simple sliding-window rate limiter.
 * @param {string} key - Identifier (e.g. IP, address)
 * @param {number} maxRequests - Max requests in window
 * @param {number} windowMs - Window duration in ms
 * @returns {boolean} true if allowed, false if rate limited
 */
function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitBuckets.set(key, bucket);
  }

  // Prune old entries
  bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    return false;
  }

  bucket.timestamps.push(now);
  return true;
}

// ─── USER DATA ISOLATION & OWNERSHIP ────────────────────────────────────────

/**
 * Verify an EVM signature for an address and message.
 * @param {string} address - Expected signer address
 * @param {string} message - Message that was signed
 * @param {string} signature - Hex signature string
 * @returns {boolean}
 */
function verifyAddressSignature(address, message, signature) {
  if (!address || !message || !signature) return false;
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch (e) {
    return false;
  }
}

/**
 * Sanitize a user profile object before sending in API response.
 * Strips private keys, encrypted keys, and private contact info for non-owners.
 * @param {object} profile - Full profile object
 * @param {boolean} isOwner - Whether the requester owns this profile
 * @returns {object|null}
 */
function sanitizeProfile(profile, isOwner = false) {
  if (!profile) return null;
  const safe = JSON.parse(JSON.stringify(profile));

  if (!isOwner) {
    // Strip private keys and secret credentials
    if (safe.solanaWallet) {
      delete safe.solanaWallet.privKey;
      delete safe.solanaWallet.secretKey;
      delete safe.solanaWallet.encryptedKey;
    }
    if (safe.copyTradingWallet) {
      delete safe.copyTradingWallet.privKey;
      delete safe.copyTradingWallet.secretKey;
      delete safe.copyTradingWallet.encryptedKey;
    }
    if (safe.tradingWallet && typeof safe.tradingWallet === 'object') {
      delete safe.tradingWallet.privKey;
      delete safe.tradingWallet.secretKey;
      delete safe.tradingWallet.encryptedKey;
    }
    // Strip sensitive personal details
    delete safe.email;
    delete safe.verifiedEmail;
    delete safe.discord;
    delete safe.accessCode;
  }
  return safe;
}

/**
 * Express middleware to identify whether the requester owns the resource.
 * Checks x-user-address header, cryptographic signature if provided, or admin session.
 * @param {string} addressParam - Param / body / query key containing target address
 * @param {object} opts - { strict: boolean } (if strict=true, blocks request if not owner)
 */
function requireOwnership(addressParam = 'address', { strict = false } = {}) {
  return (req, res, next) => {
    const target = (
      req.params[addressParam] ||
      req.body[addressParam] ||
      req.query[addressParam] ||
      ''
    ).toLowerCase();

    if (!target) {
      return res.status(400).json({ error: `Missing required target address parameter: ${addressParam}` });
    }

    // Check if requester is authenticated admin
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (adminSessions.has(token)) {
        req.isOwner = true;
        req.isAdmin = true;
        req.callerAddress = 'admin';
        return next();
      }
    }

    const caller = (
      req.headers['x-user-address'] ||
      req.headers['x-wallet-address'] ||
      req.headers['x-caller-address'] ||
      ''
    ).toLowerCase();

    const signature = req.headers['x-auth-signature'];
    const timestamp = req.headers['x-auth-timestamp'];

    let verified = false;

    // Cryptographic verification if signature provided
    if (signature && timestamp) {
      const age = Math.abs(Date.now() - Number(timestamp));
      // Max 15 minutes window
      if (age < 15 * 60 * 1000) {
        const message = `15market-auth:${target}:${timestamp}`;
        if (verifyAddressSignature(target, message, signature)) {
          verified = true;
        }
      }
    } else if (caller && caller === target) {
      // Direct caller address match (for standard app requests)
      verified = true;
    }

    req.isOwner = verified;
    req.callerAddress = caller || target;

    if (strict && !verified) {
      return res.status(403).json({
        error: 'Forbidden: You do not have permission to access or modify this account data'
      });
    }

    next();
  };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  generateAdminToken,
  requireAdminAuth,
  verifyDepositTx,
  checkRateLimit,
  verifyAddressSignature,
  sanitizeProfile,
  requireOwnership
};

