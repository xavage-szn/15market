import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
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
import { ARC_CONTRACT_ADDRESS, ARC_USDC_ADDRESS, KEEPER_URL, KEEPER_URL_ARC, ADMIN_TOKEN, ARC_RPC, ARC_RPC_BACKUP, ARC_CHAIN_ID } from "./constants";


// Memoized Sub-components
import { TradeTerminal } from "./components/TradeTerminal";
import { LiveExecution } from "./components/LiveExecution";
import { TradeHistory } from "./components/TradeHistory";
import { UnifiedWalletButton } from "./components/UnifiedWalletButton";
import { OrderBook } from "./components/OrderBook";
import { ActiveTradesSidebar } from "./components/ActiveTradesSidebar";
import { MascotLoader } from "./components/MascotLoader";
import CustomChart from './components/CustomChart';
import Toast from "./components/Toast";
import { ThemeToggle } from "./components/ThemeToggle";
import SideHistoryPane from "./components/SideHistoryPane";
import { Maximize2, RotateCw } from "lucide-react";

/**
 * Mobile Portrait Lock Component
 * Shown when a mobile/small screen user is in portrait mode.
 * Forces landscape orientation for better V2 UI experience.
 */
const PortraitPrompt = ({ theme }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center p-8 text-center backdrop-blur-3xl`}
    style={{
      background: theme === 'light' ? 'rgba(238, 249, 241, 0.98)' : 'rgba(5, 5, 5, 0.98)'
    }}
  >
    <div className="relative mb-12">
      <motion.div
        animate={{ rotate: 90 }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
        className="relative"
      >
        <div className="w-32 h-20 rounded-2xl border-4 border-[#3CB371]/30 flex items-center justify-center">
          <div className="w-1 h-8 rounded-full bg-[#3CB371]/20 absolute -right-1" />
          <div className="w-2 h-2 rounded-full bg-[#3CB371]/20 absolute left-4" />
        </div>
      </motion.div>
      <motion.div
        animate={{ opacity: [0, 1, 0], x: [20, 0, -20] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute -top-8 left-1/2 -translate-x-1/2"
      >
        <RotateCw className="w-8 h-8 text-[#3CB371]" />
      </motion.div>
    </div>

    <h2 className="text-3xl font-black text-[#3CB371] uppercase tracking-tighter mb-4">
      Rotate Your Device
    </h2>
    <p className="text-white/40 text-sm font-medium max-w-xs leading-relaxed"
      style={{ color: theme === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>
      Expert-level trading requires a wider field of view. Please turn your screen to <span className="text-[#3CB371] font-bold">Landscape</span> to access the Precision V2 Terminal.
    </p>

    <div className="mt-12 flex items-center gap-3 py-2 px-4 rounded-full bg-[#3CB371]/10 border border-[#3CB371]/20">
      <Maximize2 className="w-4 h-4 text-[#3CB371]" />
      <span className="text-[10px] font-black uppercase tracking-widest text-[#3CB371]">Desktop Mode Optimization</span>
    </div>
  </motion.div>
);


const ThemeTransitionOverlay = ({ isAnimating, targetTheme }) => {
  if (!isAnimating) return null;

  const isSunrise = targetTheme === 'light'; // dark -> light (Bottom to Top)

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden">
      {/* Directional Wash */}
      <motion.div
        initial={{ y: isSunrise ? '100vh' : '-200vh' }}
        animate={{ y: isSunrise ? '-200vh' : '100vh' }}
        transition={{ duration: 2.2, ease: [0.4, 0, 0.2, 1] }}
        className="absolute left-0 w-full h-[300vh] z-10"
        style={{
          background: isSunrise
            ? 'linear-gradient(to top, #f0f9f4 0%, #f0f9f4 60%, rgba(60, 179, 113, 0.4) 80%, transparent 100%)'
            : 'linear-gradient(to bottom, #030303 0%, #030303 60%, rgba(75, 0, 130, 0.4) 80%, transparent 100%)'
        }}
      />

      {/* Celestial Body (Sun/Moon) */}
      <motion.div
        initial={{
          y: isSunrise ? '110vh' : '-30vh',
          left: '50%',
          x: '-50%'
        }}
        animate={{
          y: isSunrise ? '-30vh' : '110vh',
        }}
        transition={{ duration: 2.2, ease: [0.4, 0, 0.2, 1] }}
        className="absolute w-40 h-40 rounded-full z-20"
        style={{
          backgroundColor: isSunrise ? '#FFD700' : '#F4F4F4',
          boxShadow: isSunrise
            ? '0 0 120px 60px rgba(255, 215, 0, 0.6), 0 0 240px 100px rgba(255, 255, 255, 0.2)'
            : '0 0 80px 30px rgba(244, 244, 244, 0.3), inset -15px -15px 30px rgba(0,0,0,0.1)'
        }}
      />
    </div>
  );
};

export default function UserApp() {
  const { isConnected, address, chainId: connectedChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [theme, setTheme] = useState(() => localStorage.getItem('15market_theme') || 'dark');
  const [isAnimatingTheme, setIsAnimatingTheme] = useState(false);
  const [targetTheme, setTargetTheme] = useState(null);

  useEffect(() => {
    localStorage.setItem('15market_theme', theme);
  }, [theme]);

  const isLight = theme === 'light';

  const toggleTheme = useCallback(() => {
    if (isAnimatingTheme) return;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    setTargetTheme(nextTheme);
    setIsAnimatingTheme(true);

    // Swap actual theme exactly when the transition fully covers the screen
    setTimeout(() => {
      setTheme(nextTheme);
    }, 1100);

    // End animation and clean up
    setTimeout(() => {
      setIsAnimatingTheme(false);
      setTargetTheme(null);
    }, 2200);
  }, [theme, isAnimatingTheme]);

  // Keep-Alive Heartbeat (Prevents Backend from Sleeping while user is active)
  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost';
    if (isLocal) return;

    const pulse = async () => {
      try {
        // Ping the health endpoint to keep the server warm
        await fetch(`${KEEPER_URL_ARC}/health`).catch(() => { });
        // Also ping the stats endpoint as a fallback
        await fetch(`${KEEPER_URL_ARC}/protocol-stats`).catch(() => { });
      } catch (e) { }
    };

    pulse(); // Initial ping
    const interval = setInterval(pulse, 120000); // 2 minute interval
    return () => clearInterval(interval);
  }, []);

  const [price, setPrice] = useState("0.00");
  const staticPriceFails = useRef(0);
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  // const [balance, setBalance] = useState(0); // Removed in favor of evmBalance/sessionBalance logic
  const [direction, setDirection] = useState(null);
  const loadLocalTrades = (userAddress, isHistory) => {
    try {
      if (!userAddress) return [];
      const key = isHistory ? `15market_history_${userAddress.toLowerCase()}` : `15market_active_${userAddress.toLowerCase()}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  };

  const [tradeHistory, setTradeHistory] = useState(() => loadLocalTrades(address, true));
  const [activeTrades, setActiveTrades] = useState(() => loadLocalTrades(address, false));

  const lastAddressRef = useRef(address);

  // Preserve local device history by scooping it to the actively connected wallet address
  useEffect(() => {
    if (address && address !== lastAddressRef.current) {
      setTradeHistory(loadLocalTrades(address, true));
      setActiveTrades(loadLocalTrades(address, false));
      lastAddressRef.current = address;
    }
  }, [address]);

  useEffect(() => {
    if (address && address === lastAddressRef.current) {
      localStorage.setItem(`15market_history_${address.toLowerCase()}`, JSON.stringify(tradeHistory));
    }
  }, [tradeHistory, address]);

  useEffect(() => {
    if (address && address === lastAddressRef.current) {
      localStorage.setItem(`15market_active_${address.toLowerCase()}`, JSON.stringify(activeTrades));
    }
  }, [activeTrades, address]);

  const [timerActive, setTimerActive] = useState(false);
  const [duration, setDuration] = useState(15);
  const [timeLeft, setTimeLeft] = useState(15);

  const activeTrade = activeTrades[0] || null; // For backward compatibility in some components
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
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

  // Loading progress animation
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev < 95) { // Stop just before 100 to wait for actual data
            return prev + 1;
          }
          return prev;
        });
      }, 50); // Increment every 50ms
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100); // Instantly complete if loading finishes
    }
  }, [isLoading]);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [showManagement, setShowManagement] = useState(false);
  const [showActiveExpanded, setShowActiveExpanded] = useState(false);
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
  const [showSideHistory, setShowSideHistory] = useState(false);
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

  // Auto-switch to Arc Testnet if wallet is on the wrong network
  useEffect(() => {
    if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
      console.log(`🔄 [NETWORK] Auto-switching from chain ${connectedChainId} to Arc Testnet (${ARC_CHAIN_ID})`);
      switchChain?.({ chainId: ARC_CHAIN_ID });
    }
  }, [isConnected, connectedChainId, switchChain]);

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

  // Orientation & Device Detection for V2 Forced Landscape
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isSmallScreen = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  const showPortraitLock = uiVersion === 'v2' && isSmallScreen && isPortrait;
  const lastOptimisticActionTime = useRef(0); // Protects optimistic balance from stale polling
  const tradeHistoryRef = useRef([]);
  const activeTradesRef = useRef([]);
  const priceHistoryRef = useRef([]); // [{p, t}] buffer for accurate expiry snapshots
  const priceRef = useRef("0.00");

  useEffect(() => {
    tradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  useEffect(() => {
    activeTradesRef.current = activeTrades;
  }, [activeTrades]);

  // Custom balance fetcher (Replaces Wagmi useBalance)
  // 1. Core Balance Fetchers
  const refetchEvmBalance = useCallback(async (force = false) => {
    if (!address) return;

    try {
      const b = await publicClient.getBalance({ address });
      const formatted = formatUnits(b, 18);
      const newBalNum = parseFloat(formatted);

      // During cooldown, block ALL non-forced polls
      // Extended to 30s to prevent balance flicker while awaiting on-chain payout settlement
      const msSinceLastAction = Date.now() - lastOptimisticActionTime.current;
      if (!force && msSinceLastAction < 30000) {
        return;
      }

      // Use numeric comparison to avoid floating-point string format mismatches
      if (Math.abs(newBalNum - parseFloat(evmBalance || '0')) > 0.000001) {
        setEvmBalance(formatted);
      }
    } catch (e) { }
  }, [address, evmBalance]);

  const updateEvmSessionBal = useCallback(async (force = false) => {
    if (!evmSessionWallet) return;

    try {
      const balanceWei = await publicClient.getBalance({ address: evmSessionWallet.address });
      const bal = parseFloat(formatUnits(balanceWei, 18));

      // Extended to 30s for better protection against slow RPC indexing
      const msSinceLastAction = Date.now() - lastOptimisticActionTime.current;
      if (!force && msSinceLastAction < 30000) {
        return;
      }

      if (Math.abs(bal - sessionBalance) > 0.0001) {
        setSessionBalance(bal);
        console.log(`💰 [SESSION_BAL] Synced from on-chain: ${bal.toFixed(4)} USDC`);
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

    // 1. DEDUPLICATE: Only process the most 'final' version of each trade from backend
    // Since backend now returns both Active and History in the same list, they may duplicate.
    const uniqueBackendById = new Map();
    backendAllRaw.forEach(t => {
      const id = String(t.id);
      const existing = uniqueBackendById.get(id);
      const statusOrder = { "WON": 3, "LOST": 3, "RESOLVING": 2, "PENDING": 1, "TIMEOUT": 0 };
      const newStatus = t.status || (t.settled ? (t.won ? "WON" : "LOST") : "PENDING");

      if (!existing || statusOrder[newStatus] > statusOrder[existing.status]) {
        const isUpTrade = (t.direction === 1 || String(t.direction) === "1" || t.direction === "UP" || t.direction === "buy");
        uniqueBackendById.set(id, {
          ...t,
          direction: isUpTrade ? "UP" : "DOWN",
          status: newStatus,
          owner: t.owner || t.user || t.userPublicKey || t.userAddress
        });
      }
    });

    const backendAll = Array.from(uniqueBackendById.values());

    // 2. NO FORCED REFRESH: Optimistic balance injection is handled by checkAndResolve.
    // We let the natural polling handle on-chain sync AFTER the guard period (30s) expires.
    // This prevents old on-chain balances from overwriting our instant winning credits.

    // 3. Absolute Sync: Use backend as source of truth for settled trades
    setTradeHistory(prev => {
      const merged = [];
      const backendGate = new Set();

      backendAll.forEach(bt => {
        const btId = String(bt.id);
        backendGate.add(btId);

        // Find local copy
        const local = prev.find(p => String(p.id || p.tx || p.nonce) === btId);
        if (local) {
          const statusOrder = { "WON": 3, "LOST": 3, "RESOLVING": 2, "PENDING": 1, "TIMEOUT": 0 };
          if (statusOrder[local.status] > statusOrder[bt.status]) {
            merged.push({ ...bt, status: local.status, payout: local.payout, balanceApplied: local.balanceApplied });
          } else {
            // If backend caught up, still preserve the local balanceApplied flag to prevent double-crediting
            merged.push({ ...bt, balanceApplied: local.balanceApplied });
          }
        } else {
          merged.push(bt);
        }
      });

      prev.forEach(local => {
        const lid = String(local.id || local.tx || local.nonce);
        if (!backendGate.has(lid)) {
          // Keep local trade if it has a final status or if it's very fresh
          const isFinal = ["WON", "LOST"].includes(local.status);
          const isRecent = (Date.now() - (local.timestamp || Date.now())) < 600000;

          if (isFinal || isRecent) {
            merged.push(local);
          }
        }
      });

      return merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100);
    });

    // 4. Update Active Trades (Monotonic Status)
    setActiveTrades(prev => {
      const now = Date.now();
      const GHOST_GRACE = 5000;

      const backendActive = backendAll.filter(t => ["PENDING", "RESOLVING"].includes(t.status)).map(t => {
        const startTime = (t.timestamp || t.startTime || now);
        const normStart = startTime > 1000000000000 ? startTime : startTime * 1000;
        const expiryMs = t.expiryMs || (normStart + (t.duration * 1000));
        return { ...t, startTime: normStart, expiryMs, confirmed: true };
      });

      const updatedActive = [];

      backendActive.forEach(bt => {
        const local = prev.find(p => String(p.id || p.tx || p.nonce) === String(bt.id || bt.tx || bt.nonce));
        let finalStatus = bt.status;

        // Monotonic Status Hierarchy: WON/LOST > RESOLVING > PENDING
        if (local) {
          const statusOrder = { "WON": 3, "LOST": 3, "RESOLVING": 2, "PENDING": 1 };
          if (statusOrder[local.status] > statusOrder[bt.status]) {
            finalStatus = local.status;
          }
        }

        if (now <= (bt.expiryMs + GHOST_GRACE)) {
          updatedActive.push({
            ...bt,
            status: finalStatus,
            optimistic: (local?.optimistic || false),
            // Preserve all local fields that the backend doesn't track
            balanceApplied: local?.balanceApplied,
            sessionOwner: local?.sessionOwner || bt.sessionOwner,
            isSessionTrade: local?.isSessionTrade || bt.isSessionTrade,
            entryPrice: local?.entryPrice || bt.entryPrice, // prefer local high-precision price
          });
        }
      });

      prev.forEach(local => {
        const localId = String(local.id || local.tx || local.nonce);
        if (!updatedActive.find(u => String(u.id || u.tx || u.nonce) === localId)) {
          const normExp = local.expiryMs || ((local.timestamp || local.startTime || now) + (local.duration * 1000));

          // Ensure we drop trades from active view after grace period, even if they were WON/LOST
          if (now <= (normExp + GHOST_GRACE)) {
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
        const text = await res.text();
        let userData;
        try {
          userData = JSON.parse(text);
        } catch (e) {
          if (text.includes("<html") || text.includes("<!DOCTYPE")) {
            console.error("[Backend] Proxy error (HTML returned). Check KEEPER_URL.");
            return;
          }
          throw e;
        }
        const { profile, history, transactions } = userData;
        if (profile) {
          setUserProfile(profile);
          localStorage.setItem(`15market_profile_${address.toLowerCase()}`, JSON.stringify(profile));
        }
        if (history) reconcileTrades(history);
        if (transactions) setTransactionHistory(transactions);
      }
    } catch (e) { } finally { setProfileChecked(true); }
  }, [address, reconcileTrades]);

  // 3. Aggressive Logic (Optimized: fewer redundant refreshes)
  const aggressiveRefresh = useCallback((force = false) => {
    triggerGlobalRefresh(force);
    [500, 2000, 5000].forEach(delay => setTimeout(() => triggerGlobalRefresh(force), delay));
    [1500, 4000].forEach(delay => setTimeout(fetchMyProfile, delay));
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


  // Periodic Universal Sync (Optimized for Instant Pulse Mode)
  useEffect(() => {
    if (address) {
      const interval = setInterval(() => {
        triggerGlobalRefresh(false);
        fetchMyProfile();
      }, 2000); // 2s — matches backend pulse speed
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
      notify("Authorizing Auto-Signer...", "pending");

      // 1. Sign Auth Message (Identity Proof)
      // This signature can be verified by backend if needed, but the backend derives wallet 
      // primarily from the user address to ensure cross-device consistency.
      const message = `Authorize 15market Auto-Signer for ${address.toLowerCase()}`;
      const sig = await walletClient.signMessage({ message }); // Auto-detect account for mobile compatibility

      if (!sig) throw new Error("Signature failed or rejected by user");

      // 2. Request Session Wallet from Backend
      console.log(`📡 [Session] Initializing at: ${KEEPER_URL_ARC}/session/init`);
      const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature: sig })
      }).catch(err => {
        console.error("❌ [Session] Fetch Failed:", err);
        throw new Error(`Connection to Backend Failed (${KEEPER_URL_ARC})`);
      });

      if (!res.ok) {
        let errData = { error: "Unknown Error" };
        try { errData = await res.json(); } catch (e) { console.error("Non-JSON Error from Backend:", e); }
        throw new Error(errData.error || `Backend init failed (${res.status})`);
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
      notify("Switched to Main Wallet", "success");
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
    const stakeAmt = parseFloat(amount);

    // For session trades, require a small margin (0.1 USDC) for gas to avoid "Insufficient funds for gas" errors
    const gasMargin = sessionMode ? 0.1 : 0;

    if (stakeAmt + gasMargin > currentBal) {
      return notify(`Insufficient ${network === 'arc' ? 'USDC' : 'SOL'}. ${sessionMode ? `Session wallet needs at least ${stakeAmt + gasMargin} USDC (Stake + Gas room)` : `Balance: ${currentBal.toFixed(3)}`}`, "error");
    }

    if (Number(amount) < parseFloat(platformSettings.minBet)) {
      return notify(`Min trade: ${platformSettings.minBet} ${network === 'arc' ? 'USDC' : 'SOL'}`, "error");
    }

    // Force collapse management when starting a trade
    setShowManagement(false);

    // setIsExecuting(true); // REMOVED global block for burst mode

    // Generate truly unique bet ID immediately
    const addressSuffix = address ? parseInt(address.slice(-4), 16) : 0;
    const tradeId = Date.now() * 1000 + Math.floor(Math.random() * 1000000) + addressSuffix;
    const dirVal = (direction === "buy" || direction === "UP") ? 1 : 0;
    const entryPriceParams = Math.floor(activePrice * 100000000);
    const ASSET_ID_MAP = { 'eth': 0, 'btc': 1, 'sol': 2, 'mon': 3, 'jup': 4, 'xrp': 5 };
    const assetId = ASSET_ID_MAP[activeMarket?.id?.toLowerCase()] || 0;
    const activeUserAddr = (sessionMode && evmSessionWallet) ? evmSessionWallet.address : address;
    const now = Date.now();
    const expiryMs = now + (duration * 1000);
    const amtNum = parseFloat(amount);

    setIsExecuting(true);
    notify("Processing Trade...", "pending");

    try {
      if (!isConnected) {
        throw new Error("Please connect wallet first");
      }
      const amountWei = parseUnits(parseFloat(amount).toFixed(18), 18);
      let txHash;

      if (sessionMode) {
        console.log(`📡 [SESSION] Sending trade ${tradeId} to keeper (Strict Mode)...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          // Safety: ensure UI is reset if backend doesn't respond in time
          setIsExecuting(false);
          notify("Trade timed out. The backend may be busy — please try again.", "error");
        }, 45000); // 45 second timeout (was 25s)

        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              address,
              tradeParams: {
                id: tradeId.toString(),
                direction: dirVal,
                duration: Number(duration),
                entryPrice: entryPriceParams.toString(),
                marketId: assetId,
                amount
              }
            })
          });
          clearTimeout(timeoutId);
          const responseText = await res.text();
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            throw new Error(`Invalid JSON response: ${responseText.slice(0, 100)}`);
          }

          if (!res.ok) throw new Error(data.error || "Session trade failed");
          txHash = data.txHash;
          console.log(`✅ [SESSION] Broadcasted: ${txHash}. Verifying in background...`);

          // RELEASE UI IMMEDIATELY FOR BURST MODE
          setIsExecuting(false);
          notify("Trade Broadcasted! Verifying...", "success");

          // We ONLY add to UI and debit if we actually got a txHash back
          const optimisticTrade = {
            id: tradeId,
            direction: (dirVal === 1 ? "UP" : "DOWN"),
            amount: Number(amount).toFixed(3),
            entryPrice: activePrice.toFixed(8),
            timestamp: Date.now(),
            status: "PENDING",
            tx: txHash,
            nonce: tradeId,
            // For session trades, owner = main wallet address (for history display)
            // but sessionOwner = session wallet address (for balance crediting)
            userPublicKey: activeUserAddr,
            owner: address, // main wallet — always the account owner
            sessionOwner: activeUserAddr, // session wallet — where payout lands
            duration,
            network: "arc",
            startTime: Date.now(),
            expiryMs: Date.now() + (duration * 1000),
            symbol: activeMarket?.symbol || 'ETH',
            isSessionTrade: true,
            confirmed: false, // Flag for verification state
          };

          const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (String(t.id || t.tx) !== String(item.id || item.tx)))];
          setActiveTrades(prev => dedupeAndAdd(prev, optimisticTrade));
          setTradeHistory(prev => dedupeAndAdd(prev, optimisticTrade));

          // 🔥 INSTANT OVERHEAD: Deduct balance and activate guard immediately ONLY after hash received
          setSessionBalance(prev => Math.max(0, prev - amtNum));
          lastOptimisticActionTime.current = Date.now();

          // 5-second timeout safety check
          setTimeout(() => {
            setActiveTrades(currentActive => {
              const tradeStillThere = currentActive.find(t => t.id === tradeId);
              if (tradeStillThere && !tradeStillThere.confirmed) {
                // Check if it's eventually confirmed
                publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null).then(r => {
                  if (!r) {
                    console.warn(`⏳ [SESSION] Trade ${tradeId} taking too long, checking again later...`);
                  }
                });
              }
              return currentActive;
            });
          }, 5000);

          // Background Verification (Non-blocking)
          publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60000 })
            .then(async (receipt) => {
              if (receipt.status === "success" || receipt.status === 1) {
                console.log(`⛓️ [SESSION] Confirmed: ${txHash}`);
                setActiveTrades(prev => prev.map(t => t.id === tradeId ? { ...t, confirmed: true } : t));
                triggerGlobalRefresh(true); // Final sync with chain reality
              } else {
                throw new Error("Transaction Reverted");
              }
            })
            .catch(err => {
              console.warn("Session background verification failed:", err);
              // Only restore balance if it's a definitive failure, not a timeout
              const isTimeout = err.message?.includes("timed out") || err.name === "TimeoutError";

              if (!isTimeout) {
                notify("Trade Reverted! Check Gas/Balance.", "error");
                setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
                // 🔥 RESTORE BALANCE on revert
                setSessionBalance(prev => prev + amtNum);
                lastOptimisticActionTime.current = 0; // Release guard to allow fresh on-chain sync
              } else {
                console.log("⌛ [SESSION] Verification timed out - keeping trade and optimistic debit.");
                // We keep it as PENDING and hope the poller eventually reconciles it
              }
            });

        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
      } else {
        if (!walletClient) throw new Error("Wallet not connected");
        console.log(`✍️ [MAIN] Requesting signature...`);
        txHash = await walletClient.writeContract({
          address: ARC_CONTRACT_ADDRESS,
          abi: ArcABI.abi,
          functionName: 'placeBet',
          args: [BigInt(tradeId), Number(dirVal), BigInt(duration), BigInt(entryPriceParams), Number(assetId), address],
          value: amountWei,
          account: address,
          gas: 800000n
        });

        // RELEASE UI IMMEDIATELY
        setIsExecuting(false);
        notify("Trade Signed! Verifying...", "success");

        // Optimistically add
        const optimisticTrade = {
          id: tradeId,
          direction: (dirVal === 1 ? "UP" : "DOWN"),
          amount: Number(amount).toFixed(3),
          entryPrice: activePrice.toFixed(8),
          timestamp: Date.now(),
          status: "PENDING",
          tx: txHash,
          nonce: tradeId,
          userPublicKey: address,
          owner: address,
          duration,
          network: "arc",
          startTime: Date.now(),
          expiryMs: Date.now() + (duration * 1000),
          symbol: activeMarket?.symbol || 'ETH',
          isSessionTrade: false,
          confirmed: false,
        };

        const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (String(t.id || t.tx) !== String(item.id || item.tx)))];
        setActiveTrades(prev => dedupeAndAdd(prev, optimisticTrade));
        setTradeHistory(prev => dedupeAndAdd(prev, optimisticTrade));

        // 🔥 INSTANT OVERHEAD: Deduct balance and activate guard immediately
        setEvmBalance(prev => {
          const current = parseFloat(prev || "0");
          return Math.max(0, current - amtNum).toString();
        });
        lastOptimisticActionTime.current = Date.now();

        // Background Verification
        publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60000 })
          .then(async (receipt) => {
            if (receipt.status === "success" || receipt.status === 1) {
              console.log(`⛓️ [MAIN] Confirmed: ${txHash}`);
              setActiveTrades(prev => prev.map(t => t.id === tradeId ? { ...t, confirmed: true } : t));

              fetch(`${KEEPER_URL_ARC}/trade-ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: tradeId.toString(),
                  address, amount, direction: dirVal, duration: Number(duration),
                  entryPrice: entryPriceParams.toString(),
                  symbol: activeMarket?.symbol || 'ETH'
                })
              }).catch(e => console.warn("Ping failed", e));

              triggerGlobalRefresh(true); // Final sync with chain reality
              notify("Trade Confirmed!", "success");
            } else {
              throw new Error("Reverted");
            }
          })
          .catch(e => {
            notify("Trade Reverted!", "error");
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
          });
      }

      setIsExecuting(false);

    } catch (err) {
      console.error("❌ Execution Failed:", err);
      notify(err.message, "error");
      setIsExecuting(false);
    }
  };

  const [platformSettings, setPlatformSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_citadel_settings");
      return saved ? JSON.parse(saved) : { minBet: 1.0, maxBet: 1000000.0, maintenanceMode: false, tradingHalted: false };
    } catch (e) { return { minBet: 1.0, maxBet: 1000000.0, maintenanceMode: false, tradingHalted: false }; }
  });

  // Sync settings across tabs (Optimized: 5s instead of 1s, relies on storage events for real-time)
  useEffect(() => {
    const syncSettings = () => {
      try {
        const loaded = JSON.parse(localStorage.getItem('15market_citadel_settings'));
        if (loaded) setPlatformSettings(loaded);
      } catch (e) { }
    };
    window.addEventListener('storage', syncSettings);
    const interval = setInterval(syncSettings, 5000);
    return () => {
      window.removeEventListener('storage', syncSettings);
      clearInterval(interval);
    };
  }, []);

  // Sync settings with Backend (Keeper) — Merged into syncMarket effect to avoid duplicate polling
  // Settings are now fetched inside the syncMarket effect below (every 5s) which already fetches /settings
  useEffect(() => {
    const fetchRemoteSettings = async () => {
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/settings`);
        if (res && res.ok) {
          const remoteSettings = await res.json();
          if (JSON.stringify(remoteSettings) !== JSON.stringify(platformSettings)) {
            setPlatformSettings(remoteSettings);
            localStorage.setItem('15market_citadel_settings', JSON.stringify(remoteSettings));
            window.dispatchEvent(new Event('storage'));
          }
        }
      } catch (e) { /* Will retry next cycle */ }
    };
    fetchRemoteSettings();
    const settingsInterval = setInterval(fetchRemoteSettings, 15000); // 15s — settings rarely change
    return () => clearInterval(settingsInterval);
  }, []);

  useEffect(() => {
    localStorage.setItem("15market_citadel_settings", JSON.stringify(platformSettings));
  }, [platformSettings]);

  // Fetch and Index Trade History
  useEffect(() => {
    if (!address || !isConnected) {
      // DONT clear it here, because Wagmi takes a moment to reconnect on refresh!
      return;
    }

    const fetchTradeHistory = async () => {
      try {
        const addr = address.toLowerCase();
        const res = await fetch(`${KEEPER_URL_ARC}/history/${addr}`);
        if (res.ok) {
          const backendAllRaw = await res.json();
          reconcileTrades(backendAllRaw);
        }
      } catch (e) {
        console.error("Failed to fetch trade history:", e);
      }
    };

    fetchTradeHistory();

    fetchTradeHistory();
    const interval = setInterval(fetchTradeHistory, 3000); // Poll every 3s for fast result sync
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



  const cleanupTimers = useRef({});

  const fetchCurrentPrice = useCallback(async () => {
    try {
      const sources = [];

      // 1. Pyth Sources (Multiple Hermes endpoints for redundancy)
      if (activeMarket.pythId) {
        const fullPythId = activeMarket.pythId.startsWith('0x') ? activeMarket.pythId : `0x${activeMarket.pythId}`;

        // Hermes v2 expects ids[] array syntax and full 0x hex
        // PRODUCTION FIX: Only use Hermes V2. Benchmark V1 returns 422 errors.
        sources.push({
          name: "pyth",
          url: `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${fullPythId}`,
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
        // Enforce 2 decimal model as requested (Truncation)
        const truncated = Math.floor(fastestPrice * 100) / 100;
        const pStr = truncated.toFixed(2);
        setPrice(pStr);
        priceRef.current = pStr;
        setIsLoading(false);

        // Record history for precise expiry price retrieval (keep 10s buffer)
        const now = Date.now();
        priceHistoryRef.current.push({ p: truncated, t: now });
        if (priceHistoryRef.current.length > 50) priceHistoryRef.current.shift();

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

  // Persistence handled by unified backend now



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









  // Slider / amount handlers - active balance aware
  const activeBal = useMemo(() => {
    const bal = sessionMode ? sessionBalance : balance;
    // console.log("💰 [ACTIVE BALANCE]", { sessionMode, activeBal: bal });
    return bal;
  }, [sessionMode, sessionBalance, balance]);

  const handleSliderChange = useCallback((e) => {
    const val = e.target.value;
    setSliderValue(val);
    if (activeBal > 0) {
      const calculated = (activeBal * val) / 100;
      const truncated = Math.floor(calculated * 100) / 100;
      setAmount(truncated.toFixed(2));
    }
  }, [activeBal]);

  const handleAmountChange = useCallback((e) => {
    let val = e.target.value;

    // Enforce 2 decimal truncation on input
    if (val.includes('.')) {
      const [int, dec] = val.split('.');
      if (dec.length > 2) {
        val = `${int}.${dec.slice(0, 2)}`;
      }
    }

    setAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && activeBal > 0) setSliderValue(Math.min((num / activeBal) * 100, 100));
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
        const start = trade.startTime || (trade.id > 1000000000000 ? trade.id : Math.floor(trade.id / 100) * 1000);
        const expiryMs = trade.expiryMs || (start + (trade.duration * 1000));

        // 🔥 IMPROVED RESOLUTION: Enable resolution as soon as timer is done, even if transaction confirmation 
        // is still pending on-chain. This removes the 'Processing' hang for winners.
        if (now < expiryMs || (!trade.confirmed && !trade.tx)) continue;
        if (trade.confirmed === false && !trade.tx) continue; // Safety: only resolve if we have a TX or on-chain confirmation
        if (resolvingInProgress.current.has(trade.id)) continue;

        // Use full precision for win/loss determination (up to 8 decimal places)
        const highPrecisionCmp = (p) => parseFloat(p);

        // ACCURACY UPGRADE: Find the price in history that was closest to the exact expiryMs
        let capturedPrice = parseFloat(priceRef.current);
        if (priceHistoryRef.current.length > 0) {
          const closest = priceHistoryRef.current.reduce((prev, curr) =>
            Math.abs(curr.t - expiryMs) < Math.abs(prev.t - expiryMs) ? curr : prev
          );
          // Only use history if it's within 1s of expiry
          if (Math.abs(closest.t - expiryMs) < 1000) {
            capturedPrice = closest.p;
            console.log(`🎯 [RESOLVER] Precise capture for ${trade.id}: ${capturedPrice} (diff: ${Math.abs(closest.t - expiryMs)}ms)`);
          }
        }

        if (trade.status === "RESOLVING" && trade.settlementPrice) {
          capturedPrice = parseFloat(trade.settlementPrice);
        }

        if (!capturedPrice || capturedPrice <= 0) continue;

        let optimisticStatus = "LOST";
        const trunc2 = (v) => Math.floor(parseFloat(v) * 100) / 100;
        const entryVal = trunc2(trade.entryPrice);
        const exitVal = trunc2(capturedPrice);
        const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";
        const isWin = isUpTrade ? (exitVal > entryVal) : (exitVal < entryVal);
        optimisticStatus = isWin ? "WON" : "LOST";

        // NOW we lock it — we actually have a result
        resolvingInProgress.current.add(trade.id);

        let optimisticPayout = "0.0000";
        if (optimisticStatus === "WON") {
          let multiplier = 1.98;
          if (trade.duration <= 5) multiplier = 6.98;
          else if (trade.duration <= 10) multiplier = 4.98;

          optimisticPayout = (Math.floor(parseFloat(trade.amount) * multiplier * 100) / 100).toFixed(2);
        }

        const updatePayload = {
          ...trade,
          status: optimisticStatus,
          settlementPrice: exitVal.toFixed(2),
          payout: optimisticPayout,
          optimistic: true,
          settledAt: now
        };

        // INSTANT WALLET BALANCE CREDIT
        if (optimisticStatus === "WON" && !trade.balanceApplied) {
          const payoutNum = parseFloat(optimisticPayout);
          const sessionAddr = evmSessionWallet?.address?.toLowerCase();
          const mainAddr = address?.toLowerCase();

          // Determine if this is a session trade:
          // Either explicitly flagged, or the sessionOwner field matches the session wallet,
          // or the user/owner field matches the session wallet address
          const tradeSessionOwner = (trade.sessionOwner || "").toLowerCase();
          const tradeOwner = (trade.owner || trade.userPublicKey || trade.user || "").toLowerCase();
          const isSessionTrade = trade.isSessionTrade ||
            (sessionAddr && tradeSessionOwner === sessionAddr) ||
            (sessionAddr && tradeOwner === sessionAddr);

          if (isSessionTrade && sessionAddr) {
            // SESSION TRADE WIN: Credit stays in session wallet
            setSessionBalance(prev => prev + payoutNum);
            lastOptimisticActionTime.current = Date.now();
            console.log(`⚡ [INSTANT] +${payoutNum} credited to SESSION wallet`);
            updatePayload.balanceApplied = true;
            creditedPayouts.current.add(String(trade.id)); // Prevent on-chain double-credit
          } else if (mainAddr) {
            // MAIN WALLET TRADE WIN: Credit goes to main wallet
            setEvmBalance(prev => {
              const current = parseFloat(prev || "0");
              return (current + payoutNum).toFixed(6);
            });
            lastOptimisticActionTime.current = Date.now();
            console.log(`⚡ [INSTANT] +${payoutNum} credited to MAIN wallet`);
            updatePayload.balanceApplied = true;
            creditedPayouts.current.add(String(trade.id)); // Prevent on-chain double-credit
          }
        }

        // Instant UI Update - show result immediately
        setActiveTrades(prev => prev.map(t => t.id === trade.id ? updatePayload : t));
        setTradeHistory(prev => prev.map(t => t.id === trade.id ? updatePayload : t));

        // CALL BACKEND TO SETTLE ON CHAIN
        fetch(`${KEEPER_URL_ARC}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: trade.id,
            exitPrice: capturedPrice
          })
        }).catch(e => console.error("Settlement trigger fail:", e));

        // Release resolving lock after a safety period
        setTimeout(() => {
          resolvingInProgress.current.delete(trade.id);
        }, 3000);
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
    const finished = activeTrades.filter(t => finalStatuses.includes(t.status));

    finished.forEach(trade => {
      const tid = trade.id || trade.tx || trade.nonce;
      if (tid && !cleanupTimers.current[tid]) {
        // Start a removal timer ONLY if one doesn't exist for this specific trade
        cleanupTimers.current[tid] = setTimeout(() => {
          setActiveTrades(prev => prev.filter(t => (t.id || t.tx || t.nonce) !== tid));
          delete cleanupTimers.current[tid];
        }, 3500); // 3.5 seconds of glory on screen
      }
    });

    return () => {
      // Cleanup orphan timers if list empties
      if (activeTrades.length === 0) {
        Object.values(cleanupTimers.current).forEach(clearTimeout);
        cleanupTimers.current = {};
      }
    };
  }, [activeTrades]);



  // Platform Settings Sync



  // Arc Settlement Listener — with dedup to prevent double-crediting
  const processedSettlements = useRef(new Set());
  const creditedPayouts = useRef(new Set()); // Track which betIds have had balance credited

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

            const eventInitialStatus = won ? "WON" : "LOST"; // FIXED: Use WON immediately, don't stay in PENDING
            const priceUSD = parseFloat(formatUnits(settlementPrice || log.args.exitPrice, 8)).toFixed(2);
            const formattedPayout = parseFloat(formatUnits(payout, 18)).toFixed(2);

            const updateTrade = (t) => {
              const isMatch = (t.tx && t.tx.toLowerCase() === log.transactionHash.toLowerCase()) ||
                (t.nonce && t.nonce.toString() === betId) ||
                (t.id && t.id.toString() === betId);
              if (isMatch) {
                return {
                  ...t,
                  status: eventInitialStatus,
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
              const payoutNum = parseFloat(formattedPayout);

              // 🔥 DIRECT CREDIT: Only credit if the optimistic resolver hasn't already done it
              // Check activeTradesRef to see if the trade already has balanceApplied
              const existingTrade = activeTradesRef.current.find(t =>
                (t.id && t.id.toString() === betId) || (t.nonce && t.nonce.toString() === betId)
              );
              const alreadyOptimisticallyCredited = existingTrade?.balanceApplied === true ||
                creditedPayouts.current.has(betId);

              if (!alreadyOptimisticallyCredited) {
                creditedPayouts.current.add(betId);
                setTimeout(() => creditedPayouts.current.delete(betId), 10 * 60 * 1000);

                const sessionAddrLower = evmSessionWallet?.address?.toLowerCase();
                const mainAddrLower = address?.toLowerCase();

                if (sessionAddrLower && normalizedUser === sessionAddrLower) {
                  setSessionBalance(prev => prev + payoutNum);
                  console.log(`🔗 [ON-CHAIN WIN] +${payoutNum} credited to SESSION wallet (optimistic had not run)`);
                } else if (mainAddrLower && normalizedUser === mainAddrLower) {
                  setEvmBalance(prev => {
                    const current = parseFloat(prev || '0');
                    return (current + payoutNum).toFixed(6);
                  });
                  console.log(`🔗 [ON-CHAIN WIN] +${payoutNum} credited to MAIN wallet (optimistic had not run)`);
                }
              } else {
                console.log(`🔗 [ON-CHAIN WIN] Bet ${betId} already credited optimistically, skipping duplicate credit.`);
              }

              // Also set the lastOptimisticActionTime to prevent the polling cooldown
              // from immediately overwriting our credited balance with a stale on-chain value
              lastOptimisticActionTime.current = Date.now();

              // Finalize status across trade lists
              const finalizeWin = () => {
                const matchFn = (t) => {
                  const isMatch = (t.tx && t.tx.toLowerCase() === log.transactionHash.toLowerCase()) ||
                    (t.id && t.id.toString() === betId);
                  return isMatch ? { ...t, status: "WON", payout: formattedPayout, chainConfirmed: true, balanceApplied: true } : t;
                };
                setTradeHistory(prev => prev.map(matchFn));
                setActiveTrades(prev => prev.map(matchFn));
                notify(`Trade WON! +${formattedPayout} USDC`, "success");
              };

              // Release cooldown and do a final on-chain sync after 5s
              setTimeout(() => {
                lastOptimisticActionTime.current = 0;
                refetchEvmBalance(true);
                updateEvmSessionBal(true);
                finalizeWin();
              }, 5000);

            } else {
              notify(`Trade LOST.`, "error");
              // Force-read balance after loss settlement
              lastOptimisticActionTime.current = 0;
              setTimeout(() => {
                updateEvmSessionBal(true);
                refetchEvmBalance(true);
              }, 2000);
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
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid deposit amount", "error");
        return;
      }

      if (!address || !evmSessionWallet) {
        notify("Connect Arc wallet for refill", "error");
        return;
      }

      if (!walletClient) {
        notify("Wallet client not ready — please reconnect your wallet", "error");
        return;
      }

      const currentBal = parseFloat(evmBalance);
      if (currentBal < amtNum) {
        notify(`Insufficient balance. You have ${currentBal.toFixed(4)} USDC`, "error");
        return;
      }

      setIsExecuting(true);
      notify(`Confirm deposit of ${amtNum.toFixed(4)} USDC in your wallet...`, "pending");

      try {
        const hash = await walletClient.sendTransaction({
          to: evmSessionWallet.address,
          value: parseEther(amtNum.toFixed(6)),
          account: address
        });

        notify("Deposit Transaction Broadcasted!", "success");

        publicClient.waitForTransactionReceipt({ hash }).then(() => {
          notify("Deposit Confirmed!", "success");
          setTimeout(() => {
            updateEvmSessionBal(true);
            refetchEvmBalance(true);
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

        fetch(`${KEEPER_URL_ARC}/push-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, transaction: newTx })
        }).catch(e => console.warn("Failed to sync deposit to cloud:", e));

      } catch (evmErr) {
        notify(`Deposit failed: ${evmErr.shortMessage || evmErr.message}`, "error");
      }
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, evmBalance, updateEvmSessionBal, isExecuting, refetchEvmBalance, walletClient]);

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

      if (!address) {
        notify("Connect your wallet", "error");
        return;
      }

      if (sessionBalance < amtNum) {
        notify(`Insufficient balance. You have ${sessionBalance.toFixed(4)} USDC`, "error");
        return;
      }

      const gasBuffer = 0.01;
      const netAmt = amtNum - gasBuffer;

      if (netAmt <= 0) {
        notify("Amount too low for gas", "error");
        return;
      }

      setIsExecuting(true);
      notify("Sign to authorize withdrawal...", "pending");

      // Require user to sign an authorization message.
      // Use walletClient (wagmi) first, fall back to window.ethereum for robustness
      // (wagmi walletClient can go stale after prior transactions)
      const authMsg = `--- 15MARKET PROTOCOL ---\nACTION: WITHDRAW FROM AUTO-SIGNER\nAMOUNT: ${amt} USDC\nTO: ${address}\nTIMESTAMP: ${Date.now()}`;
      try {
        if (walletClient) {
          await walletClient.signMessage({ message: authMsg, account: address });
        } else if (window.ethereum) {
          // Fallback: direct ethereum provider sign (works even when wagmi client is stale)
          const msgHex = '0x' + Array.from(new TextEncoder().encode(authMsg)).map(b => b.toString(16).padStart(2, '0')).join('');
          await window.ethereum.request({ method: 'personal_sign', params: [msgHex, address] });
        } else {
          throw new Error("No wallet available to sign");
        }
        console.log("✅ [WITHDRAW] User authorized");
      } catch (sigErr) {
        if (sigErr.code === 4001 || sigErr.message?.includes('rejected') || sigErr.message?.includes('denied')) {
          notify("Withdrawal cancelled by user", "error");
        } else {
          notify("Signature failed: " + (sigErr.shortMessage || sigErr.message), "error");
        }
        setIsExecuting(false);
        return;
      }

      notify("Processing sweep...", "pending");

      // Fix floating-point precision before sending (e.g. 0.49500000000000004 → "0.495000")
      const cleanNetAmt = parseFloat(netAmt.toFixed(6));

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 25000); // 25s max

      let res;
      try {
        res = await fetch(`${KEEPER_URL_ARC}/session/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            address,
            amount: cleanNetAmt,
            signature: "authorized"
          })
        });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw new Error("Network timeout — Arc RPC may be congested. Try again in a moment.");
        }
        throw fetchErr;
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Sweep failed");
      }

      const data = await res.json();
      const sweepHash = data.txHash;

      notify("Arc Withdrawal Successful!", "success");

      const newTx = {
        id: `withdraw-${Date.now()}`,
        type: "WITHDRAW",
        amount: amtNum.toFixed(4),
        timestamp: Date.now(),
        tx: sweepHash,
        network: 'arc'
      };

      setTransactionHistory(prev => [newTx, ...prev]);

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
  }, [evmSessionWallet, address, notify, sessionBalance, updateEvmSessionBal, isExecuting, refetchEvmBalance, walletClient]);

  if (isLoading) return (
    <div className="fixed inset-0 z-[100] backdrop-blur-sm flex flex-col items-center justify-center bg-black/40">
      <motion.div animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }} transition={{ duration: 2, repeat: Infinity }} className="relative mb-20 flex flex-col items-center justify-center">
        <div className="absolute inset-0 blur-[60px] bg-[#3CB371] opacity-20" />
        <img src="/logo.png" alt="logo" className="h-32 lg:h-48 w-auto relative z-10 drop-shadow-[0_0_40px_#3CB37160]" />
      </motion.div>

      <div className="flex flex-col items-center justify-center w-full">
        <MascotLoader
          status="running"
          progress={loadingProgress}
          label="Pre-Flight Systems Check"
          theme={theme}
        />
      </div>
    </div>
  );

  if (!authenticated) return (
    <div className={themeClass}>
      <LandingPage theme={theme} />
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} theme={theme} />}
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={`min-h-screen ${uiVersion === 'v2' ? 'h-screen overflow-hidden' : 'overflow-x-hidden'} font-sans flex flex-col items-center ${themeClass}`}
      style={{
        color: theme === 'light' ? '#1f2937' : '#ffffff',
        transition: "color 0.3s ease"
      }}>



      <ThemeTransitionOverlay isAnimating={isAnimatingTheme} targetTheme={targetTheme} />

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
          setUiVersion={setUiVersion}
          uiVersion={uiVersion}
          onViewReceipt={(tx) => {
            setSelectedTransaction(tx);
            setIsTransactionReceiptOpen(true);
          }}
        />
      ) : (
        <div className={`w-full flex-1 flex flex-col items-center flex-shrink-0 ${uiVersion === 'v2' ? 'py-0 overflow-hidden' : 'py-4 lg:py-6'}`}>
          <header className={`w-full ${uiVersion === 'v2' ? 'max-w-[1600px]' : 'max-w-7xl'} px-4 lg:px-6 flex items-center justify-between mb-0 relative z-50 ${uiVersion === 'v2' ? 'py-0' : ''}`}>
            <div className={`flex items-center transition-all duration-500`}
              style={{ paddingLeft: uiVersion === 'v2' && !isSmallScreen ? (showSideHistory ? '268px' : '36px') : '0px' }}>
              <img src="/logo.png" alt="logo" className={`${uiVersion === 'v2' ? 'h-14 lg:h-24' : 'h-10 lg:h-14'} w-auto drop-shadow-[0_0_50px_rgba(60,179,113,0.3)] ${theme === 'light' ? 'invert hue-rotate-180' : ''}`} />
            </div>

            <div className={`hidden lg:flex items-center gap-3 ${uiVersion === 'v2' ? 'px-2 py-1' : ''}`}>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <WalletBalance network={network} theme={theme} balanceOverride={sessionMode ? sessionBalance : parseFloat(evmBalance)} sessionMode={sessionMode} />
              <button onClick={() => setView("dashboard")} className="p-2 rounded-xl border backdrop-blur-md transition-all group active:scale-95"
                style={{
                  backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                }}>
                <User size={18} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
              </button>
              <UnifiedWalletButton theme={theme} />
            </div>

            <div className="flex lg:hidden landscape:hidden items-center gap-2">
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

          {/* Global V2 Architectural Separator (Runs across the screen) */}
          {uiVersion === 'v2' && (
            <div className="w-full flex flex-col mt-[-15px] mb-[10px] relative z-[60]">
              <div className="w-full h-[1.5px] bg-[#3CB371] shadow-[0_0_15px_rgba(60,179,113,0.3)]" />
              <div className="w-full h-[1.5px] bg-[#3CB371] shadow-[0_0_20px_rgba(60,179,113,0.4)] mt-[2px]" />
            </div>
          )}

          {uiVersion === 'v1' && (
            <div className={`w-full relative z-[45] overflow-hidden border-y ${isLight ? 'bg-[#f0f9f4]/95 border-[#3CB371]/10' : 'bg-[#0d0d0d]/80 border-white/5 backdrop-blur-md'}`}>
              <GlobalTradeScroller theme={theme} isV1={true} />
            </div>
          )}


          <div className={`w-full ${uiVersion === 'v2' ? 'max-w-[1600px]' : 'max-w-4xl lg:max-w-7xl'} px-4 sm:px-6 lg:px-8 flex flex-col items-center flex-1 min-h-0`}>
            {uiVersion === 'v1' ? (
              <div className="w-full flex-none grid grid-cols-12 gap-4 lg:gap-6 mb-8 relative z-0 mt-2 h-auto lg:h-[calc(100vh-150px)] lg:min-h-0">
                {/* Chart Widget - First in stack on mobile */}
                <div className={`col-span-12 lg:col-span-8 flex flex-col gap-3 rounded-[24px] lg:rounded-[32px] relative z-0 shadow-2xl transition-all duration-300 overflow-hidden border lg:h-full glass-panel chart-glow min-h-[280px] md:min-h-[400px] lg:min-h-0 w-full max-w-[94%] md:max-w-full mx-auto`}
                  style={{
                    background: theme === 'light' ? '#f0f9f4' : 'rgba(10, 10, 10, 0.7)',
                    boxShadow: theme === 'light'
                      ? '0 10px 40px rgba(0, 0, 0, 0.04), inset 0 0 40px rgba(60, 179, 113, 0.05)'
                      : `0 0 60px ${GREEN}30, 0 0 20px ${GREEN}20, inset 0 0 40px ${GREEN}05`,
                    borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.18)' : `${GREEN}40`
                  }}>
                  <CustomChart symbol={activeMarket.binance} theme={theme} network={network} activeMarket={activeMarket} uiVersion={uiVersion} setActiveMarket={handleMarketChange} activeTrades={activeTrades} />
                </div>

                {/* Sidebar - Below chart on mobile, right side on desktop */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 lg:h-full min-h-0 w-full max-w-[94%] md:max-w-full mx-auto">
                  {/* Trade Terminal - Second in stack on mobile */}
                  <div className="flex-none">
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
                      showManagement={showManagement} setShowManagement={setShowManagement}
                      uiVersion={uiVersion}
                    />
                  </div>

                  {/* Active Section (Live Execution) - Third in stack on mobile */}
                  <div className="flex-1 min-h-[250px] lg:min-h-0 glass-panel rounded-xl lg:rounded-2xl p-2 lg:p-3 flex flex-col min-h-0 overflow-hidden">
                    <LiveExecution
                      activeTrades={activeTrades} setActiveTrades={setActiveTrades} price={price}
                      setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
                      theme={theme} currentNetwork={network}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full flex lg:flex-row landscape:flex-row flex-col gap-3 lg:gap-4 mb-6 relative z-0 h-auto lg:h-[calc(100vh-95px)] landscape:h-[calc(100vh-95px)] min-h-0">
                {/* V2: Integrated One Screen Layout */}
                <motion.div
                  layout
                  className="w-full md:w-[70%] flex flex-col gap-1.5 h-full min-h-0 transition-all duration-500 relative"
                  style={{ paddingLeft: !isSmallScreen && showSideHistory ? '220px' : (!isSmallScreen ? '36px' : '0px') }}>

                  {uiVersion === 'v2' && (
                    <SideHistoryPane
                      isOpen={showSideHistory}
                      onToggle={() => setShowSideHistory(!showSideHistory)}
                      tradeHistory={tradeHistory}
                      theme={theme}
                      setSelectedPnLTrade={setSelectedPnLTrade}
                      setIsPnLOpen={setIsPnLOpen}
                    />
                  )}


                  {/* Scroller only above chart in V2 */}
                  <div className={`w-full overflow-hidden border-b transition-colors duration-300 ${theme === 'light' ? 'border-[#3CB371]/5 bg-transparent' : 'border-white/[0.03] bg-transparent'}`}>
                    <GlobalTradeScroller theme={theme} />
                  </div>
                  <div className="flex-1 min-h-[350px] lg:h-full lg:min-h-0 rounded-[32px] overflow-hidden border transition-all duration-300 glass-panel chart-glow flex flex-col"
                    style={{
                      background: theme === 'light' ? '#f0f9f4' : 'rgba(10, 10, 10, 0.7)',
                      boxShadow: theme === 'light'
                        ? '0 10px 40px rgba(0, 0, 0, 0.04), inset 0 0 40px rgba(60, 179, 113, 0.05)'
                        : `0 0 60px ${GREEN}10, inset 0 0 40px ${GREEN}05`,
                      borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.15)' : `${GREEN}15`
                    }}>
                    <div className="flex-1 w-full h-full flex relative">
                      {/* Chart Area */}
                      <div className="flex-1 w-full h-full relative min-w-0">
                        <CustomChart
                          symbol={activeMarket.binance}
                          theme={theme}
                          network={network}
                          activeMarket={activeMarket}
                          uiVersion={uiVersion}
                          setActiveMarket={handleMarketChange}
                          activeTrades={activeTrades}
                          currentPrice={price}
                        />
                      </div>

                      {/* Slim Order Book Area (Hidden on Mobile or when History is Open) */}
                      <div className={`hidden ${showSideHistory ? 'lg:hidden' : 'lg:flex'} w-[120px] xl:w-[150px] flex-col border-l transition-all duration-300 ${theme === 'light' ? 'border-[#3CB371]/10 bg-[#e6f4ed]/30' : 'border-white/5 bg-black/20'}`}>
                        <div className={`px-4 py-3 border-b text-[10px] font-black tracking-widest uppercase flex items-center gap-2 ${theme === 'light' ? 'text-[#0a261a]/60 border-[#3CB371]/10' : 'text-white/40 border-white/5'}`}>
                          Order Book
                        </div>
                        <div className="flex-1 overflow-hidden p-2">
                          <OrderBook price={price} theme={theme} symbol={activeMarket.symbol} />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  layout
                  className={`w-full md:w-[30%] flex flex-row lg:flex-col ${showActiveExpanded ? 'gap-0' : 'gap-3'} h-auto lg:h-full min-h-0`}
                >
                  {/* Trading Terminal Box */}
                  <div className={`rounded-[24px] lg:rounded-[32px] overflow-hidden border glass-panel transition-all duration-500 flex flex-col ${showActiveExpanded ? 'h-0 opacity-0 pointer-events-none mb-0 w-0' : 'h-auto w-1/2 lg:w-full'} min-h-0`}
                    style={{
                      background: theme === 'light' ? 'rgba(240, 250, 245, 0.9)' : 'rgba(10,10,10,0.8)',
                      borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.18)' : 'rgba(255,255,255,0.05)'
                    }}>
                    <div className={`${showActiveExpanded ? 'h-0 overflow-hidden' : 'p-2 lg:p-4'} flex flex-col min-h-0`}>
                      <TradeTerminal
                        transparent={true}
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
                        showManagement={showManagement} setShowManagement={setShowManagement}
                        uiVersion={uiVersion}
                      />
                    </div>
                  </div>

                  {/* Active Trade / Controls Box */}
                  <div className={`flex-1 min-h-0 rounded-[24px] lg:rounded-[32px] overflow-hidden border glass-panel transition-all duration-500 flex flex-col ${showActiveExpanded ? 'w-full' : 'w-1/2 lg:w-full'}`}
                    style={{
                      background: theme === 'light' ? 'rgba(240, 250, 245, 0.9)' : 'rgba(10,10,10,0.8)',
                      borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.18)' : 'rgba(255,255,255,0.05)'
                    }}>
                    <div className="p-1 lg:p-3 flex flex-col h-full min-h-0">
                      <LiveExecution
                        activeTrades={activeTrades} setActiveTrades={setActiveTrades} price={price}
                        setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
                        theme={theme} currentNetwork={network}
                        isTruncated={uiVersion === 'v2' && showManagement && !showActiveExpanded}
                        isExpanded={showActiveExpanded}
                        setIsExpanded={setShowActiveExpanded}
                      />
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Forced Orientation Overlay for V2 Mobile */}
            {showPortraitLock && <PortraitPrompt theme={theme} />}

            {uiVersion === 'v1' && (
              <div className="w-full max-w-4xl lg:max-w-7xl mx-auto px-4 sm:px-6 flex flex-col justify-center">
                <TradeHistory
                  wallet={wallet} sessionMode={sessionMode} sessionBalance={sessionBalance}
                  tradeHistory={tradeHistory} setTradeHistory={setTradeHistory}
                  setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
                  GREEN={GREEN} CORAL={CORAL}
                  evmSessionWallet={evmSessionWallet}
                  theme={theme} currentNetwork={network}
                />
                {/* Campaign / Winner Banners - Moved below trading for better mobile flow */}
                <div className="w-full mb-6 flex flex-col gap-4 mt-6">
                  {winnerBanner && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`w-full glass-panel !rounded-2xl mb-6 p-4 lg:p-6 border relative`}
                      style={{
                        background: theme === 'light' ? '#f0f9f4' : 'rgba(10, 10, 10, 0.7)',
                        borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.2)' : 'rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <div className={`absolute top-0 right-0 p-8 opacity-5 pointer-events-none ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                        <Trophy size={80} />
                      </div>
                      <div className="flex items-center gap-4 lg:gap-8 relative z-10">
                        <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
                          <Trophy size={32} className="text-yellow-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500 bg-yellow-500/5 px-2 py-0.5 rounded">Winner Detected</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest truncate max-w-[100px] lg:max-w-none ${theme === 'light' ? 'text-black/40' : 'text-white/20'}`}>{winnerBanner.owner}</span>
                          </div>
                          <h3 className={`text-lg lg:text-xl font-black tracking-tighter uppercase ${theme === 'light' ? 'text-black' : 'text-white'}`}>
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
                        <div className={`p-4 ${isLight ? 'bg-[#3CB371]/10 border-[#3CB371]/20 text-[#3CB371]' : 'bg-white/5 border-white/10 text-[#3CB371]'} border rounded-2xl`}>
                          <Trophy size={24} />
                        </div>
                        <div>
                          <h3 className={`text-lg font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} uppercase tracking-tight`}>{camp.title}</h3>
                          <div className="flex flex-wrap items-center gap-4 mt-1">
                            <div className={`flex items-center gap-1.5 text-[10px] font-black ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} uppercase tracking-widest`}>
                              <Calendar size={12} />
                              Ends {new Date(camp.endTime).toLocaleString()}
                            </div>
                            <div className={`w-1 h-1 ${isLight ? 'bg-[#3CB371]/10' : 'bg-white/10'} rounded-full`} />
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
                          : (isLight ? 'bg-[#3CB371] text-white' : 'bg-white text-black') + ' hover:scale-105 active:scale-95 shadow-xl'
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
            )}

          </div>
        </div>
      )
      }



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
        notify={notify}
        uiVersion={uiVersion}
        setUiVersion={setUiVersion}
        theme={theme}
      />
      <PnLModal isOpen={isPnLOpen} onClose={() => setIsPnLOpen(false)} trade={selectedPnLTrade} theme={theme} />



      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
      </AnimatePresence>

      <footer className={`${uiVersion === 'v2' ? 'fixed bottom-1 left-0 w-full px-8 z-[100] opacity-30 hover:opacity-100 transition-opacity pointer-events-none' : 'w-full max-w-7xl mt-10 mb-6 px-4 py-6 border-t border-white/5'} flex items-center justify-between gap-6 flex-none bg-transparent`}
        style={{ fontFamily: 'Arial, sans-serif' }}>
        <div className="flex items-center gap-4 pointer-events-auto">
          <img src="/logo.png" alt="15market" className="h-[15px] lg:h-[20px] w-auto opacity-60" />
          <span className={`text-[7px] lg:text-[9px] font-bold tracking-widest ${theme === 'light' ? 'text-black' : 'text-white'}`}>
            © 2026 15market
          </span>
        </div>
        <span className={`text-[7px] lg:text-[9px] font-medium tracking-widest pointer-events-auto ${theme === 'light' ? 'text-black/60' : 'text-white/60'}`}>
          Built by 15labs
        </span>
      </footer>
      <TransactionReceiptModal
        isOpen={isTransactionReceiptOpen}
        onClose={() => setIsTransactionReceiptOpen(false)}
        transaction={selectedTransaction}
      />
    </motion.div >
  );
}
