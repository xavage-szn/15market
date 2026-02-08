import { useEffect, useState } from "react";
import { useAccount, useWallet } from "@getpara/react-sdk";
import { useBalance } from "wagmi";

export const WalletBalance = ({ theme, balanceOverride, sessionMode }) => {
    const { isConnected } = useAccount();
    const { data: wallet } = useWallet();
    const address = wallet?.address;
    const [internalBalance, setInternalBalance] = useState(0);

    const balance = balanceOverride !== undefined ? balanceOverride : internalBalance;

    const { data: evmBalance, refetch: refetchEvm } = useBalance({
        address: address,
        chainId: 5042002, // Arc Testnet
        query: { enabled: isConnected }
    });

    useEffect(() => {
        if (!isConnected || !address) {
            setInternalBalance(0);
            return;
        }

        if (evmBalance) {
            setInternalBalance(parseFloat(evmBalance.formatted));
        }
    }, [isConnected, address, evmBalance]);

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
