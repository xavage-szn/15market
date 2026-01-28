const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const { SystemProgram, ComputeBudgetProgram } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

// Helper functions
function getBetPda(userPubkey, nonce) {
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));
    return PublicKey.findProgramAddressSync(
        [Buffer.from("bet_v7"), userPubkey.toBuffer(), nonceBuffer],
        PROGRAM_ID
    );
}

function getTreasuryPda() {
    return PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);
}

async function testSettlement() {
    console.log("🧪 Testing Bet Settlement Flow\n");

    const connection = new Connection(RPC, "confirmed");
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "idl/sol_prediction.json"), "utf8"));

    // Load keeper keypair
    const keeperSecret = JSON.parse(fs.readFileSync(path.resolve(__dirname, "keeper-keypair.json"), "utf8"));
    const keeperKeypair = Keypair.fromSecretKey(new Uint8Array(keeperSecret));
    const keeperWallet = new Wallet(keeperKeypair);

    const provider = new AnchorProvider(connection, keeperWallet, { commitment: "confirmed" });
    const program = new Program(idl, provider);

    console.log("Keeper:", keeperKeypair.publicKey.toBase58());

    // Check keeper balance
    const keeperBal = await connection.getBalance(keeperKeypair.publicKey);
    console.log("Keeper Balance:", keeperBal / 1e9, "SOL");

    if (keeperBal < 0.01 * 1e9) {
        console.log("\n❌ Keeper balance too low!");
        return;
    }

    // Check treasury
    const [treasuryPda] = getTreasuryPda();
    const treasuryBal = await connection.getBalance(treasuryPda);
    console.log("Treasury Balance:", treasuryBal / 1e9, "SOL");

    if (treasuryBal < 0.1 * 1e9) {
        console.log("\n⚠️  Treasury balance low!");
    }

    console.log("\n✅ Keeper is ready to settle bets");
    console.log("\n📝 To test settlement:");
    console.log("1. Place a bet from the UI (use 5-second duration)");
    console.log("2. Wait for it to expire");
    console.log("3. Watch keeper logs for settlement attempt");
    console.log("4. Run: node monitor_treasury.js (to see real-time payouts)");
    console.log("\n💡 If you see a withdrawal from treasury, winnings ARE being paid!");
}

testSettlement().catch(console.error);
