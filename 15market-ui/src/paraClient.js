import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { projectId } from "./constants";

export { Environment };

export const paraApiKey = import.meta.env.VITE_PARA_API_KEY || "beta_d86df4100fa75b359939af58f0f43abb";
export const paraEnv = Environment.BETA;

// create a shared instance for Wagmi and other non-React code
export const para = new Para(paraEnv, paraApiKey, {
    walletConnectProjectId: projectId || import.meta.env.VITE_REOWN_PROJECT_ID || "4aebd2ef806c541b6aaf003da2930c58"
});

export const queryClient = new QueryClient();

