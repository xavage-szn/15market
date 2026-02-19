import { createPublicClient, http } from "viem";
import { arcTestnet, ARC_RPC } from "./constants";

// Public client for contract and balance reads
export const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_RPC)
});
