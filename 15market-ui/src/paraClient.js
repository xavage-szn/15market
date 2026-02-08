import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";

export { Environment };

export const paraApiKey = import.meta.env.VITE_PARA_API_KEY || "";
export const paraEnv = Environment.BETA;

// create a shared instance for Wagmi and other non-React code
export const para = new Para(paraEnv, paraApiKey);

export const queryClient = new QueryClient();
