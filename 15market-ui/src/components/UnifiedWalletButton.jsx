import { useModal, useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount, useChainId } from "wagmi";

export const UnifiedWalletButton = ({ theme }) => {
    const { openModal } = useModal();
    const { isConnected: isParaConnected, address: paraAddress } = useParaAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress, chainId: wagmiChainId } = useWagmiAccount();
    const chainId = useChainId();
    const isConnected = isParaConnected || isWagmiConnected;
    const address = paraAddress || wagmiAddress;
    const { data: paraWallet } = useWallet();

    const displayAddress = address || paraWallet?.address || wagmiAddress;

    const isWrongNetwork = isWagmiConnected && chainId !== 5042002;

    const currentColor = isWrongNetwork ? '#FF4444' : '#3CB371'; // Red for wrong network, Green for correct

    if (!isConnected) {
        return (
            <button
                onClick={() => openModal()}
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-xs lg:text-sm tracking-widest rounded-xl transition-all active:scale-95 text-white relative overflow-hidden group"
                style={{
                    backgroundColor: '#3CB371',
                    boxShadow: `0 0 20px #3CB37150`,
                }}
            >
                <span className="relative z-10 flex items-center gap-2">
                    Connect Wallet
                </span>
            </button>
        );
    }

    return (
        <button
            onClick={() => openModal()}
            className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-4 py-1.5 lg:py-2 rounded-xl border backdrop-blur-md transition-all duration-300 group`}
            style={{
                backgroundColor: theme === 'light' ? `${currentColor}08` : `${currentColor}15`,
                borderColor: theme === 'light' ? `${currentColor}20` : `${currentColor}30`,
            }}
        >
            <div className="relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg relative"
                    style={{ backgroundColor: currentColor }}
                >
                    {isWrongNetwork ? '!' : (displayAddress?.slice(0, 1) || 'W')}
                    {isWrongNetwork && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
                    )}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'} ${isWrongNetwork ? 'text-[#FF4444]' : ''}`}>
                {isWrongNetwork ? 'WRONG NETWORK' : `${displayAddress?.slice(0, 4)}...${displayAddress?.slice(-4)}`}
            </span>
        </button>
    );
};
