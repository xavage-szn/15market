import { createPublicClient, http, fallback } from "viem";
import { arcTestnet, ARC_RPCS } from "./constants";

// Public client for contract and balance reads with multi-RPC fallback
export const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: fallback(ARC_RPCS.map(url => http(url)))
});
