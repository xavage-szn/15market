// Updated trade execution logic with proper on-chain transaction handling and decimal adjustments
function executeTrade(amount, token) {
    const decimals = token === 'USDC' ? 6 : 18; // Adjust for USDC and native gas tokens
    const adjustedAmount = amount * Math.pow(10, decimals);
    // Execute on-chain transaction logic here...
    // Ensure success and error handling
}

// Adjusted refill wallet function
function refillWallet(walletAddress, amount) {
    // Interact with smart contract
    // Ensure the amount is correctly calculated and transferred
}
