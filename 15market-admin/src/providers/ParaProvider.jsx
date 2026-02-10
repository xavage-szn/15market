import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { arcTestnet, projectId } from "../constants";
import { para, queryClient } from "../paraClient";

export function AppParaProvider({ children }) {
    const activeProjectId = projectId || "4aebd2ef806c541b6aaf003da2930c58";

    return (
        <ParaProvider
            para={para}
            queryClient={queryClient}
            config={{
                appName: "15market",
                chains: ["evm:5042002"],
                defaultChainId: "evm:5042002",
                walletConnectProjectId: activeProjectId
            }}
            externalWalletConfig={{
                appName: "15market",
                wallets: ["METAMASK", "PHANTOM", "WALLETCONNECT"],
                walletConnect: { projectId: activeProjectId },
                evmConnector: {
                    config: {
                        chains: [arcTestnet],
                        defaultChainId: arcTestnet.id,
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
                authLayout: ["AUTH", "EXTERNAL"],
                recoverySecretStepEnabled: false,
                onRampTestMode: false,
            }}
        >
            {children}
        </ParaProvider>
    );
}


