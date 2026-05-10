import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { useTurnkey } from '@turnkey/react-wallet-kit';
import { TurnkeyClient } from '@turnkey/http';
import { WebauthnStamper } from '@turnkey/webauthn-stamper';
import { getRpId } from '../utils/turnkeyHelpers';
import { ARC_CHAIN_ID } from '../constants';

export function UnifiedWalletButton({ theme }) {
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const connectedChainId = useChainId();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();
    const { switchChain } = useSwitchChain();
    const { handleLogin, createWallet, wallets: turnkeyWallets } = useTurnkey();
    
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectStatus, setConnectStatus] = useState('');

    // Auto-switch to Arc Testnet if wallet is on any other network
    useEffect(() => {
        if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
            console.log(`🔄 [NETWORK] Wallet on chain ${connectedChainId}, auto-switching to Arc Testnet (${ARC_CHAIN_ID})...`);
            switchChain?.({ chainId: ARC_CHAIN_ID });
        }
    }, [isConnected, connectedChainId, switchChain]);

    const currentColor = '#3CB371';

    // Open Turnkey onboarding flow
    const onConnect = async () => {
        if (isConnecting) return;
        setIsConnecting(true);
        setConnectStatus('Authenticating...');
        try {
            console.log("📂 [WALLET] Opening Turnkey Onboarding...");
            await handleLogin();
            
            // After Turnkey login, check if we need to create a wallet
            const turnkeyConnector = connectors.find(c => c.id === 'turnkey');
            if (turnkeyConnector) {
                setConnectStatus('Checking Wallet...');
                let wallets = turnkeyWallets || window.getTurnkeyWallets?.() || [];
                
                // If NO wallets, trigger creation immediately
                if (wallets.length === 0) {
                    setConnectStatus('Creating Wallet...');
                    console.log("🚀 [WALLET] No wallet found. Provisioning new embedded wallet...");
                    try {
                        await createWallet({
                            walletName: "15market Wallet",
                            accounts: ["ADDRESS_FORMAT_ETHEREUM"],
                        });
                        console.log("✅ [WALLET] Provisioning request sent.");
                    } catch (err) {
                        console.error("❌ [WALLET] Wallet creation failed:", err);
                    }
                }

                // RETRY LOOP: Wait for the wallet to appear in the SDK state
                let foundWallet = false;
                for (let i = 0; i < 25; i++) { // Increased to 25 attempts (~25 seconds)
                    wallets = window.getTurnkeyWallets?.() || [];
                    if (wallets.length > 0) {
                        foundWallet = true;
                        break;
                    }
                    
                    // Dynamic status messages to feel 'alive'
                    if (i < 5) setConnectStatus('Finalizing...');
                    else if (i < 15) setConnectStatus('Securing Account...');
                    else setConnectStatus('Almost Ready...');

                    console.log(`⏳ [WALLET] Waiting for wallet propagation (Attempt ${i + 1}/25)...`);
                    await new Promise(r => setTimeout(r, 1000)); // Poll every 1 second
                }
                
                if (!foundWallet) {
                    console.error("❌ [WALLET] No wallet found after timeout.");
                    setConnectStatus('Network Busy');
                    setTimeout(() => setConnectStatus('Try Again'), 2000);
                    return;
                }

                setConnectStatus('Connecting...');
                console.log("✅ [WALLET] Wallet found, connecting Wagmi...");
                connect({ connector: turnkeyConnector });
            }
        } catch (err) {
            console.error("Connect failed:", err);
            setConnectStatus('Error');
            setTimeout(() => setConnectStatus(''), 2000);
        } finally {
            // Keep the connecting state active until Wagmi actually connects (or fails)
            // This prevents the button from flickering back to 'Connect Wallet' too early
            setTimeout(() => {
                if (!isConnected) setIsConnecting(false);
            }, 5000);
        }
    };

    const handleLogout = async () => {
        try {
            disconnect();
            console.log("🚪 [WALLET] Disconnected");
        } catch (err) {
            console.error("Disconnect failed:", err);
        }
    };

    if (!isConnected) {
        return (
            <button
                onClick={onConnect}
                disabled={isConnecting}
                id="connect-wallet-btn"
                className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-[10px] lg:text-xs tracking-[0.2em] rounded-full transition-all active:scale-95 text-white relative overflow-hidden group shadow-xl"
                style={{
                    backgroundColor: '#3CB371',
                    boxShadow: `0 0 20px #3CB37150`,
                    opacity: isConnecting ? 0.7 : 1,
                }}
            >
                <span className="relative z-10 flex items-center gap-2">
                    {isConnecting ? (connectStatus || 'Connecting...') : 'Connect Wallet'}
                </span>
            </button>
        );
    }

    return (
        <button
            onClick={handleLogout}
            title="Click to Disconnect"
            id="disconnect-wallet-btn"
            className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-4 py-1.5 lg:py-2 rounded-full border backdrop-blur-md transition-all duration-300 group`}
            style={{
                backgroundColor: theme === 'light' ? `${currentColor}08` : `${currentColor}15`,
                borderColor: theme === 'light' ? `${currentColor}20` : `${currentColor}30`,
                cursor: 'pointer'
            }}
        >
            <div className="relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg relative"
                    style={{ backgroundColor: currentColor }}
                >
                    {(address?.slice(0, 1) || 'W')}
                </div>
            </div>
            <span className={`text-xs font-black font-mono hidden lg:block ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {`${address?.slice(0, 4)}...${address?.slice(-4)}`}
            </span>
        </button>
    );
}
