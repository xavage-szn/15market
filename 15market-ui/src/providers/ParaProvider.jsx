import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { arcTestnet, projectId, ARC_RPC } from "../constants";
import { para, queryClient, paraApiKey, paraEnv } from "../paraClient";
import { sepolia } from "viem/chains";

export function AppParaProvider({ children }) {
    const activeProjectId = projectId || import.meta.env.VITE_REOWN_PROJECT_ID || "4aebd2ef806c541b6aaf003da2930c58";

    return (
        <ParaProvider
            paraClientConfig={para}
            queryClient={queryClient}
            config={{
                appName: "15market",
            }}
            externalWalletConfig={{
                appName: "15market",
                wallets: ["METAMASK", "PHANTOM", "WALLETCONNECT", "ZERION", "COINBASE", "RAINBOW", "BACKPACK", "HAHA", "OKX", "RABBY", "SAFE"],
                walletConnect: { projectId: activeProjectId },
                evmConnector: {
                    config: {
                        chains: [arcTestnet, sepolia],
                        defaultChainId: arcTestnet.id,
                    },
                },
            }}
            paraModalConfig={{
                oAuthMethods: [],
                disableEmailLogin: true,
                disablePhoneLogin: true,
                authLayout: ["EXTERNAL:FULL"],
                recoverySecretStepEnabled: true,
                onRampTestMode: true,
                defaultChainId: "eip155:5042002",
                preferredChainId: "eip155:5042002",
                chains: [
                    {
                        chainId: "eip155:5042002",
                        chainName: "Arc Testnet",
                        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
                        rpcUrls: [ARC_RPC]
                    },
                    {
                        chainId: "eip155:11155111",
                        chainName: "Sepolia",
                        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                        rpcUrls: ["https://rpc2.sepolia.org"]
                    }
                ],
            }}
        >
            {children}
        </ParaProvider>
    );
}
