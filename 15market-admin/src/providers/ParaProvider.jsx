import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { arcTestnet, projectId, ARC_RPC } from "../constants";
import { para, queryClient, paraApiKey, paraEnv } from "../paraClient";

export function AppParaProvider({ children }) {
    const activeProjectId = projectId || "4aebd2ef806c541b6aaf003da2930c58";

    return (
        <ParaProvider
            paraClientConfig={{
                apiKey: paraApiKey,
                env: paraEnv,
            }}
            queryClient={queryClient}
            externalWalletConfig={{
                appName: "15market",
                wallets: ["METAMASK", "PHANTOM", "WALLETCONNECT", "ZERION", "COINBASE", "RAINBOW", "BACKPACK", "HAHA", "OKX", "RABBY", "SAFE"],
                walletConnect: { projectId: activeProjectId },
            }}
            paraModalConfig={{
                oAuthMethods: ["GOOGLE", "DISCORD", "TWITTER"],
                disableEmailLogin: false,
                disablePhoneLogin: true,
                authLayout: ["AUTH", "EXTERNAL:FULL"],
                recoverySecretStepEnabled: true,
                onRampTestMode: true,
                defaultChainId: "eip155:5042002",
                chains: [{
                    chainId: "eip155:5042002",
                    chainName: "Arc Testnet",
                    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
                    rpcUrls: [ARC_RPC]
                }],
            }}
        >
            {children}
        </ParaProvider>
    );
}


