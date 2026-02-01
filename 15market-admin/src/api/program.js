import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import idl from "../idl/sol_prediction.json";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

import { SOLANA_RPC, SOLANA_READ_RPC, SOLANA_PROGRAM_ID } from "../constants";

// Default connection (Writes/Broadcast)
export const defaultConnection = new Connection(
    SOLANA_RPC,
    "confirmed"
);

// Read-only connection (Scanning/getProgramAccounts)
export const readConnection = new Connection(
    SOLANA_READ_RPC,
    "confirmed"
);

export const programID = new PublicKey(
    SOLANA_PROGRAM_ID
);

export const getProvider = (wallet, connection = defaultConnection) => {
    // Robust fallback for read-only access if wallet is missing or invalid
    const validWallet = (wallet && wallet.publicKey) ? wallet : {
        publicKey: new PublicKey("11111111111111111111111111111111"),
        signTransaction: () => Promise.reject(new Error("Read-only mode")),
        signAllTransactions: () => Promise.reject(new Error("Read-only mode"))
    };

    return new AnchorProvider(connection, validWallet, {
        commitment: "confirmed",
    });
};

export const getProgram = (wallet, connection = defaultConnection) => {
    const provider = getProvider(wallet, connection);
    // Provider is now guaranteed to exist (read-only or actual)
    return new Program(idl, provider);
};

export { BN };
