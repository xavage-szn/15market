import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { programID } from "./program";

const encoder = new TextEncoder();

// Market PDA
export function getMarketPda(pid = programID) {
    return PublicKey.findProgramAddressSync(
        [encoder.encode("market_v2")],
        pid
    );
}

// Bet PDA for a user
export function getBetPda(userPubkey, pid = programID, nonce) {
    if (!nonce && nonce !== 0) {
        // Fallback for old calls that don't provide nonce (though we should update them)
        return PublicKey.findProgramAddressSync(
            [encoder.encode("bet_v3"), userPubkey.toBuffer()],
            pid
        );
    }

    // Convert nonce (u64) to 8-byte buffer
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));

    return PublicKey.findProgramAddressSync(
        [encoder.encode("bet_v7"), userPubkey.toBuffer(), nonceBuffer],
        pid
    );
}

// Treasury PDA
export function getTreasuryPda(pid = programID) {
    return PublicKey.findProgramAddressSync(
        [encoder.encode("treasury")],
        pid
    );
}

// User Profile PDA
export function getProfilePda(userPubkey, pid = programID) {
    return PublicKey.findProgramAddressSync(
        [encoder.encode("user-profile"), userPubkey.toBuffer()],
        pid
    );
}
