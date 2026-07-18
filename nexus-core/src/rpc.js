// ============================================================
// nexus-core/src/rpc.js
// Multi-provider RPC with automatic failover and racing.
// ============================================================
const { ethers } = require('ethers');
const config = require('./config');

class RPCManager {
  constructor() {
    this.chainId = config.CHAIN_ID;
    
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
      console.warn("⚠️ [RPCManager] No valid providers initialized. Some features will fail.");
    }

    // High-availability fallback provider for READS only
    this.provider = new ethers.FallbackProvider(this.providers.map((p, i) => ({
      provider: p,
      priority: i,
      weight: 1,
      stallTimeout: 2500
    })));

    // Direct provider for WRITES (sending transactions, waiting for receipts).
    // The FallbackProvider's quorum consensus corrupts tx.wait() under rate limiting,
    // causing txs that succeeded on-chain to report status: 0 (reverted).
    // A single direct provider avoids this.
    this.writeProvider = this.providers[0] || this.provider;
    
    this.mainProvider = this.provider;
    if (config.PRIVATE_KEY) {
      // Operator wallet uses direct provider for reliable tx sending
      this.wallet = new ethers.Wallet(config.PRIVATE_KEY, this.writeProvider);
    }
  }

  async callWithTimeout(promise, timeoutMs = 8000) {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('RPC_TIMEOUT')), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }

  async getBalance(address) {
    if (this.providers.length === 0) return "0";
    for (let i = 0; i < this.providers.length; i++) {
      try {
        const bal = await this.callWithTimeout(this.providers[i].getBalance(address, 'pending'), 5000);
        return ethers.formatEther(bal);
      } catch (e) {
        // failover
      }
    }
    return "0";
  }

  deriveSessionWallet(userAddr) {
    if (!userAddr) return null;
    const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
    const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr.toLowerCase());
    const privateKey = ethers.keccak256(entropy);
    // Use direct provider for session wallets too — FallbackProvider corrupts tx.wait()
    return new ethers.Wallet(privateKey, this.writeProvider);
  }
}

module.exports = new RPCManager();
