import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, Search, CheckCircle, ShieldCheck, X, Loader2, ArrowRightLeft, TrendingUp, Info } from 'lucide-react';
import { useAccount, useWallet, useModal } from "@getpara/react-sdk";
import { VersionedTransaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Ensure Buffer is available for transaction deserialization
if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = Buffer;
}

export const SwapPage = ({ onBack, connection }) => {
    const { isConnected } = useAccount();
    const { data: wallet } = useWallet();
    const address = wallet?.address;
    const { openModal } = useModal();
    // const { walletProvider } = useAppKitProvider('solana'); // Reown removed
    const open = openModal; // Alias for compatibility with existing button onClick

    const wallet = useMemo(() => {
        if (!isConnected || !address) return { connected: false };
        return {
            connected: true,
            publicKey: new PublicKey(address),
            signTransaction: async (tx) => {
                if (!walletProvider) throw new Error("Wallet not connected");
                return await walletProvider.signTransaction(tx);
            }
        };
    }, [isConnected, address, walletProvider]);

    // Core State
    const [fromToken, setFromToken] = useState({ symbol: 'SOL', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', name: 'Solana', address: 'So11111111111111111111111111111111111111112', decimals: 9 });
    const [toToken, setToToken] = useState({ symbol: 'USDC', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', name: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 });

    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);

    // Data State
    const [tokenList, setTokenList] = useState([
        { symbol: 'SOL', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', name: 'Solana', address: 'So11111111111111111111111111111111111111112', decimals: 9 },
        { symbol: 'USDC', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', name: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
        { symbol: 'USDT', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png', name: 'USDT', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
        { symbol: 'BONK', logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I', name: 'Bonk', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
        { symbol: 'JUP', logoURI: 'https://static.jup.ag/jup/icon.png', name: 'Jupiter', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtkLmVFb54pa8a96QM8', decimals: 6 },
    ]);
    const [quoteResponse, setQuoteResponse] = useState(null);
    const [notification, setNotification] = useState(null);

    // User Balance Map: Address -> Amount
    const [userBalances, setUserBalances] = useState({});

    // Price State: Address -> USD Price
    const [tokenPrices, setTokenPrices] = useState({});

    // UI State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState('from');
    const [searchQuery, setSearchQuery] = useState('');

    // 1. Fetch Token List
    useEffect(() => {
        const fetchTokens = async () => {
            const cached = sessionStorage.getItem('jupiter-tokens');
            if (cached) {
                setTokenList(JSON.parse(cached));
                return;
            }
            try {
                const res = await fetch('https://tokens.jup.ag/tokens?tags=verified');
                if (!res.ok) throw new Error("Failed");
                const tokens = await res.json();

                const priority = ['SOL', 'USDC', 'USDT', 'BONK', 'WIF', 'JUP', 'RAY', 'MNDE', 'MSOL'];
                const sortedTokens = tokens.sort((a, b) => {
                    const idxA = priority.indexOf(a.symbol);
                    const idxB = priority.indexOf(b.symbol);
                    if (idxA > -1 && idxB > -1) return idxA - idxB;
                    if (idxA > -1) return -1;
                    if (idxB > -1) return 1;
                    return (a.symbol || '').localeCompare(b.symbol || '');
                });
                setTokenList(sortedTokens);
                sessionStorage.setItem('jupiter-tokens', JSON.stringify(sortedTokens));
            } catch (e) { console.error(e); }
        };
        fetchTokens();
    }, []);

    // 2. Fetch User Balances
    useEffect(() => {
        if (!wallet.publicKey || !connection) {
            setUserBalances({});
            return;
        }

        const fetchBalances = async () => {
            try {
                // Get SOL Balance
                const solBalance = await connection.getBalance(wallet.publicKey);
                const solInTokens = solBalance / LAMPORTS_PER_SOL;

                // Get Parsed Token Accounts
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    wallet.publicKey,
                    { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
                );

                const newBalances = {};
                // native SOL
                newBalances['So11111111111111111111111111111111111111112'] = solInTokens;

                tokenAccounts.value.forEach((account) => {
                    const info = account.account.data.parsed.info;
                    const mint = info.mint;
                    const amount = info.tokenAmount.uiAmount;
                    if (amount > 0) newBalances[mint] = amount;
                });

                setUserBalances(newBalances);
            } catch (e) {
                console.error("Balance fetch error:", e);
            }
        };

        fetchBalances();
        const id = setInterval(fetchBalances, 10000);
        return () => clearInterval(id);
    }, [wallet.publicKey, connection]);

    // 3. Filter Tokens + Balance Priority (Memoized)
    const filteredTokens = useMemo(() => {
        const lower = searchQuery.toLowerCase();

        let filtered = tokenList.filter(t =>
            (t.symbol || '').toLowerCase().includes(lower) ||
            (t.name || '').toLowerCase().includes(lower) ||
            t.address === searchQuery
        );

        // Sort: User Balance > Priority > Alphabetical
        filtered.sort((a, b) => {
            const balA = userBalances[a.address] || 0;
            const balB = userBalances[b.address] || 0;
            if (balA > 0 && balB === 0) return -1;
            if (balB > 0 && balA === 0) return 1;
            return 0;
        });

        // Limit to 100 for performance
        return filtered.slice(0, 100);
    }, [tokenList, searchQuery, userBalances]);

    // 4. Fetch Live Prices (From/To + Visible List)
    useEffect(() => {
        const fetchUsdPrices = async () => {
            const tokensToFetch = new Set([fromToken?.address, toToken?.address]);

            // If modal is open, fetch prices for the filtered visible list too
            if (isModalOpen) {
                filteredTokens.forEach(t => tokensToFetch.add(t.address));
            }

            // Create ID string (max 100 for Jupiter V2)
            const ids = Array.from(tokensToFetch).filter(Boolean).slice(0, 100).join(',');
            if (!ids) return;

            try {
                const res = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
                const data = await res.json();
                if (data && data.data) {
                    const newPrices = {};
                    Object.keys(data.data).forEach(key => {
                        // Store direct mapping Address -> USD Price
                        if (data.data[key]) {
                            newPrices[key] = data.data[key].price;
                        }
                    });
                    setTokenPrices(prev => ({ ...prev, ...newPrices }));
                }
            } catch (e) { console.error("Price fetch error:", e); }
        };

        fetchUsdPrices();
        const id = setInterval(fetchUsdPrices, 30000); // 30s Poll
        return () => clearInterval(id);
    }, [fromToken, toToken, isModalOpen, filteredTokens]);

    // 5. Quote Logic
    useEffect(() => {
        if (!fromAmount || isNaN(fromAmount) || parseFloat(fromAmount) <= 0) {
            setToAmount('');
            setQuoteResponse(null);
            return;
        }

        // Prevent swapping same token
        if (fromToken.address === toToken.address) return;

        const fetchQuote = async () => {
            if (!fromToken.decimals) return;

            setIsQuoteLoading(true);
            try {
                // Safe Decimal Math using BigInt to avoid scientific notation
                const amountRaw = parseFloat(fromAmount);
                const base = Math.pow(10, fromToken.decimals);
                const amountParams = Math.round(amountRaw * base);

                // Convert to string safely (BigInt) to ensure no '1e+9' format
                const paramStr = BigInt(amountParams).toString();

                const url = `https://quote-api.jup.ag/v6/quote?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${paramStr}&slippageBps=50`;

                // console.log("Fetching Quote URL:", url);

                const res = await fetch(url);
                if (!res.ok) {
                    console.error("Quote API Error:", await res.text());
                    setQuoteResponse(null);
                    setToAmount('');
                    return;
                }

                const data = await res.json();

                if (data.outAmount) {
                    setQuoteResponse(data);
                    // Calculate output
                    const outAmt = parseFloat(data.outAmount) / Math.pow(10, toToken.decimals);

                    // Dynamic Decimals: Show more precision for small numbers
                    let displayAmt;
                    if (outAmt < 1) {
                        displayAmt = outAmt.toFixed(6);
                    } else if (outAmt < 100) {
                        displayAmt = outAmt.toFixed(4);
                    } else {
                        displayAmt = outAmt.toFixed(2);
                    }

                    // Remove trailing zeros for cleaner look
                    setToAmount(parseFloat(displayAmt).toString());
                } else {
                    setQuoteResponse(null);
                    setToAmount('');
                }
            } catch (e) {
                console.error("Quote Fetch Unknown Error:", e);
                setQuoteResponse(null);
                setToAmount('');
            } finally {
                setIsQuoteLoading(false);
            }
        };

        const timer = setTimeout(fetchQuote, 250);
        return () => clearTimeout(timer);
    }, [fromAmount, fromToken, toToken]);

    // 6. Swap Handler
    const handleSwap = async () => {
        if (!wallet.connected || !quoteResponse) return;
        setIsLoading(true);
        try {
            const { swapTransaction } = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: wallet.publicKey.toString(),
                        wrapAndUnwrapSol: true,
                    })
                })
            ).json();
            const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
            const signed = await wallet.signTransaction(transaction);
            const txid = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 2 });
            await connection.confirmTransaction(txid, 'confirmed');
            setNotification({ type: 'success', message: 'Swap Complete', link: `https://solscan.io/tx/${txid}` });
            setFromAmount(''); setToAmount('');
        } catch (error) {
            setNotification({ type: 'error', message: 'Swap Failed', link: null });
        } finally { setIsLoading(false); }
    };

    const handleSwitch = () => {
        setFromToken(toToken);
        setToToken(fromToken);
        setFromAmount(toAmount);
        setToAmount('');
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center font-sans overflow-x-hidden selection:bg-[#3CB371] selection:text-black">

            {/* Ambient Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#3CB371] opacity-[0.08] blur-[150px] rounded-full animate-pulse"></div>
            </div>

            {/* Notification */}
            <AnimatePresence>
                {notification && (
                    <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 24, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className="fixed top-0 z-[100] w-full max-w-sm px-6">
                        <div className="bg-[#111] border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-xl">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${notification.type === 'success' ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-red-500/20 text-red-500'}`}>
                                {notification.type === 'success' ? <CheckCircle size={20} /> : <X size={20} />}
                            </div>
                            <div>
                                <h4 className="font-bold text-sm">{notification.type === 'success' ? 'Transaction Success' : 'Transaction Failed'}</h4>
                                <p className="text-white/40 text-xs">{notification.message}</p>
                                {notification.link && <a href={notification.link} target="_blank" rel="noreferrer" className="text-[#3CB371] text-xs underline mt-1 block">View on Explorer</a>}
                            </div>
                            <button onClick={() => setNotification(null)} className="ml-auto text-white/20 hover:text-white"><X size={16} /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-20">
                <button onClick={onBack} className="group flex items-center gap-3 text-white/40 hover:text-white transition-colors">
                    <ArrowDown className="rotate-90" size={14} /> <span className="text-xs font-bold uppercase tracking-widest">Back</span>
                </button>
                {!isConnected ? (
                    <button
                        onClick={() => open()}
                        className="px-6 py-2 bg-[#111] border border-white/10 rounded-xl text-xs font-bold hover:bg-white/5 transition-all"
                    >
                        Connect Wallet
                    </button>
                ) : (
                    <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-mono text-white/50">
                        {address.slice(0, 4)}...{address.slice(-4)}
                    </div>
                )}
            </div>

            {/* Main Stage */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 w-full max-w-lg mt-10">
                <h1 className="text-center text-6xl font-black italic tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40">15<span className="text-[#3CB371]">SWAP</span></h1>

                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-br from-[#3CB371] to-transparent rounded-[32px] opacity-20 blur-xl group-hover:opacity-30 transition-opacity duration-700"></div>
                    <div className="bg-[#0A0A0A] border border-white/10 rounded-[32px] p-2 shadow-2xl backdrop-blur-md relative overflow-hidden">

                        {/* FROM Component */}
                        <div className="bg-[#111] p-6 rounded-[24px] border border-white/5 hover:border-white/10 transition-colors relative z-10">
                            <div className="flex justify-between mb-4 text-xs font-bold uppercase tracking-widest text-white/30">
                                <span>Sell</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-white/50">Bal: {(userBalances[fromToken.address] || 0).toFixed(4)}</span>
                                    <span className="font-mono text-[#3CB371]">≈ ${(parseFloat(fromAmount || 0) * (tokenPrices[fromToken.address] || 0)).toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center gap-4">
                                <input type="number" placeholder="0" value={fromAmount} onChange={(e) => setFromAmount(e.target.value)} className="w-full bg-transparent text-5xl font-bold outline-none placeholder:text-white/10 font-mono tracking-tighter no-spin-button" />
                                <button onClick={() => { setModalType('from'); setIsModalOpen(true); }} className="flex items-center gap-2 bg-black hover:bg-white/5 border border-white/10 px-4 py-2 rounded-full transition-all shrink-0">
                                    <img src={fromToken.logoURI} className="w-6 h-6 rounded-full" alt="" onError={(e) => e.target.src = 'https://via.placeholder.com/24'} />
                                    <span className="font-bold">{fromToken.symbol}</span>
                                    <ArrowDown size={14} className="opacity-50" />
                                </button>
                            </div>

                            {/* Percentage Slider (Mapped to From Balance) */}
                            <div className="mt-4 px-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#3CB371] hover:accent-[#2E8B57] transition-all"
                                    onChange={(e) => {
                                        if (!wallet.connected) return;
                                        const pct = parseFloat(e.target.value);
                                        const balance = userBalances[fromToken.address] || 0;
                                        if (balance > 0) {
                                            let amt = (balance * pct) / 100;
                                            // Safety: Leave tiny dust for fee if SOL
                                            if (fromToken.symbol === 'SOL' && pct === 100) amt -= 0.005;
                                            if (amt < 0) amt = 0;
                                            setFromAmount(amt.toFixed(fromToken.decimals > 6 ? 6 : fromToken.decimals));
                                        }
                                    }}
                                />
                                <div className="flex justify-between mt-1 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                                    <span>0%</span> <span>25%</span> <span>50%</span> <span>75%</span> <span>Max</span>
                                </div>
                            </div>
                        </div>

                        {/* Switcher */}
                        <div className="relative h-2 z-20 flex justify-center items-center">
                            <button onClick={handleSwitch} className="absolute w-10 h-10 bg-[#0A0A0A] border-4 border-[#0A0A0A] rounded-xl flex items-center justify-center text-white/40 hover:text-[#3CB371] hover:rotate-180 transition-all duration-300">
                                <ArrowRightLeft size={16} />
                            </button>
                        </div>

                        {/* TO Component */}
                        <div className="bg-[#111] p-6 rounded-[24px] border border-white/5 hover:border-white/10 transition-colors relative z-10">
                            <div className="flex justify-between mb-4 text-xs font-bold uppercase tracking-widest text-white/30">
                                <span>Buy</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-white/50">Bal: {(userBalances[toToken.address] || 0).toFixed(4)}</span>
                                    <span className="font-mono text-[#3CB371]">≈ ${(parseFloat(toAmount || 0) * (tokenPrices[toToken.address] || 0)).toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center gap-4">
                                <div className="w-full text-5xl font-bold font-mono tracking-tighter text-[#3CB371] h-[60px] flex items-center overflow-x-auto no-scrollbar whitespace-nowrap">{isQuoteLoading ? <Loader2 className="animate-spin opacity-30" /> : (toAmount || '0')}</div>
                                <button onClick={() => { setModalType('to'); setIsModalOpen(true); }} className="flex items-center gap-2 bg-black hover:bg-white/5 border border-white/10 px-4 py-2 rounded-full transition-all shrink-0">
                                    <img src={toToken.logoURI} className="w-6 h-6 rounded-full" alt="" onError={(e) => e.target.src = 'https://via.placeholder.com/24'} />
                                    <span className="font-bold">{toToken.symbol}</span>
                                    <ArrowDown size={14} className="opacity-50" />
                                </button>
                            </div>
                        </div>

                        {quoteResponse && (
                            <div className="px-6 py-4">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/30 bg-white/5 rounded-lg p-3">
                                    <span>Best Route</span>
                                    <span className={quoteResponse.priceImpactPct > 0.01 ? "text-red-500" : "text-[#3CB371]"}>price impact: {(quoteResponse.priceImpactPct * 100).toFixed(2)}%</span>
                                </div>
                            </div>
                        )}

                        <div className="p-2">
                            <button onClick={handleSwap} disabled={!wallet.connected || !fromAmount || isLoading || !quoteResponse} className={`w-full py-5 rounded-[24px] font-black text-lg uppercase tracking-[0.2em] transition-all shadow-lg overflow-hidden relative group ${!wallet.connected ? 'bg-white/10 text-white/20' : isLoading ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-[#3CB371] text-black hover:shadow-[0_0_50px_rgba(60,179,113,0.4)]'}`}>
                                <span className="relative z-10 flex items-center justify-center gap-3">{!wallet.connected ? 'Connect Wallet' : isLoading ? <Loader2 className="animate-spin" /> : 'Swap Tokens'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0A0A0A] w-full max-w-md h-[70vh] rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-white/5">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-black">Select Token</h2>
                                    <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"><X size={16} /></button>
                                </div>
                                <input autoFocus type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-[#3CB371]" />
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                                {filteredTokens.map((token) => (
                                    <button key={token.address} onClick={() => { if (modalType === 'from') setFromToken(token); else setToToken(token); setIsModalOpen(false); }} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <img src={token.logoURI} className="w-10 h-10 rounded-full bg-white/5" onError={(e) => e.target.src = 'https://via.placeholder.com/40'} />
                                            <div className="text-left">
                                                <div className="font-bold text-sm flex items-center gap-2 group-hover:text-[#3CB371]">{token.symbol} {token.tags?.includes('verified') && <ShieldCheck size={12} className="text-[#3CB371]" />}</div>
                                                <div className="text-[10px] text-white/30">{token.name}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {userBalances[token.address] > 0 && <div className="font-mono text-sm font-bold text-white">{userBalances[token.address].toFixed(4)}</div>}
                                            {tokenPrices[token.address] && <div className="font-mono text-[10px] text-white/50">${parseFloat(tokenPrices[token.address]).toFixed(2)}</div>}
                                            {(modalType === 'from' && fromToken.address === token.address || modalType === 'to' && toToken.address === token.address) && <CheckCircle size={16} className="text-[#3CB371] ml-auto mt-1" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
