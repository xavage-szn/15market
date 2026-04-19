const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPCS = [
  "https://5042002.rpc.thirdweb.com", // Thirdweb Premium - Hardcoded as Absolute Priority #1
  "https://arc-testnet.g.alchemy.com/v2/7eF4g7VDugrZQdNDi_HMj",
  "https://rpc.testnet.arc.network",
  "https://arc-testnet.drpc.org"
];

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

class BlockchainService {
  constructor() {
    this.chainId = 5042002;
    // Initialize multiple providers for aggressive redundancy
    this.providers = ARC_RPCS.map(url => {
        const fetchRequest = new ethers.FetchRequest(url);
        // Add Thirdweb secret key if it's a thirdweb URL
        if (url.includes('thirdweb.com') && process.env.THIRDWEB_SECRET_KEY) {
          fetchRequest.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
        }
        return new ethers.JsonRpcProvider(fetchRequest, this.chainId, { staticNetwork: true });
    });

    this.mainProvider = this.providers[0];
    this.arcWallet = new ethers.Wallet(PRIVATE_KEY, this.mainProvider);

    this.abi = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice) external",
      "function isBetSettled(uint256 _betId) view returns (bool)",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
      "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
      "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
    ];

    // Create a contract instance for EACH provider to enable racing
    this.contracts = (this.providers || []).filter(p => p).map(p => {
        const wallet = new ethers.Wallet(PRIVATE_KEY, p);
        return new ethers.Contract(CONTRACT_ADDRESS, this.abi, wallet);
    });

    if (this.contracts.length === 0) {
        console.error("❌ [Blockchain] FATAL: No valid providers initialized.");
    }

    // Speed Optimization: Track nonces locally
    this.localNonces = {};
  }

  async callWithTimeout(promise, timeoutMs = 8000) {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('RPC_TIMEOUT')), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }

  async getBalance(address, retryCount = 0) {
    for (let i = 0; i < this.providers.length; i++) {
        try {
            const bal = await this.callWithTimeout(this.providers[i].getBalance(address, 'pending'), 5000);
            return ethers.formatEther(bal);
        } catch (e) {}
    }
    return "0";
  }

  async getNextNonce(address) {
    const targetAddress = address.toLowerCase();
    const lockKey = `nonce_lock_${targetAddress}`;
    while (this[lockKey]) await new Promise(r => setTimeout(r, 50));
    this[lockKey] = true;

    try {
      const fetchNonce = (provider) => 
        this.callWithTimeout(provider.getTransactionCount(targetAddress, 'pending'), 4000)
        .catch(() => 0);

      const nonces = await Promise.all(this.providers.map(fetchNonce));
      const chainNonce = Math.max(...nonces);

      if (this.localNonces[targetAddress] === undefined || chainNonce > this.localNonces[targetAddress]) {
        this.localNonces[targetAddress] = chainNonce;
      } else {
        this.localNonces[targetAddress]++;
      }
      return this.localNonces[targetAddress];
    } finally {
      this[lockKey] = false;
    }
  }

  async settleBet(betId, exitPrice) {
    console.log(`[Blockchain] Settling bet ${betId} via Priority Broadcast...`);
    const nonce = await this.getNextNonce(this.arcWallet.address);
    const txOptions = { nonce, gasLimit: 600000 }; 

    // Racing to BROADCAST, not waiting for confirmations here
    const broadcastRace = this.contracts.map(async (contract, idx) => {
      try {
        const tx = await this.callWithTimeout(contract.settleBet(betId, exitPrice, txOptions), 8000);
        console.log(`[Blockchain] Settle Broadcast SUCCESS via Provider ${idx} (TX: ${tx.hash})`);
        tx.wait().catch(() => {}); // Wait in background
        return tx;
      } catch (e) {
        throw e;
      }
    });

    try {
      const tx = await Promise.any(broadcastRace);
      return { hash: tx.hash };
    } catch (e) {
      this.localNonces[this.arcWallet.address.toLowerCase()] = null; 
      throw e;
    }
  }

  async placeBetForUser(privateKey, betId, direction, duration, entryPrice, marketId, amount) {
    const val = ethers.parseEther(amount.toString());
    const burnerWallet = new ethers.Wallet(privateKey);
    const nonce = await this.getNextNonce(burnerWallet.address);

    const broadcastRace = this.providers.map(async (provider, idx) => {
        try {
            const wallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, this.abi, wallet);
            
            const feeData = await provider.getFeeData();
            const priorityFee = (feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei")) * 150n / 100n; // +50% priority
            const maxFee = (feeData.maxFeePerGas || ethers.parseUnits("2", "gwei")) * 150n / 100n;

            const txOptions = { 
                value: val, 
                nonce, 
                gasLimit: 800000,
                maxPriorityFeePerGas: priorityFee,
                maxFeePerGas: maxFee
            };
            
            const tx = await this.callWithTimeout(contract.placeBet(betId, direction, duration, entryPrice, marketId, burnerWallet.address, txOptions), 10000);
            console.log(`[Blockchain] Native Broadcast Bet ${betId} via Provider ${idx} (TX: ${tx.hash})`);
            tx.wait().catch(() => {}); // Background wait
            return tx;
        } catch (e) {
            throw e;
        }
    });

    try {
      const tx = await Promise.any(broadcastRace);
      return { hash: tx.hash };
    } catch (error) {
      this.localNonces[burnerWallet.address.toLowerCase()] = null;
      throw error;
    }
  }

  async withdrawBurner(privateKey, to, amount) {
    const val = ethers.parseEther(amount.toString());
    const burnerWallet = new ethers.Wallet(privateKey);
    const nonce = await this.getNextNonce(burnerWallet.address);

    const sweepRace = this.providers.map(async (provider, idx) => {
        try {
            const wallet = new ethers.Wallet(privateKey, provider);
            const feeData = await provider.getFeeData();
            const txOptions = { 
                to, 
                value: val,
                nonce,
                maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas || 1000000000n) * 200n / 100n,
                maxFeePerGas: (feeData.maxFeePerGas || 2000000000n) * 200n / 100n,
                gasLimit: 30000 
            };
            const tx = await this.callWithTimeout(wallet.sendTransaction(txOptions), 10000);
            return tx;
        } catch (e) { throw e; }
    });

    try {
      const tx = await Promise.any(sweepRace);
      return { hash: tx.hash };
    } catch (e) {
      this.localNonces[burnerWallet.address.toLowerCase()] = null;
      throw e;
    }
  }
}

module.exports = new BlockchainService();
