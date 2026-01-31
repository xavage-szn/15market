const { program, wallet, PublicKey, connection } = require("./config");
const { SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");

function getBetPda(userPubkey, nonce) {
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));
    return PublicKey.findProgramAddressSync(
        [Buffer.from("bet_v7"), userPubkey.toBuffer(), nonceBuffer],
        program.programId
    );
}

function getTreasuryPda() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        program.programId
    );
}

function getProfilePda(userPubkey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("user-profile"), userPubkey.toBuffer()],
        program.programId
    );
}

async function settleBet(betId, betInfo, currentPrice) {
    console.log(`[SETTLER] Settling bet ${betId.slice(0, 8)} | Symbol: ${betInfo.symbol} | Live: ${currentPrice}`);

    try {
        const entryPrice = betInfo.entryPrice;
        const directionRaw = betInfo.direction;
        const direction = typeof directionRaw === 'number' ? directionRaw :
            (directionRaw?.toNumber ? directionRaw.toNumber() : 0);

        // UI MAPPING: 1 = UP/CALL, 0 = DOWN/PUT
        // UPDATED: Include ties as wins to match UI behavior and be more generous
        let userWon = false;
        if (direction === 1) { // UP
            userWon = currentPrice >= entryPrice;
        } else { // 0 = DOWN (or fallback)
            userWon = currentPrice <= entryPrice;
        }

        console.log(`[SETTLER] Result: ${userWon ? "WIN" : "LOSS"} | Entry: ${entryPrice} | Exit: ${currentPrice} | ID: ${betId.slice(0, 8)}`);

        const userPubkey = new PublicKey(betInfo.owner);
        const mainOwnerPubkey = new PublicKey(betInfo.mainOwner);
        const [betPda] = getBetPda(userPubkey, betInfo.nonce);
        const [treasuryPda] = getTreasuryPda();
        const [profilePda] = getProfilePda(mainOwnerPubkey);

        // Check if profile exists
        const remainingAccounts = [];
        const profileAcc = await connection.getAccountInfo(profilePda);
        if (profileAcc) {
            remainingAccounts.push({ pubkey: profilePda, isWritable: true, isSigner: false });
        }

        const computePrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 });
        const computeLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 });

        const durationIdx = Number(betInfo.duration);
        const multiplier = durationIdx === 5 ? 698 : (durationIdx === 10 ? 498 : 198);
        const payout = userWon ? (BigInt(betInfo.amountLamports) * BigInt(multiplier) / 100n) : 0n;

        const tx = await program.methods
            .settleBet(userWon)
            .accounts({
                bet: betPda,
                owner: userPubkey,
                treasury: treasuryPda,
                keeper: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions([computeLimit, computePrice])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        if (userWon) {
            console.log(`✅ [SOL_PAYOUT] Winner ${userPubkey.toBase58().slice(0, 6)}... received ${Number(payout) / 1e9} SOL`);
        } else {
            console.log(`💀 [SOL_LOSS] Bet ${betId.slice(0, 8)} swept to treasury`);
        }

        console.log(`[SETTLER] ✅ Success! TX: ${tx}`);
        return { success: true, tx, payout: Number(payout) / 1e9, userWon };
    } catch (e) {
        console.error(`[SETTLER] ❌ Error settling ${betId.slice(0, 8)}:`, e);
        // Ensure error message is a string for index.js comparison
        const errorMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
        return { success: false, error: errorMsg };
    }
}

module.exports = { settleBet };
