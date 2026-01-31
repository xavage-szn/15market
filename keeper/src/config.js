const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

console.log("🔍 [ENV_CHECK] Scanning environment variables...");
console.log("📍 NETWORK:", process.env.NETWORK || "❌ MISSING");
console.log("📍 PROGRAM_ID:", process.env.PROGRAM_ID || "❌ MISSING");
console.log("📍 SOLANA_KEYPAIR_JSON:", process.env.SOLANA_KEYPAIR_JSON ? "✅ FOUND (HIDDEN)" : "❌ MISSING");
console.log("📍 ARC_RPC:", process.env.ARC_RPC || "❌ MISSING");
console.log("📍 PRIVATE_KEY:", process.env.PRIVATE_KEY ? "✅ FOUND (HIDDEN)" : "❌ MISSING");

// Load environment variables
// Load environment variables with robust fallbacks
const NETWORK = process.env.NETWORK || "https://api.devnet.solana.com";
const READ_RPC = process.env.READ_RPC || NETWORK;

if (!process.env.PROGRAM_ID) {
    console.error("❌ ERROR: PROGRAM_ID environment variable is missing!");
    process.exit(1);
}

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID.trim());
const START_TIME = Math.floor(Date.now() / 1000) - 86400; // Settle bets from last 24h to ensure no loss on restart

// Load Keypair
let keypair;
if (process.env.SOLANA_KEYPAIR_JSON) {
    try {
        // Sanitization: Remove extra quotes, spaces, or backslashes added by env loaders
        let raw = process.env.SOLANA_KEYPAIR_JSON.trim();
        if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
        if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
        raw = raw.replace(/\\/g, ''); // Remove backslashes if escaped

        // Auto-Bracket: If it's just a comma-separated list of numbers, wrap in []
        if (raw.charAt(0) !== '[') raw = '[' + raw;
        if (raw.charAt(raw.length - 1) !== ']') raw = raw + ']';

        const secretKey = JSON.parse(raw);
        console.log(`💡 DEBUG: Array length: ${secretKey.length} (Expected: 64)`);

        keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
        console.log("✅ Loaded Solana keypair (Sanitized & Wrapped)");
    } catch (e) {
        console.error("❌ Failed to parse SOLANA_KEYPAIR_JSON:", e.message);
        console.log("💡 DEBUG: Raw value start:", process.env.SOLANA_KEYPAIR_JSON.substring(0, 15));
        console.log("💡 DEBUG: Raw value end:", process.env.SOLANA_KEYPAIR_JSON.substring(process.env.SOLANA_KEYPAIR_JSON.length - 15));
    }
}

if (!keypair) {
    try {
        const keypairPath = path.resolve(__dirname, "../keeper-keypair.json");
        const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
        keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
        console.log("✅ Loaded Solana keypair from file");
    } catch (e) {
        console.error("❌ Could not load keypair from file, and env var missing/invalid.");
    }
}
const wallet = new anchor.Wallet(keypair);

// Connections
const connection = new Connection(NETWORK, "confirmed");
const readConnection = new Connection(READ_RPC, "confirmed");

// Program
const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../idl/sol_prediction.json"), "utf8"));
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider);

module.exports = {
    NETWORK,
    READ_RPC,
    PROGRAM_ID,
    START_TIME,
    keypair,
    wallet,
    connection,
    readConnection,
    program,
    PublicKey,
    // Add public fallbacks
    SOLANA_FALLBACKS: [
        process.env.NETWORK,
        "https://api.devnet.solana.com",
        "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B",
        "https://solana-devnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
    ].filter(Boolean),
    // Arc / EVM Config
    ARC_RPC: process.env.ARC_RPC || "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1",
    ARC_RPC_LIST: [
        process.env.ARC_RPC || "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1",
        "https://rpc.testnet.arc.network"
    ],
    ARC_PK: process.env.PRIVATE_KEY,
    ARC_CONTRACT: process.env.VITE_ARC_CONTRACT_ADDRESS || "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8"
};
