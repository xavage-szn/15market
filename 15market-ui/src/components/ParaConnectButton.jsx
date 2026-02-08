import React from 'react';
import { useModal, useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";
import { useAccount as useWagmiAccount } from "wagmi";

export const ParaConnectButton = ({ className, style }) => {
    const { openModal } = useModal();
    const { data: paraWallet } = useWallet();
    const { isConnected: isParaConnected } = useParaAccount();
    const { isConnected: isWagmiConnected, address: wagmiAddress } = useWagmiAccount();

    const address = paraWallet?.address || wagmiAddress;
    const isConnected = isParaConnected || isWagmiConnected;

    return (
        <button
            onClick={() => openModal()}
            className={className}
            style={style}
        >
            {isConnected
                ? `${address?.slice(0, 4)}...${address?.slice(-4)}`
                : "CONNECT WALLET"}
        </button>
    );
};
