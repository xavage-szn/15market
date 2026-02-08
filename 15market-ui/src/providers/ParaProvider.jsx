import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { arcTestnet } from "../constants";
import { paraApiKey, paraEnv } from "../paraClient";

export function AppParaProvider({ children }) {
    return (
        <ParaProvider
            paraClientConfig={{
                env: paraEnv,
                apiKey: paraApiKey,
            }}
            config={{
                appName: "15market",
                chains: ["evm"],
            }}
            externalWalletConfig={{
                appName: "15market",
                wallets: ["METAMASK", "WALLETCONNECT", "ZERION", "COINBASE_WALLET", "RAINBOW", "RABBY", "HAHA", "OKX"],
                walletConnect: { projectId: import.meta.env.VITE_REOWN_PROJECT_ID || "" },
                evmConnector: {
                    config: {
                        chains: [arcTestnet],
                    },
                },
            }}
            paraModalConfig={{
                theme: {
                    mode: 'dark',
                    foregroundColor: "#ffffff",
                    backgroundColor: "#050505",
                    accentColor: "#3CB371",
                    brandColor: "#3CB371",
                    modalHeaderLogo: "https://api.15market.online/logo.png",
                    font: "Inter",
                },
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
