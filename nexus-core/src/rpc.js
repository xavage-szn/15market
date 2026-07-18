// ============================================================
// nexus-core/src/rpc.js
// Multi-provider RPC with failover broadcasting and racing.
// ============================================================
const { ethers } = require('ethers');
const config = require('./config');

class RPCManager {
  constructor() {
    this.chainId = config.CHAIN_ID;
    this._writeCounter = 0;

    // Initialize multiple providers for redundancy
    this.providers = config.RPCS.map(url => {
      let rpcUrl = url;
      if (url.includes('thirdweb.com') && config.THIRDWEB_CLIENT_ID && !url.includes(config.THIRDWEB_CLIENT_ID)) {
        rpcUrl = url.endsWith('/') ? `${url}${config.THIRDWEB_CLIENT_ID}` : `${url}/${config.THIRDWEB_CLIENT_ID}`;
      }
      const fetchRequest = new ethers.FetchRequest(rpcUrl);
      if (url.includes('thirdweb.com') && config.THIRDWEB_SECRET_KEY) {
        fetchRequest.setHeader("x-secret-key", config.THIRDWEB_SECRET_KEY);
      }
      return new ethers.JsonRpcProvider(fetchRequest, this.chainId, { staticNetwork: true });
    });

    if (this.providers.length === 0) {
      console.warn("[RPCManager] No valid providers initialized.");
    }

    // Fallback provider for READS only
    this.provider = new ethers.FallbackProvider(this.providers.map((p, i) => ({
      provider: p,
      priority: i,
      weight: 1,
      stallTimeout: 2500
    })));

    // Direct provider for WRITES (first provider)
    this.writeProvider = this.providers[0] || this.provider;
    this.mainProvider = this.provider;

    if (config.PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(config.PRIVATE_KEY, this.writeProvider);
    }
  }

  async callWithTimeout(promise, timeoutMs = 8000) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RPC_TIMEOUT')), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }

  /**
   * Get nonce from any working provider.
   */
  async getNonce(address) {
    for (let i = 0; i < this.providers.length; i++) {
      try {
        return await this.providers[i].getTransactionCount(address, 'pending');
      } catch {}
    }
    throw new Error('Failed to get nonce from all providers');
  }

  /**
   * BROADCAST TX WITH FAILOVER — tries each provider in round-robin order.
   * Returns the TransactionResponse (with real .hash) on success.
   * Throws only if ALL providers fail.
   *
   * @param {string} privateKey - Signer private key
   * @param {object} txParams - Transaction parameters (to, data, value, gasLimit, gasPrice, nonce, chainId)
   */
  async broadcastWithFailover(privateKey, txParams) {
    const errors = [];
    for (let i = 0; i < this.providers.length; i++) {
      const idx = (this._writeCounter + i) % this.providers.length;
      try {
        const provider = this.providers[idx];
        const signer = new ethers.Wallet(privateKey, provider);
        const txResponse = await signer.sendTransaction(txParams);
        this._writeCounter = (idx + 1) % this.providers.length;
        return txResponse;
      } catch (err) {
        errors.push(`[RPC#${idx}] ${err.message?.substring(0, 120)}`);
      }
    }
    throw new Error(`All ${this.providers.length} RPCs failed: ${errors.join(' | ')}`);
  }

  /**
   * SAFE TX WAIT — Manually polls getTransactionReceipt across ALL providers
   * with exponential backoff. Never throws; returns receipt or null.
   *
   * @param {string} txHash - Transaction hash to poll
   * @param {number} maxAttempts - Max poll attempts (default 8)
   * @param {number} initialDelay - Initial delay in ms (default 3000)
   */
  async waitForReceipt(txHash, maxAttempts = 8, initialDelay = 3000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Try all providers on each attempt for fastest confirmation
      for (let p = 0; p < this.providers.length; p++) {
        try {
          const receipt = await this.providers[p].getTransactionReceipt(txHash);
          if (receipt) return receipt;
        } catch {}
      }
      const delay = Math.min(initialDelay * Math.pow(1.3, attempt - 1), 15000);
      await new Promise(r => setTimeout(r, delay));
    }
    return null;
  }

  async getBalance(address) {
    if (this.providers.length === 0) return "0";
    for (let i = 0; i < this.providers.length; i++) {
      try {
        const bal = await this.callWithTimeout(this.providers[i].getBalance(address, 'pending'), 5000);
        return ethers.formatEther(bal);
      } catch {}
    }
    return "0";
  }

  deriveSessionWallet(userAddr) {
    if (!userAddr) return null;
    const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
    const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr.toLowerCase());
    const privateKey = ethers.keccak256(entropy);
    // Wallet without connected provider — tx params are built and broadcast manually
    // via broadcastWithFailover() to distribute load across all RPCs.
    return new ethers.Wallet(privateKey);
  }
}

module.exports = new RPCManager();
