import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { PARA_API_KEY } from "./constants";

export { Environment };

// Minimal Para instance for Wagmi integration
export const para = new Para(Environment.BETA, PARA_API_KEY);

export const queryClient = new QueryClient();
