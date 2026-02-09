import { useEffect, useState } from "react";
import { useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { useBalance, useAccount as useWagmiAccount } from "wagmi";

export const WalletBalance = ({ theme, balanceOverride, sessionMode }) => {
    const { isConnected: isParaConnected } = useParaAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress } = useWagmiAccount();
    const { data: paraWallet } = useWallet();
    const address = paraWallet?.address || wagmiAddress;
    const isConnected = isParaConnected || isWagmiConnected;
    const [internalBalance, setInternalBalance] = useState(0);

    // Only use balanceOverride when in session mode
    const balance = sessionMode ? balanceOverride : internalBalance;

    const { data: evmBalance, refetch: refetchEvm } = useBalance({
        address: address,
        chainId: 5042002, // Arc Testnet
        query: { enabled: isConnected }
    });

    useEffect(() => {
        console.log("💰 [WALLET BALANCE] Component update:", {
            isConnected,
            address,
            sessionMode,
            balanceOverride,
            internalBalance,
            evmBalance: evmBalance?.formatted,
            finalBalance: balance
        });

        if (!isConnected || !address) {
            setInternalBalance(0);
            return;
        }

        if (evmBalance) {
            const bal = parseFloat(evmBalance.formatted);
            console.log("✅ [WALLET BALANCE] Setting internal balance:", bal);
            setInternalBalance(bal);
        }
    }, [isConnected, address, evmBalance, sessionMode, balanceOverride, balance]);

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
