import { useModal, useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount, useChainId, useConnect } from "wagmi";

export const UnifiedWalletButton = ({ theme }) => {
    const { openModal } = useModal();
    const { isConnected: isParaConnected, address: paraAddress } = useParaAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress, connector: wagmiConnector } = useWagmiAccount();
    const { connect, connectors } = useConnect();
    const chainId = useChainId();
    const isConnected = isParaConnected || isWagmiConnected;
    const address = paraAddress || wagmiAddress;
    const { data: paraWallet } = useWallet();

    const displayAddress = address || paraWallet?.address || wagmiAddress;
    const isWrongNetwork = isConnected && chainId !== 5042002;
    const currentColor = isWrongNetwork ? '#FF4444' : '#3CB371';

    // Determine if we should allow clicking to open Para modal
    const handleClick = () => {
        if (!isConnected) {
            // Priority: Direct Injected Connection for Rabby/MetaMask on Mobile
            const isRabby = window.ethereum?.isRabby;
            const isMetaMask = window.ethereum?.isMetaMask;
            const injectedConnector = connectors.find(c => c.id === 'injected');

            if ((isRabby || isMetaMask) && injectedConnector) {
                console.log("🔌 [WALLET] Triggering direct injected connection...");
                connect({ connector: injectedConnector });
            } else {
                // Default to Para Modal for all other cases (email, social, or desktop browser wallets)
                openModal();
            }
        } else if (isParaConnected) {
            openModal();
        } else {
            console.log("Connect status: Already connected via", wagmiConnector?.name);
        }
    };

    if (!isConnected) {
        return (
            <button
                onClick={handleClick}
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
            onClick={handleClick}
            className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-4 py-1.5 lg:py-2 rounded-xl border backdrop-blur-md transition-all duration-300 group`}
            style={{
                backgroundColor: theme === 'light' ? `${currentColor}08` : `${currentColor}15`,
                borderColor: theme === 'light' ? `${currentColor}20` : `${currentColor}30`,
                cursor: (isParaConnected || !isConnected) ? 'pointer' : 'default'
            }}
        >
            <div className="relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg relative"
                    style={{ backgroundColor: currentColor }}
                >
                    {isWrongNetwork ? '!' : (displayAddress?.slice(0, 1) || (wagmiConnector?.name?.slice(0, 1)) || 'W')}
                    {isWrongNetwork && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
                    )}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'} ${isWrongNetwork ? 'text-[#FF4444]' : ''}`}>
                {isWrongNetwork ? 'SWITCH NETWORK' : `${displayAddress?.slice(0, 4)}...${displayAddress?.slice(-4)}`}
            </span>
        </button>
    );
};
