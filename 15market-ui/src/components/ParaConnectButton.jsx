import React from 'react';
import { useModal, useAccount as useParaAccount, useWallet } from "@getpara/react-sdk";

export const ParaConnectButton = ({ className, style }) => {
    const { openModal } = useModal();
    const { data: paraWallet } = useWallet();
    const { isConnected, address } = useParaAccount();

    const displayAddress = address || paraWallet?.address;

    return (
        <button
            onClick={() => openModal()}
            className={className}
            style={style}
        >
            {isConnected
                ? `${displayAddress?.slice(0, 4)}...${displayAddress?.slice(-4)}`
                : "CONNECT WALLET"}
        </button>
    );
};
