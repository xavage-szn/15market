import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { Environment } from "@getpara/web-sdk";
import { projectId, PARA_API_KEY } from "../constants";

/**
 * AppParaProvider - Para SDK Integration
 * 
 * Following official Para SDK quickstart guide:
 * https://docs.getpara.com/v2/react/quickstart
 */
export function AppParaProvider({ children }) {
    return (
        <ParaProvider
            paraClientConfig={{
                env: Environment.BETA,
                apiKey: PARA_API_KEY,
            }}
            externalWalletConfig={{
                appName: "15market",
                wallets: ["METAMASK", "PHANTOM", "WALLETCONNECT", "RAINBOW", "COINBASE", "ZERION", "RABBY", "OKX", "HAHA"],
                walletConnect: { projectId: projectId },
            }}
            paraModalConfig={{
                logo: "https://15market.online/logo.png",
                theme: { borderRadius: "full", font: "Inter" },
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
