const { Connection, PublicKey } = require("@solana/web3.js");

// CONFIG
const RPC = "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B";
const PROGRAM_ID = "7e1dPQRBJwWpxcRDkp8PUQDGrb5m4RYHCYxSPcnuVmVe";

async function main() {
    console.log("🔍 Starting Treasury Monitor...");
    const connection = new Connection(RPC, "confirmed");
    const programId = new PublicKey(PROGRAM_ID);

    // Derive PDA
    const [treasuryPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        programId
    );

    console.log("----------------------------------------");
    console.log("PROGRAM ID:  ", PROGRAM_ID);
    console.log("TREASURY PDA:", treasuryPda.toBase58());
    console.log("----------------------------------------");

    // Fetch Initial Balance
    const balance = await connection.getBalance(treasuryPda);
    console.log(`💰 Current Balance: ${balance / 1e9} SOL`);

    // Subscribe to Account Changes
    console.log("📡 Listening for balance changes...");
    connection.onAccountChange(
        treasuryPda,
        (updatedAccountInfo, context) => {
            console.log(`\n🔔 UPDATE DETECTED! Slot: ${context.slot}`);
            console.log(`💰 New Balance: ${updatedAccountInfo.lamports / 1e9} SOL`);
        },
        "confirmed"
    );
}

main().catch(err => console.error(err));
