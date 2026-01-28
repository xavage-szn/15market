import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useBalance } from "wagmi";
import { defaultConnection as connection } from "../api/program";

export const WalletBalance = ({ network, theme, balanceOverride, sessionMode }) => {
    const { address, isConnected } = useAppKitAccount();
    const [internalBalance, setInternalBalance] = useState(0);

    const balance = balanceOverride !== undefined ? balanceOverride : internalBalance;
    const setBalance = setInternalBalance;

    // Reown Hooks for EVM
    const { data: evmBalance, refetch } = useBalance({
        address: address,
        token: network === 'arc' ? "0x3600000000000000000000000000000000000000" : undefined,
        chainId: network === 'arc' ? 5042002 : (network === 'base' ? 8453 : undefined),
    });

    const isSolana = network === 'solana';

    useEffect(() => {
        if (isSolana && isConnected && address) {
            let publicKey;
            try {
                publicKey = new PublicKey(address);
            } catch (e) {
                return;
            }

            const getBalance = async () => {
                try {
                    const bal = await connection.getBalance(publicKey, "confirmed");
                    setBalance(bal / LAMPORTS_PER_SOL);
                } catch (e) { }
            };
            getBalance();

            const id = connection.onAccountChange(publicKey, (accountInfo) => {
                setBalance(accountInfo.lamports / LAMPORTS_PER_SOL);
            }, "confirmed");

            return () => { connection.removeAccountChangeListener(id); };
        } else if (!isSolana) {
            if (isConnected && evmBalance) {
                setBalance(parseFloat(evmBalance.formatted));
            } else {
                setBalance(0);
            }
        }
    }, [address, network, isSolana, isConnected, evmBalance]);

    // Refresh EVM balance periodically
    useEffect(() => {
        if (!isSolana && isConnected) {
            const interval = setInterval(() => refetch(), 5000);
            return () => clearInterval(interval);
        }
    }, [isSolana, isConnected, refetch]);


    if (!isConnected) return null;

    const networkColor = isSolana ? '#3CB371' : '#3B82F6';

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
                {isSolana
                    ? `${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL`
                    : `${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${network === 'arc' ? 'USDC' : (evmBalance?.symbol || 'USDC')}`
                }
            </span>
        </div>
    );
};
