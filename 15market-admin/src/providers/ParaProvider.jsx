import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ParaProvider, Environment } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { arcTestnet, projectId } from "../constants";

const queryClient = new QueryClient();

export function AppParaProvider({ children }) {
    const activeProjectId = projectId || import.meta.env.VITE_REOWN_PROJECT_ID || "";

    return (
        <QueryClientProvider client={queryClient}>
            <ParaProvider
                paraClientConfig={{
                    env: Environment.BETA,
                    apiKey: import.meta.env.VITE_PARA_API_KEY || "beta_d86df4100fa75b359939af58f0f43abb",
                }}
                config={{
                    appName: "15market-admin",
                    chains: ["evm:5042002"],
                    defaultChainId: "evm:5042002",
                    walletConnectProjectId: activeProjectId
                }}
                externalWalletConfig={{
                    appName: "15market-admin",
                    wallets: ["METAMASK", "PHANTOM", "RABBY", "WALLETCONNECT"],
                    walletConnect: { projectId: activeProjectId },
                    evmConnector: {
                        config: {
                            chains: [arcTestnet],
                            defaultChainId: arcTestnet.id,
                        },
                        wagmiProviderProps: {} // Para will handle the WagmiProvider context
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
                    authLayout: ["EXTERNAL"],
                    recoverySecretStepEnabled: true,
                    onRampTestMode: true,
                }}
            >
                {children}
            </ParaProvider>
        </QueryClientProvider>
    );
}

export { queryClient };
