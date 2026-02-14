import { QueryClient } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { arcTestnet, ARC_RPC } from "./constants";

/**
 * paraClient.js
 * 
 * Utility clients for blockchain interactions.
 * Para SDK is now initialized via ParaProvider in main.jsx
 */

// React Query client for Para SDK
export const queryClient = new QueryClient();

// Public client for contract and balance reads
export const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_RPC)
});
