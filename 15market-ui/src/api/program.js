import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import idl from "../idl/sol_prediction.json";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

import { SOLANA_RPC } from "../constants";

// Default connection
export const defaultConnection = new Connection(
    SOLANA_RPC,
    {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 30000,
        disableRetryOnRateLimit: false
    }
);

export const programID = new PublicKey(
    "9bK6W6uAS2xC9Xdw6fcMgHH1BwLp4gJDKj5dwciF8CPe"
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
