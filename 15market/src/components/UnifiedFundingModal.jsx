import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ArrowRight, Zap, Wallet, Info, RefreshCw, Check, ArrowDownLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { SUPPORTED_TOKENS } from '../tokens';
import { KEEPER_URL_ARC } from '../constants';
import * as ethers from 'ethers';

const GATEWAY_ABI = [
    "function fundWithNative(bytes32 tradingWallet, uint256 minUsdcOut) external payable",
    "function fundWithUSDC(uint256 amount, bytes32 tradingWallet) external"
];

// Deployments on Fuji/Sepolia/Monad
const GATEWAY_ADDRESSES = {
    'mon': '0x094604E6bA1E98756b0de29a9E2285Ead0c443Fd', 
    'avax': '0xeb08f243e5d3fcff26a9e38ae5520a669f4019d0',
    'eth': '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'
};

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const TESTNET_RPCS = {
    'eth': 'https://rpc.ankr.com/eth_sepolia',
    'avax': 'https://api.avax-test.network/ext/bc/C/rpc',
    'mon': 'https://testnet-rpc.monad.xyz',
    'sol': 'https://api.devnet.solana.com'
};

export function UnifiedFundingModal({ 
    isOpen, 
    onClose, 
    isLight, 
    notify, 
    address, 
    sessionAddress, 
    onSuccess,
    initialToken,
    wallets = []
}) {
    const TokenLogoInfused = ({ token, isLight, size = "w-20 h-20", mode = 'stables' }) => {
        const iconSrc = mode === 'stables' ? `/${token.id}usdc.png` : token.icon;
        
        return (
            <div className={`relative ${size} flex items-center justify-center`}>
                <img 
                    src={iconSrc} 
                    className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(60,179,113,0.3)]" 
                    style={{ filter: isLight && mode === 'native' ? 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' : 'none' }}
                    alt={token.symbol} 
                />
            </div>
        );
    };

    const [selectedToken, setSelectedToken] = useState(initialToken || SUPPORTED_TOKENS[0]);
    const [fundingMode, setFundingMode] = useState(null); // null | 'native' | 'stables'
    const [amount, setAmount] = useState("");
    const [isQuoting, setIsQuoting] = useState(false);
    const [quote, setQuote] = useState(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [balances, setBalances] = useState({});

    // Keep state in sync with initialToken prop
    useEffect(() => {
        if (initialToken) setSelectedToken(initialToken);
    }, [initialToken]);

    // Multi-chain address mapping
    const solWallet = useMemo(() => wallets?.find(w => w.address && !w.address.startsWith('0x')), [wallets]);
    const evmWallet = useMemo(() => wallets?.find(w => w.address && w.address.startsWith('0x')), [wallets]);

    // Fetch Balances
    useEffect(() => {
        if (!isOpen || !evmWallet) return;

        const fetchBalances = async () => {
            const newBalances = {};
            
            for (const token of SUPPORTED_TOKENS) {
                try {
                    if (token.id === 'sol') {
                        // Simulated for Solana devnet unless we add @solana/web3.js
                        newBalances[`${token.id}_native`] = 45.8;
                        newBalances[`${token.id}_stables`] = 250.0;
                        continue;
                    }

                    const rpcUrl = TESTNET_RPCS[token.id];
                    if (!rpcUrl) continue;

                    const provider = new ethers.JsonRpcProvider(rpcUrl);
                    
                    // Fetch Native
                    const nativeBal = await provider.getBalance(evmWallet.address);
                    newBalances[`${token.id}_native`] = parseFloat(ethers.formatEther(nativeBal));

                    // Fetch USDC
                    if (token.usdcAddress && token.usdcAddress !== ethers.ZeroAddress) {
                        const usdcContract = new ethers.Contract(token.usdcAddress, ERC20_ABI, provider);
                        const usdcBal = await usdcContract.balanceOf(evmWallet.address);
                        // USDC usually has 6 decimals on Fuji/Sepolia
                        const decimals = token.id === 'mon' ? 18 : 6; 
                        newBalances[`${token.id}_stables`] = parseFloat(ethers.formatUnits(usdcBal, decimals));
                    } else {
                        newBalances[`${token.id}_stables`] = 0;
                    }
                } catch (err) {
                    console.warn(`Balance fetch failed for ${token.name}:`, err);
                    newBalances[`${token.id}_native`] = 0;
                    newBalances[`${token.id}_stables`] = 0;
                }
            }
            setBalances(newBalances);
        };

        fetchBalances();
        const interval = setInterval(fetchBalances, 10000);
        return () => clearInterval(interval);
    }, [isOpen, evmWallet]);

    // Fetch Quote when amount or token changes
    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0) {
            setQuote(null);
            return;
        }

        const fetchQuote = async () => {
            setIsQuoting(true);
            try {
                // In production, we'd call Unitflow/Xylonet API here
                // For now, we simulate the aggregator pricing for the testnets
                const mockPrices = { 'ETH': 3500, 'AVAX': 35, 'MON': 2.5, 'SOL': 150 };
                const price = mockPrices[selectedToken.symbol] || 1;
                const rawUsdc = parseFloat(amount) * (fundingMode === 'stables' ? 1 : price);
                
                // Apply 1% spread for the Gateway fee
                const spread = rawUsdc * 0.01;
                const estimatedUsdc = rawUsdc - spread;

                setQuote({
                    estimatedUsdc: estimatedUsdc.toFixed(2),
                    fee: (0.50).toFixed(2), // Flat relayer gas fee
                    spread: spread.toFixed(2),
                    aggregator: "Unitflow + Xylonet"
                });
            } catch (err) {
                console.error("Quote error:", err);
            } finally {
                setIsQuoting(false);
            }
        };

        const timer = setTimeout(fetchQuote, 500);
        return () => clearTimeout(timer);
    }, [amount, selectedToken, fundingMode]);

    const handleSwipeToken = (direction) => {
        const currentIndex = SUPPORTED_TOKENS.findIndex(t => t.id === selectedToken.id);
        if (direction === 'left' && currentIndex < SUPPORTED_TOKENS.length - 1) {
            setSelectedToken(SUPPORTED_TOKENS[currentIndex + 1]);
        } else if (direction === 'right' && currentIndex > 0) {
            setSelectedToken(SUPPORTED_TOKENS[currentIndex - 1]);
        }
    };

    const handleFunding = async () => {
        if (!amount || !quote || !evmWallet) return;

        setIsConfirming(true);
        notify("Initiating Cross-Chain Funding...", "pending");

        try {
            const ethProvider = await evmWallet.getEthereumProvider();
            const provider = new ethers.BrowserProvider(ethProvider);
            const signer = await provider.getSigner();
            const gatewayAddr = GATEWAY_ADDRESSES[selectedToken.id];
            const usdcAddr = selectedToken.usdcAddress; // We should add this to tokens.js or config
            
            if (!gatewayAddr || gatewayAddr === ethers.ZeroAddress) {
                throw new Error(`Funding Gateway not yet deployed on ${selectedToken.name} Testnet`);
            }

            const gateway = new ethers.Contract(gatewayAddr, GATEWAY_ABI, signer);
            const tradingWalletBytes32 = ethers.zeroPadValue(sessionAddress, 32);

            let tx;
            if (fundingMode === 'native') {
                const val = ethers.parseEther(amount);
                const minUsdc = ethers.parseUnits((parseFloat(quote.estimatedUsdc) * 0.99).toFixed(6), 6); // 1% slippage
                tx = await gateway.fundWithNative(tradingWalletBytes32, minUsdc, { value: val });
            } else {
                // USDC Funding
                const usdcContract = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
                const val = ethers.parseUnits(amount, 6);
                
                // Check allowance
                const allowance = await usdcContract.allowance(address, gatewayAddr);
                if (allowance < val) {
                    notify("Approving USDC...", "pending");
                    const appTx = await usdcContract.approve(gatewayAddr, ethers.MaxUint256);
                    await appTx.wait();
                }

                tx = await gateway.fundWithUSDC(val, tradingWalletBytes32);
            }

            notify("Transaction Sent! Registering with relayer...", "pending");
            
            // Notify Backend immediately to start monitoring in the background and instantly credit user's cache!
            const chainIdMap = { 'avax': '43113', 'eth': '111155111', 'mon': '10143' };
            const chainId = selectedToken.chainId || chainIdMap[selectedToken.id] || '43113';

            fetch(`${KEEPER_URL_ARC}/fund/monitor-cctp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address,
                    txHash: tx.hash,
                    fromChain: chainId,
                    amount: quote.estimatedUsdc
                })
            }).catch(e => {
                console.error("[CCTP] Relayer register failed:", e);
            });

            tx.wait().catch(() => {}); // Wait in the background silently

            notify(`Success! ${quote.estimatedUsdc} USDC will arrive in Trading Wallet shortly!`, "success");
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error("Funding Error:", err);
            notify(err.message || "Funding failed", "error");
        } finally {
            setIsConfirming(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden" style={{ fontFamily: '"Comfortaa", cursive' }}>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={onClose} 
                className="absolute inset-0 bg-black/90 backdrop-blur-md" 
            />
            
            <motion.div 
                initial={{ opacity: 0, y: 100 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 100 }}
                className={`w-full md:max-w-xl relative z-10 rounded-t-[40px] md:rounded-[40px] border-t md:border overflow-hidden flex flex-col ${isLight ? 'bg-[#CFDCD5] border-black/5 shadow-2xl' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'}`}
            >
                {/* Header Section */}
                <div className={`p-6 border-b flex items-center justify-between shrink-0 ${isLight ? 'bg-white/40 border-black/5' : 'bg-white/[0.02] border-white/5'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#3CB371]/10 flex items-center justify-center">
                            <Zap className="text-[#3CB371]" size={20} />
                        </div>
                        <div>
                            <h3 className={`text-lg font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Quick Fund</h3>
                            <p className="text-[10px] font-bold text-[#3CB371] uppercase tracking-widest">Main → Trading Vault</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-black/5 text-black/40' : 'hover:bg-white/5 text-white/40'}`}>
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6 max-h-[85dvh] overflow-y-auto custom-scrollbar">
                                        {/* Guided Funding Selection */}
                    <div className={`p-8 rounded-[40px] border relative overflow-hidden flex flex-col items-center justify-center min-h-[320px] ${isLight ? 'bg-[#C2D1C9] border-black/5 shadow-xl' : 'bg-[#111] border-white/5 shadow-2xl'}`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#3CB371]/5 blur-[60px] rounded-full" />
                        
                        <AnimatePresence mode="wait">
                            {!fundingMode ? (
                                <motion.div 
                                    key="selection"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex flex-row items-center justify-center gap-0 w-full h-full"
                                >
                                    <button 
                                        onClick={() => setFundingMode('native')}
                                        className={`flex-1 group relative p-6 h-full flex flex-col items-center justify-center gap-4 transition-all hover:bg-[#3CB371]/5 active:scale-[0.98]`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Zap size={24} className="text-[#3CB371]" />
                                        </div>
                                        <div className="text-center">
                                            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>Native</p>
                                        </div>
                                    </button>

                                    {/* Vertical Divider */}
                                    <div className="w-px h-16 bg-[#3CB371]/20" />

                                    <button 
                                        onClick={() => setFundingMode('stables')}
                                        className={`flex-1 group relative p-6 h-full flex flex-col items-center justify-center gap-4 transition-all hover:bg-[#3CB371]/5 active:scale-[0.98]`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-[#3CB371]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Globe size={24} className="text-[#3CB371]" />
                                        </div>
                                        <div className="text-center">
                                            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>Stables</p>
                                        </div>
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="assets"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="flex flex-col gap-4 w-full"
                                >
                                    <div className="flex items-center justify-between w-full mb-2">
                                        <button 
                                            onClick={() => setFundingMode(null)}
                                            className={`p-2 rounded-xl flex items-center gap-2 hover:scale-105 active:scale-95 transition-all ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white/60'}`}
                                        >
                                            <ChevronLeft size={16} />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Type</span>
                                        </button>
                                        <div className="flex gap-1">
                                            {SUPPORTED_TOKENS.map(t => (
                                                <div key={t.id} className={`w-1 h-1 rounded-full transition-all ${selectedToken.id === t.id ? 'w-3 bg-[#3CB371]' : 'bg-white/10'}`} />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="relative h-[120px] w-full flex items-center justify-center">
                                        {/* Token Navigation Buttons */}
                                        <button 
                                            onClick={() => handleSwipeToken('right')}
                                            className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2 text-[#3CB371] hover:scale-110 active:scale-90 transition-all`}
                                        >
                                            <ChevronLeft size={32} strokeWidth={3} />
                                        </button>
                                        <button 
                                            onClick={() => handleSwipeToken('left')}
                                            className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2 text-[#3CB371] hover:scale-110 active:scale-90 transition-all`}
                                        >
                                            <ChevronRight size={32} strokeWidth={3} />
                                        </button>

                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={`${selectedToken.id}-${fundingMode}`}
                                                drag="x"
                                                dragConstraints={{ left: 0, right: 0 }}
                                                onDragEnd={(e, info) => {
                                                    if (info.offset.x < -50) handleSwipeToken('left');
                                                    else if (info.offset.x > 50) handleSwipeToken('right');
                                                }}
                                                initial={{ opacity: 0, scale: 0.8, x: 50 }}
                                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                                exit={{ opacity: 0, scale: 0.8, x: -50 }}
                                                className="absolute inset-0 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
                                            >
                                                <div className="flex items-center justify-center mb-4">
                                                    <TokenLogoInfused token={selectedToken} isLight={isLight} mode={fundingMode} />
                                                </div>
                                                <p className={`text-xl font-black tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>
                                                    {fundingMode === 'stables' ? `${selectedToken.symbol}USDC` : selectedToken.symbol}
                                                </p>
                                                <p className="text-[10px] font-bold text-[#3CB371] uppercase tracking-[0.2em]">
                                                    {balances[`${selectedToken.id}_${fundingMode}`]?.toFixed(2) || '0.00'} Available
                                                </p>
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>


                    {/* Amount Input */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-2">
                            <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Funding Amount</label>
                             <button onClick={() => setAmount(balances[`${selectedToken.id}_${fundingMode}`]?.toString())} className="text-[10px] font-black text-[#3CB371] uppercase hover:underline">Use Max</button>
                        </div>
                        <div className="relative group">
                            <input 
                                type="number" 
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className={`w-full py-6 px-8 rounded-[32px] text-4xl font-black transition-all outline-none border-2 border-transparent focus:border-[#3CB371]/30 ${isLight ? 'bg-[#CFDCD5] text-[#2d3d34] shadow-lg' : 'bg-white/5 text-white shadow-2xl'}`}
                            />
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                <span className="text-xl font-black text-[#3CB371]">{selectedToken.symbol}</span>
                            </div>
                        </div>
                    </div>

                    {/* Quote & Results */}
                    <AnimatePresence>
                        {quote ? (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-[32px] border ${isLight ? 'bg-[#C2D1C9] border-black/5 shadow-md' : 'bg-[#151515] border-white/5'} flex flex-col gap-4`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Estimated Deposit</p>
                                        <p className="text-2xl font-black text-[#3CB371]">{quote.estimatedUsdc} USDC</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Net Fees</p>
                                        <p className="text-xs font-bold text-orange-500">{(parseFloat(quote.fee) + parseFloat(quote.spread)).toFixed(2)} USDC</p>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-white/5 w-full" />
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-[#3CB371]" />
                                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-40">Automated settlement on Arc Mainnet Node.</p>
                                </div>
                            </motion.div>
                        ) : (
                            <div className={`p-6 rounded-[32px] border border-dashed flex items-center gap-4 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                                <Info size={18} className="text-[#3CB371] shrink-0" />
                                <p className="text-[9px] font-bold uppercase leading-relaxed opacity-40">
                                    Funding your Trading Wallet converts any asset to USDC instantly for high-speed trade execution.
                                </p>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Action Button */}
                    <button 
                        onClick={handleFunding}
                        disabled={!quote || isConfirming}
                        className={`w-full py-6 rounded-[28px] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-xl ${(!quote || isConfirming) ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-[#3CB371] text-black hover:scale-[1.02] active:scale-[0.98] shadow-[#3CB371]/20'}`}
                    >
                        {isConfirming ? (
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCw className="animate-spin" size={18} />
                                Bridging Assets...
                            </div>
                        ) : quote ? `Fund ${quote.estimatedUsdc} USDC` : 'Enter Amount'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
