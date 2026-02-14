import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { projectId, ARC_RPC, PARA_API_KEY } from "../constants";
import { para, queryClient } from "../paraClient";

export function AppParaProvider({ children }) {
    return (
        <ParaProvider
            paraClient={para}
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
            queryClient={queryClient}
        >
            {children}
        </ParaProvider>
    );
}
