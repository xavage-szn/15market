import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";

export const para = new Para(
    Environment.BETA,
    import.meta.env.VITE_PARA_API_KEY || ""
);

export const queryClient = new QueryClient();
