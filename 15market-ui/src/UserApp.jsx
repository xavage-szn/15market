import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient } from "wagmi";
import { GlobalTradeScroller } from "./components/GlobalTradeScroller";
import { ProfileModal } from "./components/ProfileModal";
import { PnLModal } from "./components/PnLModal";
import { TransactionReceiptModal } from "./components/TransactionReceiptModal";
import {
  MessageSquare, User, Trophy, Calendar, CheckCircle, ChevronRight,
  Image as ImageIcon, PartyPopper, Settings, LogOut, Coins, Menu, X, Shield, Lock
} from "lucide-react";
import { Stamp } from "./components/Stamp";
import { parseEther, parseUnits, formatUnits } from "viem";
// Solana imports removed
import ArcABI from "./abi/ArcPrediction.json";
import * as ethers from "ethers";
import { publicClient } from "./client";

import { WalletBalance } from "./components/WalletBalance";
import { LandingPage } from "./components/LandingPage";
import { DashboardPage } from "./components/DashboardPage";

import MessagingSystem from "./components/MessagingSystem";
import { ARC_CONTRACT_ADDRESS, ARC_USDC_ADDRESS, KEEPER_URL, KEEPER_URL_ARC, ADMIN_TOKEN, ARC_RPC, ARC_RPC_BACKUP } from "./constants";

import { OnboardingModal } from "./components/OnboardingModal";



// Memoized Sub-components
// Memoized Sub-components
import { TradeTerminal } from "./components/TradeTerminal";
import { LiveExecution } from "./components/LiveExecution";
import { TradeHistory } from "./components/TradeHistory";
import { UnifiedWalletButton } from "./components/UnifiedWalletButton";
import { OrderBook } from "./components/OrderBook";
import { ActiveTradesSidebar } from "./components/ActiveTradesSidebar";
import CustomChart from './components/CustomChart';
import Toast from "./components/Toast";
import { ThemeToggle } from "./components/ThemeToggle";



export default function UserApp() {
  const { data: walletClient } = useWalletClient();
  const [price, setPrice] = useState("0.00");
  const staticPriceFails = useRef(0);
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  // const [balance, setBalance] = useState(0); // Removed in favor of evmBalance/sessionBalance logic
  const [direction, setDirection] = useState(null);
  const [tradeHistory, setTradeHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_history_v1");
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [timerActive, setTimerActive] = useState(false);
  const [duration, setDuration] = useState(15);
  const [timeLeft, setTimeLeft] = useState(15);
  const [activeTrades, setActiveTrades] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_history_v1");
      return saved ? JSON.parse(saved).filter(t => ["PENDING", "RESOLVING"].includes(t.status)) : [];
    } catch (e) { return []; }
  }); // Array of active trades
  const activeTrade = activeTrades[0] || null; // For backward compatibility in some components
  const [isLoading, setIsLoading] = useState(true);
  const loadingTimeoutRef = useRef(null);
  const lastTradeTimeRef = useRef(0);

  // Safety Timeout: Ensure app always loads even if price feed is slow
  useEffect(() => {
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.warn("⚠️ Price feed sync taking too long, entering fallback load state...");
        setIsLoading(false);
      }
    }, 5000); // 5 seconds max loading
    return () => clearTimeout(loadingTimeoutRef.current);
  }, [isLoading]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false); // SITE IS OPEN BY DEFAULT
  const [transactionHistory, setTransactionHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_transactions_v1");
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      // Filter out invalid items to prevent rendering crashes
      return parsed.filter(tx =>
        tx &&
        typeof tx === 'object' &&
        (typeof tx.amount === 'string' || typeof tx.amount === 'number')
      );
    } catch (e) { return []; }
  });
  const [isPnLOpen, setIsPnLOpen] = useState(false);
  const [selectedPnLTrade, setSelectedPnLTrade] = useState(null);
  const [isTransactionReceiptOpen, setIsTransactionReceiptOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [view, setView] = useState("trading"); // "trading", "dashboard", or "history"

  const [campaigns, setCampaigns] = useState([]);
  const [winnerBanner, setWinnerBanner] = useState(null);
  const [enrollments, setEnrollments] = useState({}); // { campaignId: boolean }
  const [userLocation, setUserLocation] = useState(null); // { country, countryCode, lat, lng }

  // Main Network State
  const [network, setNetwork] = useState("arc");
  const [theme, setTheme] = useState(() => localStorage.getItem("15market_theme") || "dark");
  const [uiVersion, setUiVersion] = useState(() => localStorage.getItem("15market_ui_version") || "v1"); // "v1" or "v2"

  useEffect(() => {
    localStorage.setItem("15market_ui_version", uiVersion);
  }, [uiVersion]);

  // Apply theme to html and body elements
  useEffect(() => {
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    const rootElement = document.getElementById('root');

    if (theme === 'light') {
      htmlElement.classList.add('light');
      bodyElement.classList.add('light');
      if (rootElement) rootElement.classList.add('light');
    } else {
      htmlElement.classList.remove('light');
      bodyElement.classList.remove('light');
      if (rootElement) rootElement.classList.remove('light');
    }

    // Apply network-specific theme class
    if (network === 'arc') {
      htmlElement.classList.add('theme-arc');
      bodyElement.classList.add('theme-arc');
      if (rootElement) rootElement.classList.add('theme-arc');
    } else {
      htmlElement.classList.remove('theme-arc');
      bodyElement.classList.remove('theme-arc');
      if (rootElement) rootElement.classList.remove('theme-arc');
    }

    localStorage.setItem("15market_theme", theme);
  }, [theme, network]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const { isConnected, address } = useAccount();

  // Debug connection state transitions
  useEffect(() => {
    if (isConnected) {
      console.log("🔐 [AUTH STATE] Wallet Connected", {
        isConnected,
        address
      });
    }
  }, [isConnected, address]);

  const [evmBalance, setEvmBalance] = useState("0");
  const [pendingStakes, setPendingStakes] = useState({}); // Tracking hash -> amount
  const [sessionMode, setSessionMode] = useState(false);
  const [evmSessionWallet, setEvmSessionWallet] = useState(null);
  const [sessionBalance, setSessionBalance] = useState(0);
  const [refillAmount, setRefillAmount] = useState("0.1");
  const [isSessionSynced, setIsSessionSynced] = useState(() => localStorage.getItem("15market_session_synced") === "true");
  const [isSignerInitializing, setIsSignerInitializing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [toast, setToast] = useState(null); // { message, type }
  const resolvingInProgress = useRef(new Set()); // Tracks IDs of trades currently being resolved
  const lastSettlementCreditTime = useRef(0); // Cooldown: prevents polling from overwriting optimistic balance credits

  // Custom balance fetcher (Replaces Wagmi useBalance)
  // 1. Core Balance Fetchers
  const refetchEvmBalance = useCallback(async (force = false) => {
    if (!address) return;

    try {
      const b = await publicClient.getBalance({ address });
      const formatted = formatUnits(b, 18);
      if (formatted !== evmBalance) setEvmBalance(formatted);
    } catch (e) { }
  }, [address, evmBalance]);

  const updateEvmSessionBal = useCallback(async (force = false) => {
    if (!evmSessionWallet) return;

    // COOLDOWN: Don't overwrite optimistic balance with stale on-chain data
    // during the 12s window after a settlement credit was applied.
    // This prevents the "flash" where winnings appear then vanish before on-chain confirms.
    const msSinceLastCredit = Date.now() - lastSettlementCreditTime.current;
    if (!force && msSinceLastCredit < 12000) {
      console.log(`⏳ [SESSION_BAL] Skipping poll — settlement cooldown active (${Math.round(msSinceLastCredit / 1000)}s/12s)`);
      return;
    }

    try {
      const balanceWei = await publicClient.getBalance({ address: evmSessionWallet.address });
      const bal = parseFloat(formatUnits(balanceWei, 18));
      if (bal !== sessionBalance) {
        setSessionBalance(bal);
        console.log(`💰 [SESSION_BAL] On-chain balance: ${bal.toFixed(4)} USDC`);
      }
    } catch (err) { }
  }, [evmSessionWallet, sessionBalance]);

  const triggerGlobalRefresh = useCallback((force = false) => {
    refetchEvmBalance(force);
    updateEvmSessionBal(force);
  }, [refetchEvmBalance, updateEvmSessionBal]);

  // 2. Authoritative Profile & History Sync
  // 2. Authoritative Profile & History Sync (Unified Reconciler)
  const reconcileTrades = useCallback((backendAllRaw) => {
    if (!backendAllRaw) return;

    // 1. Normalize backend trades
    const backendAll = backendAllRaw.map(t => ({
      ...t,
      direction: (t.direction === 1 || String(t.direction) === "1" || t.direction === "UP" || t.direction === "buy") ? "UP" : "DOWN",
      status: t.status || (t.settled ? (t.won ? "WON" : "LOST") : "PENDING"),
      owner: t.owner || t.user || t.userPublicKey || t.userAddress
    }));

    // 2. Reactive Balance Sync: If any trade settled since last view, force refresh
    setActiveTrades(prev => {
      const hasSettled = backendAll.some(bt =>
        bt.status !== "PENDING" && bt.status !== "RESOLVING" &&
        prev.some(p => String(p.id || p.tx || p.nonce) === String(bt.id || bt.tx || bt.nonce) && (p.status === "PENDING" || p.status === "RESOLVING"))
      );
      if (hasSettled) {
        console.log("💰 [BALANCE] Settlement detected. Refetching...");
        triggerGlobalRefresh(true);
        setTimeout(() => triggerGlobalRefresh(true), 1500); // 2nd pass for RPC safety
      }
      return prev;
    });

    // 3. Update History (Dedupe & Merge)
    setTradeHistory(prev => {
      const merged = [...backendAll];
      const now = Date.now();
      const FIFTEEN_MINS = 15 * 60 * 1000;

      prev.forEach(local => {
        const localId = String(local.id || local.tx || local.nonce);
        const matchIdx = merged.findIndex(m => String(m.id || m.tx || m.nonce) === localId);

        if (matchIdx !== -1) {
          // Preserve local-only flags that backend doesn't know about
          const preservedFields = {};
          if (local.balanceApplied) preservedFields.balanceApplied = true;
          if (local.isSessionTrade !== undefined) preservedFields.isSessionTrade = local.isSessionTrade;
          if (local.optimistic) preservedFields.optimistic = true;

          // Keep internal "RESOLVING" status if backend is still PENDING
          if (merged[matchIdx].status === "PENDING" && local.status === "RESOLVING") {
            merged[matchIdx] = { ...merged[matchIdx], ...preservedFields, status: "RESOLVING" };
          } else {
            merged[matchIdx] = { ...merged[matchIdx], ...preservedFields };
          }
        } else {
          // Not in backend, keep local if fresh
          const localTime = (local.timestamp || local.startTime || now);
          const normLocal = localTime > 1000000000000 ? localTime : localTime * 1000;
          const isFresh = (now - normLocal) < FIFTEEN_MINS;
          if (local.status === "PENDING" ? isFresh : true) {
            merged.push(local);
          }
        }
      });

      const sorted = merged.sort((a, b) => {
        const timeA = (a.timestamp || a.startTime || 0);
        const timeB = (b.timestamp || b.startTime || 0);
        const normA = timeA > 1000000000000 ? timeA : timeA * 1000;
        const normB = timeB > 1000000000000 ? timeB : timeB * 1000;
        return normB - normA;
      });
      return sorted.slice(0, 100);
    });

    // 4. Update Active Trades (Monotonic Status)
    setActiveTrades(prev => {
      const now = Date.now();
      const GHOST_GRACE = 5000;

      const backendActive = backendAll.filter(t => ["PENDING", "RESOLVING"].includes(t.status)).map(t => {
        const startTime = (t.timestamp || t.startTime || now);
        const normStart = startTime > 1000000000000 ? startTime : startTime * 1000;
        const expiryMs = t.expiryMs || (normStart + (t.duration * 1000));
        return { ...t, startTime: normStart, expiryMs };
      });

      const updatedActive = [];

      backendActive.forEach(bt => {
        const local = prev.find(p => String(p.id || p.tx || p.nonce) === String(bt.id || bt.tx || bt.nonce));
        let finalStatus = bt.status;
        if (local && local.status === "RESOLVING" && bt.status === "PENDING") {
          finalStatus = "RESOLVING";
        }
        if (now <= (bt.expiryMs + GHOST_GRACE)) {
          updatedActive.push({ ...bt, status: finalStatus });
        }
      });

      prev.forEach(local => {
        const localId = String(local.id || local.tx || local.nonce);
        if (!updatedActive.find(u => String(u.id || u.tx || u.nonce) === localId)) {
          const normExp = local.expiryMs || ((local.timestamp || local.startTime || now) + (local.duration * 1000));
          if (local.status === "PENDING" && now <= (normExp + GHOST_GRACE)) {
            updatedActive.push({ ...local, expiryMs: normExp });
          }
        }
      });

      const seen = new Set();
      return updatedActive.filter(t => {
        const mid = String(t.id || t.tx || t.nonce);
        if (seen.has(mid)) return false;
        seen.add(mid);
        return true;
      });
    });
  }, [triggerGlobalRefresh]);

  const fetchMyProfile = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${KEEPER_URL_ARC}/profile?address=${address}`);
      if (res.ok) {
        const userData = await res.json();
        const { profile, history, transactions } = userData;
        if (profile) {
          setUserProfile(profile);
          setShowOnboarding(false);
          localStorage.setItem(`15market_profile_${address.toLowerCase()}`, JSON.stringify(profile));
        }
        if (history) reconcileTrades(history);
        if (transactions) setTransactionHistory(transactions);
      }
    } catch (e) { } finally { setProfileChecked(true); }
  }, [address, reconcileTrades]);

  // 3. Aggressive Logic
  const aggressiveRefresh = useCallback(() => {
    triggerGlobalRefresh(true);
    [100, 500, 1500, 3000, 6000, 12000].forEach(delay => setTimeout(() => triggerGlobalRefresh(true), delay));
    [2000, 8000].forEach(delay => setTimeout(fetchMyProfile, delay));
  }, [triggerGlobalRefresh, fetchMyProfile]);

  // 4. Derived State
  const displayEvmBalance = useMemo(() => {
    let bal = parseFloat(evmBalance || "0");
    if (isNaN(bal)) bal = 0;
    Object.values(pendingStakes || {}).forEach(amt => { bal -= (amt || 0); });
    return Math.max(0, bal);
  }, [evmBalance, pendingStakes]);

  const balance = useMemo(() => parseFloat(displayEvmBalance || "0"), [displayEvmBalance]);

  // 5. Lifecycle Effects
  useEffect(() => {
    if (address) triggerGlobalRefresh(true);
  }, [address, triggerGlobalRefresh]);


  // Periodic Universal Sync (Fix for Cross-Device Inconsistency)
  useEffect(() => {
    if (address) {
      const interval = setInterval(() => {
        triggerGlobalRefresh(false);
        fetchMyProfile(); // Also refresh profile to catch session address updates from other devices
      }, 2500); // 2.5s for faster cross-device sync
      return () => clearInterval(interval);
    }
  }, [address, triggerGlobalRefresh, fetchMyProfile]);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  // Compatibility wrapper for legacy setBalance calls
  const setBalance = useCallback((val) => {
    if (typeof val === 'function') {
      setEvmBalance(prev => {
        const num = parseFloat(prev || "0");
        return val(num).toString();
      });
    } else {
      setEvmBalance(val.toString());
    }
  }, []);

  // Network Detection
  const [chainId, setChainId] = useState(null);
  useEffect(() => {
    const checkChain = async () => {
      try {
        const id = await publicClient.getChainId();
        setChainId(id);
      } catch (e) { }
    };
    checkChain();
  }, []);

  // Sticky Authentication: Prevent flicker on sync or chain switch
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    if (isConnected) {
      setAuthenticated(true);
    } else {
      const timer = setTimeout(() => setAuthenticated(false), 2000); // 2s grace
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  const wallet = useMemo(() => {
    if (!isConnected || !address) return { connected: false };

    return {
      connected: true,
      address: address,
      publicKey: null
    };
  }, [isConnected, address]);

  const login = () => {
    console.log("Connect via wallet button");
  };

  const user = useMemo(() => {
    if (isConnected && address) return { wallet: { address } };
    return null;
  }, [isConnected, address]);

  const GREEN = "#3CB371";
  const CORAL = "#FF4444";

  useEffect(() => {
    localStorage.setItem("15market_network", "arc");
  }, []);

  const themeClass = "theme-arc";



  // Initialize Server-Side Session Wallet (Stateless & Secure)
  const initializeSessionWallet = useCallback(async () => {
    if (!address || !walletClient) {
      notify("Connect your main wallet first", "error");
      return;
    }

    try {
      setIsExecuting(true);
      notify("Authorizing Auto-Signer...", "info");

      // 1. Sign Auth Message (Identity Proof)
      // This signature can be verified by backend if needed, but the backend derives wallet 
      // primarily from the user address to ensure cross-device consistency.
      const message = `Authorize 15market Auto-Signer for ${address.toLowerCase()}`;
      const sig = await walletClient.signMessage({ message, account: address });

      // 2. Request Session Wallet from Backend
      const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature: sig })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Backend init failed");
      }

      const data = await res.json();

      // 3. Update State (No Private Keys on Device!)
      const sessionObj = { address: data.sessionAddress, isRemote: true };
      setEvmSessionWallet(sessionObj);
      setSessionBalance(parseFloat(data.balance));
      setIsSessionSynced(true);
      setSessionMode(true);

      // Persist public info only
      localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);

      // Update Profile Sync
      if (userProfile) {
        const updatedProfile = { ...userProfile, sessionWalletAddress: data.sessionAddress };
        setUserProfile(updatedProfile);
        fetch(`${KEEPER_URL_ARC}/sync-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, profile: updatedProfile })
        }).catch(e => console.warn("Failed to sync session wallet to backend:", e));
      }

      setIsSignerInitializing(false);
      notify("Auto-Signer Activated (Server-Managed)", "success");

    } catch (err) {
      console.error("Session init error:", err);
      notify("Setup failed: " + (err.message), "error");
      setSessionMode(false);
    } finally {
      setIsExecuting(false);
    }
  }, [address, walletClient, notify, userProfile]);

  const toggleSessionMode = () => {
    if (sessionMode) {
      setSessionMode(false);
      notify("Switched to Main Wallet", "info");
    } else {
      // Trying to ENABLE
      // If we have an address in state or local storage, use it. Otherwise init.
      const storedAddr = localStorage.getItem(`15market_session_addr_${address?.toLowerCase()}`);
      if (evmSessionWallet?.address || storedAddr) {
        if (!evmSessionWallet) {
          // Restore object from storage
          setEvmSessionWallet({ address: storedAddr, isRemote: true });
          // Balance will update via poll
        }
        setSessionMode(true);
        notify("Auto-Signer Activated", "success");
      } else {
        // Need to initialize
        initializeSessionWallet();
      }
    }
  };

  // 15MARKET REVENUE TRACKER (Auto-Signer Fees)
  const [autoSignerFees, setAutoSignerFees] = useState(() => {
    const saved = localStorage.getItem("15market_autosigner_fees");
    return saved ? JSON.parse(saved) : { arc: 0 };
  });

  // Fetch Treasury (Contract) Balance
  useEffect(() => {
    const fetchTreasury = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC);
        const bal = await provider.getBalance(ARC_CONTRACT_ADDRESS);
        setTreasuryBalance(parseFloat(ethers.formatEther(bal)));
      } catch (e) { }
    };
    fetchTreasury();
    // ... existing ...
  }, []); // Keeping original dep array

  // Execute trade
  const executeTrade = async () => {
    if (isExecuting) return;

    if (platformSettings.tradingHalted) {
      return notify("TRADING HALTED BY ADMIN - Operations Paused", "error");
    }

    let activePrice = parseFloat(price);
    if (!activePrice || activePrice <= 0) return;
    if (!direction) return notify("Select UP or DOWN first", "error");
    if (!amount || parseFloat(amount) <= 0) return notify("Enter a valid amount", "error");

    const currentBal = sessionMode ? sessionBalance : balance;
    if (parseFloat(amount) > currentBal) {
      return notify(`Insufficient ${network === 'arc' ? 'USDC' : 'SOL'}. Balance: ${currentBal.toFixed(3)}`, "error");
    }

    if (Number(amount) < parseFloat(minStake)) {
      return notify(`Min trade: ${minStake} ${network === 'arc' ? 'USDC' : 'SOL'}`, "error");
    }

    setIsExecuting(true);
    let txHash;
    // Generate truly unique bet ID
    const addressSuffix = address ? parseInt(address.slice(-4), 16) : 0;
    const tradeId = Date.now() * 1000 + Math.floor(Math.random() * 1000000) + addressSuffix;
    const dirVal = (direction === "buy" || direction === "UP") ? 1 : 0;
    const entryPriceParams = Math.floor(activePrice * 100000000);
    const ASSET_ID_MAP = { 'eth': 0, 'btc': 1, 'sol': 2, 'mon': 3, 'jup': 4, 'xrp': 5 }; // Synchronized with backend
    const assetId = ASSET_ID_MAP[activeMarket?.id?.toLowerCase()] || 0;

    try {
      if (!isConnected) {
        notify("Please connect wallet first", "error");
        setIsExecuting(false);
        return;
      }

      const amountWei = parseUnits(parseFloat(amount).toFixed(18), 18);

      if (sessionMode) {
        // SESSION MODE: Always use auto-signer, never fall through to main wallet
        if (sessionBalance < (Number(amount) + 0.005)) {
          notify(`Insufficient Auto-Signer balance. You have ${sessionBalance.toFixed(3)} USDC. Deposit more or switch to Main Wallet.`, "error");
          setIsExecuting(false);
          return;
        }

        console.log("✅ [TRADE] Using REMOTE AUTO-SIGNER — payout stays in session wallet");
        notify(`Auto-signing via Cloud...`, "success");

        const res = await fetch(`${KEEPER_URL_ARC}/session/trade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address,
            tradeParams: {
              id: tradeId.toString(),
              direction: dirVal,
              duration: Number(duration),
              entryPrice: entryPriceParams.toString(),
              marketId: assetId,
              amount: amount
            }
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Auto-Signer trade failed");
        }

        const data = await res.json();
        txHash = data.txHash;
        console.log("📤 [TRADE] Remote tx SENT:", txHash, "Payout to session wallet:", data.sessionAddress || evmSessionWallet?.address);

      } else {
        // MAIN WALLET MODE: User directly signs, payout goes to main wallet
        console.log("📝 [TRADE] Using MAIN WALLET");
        notify(`Confirm on Arc...`, "success");

        if (!walletClient) throw new Error("Wallet not connected");

        const hash = await walletClient.writeContract({
          address: ARC_CONTRACT_ADDRESS,
          abi: ArcABI.abi,
          functionName: 'placeBet',
          args: [BigInt(tradeId), Number(dirVal), BigInt(duration), BigInt(entryPriceParams), Number(assetId), address],
          value: amountWei,
          account: address,
          gas: 800000n
        });

        txHash = hash;
        console.log("📤 [TRADE] Main wallet tx SENT:", txHash);

        // Optimistic pending stake
        setPendingStakes(prev => ({ ...prev, [hash]: parseFloat(amount) }));

        // Background Wait
        publicClient.waitForTransactionReceipt({ hash }).then(receipt => {
          console.log("✅ [TRADE] Confirmed:", receipt.transactionHash);
          setPendingStakes(prev => {
            const next = { ...prev };
            delete next[hash];
            return next;
          });
          setTimeout(refetchEvmBalance, 1000);
        });
      }

      // --- Common Post-Trade Logic ---
      notify(`Arc Trade Executed!`, "success");

      if (sessionMode) {
        // Optimistic Balance Update
        const feePercent = 0.001;
        const signerFee = Number(amount) * feePercent;
        setSessionBalance(prev => Math.max(0, prev - parseFloat(amount) - signerFee));
      }

      lastTradeTimeRef.current = Date.now();

      // CRITICAL: If sessionMode is true, ALWAYS use session wallet. If it's null, we shouldn't be here (caught above), but we force it to ensure no payout goes to main by accident.
      const activeUserAddr = (sessionMode) ? (evmSessionWallet?.address) : address;

      const now = Date.now();
      const expiryMs = now + (duration * 1000);

      const newTrade = {
        id: tradeId,
        direction: (dirVal === 1 ? "UP" : "DOWN"),
        amount: Number(amount).toFixed(3),
        entryPrice: activePrice.toFixed(3),
        timestamp: now,
        status: "PENDING",
        tx: txHash,
        nonce: tradeId,
        userPublicKey: activeUserAddr,
        owner: activeUserAddr,
        duration,
        network: "arc",
        startTime: now,
        expiryMs: expiryMs,
        symbol: activeMarket?.symbol || 'ETH',
        isSessionTrade: sessionMode, // Track which wallet mode placed this trade
      };

      // Helper to prevent dupes
      const dedupeAndAdd = (prev, item) => {
        const filtered = prev.filter(t => (t.id || t.tx || t.nonce) !== (item.id || item.tx || item.nonce));
        return [item, ...filtered];
      };

      setActiveTrades(prev => dedupeAndAdd(prev, newTrade));
      setTradeHistory(prev => dedupeAndAdd(prev, newTrade));

      // Register with Backend immediately (Ping)
      fetch(`${KEEPER_URL_ARC}/trade-ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tradeId,
          address: activeUserAddr, // associate with the wallet that made the trade
          amount: Number(amount).toFixed(3),
          direction: dirVal,
          duration,
          entryPrice: activePrice.toFixed(3),
          symbol: activeMarket?.symbol || 'ETH',
          network: 'arc',
          expiryMs: expiryMs
        })
      }).catch(e => console.warn("Trade ping failed:", e));

      // Transaction History
      const newTx = {
        id: `trade_${tradeId}`,
        type: 'TRADE',
        amount: Number(amount).toFixed(3),
        timestamp: Date.now(),
        hash: txHash,
        status: 'PENDING'
      };
      setTransactionHistory(prev => [newTx, ...prev]);

    } catch (err) {
      console.error("Execute Trade Error:", err);
      notify("Trade Failed: " + (err.shortMessage || err.message), "error");
    } finally {
      setIsExecuting(false);
    }
  };

  const [platformSettings, setPlatformSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_citadel_settings");
      return saved ? JSON.parse(saved) : { minBet: 1.0, maxBet: 1000000.0, maintenanceMode: false, tradingHalted: false };
    } catch (e) { return { minBet: 1.0, maxBet: 1000000.0, maintenanceMode: false, tradingHalted: false }; }
  });

  // Sync settings across tabs and periodically
  useEffect(() => {
    const syncSettings = () => {
      try {
        const loaded = JSON.parse(localStorage.getItem('15market_citadel_settings'));
        if (loaded) setPlatformSettings(loaded);
      } catch (e) { }
    };
    window.addEventListener('storage', syncSettings);
    const interval = setInterval(syncSettings, 1000);
    return () => {
      window.removeEventListener('storage', syncSettings);
      clearInterval(interval);
    };
  }, []);

  // Sync settings with Backend (Keeper)
  useEffect(() => {
    const fetchRemoteSettings = async () => {
      try {
        const primaryUrl = KEEPER_URL_ARC;
        let res = await fetch(`${primaryUrl}/settings`);

        if (res && res.ok) {
          const remoteSettings = await res.json();
          console.log("📡 [SETTINGS_SYNC] Received remote settings:", remoteSettings);
          // Update local state if different
          if (JSON.stringify(remoteSettings) !== JSON.stringify(platformSettings)) {
            setPlatformSettings(remoteSettings);
            localStorage.setItem('15market_citadel_settings', JSON.stringify(remoteSettings));
            // Dispatch event for other components listening to storage
            window.dispatchEvent(new Event('storage'));
          }
        } else {
          console.warn(`⚠️ [SETTINGS_SYNC] Failed fetch from both keepers. Status: ${res?.status}`);
        }
      } catch (e) {
        console.warn("Settings sync failed:", e);
      }
    };

    fetchRemoteSettings(); // Initial fetch
    const settingsInterval = setInterval(fetchRemoteSettings, 2000); // Poll every 2s for instant updates
    return () => clearInterval(settingsInterval);
  }, []);

  useEffect(() => {
    localStorage.setItem("15market_citadel_settings", JSON.stringify(platformSettings));
  }, [platformSettings]);

  // Fetch and Index Trade History
  useEffect(() => {
    if (!address || !isConnected) {
      setTradeHistory([]);
      return;
    }

    const fetchTradeHistory = async () => {
      try {
        const addr = address.toLowerCase();
        const res = await fetch(`${KEEPER_URL_ARC}/trades/${addr}`);
        if (res.ok) {
          const backendAllRaw = await res.json();
          reconcileTrades(backendAllRaw);
        }
      } catch (e) {
        console.error("Failed to fetch trade history:", e);
      }
    };

    fetchTradeHistory();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchTradeHistory, 5000);
    return () => clearInterval(interval);
  }, [address, isConnected, network, evmSessionWallet, userProfile?.sessionWalletAddress]);

  useEffect(() => {
    localStorage.setItem("15market_autosigner_fees", JSON.stringify(autoSignerFees));
  }, [autoSignerFees]);

  const recordFee = async (network, amount) => {
    // 1. Update local state for instant UI feedback
    setAutoSignerFees(prev => ({
      ...prev,
      arc: prev.arc + amount
    }));

    // 2. Persist to Keeper Backend
    const targetUrl = KEEPER_URL_ARC;
    try {
      await fetch(`${targetUrl}/record-fee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ADMIN_TOKEN
        },
        body: JSON.stringify({ network: 'arc', amount })
      });
    } catch (e) {
      console.error("Failed to sync fee with keeper:", e);
    }
  };



  const navigate = useNavigate();


  useEffect(() => {
    // Session persistence handled by Reown/Wagmi
  }, []);
  // Run once on mount

  // Auto-Switch logic removed 


  // Force Chain Switch when network state changes to 'arc'


  // Debug logging for connection issues
  useEffect(() => {
    if (isConnected) {
      // console.log(`Connected`);
    }
  }, [isConnected, address]);

  // Dynamic Market State


  const [activeMarket, setActiveMarket] = useState(() => {
    const defaultTokens = [
      { id: 'eth', symbol: 'ETH', name: 'Ethereum', pair: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', pythId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT', kraken: 'ETHUSD' },
      { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pair: '0xCBCdAf43E4E8BA277685D62aA137BA4904f421ac', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT', kraken: 'XBTUSD' },
      { id: 'sol', symbol: 'SOL', name: 'Solana', pair: '0x127452f3f1da03d95f9bbd58a2d10c1154b33001', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT', kraken: 'SOLUSD' },
      { id: 'mon', symbol: 'MON', name: 'Monad', pythId: '0x0000000000000000000000000000000000000000000000000000000000000000', binance: 'MONUSDT' },
    ];

    const saved = localStorage.getItem('15market_listed_tokens');
    const listed = saved ? JSON.parse(saved) : defaultTokens;

    const activeId = localStorage.getItem('15market_active_token_id') || 'eth';
    return listed.find(t => t.id === activeId) || listed[0];
  });

  // Shared Price Fetch Logic
  const priceRef = useRef(price);
  useEffect(() => { priceRef.current = price; }, [price]);

  const fetchCurrentPrice = useCallback(async () => {
    try {
      const sources = [];

      // 1. Pyth Sources (Multiple Hermes endpoints for redundancy)
      if (activeMarket.pythId) {
        const fullPythId = activeMarket.pythId.startsWith('0x') ? activeMarket.pythId : `0x${activeMarket.pythId}`;

        // Hermes v2 expects ids[] array syntax and full 0x hex
        sources.push({
          name: "pyth",
          url: `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${fullPythId}`,
          parse: d => {
            const p = d.parsed?.[0]?.price;
            return p ? parseFloat(p.price) * Math.pow(10, p.expo) : null;
          }
        });

        sources.push({
          name: "pyth-bench",
          url: `https://benchmarks.pyth.network/v1/updates/price/latest?ids[]=${fullPythId}`,
          parse: d => {
            const p = d.parsed?.[0]?.price;
            return p ? parseFloat(p.price) * Math.pow(10, p.expo) : null;
          }
        });
      }

      // 2. MEXC Source (Proxied)
      if (activeMarket.binance) {
        sources.push({ name: "mexc", url: `/api-mexc/api/v3/ticker/price?symbol=${activeMarket.binance}`, parse: d => parseFloat(d.price) });
      }

      // 3. Kraken Source (Direct API - no proxy needed, no geo-restrictions)
      if (activeMarket.kraken) {
        sources.push({
          name: "kraken",
          url: `https://api.kraken.com/0/public/Ticker?pair=${activeMarket.kraken}`,
          parse: d => {
            const k = Object.keys(d.result || {})[0];
            return k ? parseFloat(d.result[k].c[0]) : null;
          }
        });
      }

      // If no secondary sources, we might need a DEX fallback or DexScreener
      if (sources.length === 0 && activeMarket.mint) {
        sources.push({
          name: "jup",
          url: `https://price.jup.ag/v4/price?ids=${activeMarket.mint}`,
          parse: d => d.data[activeMarket.mint]?.price
        });
      }

      if (sources.length === 0) return null;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const pricePromises = sources.map(async (src) => {
        try {
          const res = await fetch(src.url, {
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' }
          });
          const data = await res.json();
          const val = src.parse(data);
          if (!val || isNaN(val)) throw new Error("Invalid");
          return val;
        } catch (e) { throw e; }
      });

      const fastestPrice = await Promise.any(pricePromises);
      clearTimeout(timeoutId);

      if (fastestPrice > 0) {
        setPrice(fastestPrice.toFixed(4));
        setIsLoading(false);
        return fastestPrice;
      }
    } catch (err) {
      // Don't let total API failure block the UI forever
      staticPriceFails.current = (staticPriceFails.current || 0) + 1;
      if (staticPriceFails.current > 3) setIsLoading(false);
    }
    return null;
  }, [activeMarket]);

  useEffect(() => {
    let active = true;
    const loop = async () => {
      if (!active) return;
      await fetchCurrentPrice();
      if (active) setTimeout(loop, 300);
    };
    loop();
    return () => { active = false; };
  }, [fetchCurrentPrice]);

  // Sync Market Changes (Across Ports via Keeper)
  useEffect(() => {
    const syncMarket = async () => {
      try {
        const targetUrl = KEEPER_URL_ARC;
        // 1. Fetch Remote Listings from Keeper (Source of Truth)
        const res = await fetch(`${targetUrl}/listings`);
        const remoteListings = await res.json();

        if (Array.isArray(remoteListings) && remoteListings.length > 0) {
          const currentListedStr = localStorage.getItem('15market_listed_tokens');
          const remoteStr = JSON.stringify(remoteListings);

          if (currentListedStr !== remoteStr) {
            console.log(`🔄 Market listings updated from Arc Keeper.`);
            localStorage.setItem('15market_listed_tokens', remoteStr);
          }
        }

        // 2. Fetch Remote Active Market (LIVE SYNC)
        const activeRes = await fetch(`${targetUrl}/active-market`);
        const activeData = await activeRes.json();
        if (activeData && activeData.activeId) {
          const currentLocalActiveId = localStorage.getItem('15market_active_token_id');
          if (currentLocalActiveId !== activeData.activeId) {
            console.log(`🎯 Syncing with LIVE active market: ${activeData.activeId}`);
            localStorage.setItem('15market_active_token_id', activeData.activeId);
          }
        }

        // 3. Fetch Remote Platform Settings
        const settingsRes = await fetch(`${targetUrl}/settings`);
        const settingsData = await settingsRes.json();
        if (settingsData) {
          const settingsStr = JSON.stringify(settingsData);
          if (localStorage.getItem('15market_citadel_settings') !== settingsStr) {
            console.log(`🛡️ Syncing platform settings from Arc Keeper.`);
            setPlatformSettings(settingsData);
          }
        }
      } catch (e) {
        // Fallback to local storage if keeper is down
      }

      const listed = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
      const activeId = localStorage.getItem('15market_active_token_id') || 'eth'; // Default to ETH
      const market = listed.find(t => t.id === activeId);

      if (market) {
        // Safety: Ensure binance symbol exists for chart
        if (!market.binance) {
          market.binance = `${market.symbol}USDT`;
        }

        if (market.id !== activeMarket.id) {
          console.log(`🎯 Switching UI to market: ${market.symbol}`);
          setActiveMarket(market);
          setTimeout(() => fetchCurrentPrice(), 50);
        }
      }
    };

    // Initial sync on mount
    syncMarket();

    // Listen for storage events (triggered by CustomChart when user selects asset)
    window.addEventListener('storage', syncMarket);

    // Polling fallback for remote updates (increased from 2s to 5s)
    const poller = setInterval(syncMarket, 5000);

    return () => {
      window.removeEventListener('storage', syncMarket);
      clearInterval(poller);
    };
  }, [activeMarket.id, network]);

  // Handle market changes from UI (persist to localStorage and sync with keeper)
  const handleMarketChange = useCallback(async (newMarket) => {
    if (!newMarket || newMarket.id === activeMarket.id) return;

    console.log(`🎯 User switched market to: ${newMarket.symbol}`);
    localStorage.setItem('15market_active_token_id', newMarket.id);
    setActiveMarket(newMarket);

    // Sync with keeper
    try {
      await fetch(`${KEEPER_URL_ARC}/active-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeId: newMarket.id })
      });
    } catch (e) {
      console.warn('Failed to sync market change with keeper:', e.message);
    }

    // Trigger price fetch for new market
    setTimeout(() => fetchCurrentPrice(), 100);
  }, [activeMarket.id, fetchCurrentPrice]);

  const fetchCampaigns = useCallback(async () => {
    try {
      const targetUrl = KEEPER_URL_ARC;
      const res = await fetch(`${targetUrl}/campaigns`);
      if (!res.ok) return;
      const data = await res.json();
      setCampaigns(data);

      if (address && data.length > 0) {
        // Check enrollments for all active campaigns
        const active = data.filter(c => Date.now() < c.endTime);
        const newEnrollments = { ...enrollments };
        let changed = false;

        for (const c of active) {
          if (newEnrollments[c.id] === undefined) {
            const eRes = await fetch(`${KEEPER_URL_ARC}/enroll?campaignId=${c.id}&address=${address}`);
            if (eRes.ok) {
              const eData = await eRes.json();
              newEnrollments[c.id] = eData.enrolled;
              changed = true;
            }
          }
        }
        if (changed) setEnrollments(newEnrollments);
      }
    } catch (e) { }
  }, [address, enrollments]);

  useEffect(() => {
    const detectLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        setUserLocation({
          country: data.country_name,
          countryCode: data.country_code,
          lat: data.latitude,
          lng: data.longitude
        });
      } catch (e) {
        // Fallback or ignore
        console.warn("Location detection failed", e);
      }
    };
    detectLocation();
  }, []);

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 10000);
    return () => clearInterval(interval);
  }, [fetchCampaigns]);

  const handleEnroll = async (campaignId) => {
    if (!address) {
      notify("Please connect wallet to enroll", "error");
      return;
    }
    try {
      const res = await fetch(`${KEEPER_URL_ARC}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, address })
      });
      if (res.ok) {
        setEnrollments(prev => ({ ...prev, [campaignId]: true }));
        notify("Successfully enrolled in campaign!", "success");
      }
    } catch (e) { notify("Enrollment failed", "error"); }
  };

  const minStake = useMemo(() => {
    return "0.1"; // 0.1 USDC min stake on Arc
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem("15market_history_v1", JSON.stringify(tradeHistory));
  }, [tradeHistory]);



  // Startup Cleanup: Purge ghost trades
  useEffect(() => {
    const now = Date.now();
    setTradeHistory(prev => {
      let changed = false;
      const updated = prev.map(t => {
        if (["PENDING", "RESOLVING"].includes(t.status)) {
          const start = t.startTime || (t.nonce > 1000000000000 ? t.nonce : Math.floor(t.nonce / 100) * 1000);
          const expiry = start + ((t.duration || 15) * 1000);
          if (now > expiry + 60000) { // If it expired more than 60s ago
            changed = true;
            return { ...t, status: "TIMEOUT" };
          }
        }
        return t;
      });
      return changed ? updated : prev;
    });
    // Also clean active trades
    setActiveTrades(prev => prev.filter(t => {
      const expiry = (t.nonce || 0) + ((t.duration || 15) * 1000);
      return now < expiry + 60000;
    }));
  }, []);

  // Session Wallet - RESTORE STATE ONLY (No Auto-Enable)
  // We only load the address so it's ready if they toggle it on.
  useEffect(() => {
    if (!address) return;

    // Reset mode to false on wallet change/connect to ensure opt-in
    setSessionMode(false);

    const storedAddr = localStorage.getItem(`15market_session_addr_${address.toLowerCase()}`);
    if (storedAddr) {
      setEvmSessionWallet({ address: storedAddr, isRemote: true });
      // Optionally fetch balance here (using the separate updater)
      updateEvmSessionBal(true);
    } else {
      setEvmSessionWallet(null);
    }
  }, [address]);

  // NOTE: The actual "creation" now happens via handleSyncSession which we will rename/auto-trigger
  // We need to auto-trigger the sync if the user toggles session mode and has no key.







  // Fetch current user profile - STRICT REDIS VERIFICATION
  useEffect(() => {
    if (!isConnected || !address) {
      setUserProfile(null);
      setProfileChecked(false);
      setShowOnboarding(false);
      return;
    }

    setShowOnboarding(true);

    const cachedProfile = localStorage.getItem(`15market_profile_${address.toLowerCase()}`);
    if (cachedProfile) {
      try {
        const parsed = JSON.parse(cachedProfile);
        if (parsed.username && parsed.tosAccepted) {
          setUserProfile(parsed);
          setShowOnboarding(false);
        }
      } catch (e) { }
    }

    fetchMyProfile();
  }, [isConnected, address, fetchMyProfile]);

  const handleOnboardingComplete = async (onboardingData) => {
    // OPTIMISTIC: Close modal immediately to avoid "stuck" feeling
    setShowOnboarding(false);

    // Create local profile immediately
    const localProfile = {
      username: onboardingData.username,
      xHandle: onboardingData.twitterHandle || "",
      xProfileImage: onboardingData.twitterImage || "",
      tosAccepted: onboardingData.tosAccepted,
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      totalVolume: "0.00"
    };

    const finalProfile = {
      ...localProfile,
      sessionWalletAddress: evmSessionWallet?.address || ""
    };

    setUserProfile(finalProfile);
    localStorage.setItem(`15market_profile_${address.toLowerCase()}`, JSON.stringify(finalProfile));

    try {
      // Sync with backend in background
      const res = await fetch(`${KEEPER_URL_ARC}/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          profile: finalProfile
        })
      });

      if (!res.ok) console.warn("Background profile sync failed");
      else notify("Welcome to 15market, " + onboardingData.username, "success");

      // NO AUTO-INIT: User must explicitly enable Auto-Signer via the toggle.

    } catch (err) {
      console.error("Profile sync failed:", err);
    }
  };

  // Slider / amount handlers - active balance aware
  const activeBal = useMemo(() => {
    const bal = sessionMode ? sessionBalance : balance;
    // console.log("💰 [ACTIVE BALANCE]", { sessionMode, activeBal: bal });
    return bal;
  }, [sessionMode, sessionBalance, balance]);

  const handleSliderChange = useCallback((e) => {
    const val = e.target.value;
    setSliderValue(val);
    if (activeBal > 0) setAmount(((activeBal * val) / 100).toFixed(4));
  }, [activeBal]);

  const handleAmountChange = useCallback((e) => {
    const val = e.target.value;
    setAmount(val);
    if (activeBal > 0) setSliderValue(Math.min((val / activeBal) * 100, 100));
    else setSliderValue(0);
  }, [activeBal]);

  // Countdown Timer - Purely based on time, not price updates
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);
  // Cleanup resolution lock if trade is cleared manually
  useEffect(() => {
    // Clean up IDs that are no longer in activeTrades
    const activeIds = new Set(activeTrades.map(t => t.id));
    for (const id of resolvingInProgress.current) {
      if (!activeIds.has(id)) {
        resolvingInProgress.current.delete(id);
      }
    }
  }, [activeTrades]);

  // Result Resolution - HIGH SPEED polling for instant settlement feel
  useEffect(() => {
    const checkAndResolve = () => {
      const now = Date.now();
      const pendingTrades = activeTrades.filter(t => t.status === "PENDING" || t.status === "RESOLVING");

      for (const trade of pendingTrades) {
        const start = trade.startTime || (trade.nonce > 1000000000000 ? trade.nonce : Math.floor(trade.nonce / 100) * 1000);
        const expiryMs = trade.expiryMs || (start + (trade.duration * 1000));
        if (now < expiryMs) continue; // Not yet expired
        if (resolvingInProgress.current.has(trade.id)) continue;

        resolvingInProgress.current.add(trade.id);

        // Capture the current live price for instant result
        let capturedPrice = parseFloat(priceRef.current);
        if (trade.status === "RESOLVING" && trade.settlementPrice) {
          capturedPrice = parseFloat(trade.settlementPrice);
        }

        // RULE: Truncate to 3 decimal places (floor) for win/loss determination
        // If price doesn't move by at least 0.001 past entry, it's a LOSS
        const truncTo3dp = (p) => Math.floor(p * 1000) / 1000;

        let optimisticStatus = "LOST"; // Default to LOST (safer than WON)

        if (capturedPrice > 0) {
          const entry3dp = truncTo3dp(parseFloat(trade.entryPrice));
          const exit3dp = truncTo3dp(capturedPrice);
          const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";
          const isWin = isUpTrade ? (exit3dp > entry3dp) : (exit3dp < entry3dp);
          optimisticStatus = isWin ? "WON" : "LOST";
        }

        let optimisticPayout = "0.0000";
        if (optimisticStatus === "WON") {
          let multiplier = 1.98;
          if (trade.duration <= 5) multiplier = 6.98;
          else if (trade.duration <= 10) multiplier = 4.98;

          optimisticPayout = (parseFloat(trade.amount) * multiplier).toFixed(3);
        }

        const updatePayload = {
          ...trade,
          status: optimisticStatus,
          settlementPrice: capturedPrice.toFixed(3),
          payout: optimisticPayout,
          optimistic: true,
          settledAt: now
        };

        // INSTANT WALLET BALANCE CREDIT: Use address comparison for reliability
        if (optimisticStatus === "WON" && !trade.balanceApplied) {
          const payoutNum = parseFloat(optimisticPayout);
          const tradeOwner = (trade.owner || trade.userPublicKey || trade.user || "").toLowerCase();
          const sessionAddr = evmSessionWallet?.address?.toLowerCase();
          const mainAddr = address?.toLowerCase();

          if (sessionAddr && (tradeOwner === sessionAddr || trade.isSessionTrade)) {
            // SESSION TRADE WIN: Credit stays in session wallet
            setSessionBalance(prev => prev + payoutNum);
            lastSettlementCreditTime.current = Date.now(); // Activate cooldown
            console.log(`⚡ [INSTANT] +${payoutNum} credited to SESSION wallet (${tradeOwner})`);
            updatePayload.balanceApplied = true;
          } else if (mainAddr && tradeOwner === mainAddr) {
            // MAIN WALLET TRADE WIN: Credit goes to main wallet
            setBalance(prev => prev + payoutNum);
            console.log(`⚡ [INSTANT] +${payoutNum} credited to MAIN wallet (${tradeOwner})`);
            updatePayload.balanceApplied = true;
          }
        }

        // Instant UI Update - show result immediately
        setActiveTrades(prev => prev.map(t => t.id === trade.id ? updatePayload : t));
        setTradeHistory(prev => prev.map(t => t.id === trade.id ? updatePayload : t));

        // Release resolving lock after a safety period (chain will confirm in background)
        setTimeout(() => {
          resolvingInProgress.current.delete(trade.id);
        }, 30000);
      }
    };

    // HIGH SPEED: Check every 200ms for near-instant resolution
    const interval = setInterval(checkAndResolve, 200);
    // Also run immediately on mount/update
    checkAndResolve();
    return () => clearInterval(interval);
  }, [activeTrades, address, evmSessionWallet, sessionMode]);

  // Safety Cleanup: Remove finalized trades after showing result
  useEffect(() => {
    const finalStatuses = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"];
    const toRemove = activeTrades.filter(t => finalStatuses.includes(t.status));

    if (toRemove.length > 0) {
      const timer = setTimeout(() => {
        setActiveTrades(prev => prev.filter(t => !finalStatuses.includes(t.status)));
      }, 4500); // Show result for 4.5s so user can see payout
      return () => clearTimeout(timer);
    }
  }, [activeTrades]);



  // Platform Settings Sync



  // Arc Settlement Listener — with dedup to prevent double-crediting
  const processedSettlements = useRef(new Set());

  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: ARC_CONTRACT_ADDRESS,
      abi: ArcABI.abi,
      eventName: 'BetSettled',
      onLogs(logs) {
        logs.forEach(log => {
          const { id, user: betUser, settlementPrice, won, payout } = log.args;
          const normalizedUser = betUser?.toLowerCase();
          const mainAddr = address?.toLowerCase();
          const sessionAddr = evmSessionWallet?.address?.toLowerCase();

          if (normalizedUser === mainAddr || normalizedUser === sessionAddr) {
            const betId = id.toString();

            // 🛑 DEDUP: Skip if we already processed this exact settlement event
            const eventKey = `${betId}_${log.transactionHash}`;
            if (processedSettlements.current.has(eventKey)) {
              console.log(`⏭️ [DEDUP] Already processed settlement for bet ${betId}, skipping.`);
              return;
            }
            processedSettlements.current.add(eventKey);

            // Auto-cleanup old entries after 5 minutes
            setTimeout(() => processedSettlements.current.delete(eventKey), 5 * 60 * 1000);

            const finalStatus = won ? "WON" : "LOST";
            const priceUSD = parseFloat(formatUnits(settlementPrice, 8)).toFixed(3);
            const formattedPayout = parseFloat(formatUnits(payout, 18)).toFixed(3);

            const updateTrade = (t) => {
              const isMatch = (t.tx && t.tx.toLowerCase() === log.transactionHash.toLowerCase()) ||
                (t.nonce && t.nonce.toString() === betId) ||
                (t.id && t.id.toString() === betId);
              if (isMatch) {
                return {
                  ...t,
                  status: finalStatus,
                  settlementPrice: priceUSD,
                  payout: formattedPayout,
                  chainConfirmed: true,
                  balanceApplied: t.balanceApplied || false // Preserve existing flag
                };
              }
              return t;
            };

            setTradeHistory(prev => prev.map(updateTrade));
            setActiveTrades(prev => prev.map(updateTrade));

            if (won) {
              notify(`Trade WON! +${formattedPayout} USDC`, "success");
              const payoutVal = parseFloat(formattedPayout);

              // Update balance ONLY if not already optimistically applied
              const existingTrade = tradeHistory.find(t => String(t.id) === betId || (t.tx && t.tx.toLowerCase() === log.transactionHash.toLowerCase()));
              const existingActive = activeTrades.find(t => String(t.id) === betId || (t.tx && t.tx.toLowerCase() === log.transactionHash.toLowerCase()));
              const alreadyApplied = existingTrade?.balanceApplied || existingActive?.balanceApplied;
              const isSessionTrade = existingTrade?.isSessionTrade || existingActive?.isSessionTrade;

              if (!alreadyApplied) {
                if (normalizedUser === sessionAddr || (isSessionTrade && sessionAddr)) {
                  // SESSION TRADE: Winnings stay in session wallet
                  setSessionBalance(prev => prev + payoutVal);
                  lastSettlementCreditTime.current = Date.now(); // Activate cooldown
                  console.log(`⚡ [CHAIN_CONFIRM] +${payoutVal} credited to SESSION wallet (bet ${betId})`);
                } else if (normalizedUser === mainAddr) {
                  // MAIN WALLET TRADE: Winnings go to main wallet
                  setBalance(prev => prev + payoutVal);
                  console.log(`⚡ [CHAIN_CONFIRM] +${payoutVal} credited to MAIN wallet (bet ${betId})`);
                }
              } else {
                console.log(`⏭️ [CHAIN_CONFIRM] Balance already applied for bet ${betId}, skipping credit.`);
              }

              // Delayed refresh: Wait for on-chain payout to confirm, then read real balance
              // This is the authoritative balance refresh that catches the actual payout
              setTimeout(() => {
                if (normalizedUser === sessionAddr || isSessionTrade) {
                  updateEvmSessionBal(true); // Force read on-chain session balance
                } else {
                  refetchEvmBalance(true); // Force read on-chain main balance
                }
              }, 3000);
              setTimeout(() => {
                updateEvmSessionBal(true);
                refetchEvmBalance(true);
              }, 8000);

              lastTradeTimeRef.current = Date.now() - 7000;
              aggressiveRefresh();
            } else {
              notify(`Trade LOST. Price: $${priceUSD}`, "error");
              lastTradeTimeRef.current = Date.now() - 7000;
              aggressiveRefresh();
            }
          }
        });
      },
    });
    return () => unwatch();
  }, [address, evmSessionWallet, notify, aggressiveRefresh, updateEvmSessionBal, refetchEvmBalance]);

  const handleRefill = useCallback(async (amt) => {
    if (isExecuting) return;

    try {
      const amtNum = parseFloat(amt);
      const feePercent = 0.01;
      const fee = amtNum * feePercent;

      if (!address || !evmSessionWallet) {
        notify("Connect Arc wallet for refill", "error");
        return;
      }

      const currentBal = parseFloat(evmBalance);
      if (currentBal < amtNum) {
        notify(`Insufficient balance. You have ${currentBal.toFixed(4)} USDC`, "error");
        return;
      }

      setIsExecuting(true);
      notify(`Initiating Refill (${amtNum} USDC)...`, "success");

      try {
        if (!walletClient) throw new Error("Wallet not connected");

        const hash = await walletClient.sendTransaction({
          to: evmSessionWallet.address,
          value: parseUnits(amtNum.toFixed(18), 18),
          account: address
        });

        notify("Refill Transaction Broadcasted", "success");

        publicClient.waitForTransactionReceipt({ hash }).then(() => {
          notify("Refill Confirmed!", "success");
          setTimeout(() => {
            updateEvmSessionBal(true); // Forced update
            refetchEvmBalance(true);     // Forced update
          }, 2000);
        });

        const newTx = {
          id: `dep_${Date.now()}`,
          type: 'DEPOSIT',
          amount: amtNum.toFixed(4),
          timestamp: Date.now(),
          tx: hash,
          network: 'arc'
        };
        setTransactionHistory(prev => [newTx, ...prev]);

        // SYNC TRANSACTION TO CLOUD
        fetch(`${KEEPER_URL_ARC}/push-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, transaction: newTx })
        }).catch(e => console.warn("Failed to sync tx to cloud:", e));

      } catch (evmErr) {
        notify(`Refill failed: ${evmErr.message}`, "error");
      }
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, recordFee, evmBalance, updateEvmSessionBal, isExecuting, refetchEvmBalance, walletClient]);

  const handleWithdraw = useCallback(async (amt) => {
    if (isExecuting) return;

    try {
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid withdrawal amount", "error");
        return;
      }

      if (!evmSessionWallet) {
        notify("Session wallet not ready", "error");
        return;
      }

      if (sessionBalance < amtNum) {
        notify(`Insufficient balance. You have ${sessionBalance.toFixed(4)} USDC`, "error");
        return;
      }

      const gasBuffer = 0.005;
      const netAmt = amtNum - gasBuffer;

      if (netAmt <= 0) {
        notify("Amount too low for gas", "error");
        return;
      }

      if (!address || !walletClient) {
        notify("Connect your wallet", "error");
        return;
      }

      setIsExecuting(true);
      notify("Processing sweep...", "info");

      const res = await fetch(`${KEEPER_URL_ARC}/session/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          amount: netAmt,
          signature: "authorized" // Real sig can be verified on backend if needed
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Sweep failed");
      }

      const data = await res.json();
      const sweepHash = data.txHash;

      notify("Arc Withdrawal Successful!", "success");

      // Record transaction
      const newTx = {
        id: `withdraw-${Date.now()}`,
        type: "WITHDRAW",
        amount: amtNum.toFixed(4),
        timestamp: Date.now(),
        tx: sweepHash,
        network: 'arc'
      };

      setTransactionHistory(prev => [newTx, ...prev]);

      // SYNC WITHDRAWAL TO CLOUD
      fetch(`${KEEPER_URL_ARC}/push-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, transaction: newTx })
      }).catch(e => console.warn("Failed to sync withdrawal to cloud:", e));

      setTimeout(() => {
        updateEvmSessionBal(true);
        refetchEvmBalance(true);
      }, 2000);
    } catch (e) {
      notify("Withdrawal failed: " + (e.shortMessage || e.message), "error");
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, sessionBalance, updateEvmSessionBal, isExecuting, refetchEvmBalance]);

  if (isLoading) return (
    <div className="fixed inset-0 z-[100] backdrop-blur-sm flex flex-col items-center justify-center">
      <motion.div animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }} transition={{ duration: 2, repeat: Infinity }} className="relative">
        <div className="absolute inset-0 blur-[60px] bg-[#3CB371] opacity-20" />
        <img src="/logo.png" alt="logo" className="h-32 lg:h-48 w-auto relative z-10 drop-shadow-[0_0_40px_#3CB37160]" />
      </motion.div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden relative border border-white/5">
          <motion.div className="absolute inset-y-0 left-0 bg-[#3CB371]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.3 }} />
        </div>
        <p className="text-[10px] font-black uppercase text-[#3CB371]">Beta Testing is Live</p>
      </div>
    </div>
  );

  if (!authenticated) return (
    <div className={themeClass}>
      <LandingPage />
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
      </AnimatePresence>
    </div>
  );

  if (isSignerInitializing) {
    return (
      <div className={`${themeClass} fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center`}>
        <div className="max-w-md w-full bg-[#0D0D0D] border border-[#3CB371]/20 rounded-3xl p-8 relative overflow-hidden shadow-[0_0_100px_rgba(60,179,113,0.1)]">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

          <div className="w-16 h-16 rounded-full bg-[#3CB371]/10 flex items-center justify-center mx-auto mb-6 border border-[#3CB371]/20">
            <Shield className="w-8 h-8 text-[#3CB371] animate-pulse" />
          </div>

          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">
            {userProfile?.sessionWalletAddress ? "Restore Auto-Signer" : "Secure Auto-Signer Setup"}
          </h2>
          <p className="text-white/40 text-xs font-medium leading-relaxed mb-8">
            {userProfile?.sessionWalletAddress
              ? `We've detected an existing Auto-Signer linked to your wallet (${userProfile.sessionWalletAddress.slice(0, 6)}...). Please sign to restore access on this device.`
              : "To ensure maximum security and cross-device synchronization, you must sign a one-time authorization to link your Main Wallet to your Auto-Signer."
            }
          </p>

          <button
            onClick={initializeSessionWallet}
            disabled={isExecuting}
            className="w-full py-4 rounded-xl bg-[#3CB371] hover:brightness-110 active:scale-[0.98] transition-all text-white font-black uppercase tracking-widest text-sm shadow-[0_10px_40px_-10px_#3CB371]"
          >
            {isExecuting ? "Signing..." : "Initialize & Link Wallet"}
          </button>
          <AnimatePresence>
            {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`min-h-screen font-sans flex flex-col items-center overflow-x-hidden ${themeClass}`}
      style={{
        color: theme === 'light' ? '#1f2937' : '#ffffff',
        transition: "color 0.3s ease"
      }}>

      {view === "dashboard" ? (
        <DashboardPage
          onBack={() => setView("trading")}
          wallet={wallet}
          sessionBalance={sessionBalance}
          onRefill={handleRefill}
          onWithdraw={handleWithdraw}
          treasuryBalance={treasuryBalance}
          autoSignerFees={autoSignerFees}
          userProfile={userProfile}
          theme={theme}
          evmSessionWallet={evmSessionWallet}
          transactionHistory={transactionHistory}
          onViewReceipt={(tx) => {
            setSelectedTransaction(tx);
            setIsTransactionReceiptOpen(true);
          }}
        />
      ) : (
        <div className="w-full flex flex-col items-center px-2 lg:px-6 py-4 lg:py-10">
          <header className="w-full max-w-7xl flex items-center justify-between mb-4 lg:mb-8 relative z-50">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="logo" className={`h-20 sm:h-24 lg:h-32 w-auto drop-shadow-[0_0_40px_var(--primary-glow)] ${theme === 'light' ? 'invert hue-rotate-180' : ''}`} />
            </div>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-12">
              {/* Dashboard/Trading links removed from navbar per request */}
            </div>

            {/* Desktop Controls */}
            <div className="hidden lg:flex items-center gap-3">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <WalletBalance network={network} theme={theme} balanceOverride={sessionMode ? sessionBalance : parseFloat(evmBalance)} sessionMode={sessionMode} />

              {uiVersion === 'v1' && (
                <>
                  <button onClick={() => setView("dashboard")} className="p-2.5 rounded-xl border backdrop-blur-md transition-all group active:scale-95"
                    style={{
                      backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                      borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                    }}>
                    <User size={20} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
                  </button>
                </>
              )}

              <UnifiedWalletButton theme={theme} />
            </div>

            {/* Mobile Controls */}
            <div className="flex lg:hidden items-center gap-2">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />

              <button onClick={() => setView("dashboard")} className="p-2 rounded-xl border backdrop-blur-md transition-all group active:scale-95"
                style={{
                  backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                }}>
                <User size={18} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
              </button>

              <UnifiedWalletButton theme={theme} />
            </div>
          </header>

          {/* Full-width scroller - edge to edge */}
          <div className="w-screen mb-4 lg:mb-10 overflow-hidden">
            <GlobalTradeScroller wallet={wallet} theme={theme} currentNetwork={network} activeTrades={activeTrades} tradeHistory={tradeHistory} />
          </div>

          <div className="w-full max-w-7xl flex flex-col items-center">
            <div className="w-full max-w-7xl grid grid-cols-12 gap-2 lg:gap-6 mb-10 relative z-0">
              {/* Chart - Responsive - Full width */}
              <div className={`col-span-12 flex flex-col gap-3 rounded-[24px] lg:rounded-[32px] relative z-0 shadow-2xl transition-all duration-300 mb-2 overflow-hidden border h-[300px] sm:h-[400px] lg:h-[500px] glass-panel chart-glow`}
                style={{
                  background: theme === 'light' ? '#ffffff' : 'rgba(10, 10, 10, 0.7)',
                  boxShadow: theme === 'light'
                    ? '0 0 40px rgba(60, 179, 113, 0.5), 0 0 25px rgba(60, 179, 113, 0.4), 0 0 15px rgba(60, 179, 113, 0.3), inset 0 0 40px rgba(60, 179, 113, 0.1)'
                    : `0 0 60px ${GREEN}30, 0 0 20px ${GREEN}20, inset 0 0 40px ${GREEN}05`,
                  borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.8)' : `${GREEN}40`
                }}>
                <CustomChart symbol={activeMarket.binance} theme={theme} network={network} activeMarket={activeMarket} uiVersion={uiVersion} setActiveMarket={handleMarketChange} activeTrades={activeTrades} />
              </div>

              {/* Terminal - 50/50 split on desktop and mobile */}
              <div className="col-span-6 lg:col-span-6 flex flex-col">
                <TradeTerminal
                  activeTrade={activeTrade} sessionMode={sessionMode} setSessionMode={toggleSessionMode} price={price}
                  sessionBalance={sessionBalance} direction={direction} setDirection={setDirection} duration={duration}
                  setDuration={setDuration} amount={amount} handleAmountChange={handleAmountChange} balance={balance}
                  sliderValue={sliderValue} handleSliderChange={handleSliderChange} executeTrade={executeTrade}
                  theme={theme} minStake={platformSettings.minBet} timerActive={activeTrades.length > 0} isExecuting={isExecuting} wallet={wallet}
                  refillAmount={refillAmount} setRefillAmount={setRefillAmount} onRefill={handleRefill} onWithdraw={handleWithdraw}
                  CORAL={CORAL} GREEN={GREEN} currentNetwork={network} chainId={chainId}
                  evmSessionWallet={evmSessionWallet} hasProfile={!!userProfile}
                  activeMarket={activeMarket}
                  maintenanceMode={platformSettings.maintenanceMode}
                />
              </div>

              {/* Live Execution - Primary Active Bets Feed (Equal width and height with Terminal) */}
              <div className="col-span-6 lg:col-span-6 flex flex-col">
                <div className="glass-panel rounded-xl lg:rounded-2xl p-2 lg:p-4 h-full flex flex-col">
                  <LiveExecution
                    activeTrades={activeTrades} setActiveTrades={setActiveTrades} price={price}
                    setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
                    theme={theme} currentNetwork={network}
                  />
                </div>
              </div>
            </div>

            <TradeHistory
              wallet={wallet} sessionMode={sessionMode} sessionBalance={sessionBalance}
              tradeHistory={tradeHistory} setTradeHistory={setTradeHistory}
              setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
              GREEN={GREEN} CORAL={CORAL}
              evmSessionWallet={evmSessionWallet}
              theme={theme} currentNetwork={network}
            />
            {/* Campaign / Winner Banners - Moved below trading for better mobile flow */}
            <div className="w-full max-w-7xl mb-6 flex flex-col gap-4">
              {winnerBanner && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`w-full glass-panel !rounded-2xl mb-6 p-4 lg:p-6 border !border-white/5 relative`}
                  style={{ background: theme === 'light' ? '#ffffff' : 'rgba(10, 10, 10, 0.7)' }}
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <Trophy size={80} />
                  </div>
                  <div className="flex items-center gap-4 lg:gap-8 relative z-10">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
                      <Trophy size={32} className="text-yellow-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500 bg-yellow-500/5 px-2 py-0.5 rounded">Winner Detected</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 truncate max-w-[100px] lg:max-w-none">{winnerBanner.owner}</span>
                      </div>
                      <h3 className="text-lg lg:text-xl font-black text-white tracking-tighter uppercase">
                        Payout Propagated: <span className="text-yellow-500">+{(parseFloat(winnerBanner.amount) * 1.95).toFixed(4)} USDC</span>
                      </h3>
                    </div>
                  </div>
                </motion.div>
              )}

              {campaigns.filter(c => Date.now() < c.endTime && (c.network === 'general' || c.network === network)).map(camp => (
                <motion.div
                  key={camp.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`w-full glass-panel !rounded-2xl p-6 mb-4 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-500`}
                >
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-[#3CB371]">
                      <Trophy size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-tight">{camp.title}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-white/40 uppercase tracking-widest">
                          <Calendar size={12} />
                          Ends {new Date(camp.endTime).toLocaleString()}
                        </div>
                        <div className="w-1 h-1 bg-white/10 rounded-full" />
                        <div className="text-[10px] font-black text-[#3CB371] uppercase tracking-widest">
                          Prize: {camp.prize || 'Pride'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/campaign/${camp.id}`)}
                    className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${enrollments[camp.id]
                      ? 'bg-[#3CB371]/10 text-[#3CB371] border border-[#3CB371]/20 shadow-inner'
                      : 'bg-white text-black hover:scale-105 active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.2)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.3)]'
                      }`}
                  >
                    {enrollments[camp.id] ? (
                      <>
                        <CheckCircle size={14} />
                        View Leaderboard
                      </>
                    ) : (
                      <>
                        View Campaign Details
                        <ChevronRight size={14} />
                      </>
                    )}
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}



      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        wallet={wallet}
        userProfile={userProfile}
        transactionHistory={transactionHistory}
        onViewReceipt={(tx) => {
          setSelectedTransaction(tx);
          setIsTransactionReceiptOpen(true);
        }}
      />
      <PnLModal isOpen={isPnLOpen} onClose={() => setIsPnLOpen(false)} trade={selectedPnLTrade} />



      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
      </AnimatePresence>

      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        address={address}
        network={network}
        existingProfile={userProfile}
        theme={theme}
      />

      {/* Footer */}
      <footer className="w-full max-w-7xl mt-24 mb-10 flex items-center justify-center gap-6 opacity-60 hover:opacity-100 transition-opacity" style={{ fontFamily: 'Arial, sans-serif' }}>
        <img
          src="/logo.png"
          alt="15market"
          className="h-14 lg:h-18 w-auto opacity-80"
        />
        <div className={`w-px h-5 ${theme === 'light' ? 'bg-black/20' : 'bg-white/20'}`}></div>
        <span className={`text-xs md:text-sm font-bold tracking-widest ${theme === 'light' ? 'text-black' : 'text-white'}`}>
          © 2026 15market
        </span>
        <div className={`w-px h-5 ${theme === 'light' ? 'bg-black/20' : 'bg-white/20'}`}></div>
        <span className={`text-xs md:text-sm font-medium tracking-widest ${theme === 'light' ? 'text-black/60' : 'text-white/60'}`}>
          Built by 15labs
        </span>
      </footer>
      <TransactionReceiptModal
        isOpen={isTransactionReceiptOpen}
        onClose={() => setIsTransactionReceiptOpen(false)}
        transaction={selectedTransaction}
      />
    </motion.div>
  );
}
