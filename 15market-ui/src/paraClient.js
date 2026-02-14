import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { PARA_API_KEY } from "./constants";

export { Environment };

/**
 * paraClient.js
 * 
 * Centralized Para instance for the entire application.
 * Initialized with explicit session configuration to prevent SDK crashes.
 */
const paraConfig = {
    appName: "15market",
    sessionConfig: {
        disableAutoSessionKeepAlive: false
    }
};

export const para = new Para(Environment.BETA, PARA_API_KEY, paraConfig);

// Defensive property injection to ensure SDK internals find what they need
if (para && !para.config) {
    para.config = paraConfig;
}

export const queryClient = new QueryClient();
