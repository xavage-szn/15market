import { createPublicClient, http, fallback } from "viem";
import { arcTestnet, ARC_RPCS } from "./constants";

// Public client for contract and balance reads with direct primary RPC
export const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_RPCS[0])
});
