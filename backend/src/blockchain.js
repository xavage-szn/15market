const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPCS = [
  "https://arc-testnet.g.alchemy.com/v2/7eF4g7VDugrZQdNDi_HMj",
  "https://rpc.testnet.arc.network"
];

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;
const PYTH_CONTRACT_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43"; // Pyth on Arc Testnet

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

    this.pythAbi = [
      "function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime) price)"
    ];

    // Standard wallet for metrics/admin lookups
    this.mainProvider = this.providers[0];
    this.arcWallet = new ethers.Wallet(PRIVATE_KEY, this.mainProvider);

    // Create a contract instance for EACH provider to enable racing
    this.contracts = this.providers.map(p => {
        const wallet = new ethers.Wallet(PRIVATE_KEY, p);
        return new ethers.Contract(CONTRACT_ADDRESS, this.abi, wallet);
    });

    this.pythContracts = this.providers.map(p => {
        return new ethers.Contract(PYTH_CONTRACT_ADDRESS, this.pythAbi, p);
    });

    // Speed Optimization: Track nonces locally
    this.localNonce = null;
    this.nonceLock = false;
  }

  async callWithTimeout(promise, timeoutMs = 8000) {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('RPC_TIMEOUT')), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }

  async getBalance(address, retryCount = 0) {
    // Attempt balancing across ALL providers simultaneously
    const balancePromises = this.providers.map(async (provider, idx) => {
        try {
            const bal = await this.callWithTimeout(provider.getBalance(address, 'pending'), 15000); // include mempool for instant feedback
            return ethers.formatEther(bal);
        } catch (e) {
            console.warn(`[Blockchain] Provider ${idx} (${ARC_RPCS[idx]}) failed: [${e.code || 'TIMEOUT'}] ${e.message}`);
            throw e;
        }
    });

    try {
      // Use the FIRST successful response from any provider
      const result = await Promise.any(balancePromises);
      return result;
    } catch (error) {
      if (retryCount < 2) {
          console.warn(`[Blockchain] ⚠️ Cycle ${retryCount + 1} failed. Re-initiating race across all sources for ${address}...`);
          await new Promise(r => setTimeout(r, 2000));
          return this.getBalance(address, retryCount + 1);
      }
      console.error("[Blockchain] ❌ FATAL REJECTION: All 5 RPC streams are unreachable from your current network.");
      return "0";
    }
  }

  async getNextNonce() {
    // Wait for lock
    while (this.nonceLock) await new Promise(r => setTimeout(r, 50));
    this.nonceLock = true;

    try {
      // Fetch nonces in parallel across all providers
      const fetchNonce = (provider) => 
        this.callWithTimeout(provider.getTransactionCount(this.arcWallet.address, 'pending'), 5000)
        .catch(() => 0);

      const nonces = await Promise.all(this.providers.map(fetchNonce));
      const chainNonce = Math.max(...nonces);

      if (this.localNonce === null || chainNonce > this.localNonce) {
        this.localNonce = chainNonce;
      } else {
        this.localNonce++;
      }
      return this.localNonce;
    } finally {
      this.nonceLock = false;
    }
  }

  async settleBet(betId, exitPrice) {
    console.log(`[Blockchain] Settling bet ${betId} instantly racing ${this.contracts.length} sources...`);
    const nonce = await this.getNextNonce();
    const txOptions = { nonce, gasLimit: 600000 }; 

    const broadcastPromise = (contract, idx) => async () => {
      const tx = await this.callWithTimeout(contract.settleBet(betId, exitPrice, txOptions), 8000);
      console.log(`[Blockchain] Broadcasted settlement for ${betId} via Provider ${idx} (TX: ${tx.hash})`);
      tx.wait().catch(e => {}); 
      return tx;
    };

    try {
      const tx = await Promise.any(this.contracts.map((c, i) => broadcastPromise(c, i)()));
      return { hash: tx.hash };
    } catch (error) {
      console.error(`[Blockchain] All ${this.contracts.length} settlement broadcasts failed for ${betId}:`, error.message);
      this.localNonce = null; 
      throw error;
    }
  }

  async placeBet(betId, direction, duration, entryPrice, marketId, amount) {
    console.log(`[Blockchain] Placing bet ${betId} racing ${this.contracts.length} sources...`);
    const val = ethers.parseEther(amount.toString());
    const nonce = await this.getNextNonce();
    const txOptions = { value: val, nonce, gasLimit: 800000 };

    const broadcastPromise = (contract, idx) => async () => {
      const tx = await this.callWithTimeout(contract.placeBet(betId, direction, duration, entryPrice, marketId, this.arcWallet.address, txOptions), 8000);
      console.log(`[Blockchain] Broadcasted bet ${betId} via Provider ${idx} (TX: ${tx.hash})`);
      tx.wait().catch(e => {});
      return tx;
    };

    try {
      const tx = await Promise.any(this.contracts.map((c, i) => broadcastPromise(c, i)()));
      return { hash: tx.hash };
    } catch (error) {
      console.error(`[Blockchain] All ${this.contracts.length} trade broadcasts failed for ${betId}:`, error.message);
      this.localNonce = null;
      throw error;
    }
  }

  async getBetDetails(betId) {
    try {
      return await Promise.any(this.contracts.map(async (c) => {
          const bet = await this.callWithTimeout(c.bets(betId), 5000);
          return {
            id: bet.id.toString(),
            user: bet.user,
            amount: ethers.formatEther(bet.amount),
            direction: bet.direction === 1 ? 'UP' : 'DOWN',
            entryPrice: bet.entryPrice.toString(),
            duration: bet.duration.toString(),
            settled: bet.settled,
            won: bet.won,
            settlementPrice: bet.settlementPrice.toString()
          };
      }));
    } catch (error) {
      console.error(`Error fetching bet ${betId}:`, error);
      return null;
    }
  }

  parseSettlementEvent(receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = this.arcContract.interface.parseLog(log);
        if (parsed && parsed.name === 'BetSettled') {
          return {
            id: parsed.args.id.toString(),
            user: parsed.args.user,
            settlementPrice: parsed.args.settlementPrice.toString(),
            won: parsed.args.won,
            payout: ethers.formatEther(parsed.args.payout)
          };
        }
      } catch (e) {
        // Log doesn't belong to this contract or wrong interface
      }
    }
    return null;
  }

  async placeBetForUser(privateKey, betId, direction, duration, entryPrice, marketId, amount) {
    console.log(`[Blockchain] Placing native bet ${betId} racing ALL sources...`);
    const val = ethers.parseEther(amount.toString());
    
    const broadcastRace = this.providers.map(async (provider, idx) => {
        try {
            const burnerWallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, this.abi, burnerWallet);
            const txOptions = { value: val, gasLimit: 800000 };
            
            const tx = await this.callWithTimeout(contract.placeBet(betId, direction, duration, entryPrice, marketId, burnerWallet.address, txOptions), 10000);
            console.log(`[Blockchain] Native Broadcast Bet ${betId} via Provider ${idx} (TX: ${tx.hash})`);
            tx.wait().catch(() => {});
            return tx;
        } catch (e) {
            throw e;
        }
    });

    try {
      const tx = await Promise.any(broadcastRace);
      return { hash: tx.hash };
    } catch (error) {
      console.error(`[Blockchain] Native broadcast failed across ALL providers for ${betId}:`, error.message);
      throw error;
    }
  }

  async withdrawBurner(privateKey, to, amount) {
    console.log(`[Blockchain] Sweeping ${amount} from True Embedded Wallet...`);
    const val = ethers.parseEther(amount.toString());

    const sweepRace = this.providers.map(async (provider, idx) => {
        try {
            const burnerWallet = new ethers.Wallet(privateKey, provider);
            const tx = await this.callWithTimeout(burnerWallet.sendTransaction({ to, value: val }), 12000);
            console.log(`[Blockchain] Sweep broadcasted via Provider ${idx} (TX: ${tx.hash})`);
            return tx;
        } catch (e) {
            throw e;
        }
    });

    try {
      const tx = await Promise.any(sweepRace);
      return tx;
    } catch (error) {
      console.error(`[Blockchain] Native sweep failed across ALL providers:`, error.message);
      throw error;
    }
  async getPythPriceOnChain(feedId, maxAge = 3600) {
    // Race across all providers for the fastest on-chain price
    const race = this.pythContracts.map(async (contract, idx) => {
        try {
            // feedId must be bytes32 (64 hex chars, with 0x)
            const result = await this.callWithTimeout(contract.getPriceNoOlderThan(feedId, maxAge), 5000);
            const price = Number(result.price) * Math.pow(10, Number(result.expo));
            return price;
        } catch (e) {
            throw e;
        }
    });

    try {
      return await Promise.any(race);
    } catch (e) {
      // If it fails (stale or network), return null
      return null;
    }
  }
}

module.exports = new BlockchainService();
