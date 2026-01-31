const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

// CONFIG
const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = "9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe";

async function main() {
    console.log("🚀 Starting Solana Program Initialization...");

    // 1. Setup Connection & Wallet
    const connection = new Connection(RPC, "confirmed");
    const projectRoot = path.resolve(__dirname, "..");
    const keypairPath = path.resolve(projectRoot, "keeper/keeper-keypair.json");

    if (!fs.existsSync(keypairPath)) {
        throw new Error("Keeper keypair not found at " + keypairPath);
    }

    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
    const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
    const wallet = new anchor.Wallet(keypair);

    console.log("Authority Wallet:", keypair.publicKey.toBase58());

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    if (balance < 10000000) { // < 0.01 SOL
        console.error(`❌ Insufficient balance: ${balance / 1e9} SOL. Need at least 0.05 SOL.`);
        return;
    }

    // 2. Setup Instruction
    const instructionDiscriminator = Buffer.from([35, 35, 189, 193, 155, 48, 170, 203]);
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from("market_v2")], new PublicKey(PROGRAM_ID));
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], new PublicKey(PROGRAM_ID));

    console.log("Market PDA:  ", marketPda.toBase58());
    console.log("Treasury PDA:", treasuryPda.toBase58());

    const ix = {
        programId: new PublicKey(PROGRAM_ID),
        keys: [
            { pubkey: marketPda, isSigner: false, isWritable: true },
            { pubkey: treasuryPda, isSigner: false, isWritable: true },
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionDiscriminator
    };

    // 3. Execute Initialize
    try {
        console.log("Sending initialize_market transaction...");
        const transaction = new anchor.web3.Transaction().add(ix);
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;

        const signature = await anchor.web3.sendAndConfirmTransaction(connection, transaction, [keypair]);

        console.log("✅ Initialization Successful!");
        console.log("Transaction Signature:", signature);
    } catch (err) {
        if (err.message.includes("already in use")) {
            console.log("⚠️ Program already initialized or accounts already exist.");
        } else {
            console.error("❌ Initialization failed:", err);
        }
    }
}

main().catch(console.error);
