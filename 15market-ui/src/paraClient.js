import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { PARA_API_KEY, projectId } from "./constants";

export { Environment };

// Shared Para configuration to ensure consistency across Wagmi and React SDK
export const paraOptions = {
    appName: "15market",
    logo: "https://15market.online/logo.png",
    theme: { "borderRadius": "full", "font": "Inter" },
    oAuthMethods: [],
    disableEmailLogin: true,
    disablePhoneLogin: true,
    authLayout: ["EXTERNAL:FULL"],
    recoverySecretStepEnabled: true,
    onRampTestMode: true,
    walletConnectProjectId: projectId,
    sessionConfig: {
        disableAutoSessionKeepAlive: false
    }
};

// Unified Para instance for Wagmi integration
export const para = new Para(Environment.BETA, PARA_API_KEY, paraOptions);

export const queryClient = new QueryClient();
