import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ParaProvider, ParaModal } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";

const queryClient = new QueryClient();

export function AppParaProvider({ children }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ParaProvider
                paraClientConfig={{
                    apiKey: import.meta.env.VITE_PARA_API_KEY || "",
                    env: "BETA", // Assuming BETA given the key format, change to PROD for production
                }}
                config={{
                    appName: "15market",
                    chains: ["evm", "solana"], // Support both Arc and Solana
                    appLogo: "/logo.png",
                }}
                paraModalConfig={{
                    logo: "/logo.png",
                    theme: {
                        backgroundColor: "#050505",
                        foregroundColor: "#ffffff",
                        accentColor: "#3B82F6", // Arc Blue
                    }
                }}
            >
                {children}
            </ParaProvider>
        </QueryClientProvider>
    );
}
