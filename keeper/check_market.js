const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

const RPC = "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

async function checkMarket() {
    const connection = new Connection(RPC, "confirmed");
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "idl/sol_prediction.json"), "utf8"));

    // Dummy wallet for read-only
    const dummyWallet = {
        publicKey: new PublicKey("11111111111111111111111111111111"),
        signTransaction: () => Promise.reject(),
        signAllTransactions: () => Promise.reject()
    };

    const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
    const program = new Program(idl, provider);

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from("market_v2")], PROGRAM_ID);
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);

    console.log("Market PDA:", marketPda.toBase58());
    console.log("Treasury PDA:", treasuryPda.toBase58());

    try {
        const marketAcc = await program.account.market.fetch(marketPda);
        console.log("\n✅ Market initialized!");
        console.log("Authority:", marketAcc.authority.toBase58());
        console.log("Bump:", marketAcc.bump);
    } catch (e) {
        console.log("\n❌ Market NOT initialized:", e.message);
    }

    try {
        const treasuryAcc = await program.account.treasury.fetch(treasuryPda);
        console.log("\n✅ Treasury initialized!");
        console.log("Bump:", treasuryAcc.bump);

        const bal = await connection.getBalance(treasuryPda);
        console.log("Balance:", bal / 1e9, "SOL");
    } catch (e) {
        console.log("\n❌ Treasury NOT initialized:", e.message);
    }
}

checkMarket().catch(console.error);
