import Para, { Environment } from "@getpara/web-sdk";
import { QueryClient } from "@tanstack/react-query";
import { PARA_API_KEY, projectId } from "./constants";

export { Environment };

// Shared Para configuration - Unified for Modal and SDK
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

// Defensive Initialization
export const para = new Para(Environment.BETA, PARA_API_KEY, paraOptions);

// Force sessionConfig presence to prevent SDK crashes
if (para && para.config && !para.config.sessionConfig) {
    para.config.sessionConfig = { disableAutoSessionKeepAlive: false };
}

export const queryClient = new QueryClient();
