const { Connection, PublicKey } = require("@solana/web3.js");

const NETWORK = "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

async function check() {
    const connection = new Connection(NETWORK, "confirmed");
    const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        PROGRAM_ID
    );

    console.log("Treasury PDA:", treasuryPda.toBase58());
    const balance = await connection.getBalance(treasuryPda);
    console.log("Treasury Balance:", balance / 1e9, "SOL");

    const info = await connection.getAccountInfo(treasuryPda);
    if (info) {
        console.log("Treasury Account Data Length:", info.data.length);
        console.log("Treasury Owner:", info.owner.toBase58());
    } else {
        console.log("Treasury PDA does NOT exist on-chain!");
    }
}

check().catch(console.error);
