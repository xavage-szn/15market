const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe");

async function monitorTreasury() {
    console.log("📊 Monitoring Treasury Activity\n");

    const connection = new Connection(RPC, "confirmed");
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);

    console.log("Treasury PDA:", treasuryPda.toBase58());

    let lastBalance = await connection.getBalance(treasuryPda);
    console.log("Initial Balance:", lastBalance / 1e9, "SOL\n");
    console.log("Monitoring for changes... (Ctrl+C to stop)\n");

    // Subscribe to account changes
    const subscriptionId = connection.onAccountChange(
        treasuryPda,
        (accountInfo) => {
            const newBalance = accountInfo.lamports;
            const change = (newBalance - lastBalance) / 1e9;
            const timestamp = new Date().toLocaleTimeString();

            if (change > 0) {
                console.log(`[${timestamp}] 💰 DEPOSIT: +${change.toFixed(6)} SOL (Bet placed)`);
            } else if (change < 0) {
                console.log(`[${timestamp}] 💸 WITHDRAWAL: ${change.toFixed(6)} SOL (Winnings paid!)`);
            }

            console.log(`           New Balance: ${(newBalance / 1e9).toFixed(6)} SOL\n`);
            lastBalance = newBalance;
        },
        "confirmed"
    );

    // Keep the script running
    process.on('SIGINT', () => {
        console.log("\n\nStopping monitor...");
        connection.removeAccountChangeListener(subscriptionId);
        process.exit(0);
    });
}

monitorTreasury().catch(console.error);
