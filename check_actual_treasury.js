const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = "9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe";

async function main() {
    console.log("🔍 Checking Treasury Balance...");
    const connection = new Connection(RPC, "confirmed");
    const programId = new PublicKey(PROGRAM_ID);

    const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        programId
    );

    console.log("TREASURY PDA:", treasuryPda.toBase58());

    try {
        const balance = await connection.getBalance(treasuryPda);
        console.log(`💰 Current Balance: ${balance / 1e9} SOL`);
    } catch (e) {
        console.error("Failed to fetch balance:", e.message);
    }
}

main();
