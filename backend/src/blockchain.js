const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
const THIRDWEB_RPC = process.env.THIRDWEB_RPC || "https://5042002.rpc.thirdweb.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.error("Missing environment variables for blockchain service");
}

class BlockchainService {
  constructor() {
    this.arcProvider = new ethers.JsonRpcProvider(ARC_RPC);
    
    // Thirdweb Provider with Secret Key authentication
    const twRequest = new ethers.FetchRequest(THIRDWEB_RPC);
    if (process.env.THIRDWEB_SECRET_KEY) {
      twRequest.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
    }
    this.twProvider = new ethers.JsonRpcProvider(twRequest);
    
    // Signer on Thirdweb for fast settlements
    this.twWallet = new ethers.Wallet(PRIVATE_KEY, this.twProvider);
    
    // Signer on Arc Official as fallback
    this.arcWallet = new ethers.Wallet(PRIVATE_KEY, this.arcProvider);

    this.abi = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice) external",
      "function isBetSettled(uint256 _betId) view returns (bool)",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
      "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
      "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
    ];

    this.twContract = new ethers.Contract(CONTRACT_ADDRESS, this.abi, this.twWallet);
    this.arcContract = new ethers.Contract(CONTRACT_ADDRESS, this.abi, this.arcWallet);

    // Speed Optimization: Track nonces locally to avoid round-trip delays
    this.localNonce = null;
    this.nonceLock = false;
  }

  // Helper for timed RPC calls
  async callWithTimeout(promise, timeoutMs = 4000) {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('RPC_TIMEOUT')), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }

  async getBalance(address) {
    // Race both providers for balance to stay fast
    const getBal = (provider, name) => async () => {
      const b = await this.callWithTimeout(provider.getBalance(address), 3500);
      return ethers.formatEther(b);
    };

    try {
      return await Promise.any([
        getBal(this.arcProvider, "Arc")(),
        getBal(this.twProvider, "Thirdweb")()
      ]);
    } catch (error) {
      console.error("[Blockchain] All balance sources failed/timed out:", error.message);
      return "0";
    }
  }

  async getNextNonce() {
    // Wait for lock
    while (this.nonceLock) await new Promise(r => setTimeout(r, 50));
    this.nonceLock = true;

    try {
      // Fetch nonces in parallel but don't block if one hangs
      const fetchNonce = (provider) => 
        this.callWithTimeout(provider.getTransactionCount(this.arcWallet.address, 'pending'), 3000)
        .catch(() => 0);

      const [arcNonce, twNonce] = await Promise.all([
        fetchNonce(this.arcProvider),
        fetchNonce(this.twProvider)
      ]);
      const chainNonce = Math.max(arcNonce, twNonce);

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
    console.log(`[Blockchain] Settling bet ${betId} instantly...`);
    const nonce = await this.getNextNonce();
    const txOptions = { nonce, gasLimit: 600000 }; 

    // Race for the FASTEST BROADCAST (not the mining)
    const broadcastPromise = (contract) => async () => {
      const tx = await this.callWithTimeout(contract.settleBet(betId, exitPrice, txOptions), 3500);
      console.log(`[Blockchain] Broadcasted settlement for ${betId} (TX: ${tx.hash})`);
      // Background mining wait
      tx.wait().then(r => console.log(`[Blockchain] Confirmed settlement for ${betId}`)).catch(e => console.error(`[Blockchain] Settlement mining failed for ${betId}:`, e.message));
      return tx;
    };

    // Attempt individual broadcasts
    try {
      const tx = await Promise.any([
        broadcastPromise(this.arcContract)(),
        broadcastPromise(this.twContract)()
      ]);
      return { hash: tx.hash }; // Return immediately to API
    } catch (error) {
      console.error(`[Blockchain] All settlement broadcasts failed for ${betId}:`, error.message);
      this.localNonce = null; 
      throw error;
    }
  }

  async placeBet(betId, direction, duration, entryPrice, marketId, amount) {
    console.log(`[Blockchain] Placing bet ${betId} instantly...`);
    const val = ethers.parseEther(amount.toString());
    const nonce = await this.getNextNonce();
    const txOptions = { value: val, nonce, gasLimit: 800000 };

    const broadcastPromise = (contract) => async () => {
      const tx = await this.callWithTimeout(contract.placeBet(betId, direction, duration, entryPrice, marketId, this.arcWallet.address, txOptions), 3500);
      console.log(`[Blockchain] Broadcasted bet ${betId} (TX: ${tx.hash})`);
      tx.wait().catch(e => console.error(`[Blockchain] Bet mining failed for ${betId}:`, e.message));
      return tx;
    };

    try {
      const tx = await Promise.any([
        broadcastPromise(this.arcContract)(),
        broadcastPromise(this.twContract)()
      ]);
      return { hash: tx.hash };
    } catch (error) {
      console.error(`[Blockchain] All trade broadcasts failed for ${betId}:`, error.message);
      this.localNonce = null;
      throw error;
    }
  }

  async getBetDetails(betId) {
    try {
      const bet = await this.arcContract.bets(betId);
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

  async transfer(to, amount) {
    console.log(`[Blockchain] Transferring ${amount} to ${to}...`);
    const val = ethers.parseEther(amount.toString());
    
    // Attempt transfer via Arc Official
    try {
      const tx = await this.arcWallet.sendTransaction({
        to: to,
        value: val
      });
      return await tx.wait();
    } catch (error) {
      console.error("[Blockchain] Transfer failed on Arc, trying Thirdweb fallback:", error.message);
      const tx = await this.twWallet.sendTransaction({
        to: to,
        value: val
      });
      return await tx.wait();
    }
  }
}

module.exports = new BlockchainService();
