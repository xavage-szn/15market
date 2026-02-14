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
            paraModalConfig={{
                oAuthMethods: [],
                disableEmailLogin: true,
                disablePhoneLogin: true,
                disableSocialLogin: true,
                authLayout: ["EXTERNAL:FULL"],
            }}
        >
            {children}
        </ParaProvider>
    );
}
