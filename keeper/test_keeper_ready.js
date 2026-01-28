const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

const RPC = "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

async function testBetFlow() {
    console.log("🧪 Testing Complete Bet Flow\n");

    const connection = new Connection(RPC, "confirmed");
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "idl/sol_prediction.json"), "utf8"));

    // Load keeper keypair
    const keeperSecret = JSON.parse(fs.readFileSync(path.resolve(__dirname, "keeper-keypair.json"), "utf8"));
    const keeperKeypair = Keypair.fromSecretKey(new Uint8Array(keeperSecret));
    const keeperWallet = new Wallet(keeperKeypair);

    const provider = new AnchorProvider(connection, keeperWallet, { commitment: "confirmed" });
    const program = new Program(idl, provider);

    console.log("Keeper Address:", keeperKeypair.publicKey.toBase58());
    const keeperBal = await connection.getBalance(keeperKeypair.publicKey);
    console.log("Keeper Balance:", keeperBal / 1e9, "SOL");

    if (keeperBal < 0.01 * 1e9) {
        console.log("\n❌ Keeper balance too low! Need at least 0.01 SOL for transaction fees.");
        console.log("Please fund keeper at:", keeperKeypair.publicKey.toBase58());
        return;
    }

    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);
    const treasuryBal = await connection.getBalance(treasuryPda);
    console.log("\nTreasury Balance:", treasuryBal / 1e9, "SOL");

    if (treasuryBal < 0.1 * 1e9) {
        console.log("⚠️  Treasury balance low - may not be able to pay out large winnings");
    }

    console.log("\n📊 Keeper is ready to settle bets!");
    console.log("\nTo test:");
    console.log("1. Place a bet from the UI");
    console.log("2. Wait for it to expire (5/10/15 seconds)");
    console.log("3. Keeper should automatically detect and settle it");
    console.log("\nMonitor keeper logs with: npm start");
}

testBetFlow().catch(console.error);
