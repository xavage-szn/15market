const { PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58");

const PROFILE_DISCRIMINATOR = Buffer.from([32, 37, 119, 205, 179, 180, 13, 194]);
const BET_DISCRIMINATOR = Buffer.from([147, 23, 35, 59, 15, 75, 155, 32]);

console.log("Profile Base58:", bs58.encode(PROFILE_DISCRIMINATOR));
console.log("Bet Base58:", bs58.encode(BET_DISCRIMINATOR));

const programId = new PublicKey("7e1dPQRBJwWpxcRDkp8PUQDGrb5m4RYHCYxSPcnuVmVe");

const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    programId
);
console.log("Treasury PDA:", treasuryPda.toBase58());

const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_v2")],
    programId
);
console.log("Market PDA:", marketPda.toBase58());
