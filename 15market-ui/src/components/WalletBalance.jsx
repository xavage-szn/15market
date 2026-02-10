import { useEffect, useState } from "react";
import { useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { useBalance, useAccount as useWagmiAccount } from "wagmi";

export const WalletBalance = ({ theme, balanceOverride, sessionMode }) => {
    const { isConnected: isParaConnected, address: paraAddress } = useParaAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress } = useWagmiAccount();
    const { data: paraWallet } = useWallet();
    const address = paraAddress || wagmiAddress || paraWallet?.address;
    const isConnected = isParaConnected || isWagmiConnected;
    const [internalBalance, setInternalBalance] = useState(0);

    // Sync balance with the override passed from UserApp (robust fetch)
    const balance = (typeof balanceOverride === 'number') ? balanceOverride : internalBalance;

    const { data: evmBalance, refetch: refetchEvm } = useBalance({
        address: address,
        chainId: 5042002,
        query: { enabled: isConnected && !balanceOverride }
    });

    useEffect(() => {
        if (evmBalance && !balanceOverride) {
            setInternalBalance(parseFloat(evmBalance.formatted));
        }
    }, [evmBalance, balanceOverride]);

    useEffect(() => {
        if (isConnected) {
            const interval = setInterval(() => refetchEvm(), 5000);
            return () => clearInterval(interval);
        }
    }, [isConnected, refetchEvm]);

    if (!isConnected) return null;

    const networkColor = '#3CB371'; // Arc Green

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-xl transition-all duration-300 group hover:scale-105"
            style={{
                backgroundColor: theme === 'light' ? `${networkColor}08` : `${networkColor}15`,
                borderColor: theme === 'light' ? `${networkColor}20` : `${networkColor}30`
            }}>

            {sessionMode && (
                <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-[8px] font-black text-yellow-400/90 uppercase tracking-tighter">Auto</span>
                </div>
            )}

            {!sessionMode && (
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={{ backgroundColor: networkColor }} />
            )}

            <span className={`text-[10px] font-bold font-mono tracking-wide ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDC
            </span>
        </div>
    );
};
