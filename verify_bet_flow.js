const { PublicKey } = require("@solana/web3.js");

const programId = new PublicKey("7e1dPQRBJwWpxcRDkp8PUQDGrb5m4RYHCYxSPcnuVmVe");

console.log("=== SOLANA BET FLOW VERIFICATION ===\n");

// Treasury PDA
const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    programId
);
console.log("✅ Treasury PDA:", treasuryPda.toBase58());
console.log("   Bump:", treasuryBump);

// Market PDA
const [marketPda, marketBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_v2")],
    programId
);
console.log("\n✅ Market PDA:", marketPda.toBase58());
console.log("   Bump:", marketBump);

console.log("\n=== EXPECTED BET FLOW ===");
console.log("1. Place Bet:");
console.log("   User → Bet Account (stake held in escrow)");
console.log("   Accounts required: market, bet, treasury, user, systemProgram");
console.log("\n2. Settlement (User Wins):");
console.log("   Treasury → User (profit only)");
console.log("   Bet Account closes → User (original stake returned)");
console.log("\n3. Settlement (User Loses):");
console.log("   Bet Account → Treasury (entire stake)");
console.log("   Bet Account closes");

console.log("\n=== ISSUE FOUND & FIXED ===");
console.log("❌ BUG: UI was NOT passing treasury account to place_bet");
console.log("✅ FIX: Added treasury: treasuryPda to accounts in UserApp.jsx");
console.log("\nThe treasury account is required in the PlaceBet struct even though");
console.log("funds don't go directly to treasury during bet placement.");
console.log("The bet account acts as escrow, and treasury is used during settlement.");
