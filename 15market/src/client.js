import { createPublicClient, http, fallback } from "viem";
import { arcTestnet, ARC_RPCS, THIRDWEB_CLIENT_ID } from "./constants";

// Public client for contract and balance reads with multi-RPC fallback
export const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: fallback(ARC_RPCS.map(url => {
        if (url.includes('thirdweb.com')) {
            return http(url, {
                fetchOptions: {
                    headers: {
                        'x-client-id': THIRDWEB_CLIENT_ID
                    }
                }
            });
        }
        return http(url);
    }))
});
