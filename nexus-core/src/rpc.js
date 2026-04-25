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
      const fetchRequest = new ethers.FetchRequest(url);
      if (url.includes('thirdweb.com') && config.THIRDWEB_SECRET_KEY) {
        fetchRequest.setHeader("x-secret-key", config.THIRDWEB_SECRET_KEY);
      }
      return new ethers.JsonRpcProvider(fetchRequest, this.chainId, { staticNetwork: true });
    });

    if (this.providers.length === 0) {
      console.warn("⚠️ [RPCManager] No valid providers initialized. Some features will fail.");
    }

    this.mainProvider = this.providers[0];
    if (config.PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(config.PRIVATE_KEY, this.mainProvider);
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
}

module.exports = new RPCManager();
