import { useAccount } from "wagmi";
import { publicClient } from "../client";
import { formatUnits } from "viem";
import { useState, useEffect, useCallback } from "react";

export const WalletBalance = ({ theme, balanceOverride, sessionMode }) => {
    const { isConnected, address } = useAccount();
    const [internalBalance, setInternalBalance] = useState(0);

    // Sync balance with the override passed from UserApp (robust fetch)
    const balance = (typeof balanceOverride === 'number') ? balanceOverride : internalBalance;

    const refetchEvm = useCallback(async () => {
        if (!address || balanceOverride !== undefined) return;
        try {
            const b = await publicClient.getBalance({ address });
            setInternalBalance(parseFloat(formatUnits(b, 18)));
        } catch (e) {
            console.error("WalletBalance fetch error:", e);
        }
    }, [address, balanceOverride]);

    useEffect(() => {
        refetchEvm();
        if (isConnected && !balanceOverride) {
            const interval = setInterval(refetchEvm, 10000);
            return () => clearInterval(interval);
        }
    }, [isConnected, refetchEvm, balanceOverride]);

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
