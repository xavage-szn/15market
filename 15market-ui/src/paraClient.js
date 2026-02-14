import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { PARA_API_KEY, projectId } from "./constants";

export { Environment };

/**
 * paraClient.js
 * 
 * We initialize the Para instance with explicit sessionConfig to prevent 
 * the 'disableAutoSessionKeepAlive' crash during SDK initialization.
 */
export const para = new Para(Environment.BETA, PARA_API_KEY, {
    appName: "15market",
    sessionConfig: {
        disableAutoSessionKeepAlive: false
    }
});

// Deep set properties to ensure they are available to both web-sdk and react-sdk internals
if (para) {
    if (!para.config) para.config = {};
    para.config.sessionConfig = { disableAutoSessionKeepAlive: false };
    para.sessionConfig = { disableAutoSessionKeepAlive: false };
}

export const queryClient = new QueryClient();
