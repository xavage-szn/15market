const { Connection, PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

const RPC = "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

async function check() {
    const conn = new Connection(RPC, "confirmed");

    // Treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);
    const treasuryBal = await conn.getBalance(treasuryPda);
    console.log(`Treasury (${treasuryPda.toBase58()}): ${treasuryBal / 1e9} SOL`);

    // We don't know the exact session wallet, but we can check the keeper balance too
    const path = require("path");
    const keeperKeypair = JSON.parse(require("fs").readFileSync(path.resolve(__dirname, "../keeper-keypair.json"), "utf8"));
    const keeperPub = new PublicKey(bs58.encode(Buffer.from(keeperKeypair.slice(0, 32)))); // Wait, this is wrong for json array
    // Keypair from secret key array
    const { Keypair } = require("@solana/web3.js");
    const kp = Keypair.fromSecretKey(new Uint8Array(keeperKeypair));
    const keeperBal = await conn.getBalance(kp.publicKey);
    console.log(`Keeper (${kp.publicKey.toBase58()}): ${keeperBal / 1e9} SOL`);
}

check();
