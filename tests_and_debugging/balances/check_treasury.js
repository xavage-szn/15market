const { Connection, PublicKey } = require('@solana/web3.js');
const PROGRAM_ID = new PublicKey('9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe');
const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
const conn = new Connection('https://api.devnet.solana.com');

async function check() {
    console.log('Treasury PDA:', treasuryPda.toBase58());
    const bal = await conn.getBalance(treasuryPda);
    console.log('Balance (SOL):', bal / 1e9);
}

check().catch(console.error);
