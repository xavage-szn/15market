import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { projectId, PARA_API_KEY } from "../constants";
import { para, queryClient, paraOptions, Environment } from "../paraClient";

/**
 * AppParaProvider - Unified GetPara Provider
 * Strictly follows the user's requested branding and configuration structure.
 */
export function AppParaProvider({ children }) {
    return (
        <ParaProvider
            paraClient={para}
            queryClient={queryClient}
            paraClientConfig={{
                env: Environment.BETA,
                apiKey: PARA_API_KEY,
                appName: "15market",
                sessionConfig: {
                    disableAutoSessionKeepAlive: false
                }
            }}
            externalWalletConfig={{
                appName: "15market",
                wallets: ["METAMASK", "PHANTOM", "WALLETCONNECT", "RAINBOW", "COINBASE", "ZERION", "RABBY", "OKX", "HAHA"],
                walletConnect: { projectId: projectId },
            }}
            paraModalConfig={{
                logo: "https://15market.online/logo.png",
                theme: { "borderRadius": "full", "font": "Inter" },
                oAuthMethods: [],
                disableEmailLogin: true,
                disablePhoneLogin: true,
                authLayout: ["EXTERNAL:FULL"],
                recoverySecretStepEnabled: true,
                onRampTestMode: true,
            }}
        >
            {children}
        </ParaProvider>
    );
}
