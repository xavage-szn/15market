import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";

const queryClient = new QueryClient();

export function AppParaProvider({ children }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ParaProvider
                paraClientConfig={{
                    apiKey: import.meta.env.VITE_PARA_API_KEY || "",
                }}
                config={{
                    appName: "15market",
                    chains: ["solana", "evm"], // Adjust based on supported chains
                }}
            >
                {children}
            </ParaProvider>
        </QueryClientProvider>
    );
}
