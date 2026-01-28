const { Connection, PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");

const NETWORK = "https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

async function check() {
    const connection = new Connection(NETWORK, "confirmed");
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "idl/sol_prediction.json"), "utf8"));
    const provider = new anchor.AnchorProvider(connection, { publicKey: PublicKey.default }, { commitment: "confirmed" });
    const program = new anchor.Program(idl, provider);

    console.log("Fetching all bets...");
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
            {
                memcmp: {
                    offset: 0,
                    bytes: anchor.utils.bytes.bs58.encode(Buffer.from([147, 23, 35, 59, 15, 75, 155, 32]))
                }
            }
        ]
    });

    console.log(`Found ${accounts.length} bet accounts.`);
    const now = Math.floor(Date.now() / 1000);

    for (const { pubkey, account } of accounts) {
        try {
            const decoded = program.coder.accounts.decode("bet", account.data);
            const expiry = decoded.timestamp.toNumber() + decoded.duration;
            console.log(`Bet ${pubkey.toBase58()}:`);
            console.log(`  Owner: ${decoded.owner.toBase58()}`);
            console.log(`  Amount: ${decoded.amountLamports.toNumber() / 1e9} SOL`);
            console.log(`  Resolved: ${decoded.resolved}`);
            console.log(`  Expiry: ${new Date(expiry * 1000).toLocaleString()}`);
            if (!decoded.resolved && expiry <= now) {
                console.log(`  >>> READY TO SETTLE <<<`);
            }
        } catch (e) {
            console.error(`  Error decoding ${pubkey.toBase58()}: ${e.message}`);
        }
    }
}

check().catch(console.error);
