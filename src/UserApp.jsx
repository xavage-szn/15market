// Updated executeTrade function to ensure session wallet payouts
if (trade.isSessionTrade) {
  setSessionBalance(prev => prev + payoutAmount);
} else {
  setWalletBalance(prev => prev + payoutAmount);
}

// Updated handleWithdraw, resolveTrade, and backendTradeHandler similarly.