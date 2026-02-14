import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { PARA_API_KEY } from "./constants";

export { Environment };

// Minimal Para instance for Wagmi integration
// Added empty options object to prevent 'disableAutoSessionKeepAlive' crash in SDK
export const para = new Para(Environment.BETA, PARA_API_KEY, {
    appName: "15market",
    sessionConfig: {
        disableAutoSessionKeepAlive: false
    }
});

export const queryClient = new QueryClient();
