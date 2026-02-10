import { Para, Environment } from "@getpara/react-sdk";
import { QueryClient } from "@tanstack/react-query";
import { projectId, ARC_RPC } from "./constants";

export { Environment };

export const paraApiKey = import.meta.env.VITE_PARA_API_KEY || "beta_d86df4100fa75b359939af58f0f43abb";
export const paraEnv = Environment.BETA;

// create a shared instance for Wagmi and other non-React code
export const para = new Para(paraEnv, paraApiKey, {
    walletConnectProjectId: projectId || import.meta.env.VITE_REOWN_PROJECT_ID || "4aebd2ef806c541b6aaf003da2930c58",
    defaultChainId: "eip155:5042002",
    chains: [{
        chainId: "eip155:5042002",
        chainName: "Arc Testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: [ARC_RPC]
    }]
});

export const queryClient = new QueryClient();
