import { ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { arcTestnet } from "../constants";
import { para } from "../paraClient";

export function AppParaProvider({ children }) {
    return (
        <ParaProvider
            para={para}
            config={{
                appName: "15market",
                chains: ["evm"],
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
