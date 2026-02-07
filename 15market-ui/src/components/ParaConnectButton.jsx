import React from 'react';
import { useModal, useAccount, useWallet } from "@getpara/react-sdk";

export const ParaConnectButton = ({ className, style }) => {
    const { openModal } = useModal();
    const { data: wallet } = useWallet();
    const { isConnected } = useAccount();

    return (
        <button
            onClick={() => openModal()}
            className={className}
            style={style}
        >
            {isConnected
                ? `${wallet?.address?.slice(0, 4)}...${wallet?.address?.slice(-4)}`
                : "CONNECT WALLET"}
        </button>
    );
};
