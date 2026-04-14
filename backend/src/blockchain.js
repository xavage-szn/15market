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
  }

  async getBalance(address) {
    try {
      // Always use Arc Official for data fetching to avoid Thirdweb limits
      const balance = await this.arcProvider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error("Error fetching balance from Arc RPC:", error);
      // Fallback to Thirdweb for balance ONLY if Arc is down
      try {
        const balance = await this.twProvider.getBalance(address);
        return ethers.formatEther(balance);
      } catch (e) {
        return "0";
      }
    }
  }

  async settleBet(betId, exitPrice) {
    console.log(`[Blockchain] Settling bet ${betId} at ${exitPrice}...`);
    
    // Get the nonce once to ensure both transactions use the same nonce
    // This allows them to race for the same slot on the blockchain
    let nonce;
    try {
      nonce = await this.arcProvider.getTransactionCount(this.arcWallet.address);
    } catch (e) {
      console.warn("Failed to get nonce from Arc, trying Thirdweb", e.message);
      nonce = await this.twProvider.getTransactionCount(this.twWallet.address);
    }

    const txOptions = { nonce };

    const arcSettle = (async () => {
      console.log("[Blockchain] Attempting settlement via Arc Official...");
      const tx = await this.arcContract.settleBet(betId, exitPrice, txOptions);
      const receipt = await tx.wait();
      return { source: 'Arc Official', receipt };
    })();

    const twSettle = (async () => {
      console.log("[Blockchain] Attempting settlement via Thirdweb...");
      const tx = await this.twContract.settleBet(betId, exitPrice, txOptions);
      const receipt = await tx.wait();
      return { source: 'Thirdweb', receipt };
    })();

    try {
      // Parallel racing: first one to succeed wins
      const result = await Promise.any([arcSettle, twSettle]);
      console.log(`[Blockchain] Settlement SUCCESS via ${result.source}`);
      return result.receipt;
    } catch (error) {
      console.error("[Blockchain] Settlement FAILED on all RPCs:", error);
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

  async placeBet(betId, direction, duration, entryPrice, marketId, amount) {
    console.log(`[Blockchain] Placing bet ${betId}...`);
    const val = ethers.parseEther(amount.toString());
    
    // Use Arc Official as primary for placing
    const tx = await this.arcContract.placeBet(
      betId, 
      direction, 
      duration, 
      entryPrice, 
      marketId, 
      this.arcWallet.address, // Payout comes back to Treasury for Redis credit
      { value: val }
    );
    return await tx.wait();
  }
}

module.exports = new BlockchainService();
