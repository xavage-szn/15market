const { Connection, PublicKey } = require("@solana/web3.js");
const { AnchorProvider, Program } = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");

async function checkBetsAndTreasury() {
    const programId = new PublicKey("7e1dPQRBJwWpxcRDkp8PUQDGrb5m4RYHCYxSPcnuVmVe");
    const connection = new Connection("https://solana-devnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1", "confirmed");

    // Load IDL
    const idlPath = path.join(__dirname, "keeper/idl/sol_prediction.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

    // Create a dummy provider
    const provider = new AnchorProvider(connection, {
        publicKey: new PublicKey("11111111111111111111111111111111"),
        signTransaction: () => Promise.reject(),
        signAllTransactions: () => Promise.reject()
    }, { commitment: "confirmed" });

    const program = new Program(idl, provider);

    console.log("=== PROGRAM VERIFICATION ===");
    console.log("Program ID:", programId.toBase58());
    console.log();

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        programId
    );
    console.log("=== TREASURY ===");
    console.log("Treasury PDA:", treasuryPda.toBase58());

    const treasuryBalance = await connection.getBalance(treasuryPda);
    console.log("Treasury Balance:", treasuryBalance / 1e9, "SOL");
    console.log();

    // Check for bets
    console.log("=== SCANNING FOR BETS ===");
    try {
        const betDiscriminator = Buffer.from([147, 23, 35, 59, 15, 75, 155, 32]);
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: require("bs58").encode(betDiscriminator)
                    }
                }
            ]
        });

        console.log(`Found ${accounts.length} bet accounts`);

        if (accounts.length > 0) {
            console.log("\n=== BET DETAILS ===");
            for (let i = 0; i < Math.min(5, accounts.length); i++) {
                const acc = accounts[i];
                try {
                    const decoded = program.coder.accounts.decode("Bet", acc.account.data);
                    console.log(`\nBet ${i + 1}:`);
                    console.log("  Address:", acc.pubkey.toBase58());
                    console.log("  Owner:", decoded.owner.toBase58());
                    console.log("  Amount:", decoded.amountLamports.toNumber() / 1e9, "SOL");
                    console.log("  Direction:", decoded.direction);
                    console.log("  Duration:", decoded.duration);
                    console.log("  Resolved:", decoded.resolved);
                    console.log("  Timestamp:", new Date(decoded.timestamp.toNumber() * 1000).toISOString());
                } catch (e) {
                    console.log(`  Error decoding bet ${i + 1}:`, e.message);
                }
            }
        }
    } catch (error) {
        console.error("Error scanning bets:", error.message);
    }
}

checkBetsAndTreasury().catch(console.error);
