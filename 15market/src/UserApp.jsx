import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { GlobalTradeScroller } from "./components/GlobalTradeScroller";
import { RoundsTradeScroller } from "./components/RoundsTradeScroller";
import { ProfileModal } from "./components/ProfileModal";
import { PnLModal } from "./components/PnLModal";
import { TransactionReceiptModal } from "./components/TransactionReceiptModal";
import {
  MessageSquare, User, Trophy, Calendar, CheckCircle, ChevronRight,
  Image as ImageIcon, PartyPopper, Settings, LogOut, Coins, Menu, X, Shield, Lock,
  History, ChevronUp, ChevronDown, Share2, ExternalLink, Zap, Activity, TrendingUp,
  Maximize2, RotateCw, Layers
} from "lucide-react";
import { Stamp } from "./components/Stamp";
import { parseEther, parseUnits, formatUnits, encodeFunctionData } from "viem";
// Solana imports removed
import ArcABI from "./abi/ArcPrediction.json";
import * as ethers from "ethers";
import { publicClient } from "./client";

import { WalletBalance } from "./components/WalletBalance";
import { LandingPage } from "./components/LandingPage";
import { DashboardPage } from "./components/DashboardPage";
import { AdminDashboard } from "./components/AdminDashboard";

import MessagingSystem from "./components/MessagingSystem";
import { ARC_CONTRACT_ADDRESS, ARC_USDC_ADDRESS, KEEPER_URL, KEEPER_URL_ARC, KEEPER_URL_ROUNDS, ADMIN_TOKEN, ARC_RPC, ARC_RPC_BACKUP, ARC_CHAIN_ID, ARC_ROUNDS_CONTRACT_ADDRESS } from "./constants";


// Memoized Sub-components
import { TradeTerminal } from "./components/TradeTerminal";
import { LiveExecution } from "./components/LiveExecution";
import { TradeHistory } from "./components/TradeHistory";
import { RoundsTradeHistory } from "./components/RoundsTradeHistory";
import { UnifiedWalletButton } from "./components/UnifiedWalletButton";
import { OrderBook } from "./components/OrderBook";
import { ActiveTradesSidebar } from "./components/ActiveTradesSidebar";
import { MascotLoader } from "./components/MascotLoader";
import CustomChart from './components/CustomChart';
import Toast from "./components/Toast";
import { ThemeToggle } from "./components/ThemeToggle";
import SideHistoryPane from "./components/SideHistoryPane";

import { RoundsTerminal } from "./components/RoundsTerminal";
import RoundsChart from "./components/RoundsChart";
import RoundsAccessGate from "./components/RoundsAccessGate";
import { OnboardingFlow } from "./components/OnboardingFlow";
import vaultClient from './utils/vaultClient';

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
      background: theme === 'light' ? 'rgba(180, 217, 199, 0.98)' : 'rgba(5, 5, 5, 0.98)'
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

/**
 * Mobile Bottom History Pane for V2 (Slide-up drawer style)
 */
const MobileBottomHistoryPane = ({ isOpen, onToggle, tradeHistory, theme, setSelectedPnLTrade, setIsPnLOpen, userProfile }) => {
  const isDark = theme !== 'light';

  return (
    <motion.div
      initial={false}
      animate={{
        y: isOpen ? 0 : 'calc(100% - 32px)',
      }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="absolute inset-0 z-[110] flex flex-col pointer-events-none"
      style={{ height: '100%' }}
    >
      <div className={`
        w-full h-full pointer-events-auto
        backdrop-blur-xl border-t border-x rounded-t-[32px]
        flex flex-col overflow-hidden
        ${isDark
          ? 'bg-gradient-to-br from-[#1B5E3C]/95 to-[#0D2B1D]/95 shadow-[0_-10px_40px_rgba(27,94,60,0.4)] border-white/10'
          : 'bg-gradient-to-br from-[#E2EFEA]/98 to-[#D9E9E2]/98 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border-[#3CB371]/30'}
      `}>
        {/* Horizontal Toggle Handle Bar */}
        <div
          onClick={onToggle}
          className={`
            w-full h-8 flex items-center justify-center cursor-pointer 
            transition-all duration-300 relative shrink-0
            ${isDark 
              ? 'bg-white/5 border-b border-white/5' 
              : 'bg-black/5 border-b border-black/5'}
          `}
        >
          {/* Branded "Glow Line" at the top edge */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#48c97f] to-transparent opacity-90" />
          
          <div className="flex items-center justify-center gap-3 w-full">
            <History size={14} className={isDark ? "text-white" : "text-[#0a261a]"} style={isDark ? { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' } : {}} />
            <span className={`text-[11px] font-black uppercase tracking-[0.25em] ${isDark ? "text-white" : "text-[#0a261a]"}`}>
              TRADE HISTORY ({userProfile?.stats?.totalTrades || tradeHistory.length})
            </span>
            {isOpen ? <ChevronDown size={12} className={isDark ? "text-white/80" : "text-black/60"} /> : <ChevronUp size={12} className={isDark ? "text-white/80" : "text-black/60"} />}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-12 flex flex-col gap-2">
          {tradeHistory.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
              <History size={48} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No history yet</p>
            </div>
          ) : (
            tradeHistory.slice(0, 50).map((trade) => {
              const isWin = trade.status === 'WON';
              const isLoss = trade.status === 'LOST';

              return (
                <div
                  key={trade.id}
                  className={`
                    p-4 rounded-2xl border transition-all active:scale-[0.98]
                    ${isDark ? 'bg-white/5 border-white/5' : 'bg-[#cce3d7] border-[#3CB371]/20 shadow-sm'}
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`
                        text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter
                        ${trade.direction === 'UP' ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}
                      `}>
                        {trade.direction}
                      </div>
                      <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>{trade.symbol || 'BTC'}</span>
                    </div>
                    <span className={`text-xs font-black ${isWin ? 'text-[#3CB371]' : isLoss ? 'text-[#FF7F50]' : (isDark ? 'text-white/40' : 'text-[#0a261a]/40')}`}>
                      {isWin ? `+$${Number(trade.payout || 0).toFixed(2)}` : trade.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[10px] opacity-40">
                      ${Number(trade.entryPrice).toFixed(2)} • {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedPnLTrade(trade); setIsPnLOpen(true); }}
                        className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5 text-white/40' : 'bg-black/5 text-black/40'}`}
                      >
                        <Share2 size={12} />
                      </button>
                      <a
                        href={`https://testnet.arcscan.app/tx/${trade.tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5 text-white/40' : 'bg-black/5 text-black/40'}`}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
};


const DissolveTransition = ({ isAnimating, targetTheme }) => {
  if (!isAnimating) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{
        duration: 0.8,
        times: [0, 0.4, 0.6, 1],
        ease: "easeInOut"
      }}
      className="fixed inset-0 z-[10000] pointer-events-none"
      style={{
        backgroundColor: targetTheme === 'light' ? '#b4d9c7' : '#030303',
      }}
    />
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

    // Sync theme swap with the mid-point of the dissolve (fully opaque)
    setTimeout(() => {
      setTheme(nextTheme);
    }, 400);

    // End animation state after cycle completes
    setTimeout(() => {
      setIsAnimatingTheme(false);
      setTargetTheme(null);
    }, 800);
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
  const loadLocalTrades = (userAddress, isHistory, type = 'classic') => {
    try {
      if (!userAddress) return [];
      const prefix = type === 'rounds' ? '15market_rounds' : '15market';
      const key = isHistory ? `${prefix}_history_${userAddress.toLowerCase()}` : `${prefix}_active_${userAddress.toLowerCase()}`;
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
      setTradeHistory(loadLocalTrades(address, true, 'classic'));
      setActiveTrades(loadLocalTrades(address, false, 'classic'));
      setRoundsTradeHistory(loadLocalTrades(address, true, 'rounds'));
      lastAddressRef.current = address;
    }
  }, [address]);

  useEffect(() => {
    if (address && address === lastAddressRef.current) {
      localStorage.setItem(`15market_history_${address.toLowerCase()}`, JSON.stringify(tradeHistory));
    }
    tradeHistoryRef.current = tradeHistory;
  }, [tradeHistory, address]);

  useEffect(() => {
    if (address && address === lastAddressRef.current) {
      localStorage.setItem(`15market_active_${address.toLowerCase()}`, JSON.stringify(activeTrades));
    }
    activeTradesRef.current = activeTrades;
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
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const [selectedPnLTrade, setSelectedPnLTrade] = useState(null);
  const [isTransactionReceiptOpen, setIsTransactionReceiptOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [view, setView] = useState("trading"); // "trading", "dashboard", or "history"
  
  // LOCK SCROLL for Mobile History Drawer
  useEffect(() => {
    if (showMobileHistory) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [showMobileHistory]);

  const [campaigns, setCampaigns] = useState([]);
  const [winnerBanner, setWinnerBanner] = useState(null);
  const [enrollments, setEnrollments] = useState({}); // { campaignId: boolean }
  const [userLocation, setUserLocation] = useState(null); // { country, countryCode, lat, lng }

  // Main Network State
  const [network, setNetwork] = useState("arc");
  const uiVersion = "v2"; // Sunsetting v1, V2 is now the only authoritative UI
  const [gameMode, setGameMode] = useState("classic"); // "classic" | "rounds"
  const [roundsTradeHistory, setRoundsTradeHistory] = useState(() => loadLocalTrades(address, true, 'rounds'));
  const [activeRounds, setActiveRounds] = useState(() => loadLocalTrades(address, false, 'rounds'));

  // Rounds chart state — populated by RoundsTerminal via onRoundPhaseChange
  const [roundsChartState, setRoundsChartState] = useState(null);
  const [platformSettings, setPlatformSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_citadel_settings");
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return {
      minBet: 1.0,
      maxBet: 1000000.0,
      maintenanceMode: false,
      tradingHalted: false,
      systemBanner: "",
      bannerLevel: "info"
    };
  });

  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [globalLoadingProgress, setGlobalLoadingProgress] = useState(0);
  const [hasRoundsAccess, setHasRoundsAccess] = useState(null); // null = unknown, true/false = verified

  const performStealthChecks = useCallback(async (addr) => {
    if (!addr) return;
    
    setIsGlobalLoading(true);
    setGlobalLoadingProgress(0);

    const startTime = Date.now();
    const MIN_LOAD_TIME = 5000; // 5s "premium" feel as requested
    
    // Progress bar simulation for the stealth checks
    const progressInterval = setInterval(() => {
      setGlobalLoadingProgress(prev => {
        if (prev < 90) return prev + (Math.random() * 5);
        return prev;
      });
    }, 200);

    try {
      // PROMISE 1: Check if user exists (Onboarding check)
      const profilePromise = Promise.race([
        fetch(`${KEEPER_URL_ARC}/profiles/${addr.toLowerCase()}`),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Profile Timeout")), 10000))
      ]);
      
      // PROMISE 2: Check if user has Rounds access
      const roundsPromise = Promise.race([
        fetch(`${KEEPER_URL_ROUNDS}/access/check/${addr.toLowerCase()}`),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Access Timeout")), 10000))
      ]);

      const [pRes, rRes] = await Promise.all([profilePromise, roundsPromise]);
      
      let pData = null;
      if (pRes.ok) pData = await pRes.json();
      
      let rData = { authorized: false };
      if (rRes.ok) rData = await rRes.json();

      // Update Profile & Onboarding State Stealthily
      if (!pData || pData.error) {
        // New user detected
        setUserProfile({ address: addr, isInitial: true });
        setShowOnboarding(true);
      } else {
        // Returning user
        setUserProfile(pData);
        setShowOnboarding(false);
      }

      // Update Rounds Access State
      setHasRoundsAccess(rRes.ok ? rData.authorized === true : false);

    } catch (e) {
      // Quiet fail for stealth
      setHasRoundsAccess(false);
    } finally {
      clearInterval(progressInterval);
      setGlobalLoadingProgress(100);
      
      // Ensure we hit the 5s target for aesthetics
      const elapsed = Date.now() - startTime;
      const remains = Math.max(0, MIN_LOAD_TIME - elapsed);
      
      setTimeout(() => {
        setIsGlobalLoading(false);
      }, remains);
    }
  }, []);

  // Trigger stealth checks when wallet connects or changes
  useEffect(() => {
    if (address) {
      performStealthChecks(address);
    } else {
      setIsGlobalLoading(false);
      setHasRoundsAccess(null);
    }
  }, [address, performStealthChecks]);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      const res = await fetch(`${KEEPER_URL_ARC}/settings`); // Uses normalized endpoint
      if (res.ok) {
        const data = await res.json();
        // Update both React state and localStorage
        setPlatformSettings(prev => {
          const updated = { ...prev, ...data };
          if (JSON.stringify(prev) !== JSON.stringify(updated)) {
            localStorage.setItem("15market_citadel_settings", JSON.stringify(updated));
            window.dispatchEvent(new Event('storage')); // Notify other tabs
          }
          return updated;
        });
      }
    } catch (e) {
    }
  }, []);

  useEffect(() => {
    fetchGlobalSettings();
    const interval = setInterval(fetchGlobalSettings, 3000); // 3s sync for real-time maintenance

    const syncLocal = () => {
      try {
        const loaded = JSON.parse(localStorage.getItem('15market_citadel_settings'));
        if (loaded) setPlatformSettings(loaded);
      } catch (e) { }
    };
    window.addEventListener('storage', syncLocal);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', syncLocal);
    };
  }, [fetchGlobalSettings]);

  const handleRoundPhaseChange = useCallback((phase, entryPrice, pools, userDirection, timeLeft, odds, onResult, isSettled, result) => {
    setRoundsChartState({ phase, entryPrice, pools, userDirection, timeLeft, odds, onResult, isSettled, result });
  }, []);




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

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (userProfile?.isInitial && !showOnboarding) {
      setShowOnboarding(true);
    }
  }, [userProfile, showOnboarding]);

  // Auto-switch to Arc Testnet if wallet is on the wrong network
  useEffect(() => {
    if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
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
  
  // --- 🔒 SECURITY: Secure Vault Handshake on Mount ---
  useEffect(() => {
    const initSecurity = async () => {
      try {
        const apiBase = KEEPER_URL_ARC.replace(/^\/(arc|arc-api|api-arc)\//, '/');
        await vaultClient.handshake(apiBase);
      } catch (e) {
        console.error("Security handshake failed:", e);
      }
    };
    initSecurity();
  }, [KEEPER_URL_ARC]);

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [toast, setToast] = useState(null); // { message, type }
  const resolvingInProgress = useRef(new Set()); // Tracks IDs of trades currently being resolved
  const activeTradesRef = useRef([]);
  const tradeHistoryRef = useRef([]);
  const priceRef = useRef("0.00");
  const priceHistoryRef = useRef([]);
  const lastOptimisticActionTime = useRef(0);
  // 🔒 RESULT LOCK: Once a trade expires and the frontend resolves it, its outcome is stored here.
  // The reconciler will NEVER downgrade a locked result, preventing glitches.
  const lockedResults = useRef(new Map()); // tradeId → { status, settlementPrice }
  // 🗑️ REMOVED TRADES: IDs of trades that have been fully removed from activeTrades.
  // Prevents the reconciler from re-inserting them from backend data.
  const removedTradeIds = useRef(new Set());

  // Orientation & Device Detection for V2 Forced Landscape
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
      // Use orientation-based detection: Portrait = Mobile UI, Landscape = Desktop UI
      setIsSmallScreen(portrait); 
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize(); // Initial check
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const showPortraitLock = false; // Restriction removed: V2 now supports mobile/portrait layout




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

      return merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 1000);
    });

    // 4. Update Active Trades (Monotonic Status)
    setActiveTrades(prev => {
      const now = Date.now();
      const GHOST_GRACE = 5000;

      const backendActive = backendAll.filter(t => {
        const tid = String(t.id || t.tx || t.nonce);
        // 🗑️ Never re-insert trades that have been fully removed from active view
        if (removedTradeIds.current.has(tid)) return false;
        return ["PENDING", "RESOLVING"].includes(t.status);
      }).map(t => {
        // Find existing local copy to preserve its STABLE startTime
        const local = prev.find(p => String(p.id) === String(t.id));
        const startTime = (t.timestamp || t.startTime || local?.startTime || now);
        const normStart = startTime > 1000000000000 ? startTime : startTime * 1000;

        // CRITICAL: Prefer current local expiryMs if it exists to prevent countdown jumping
        const expiryMs = local?.expiryMs || t.expiryMs || (normStart + (t.duration * 1000));

        return { ...t, startTime: normStart, expiryMs, confirmed: true };
      });

      const updatedActive = [];

      backendActive.forEach(bt => {
        const btId = String(bt.id || bt.tx || bt.nonce);
        const local = prev.find(p => String(p.id || p.tx || p.nonce) === btId);

        // 🔒 CHECK LOCKED RESULT: If we resolved this trade locally at expiry, NEVER let
        // the backend revert it to PENDING/RESOLVING. The local lock is ground truth.
        const locked = lockedResults.current.get(btId);
        if (locked) {
          return;
        }

        let finalStatus = bt.status;

        // Monotonic Status Hierarchy: WON/LOST > RESOLVING > PENDING
        if (local) {
          const statusOrder = { "WON": 3, "LOST": 3, "RESOLVING": 2, "PENDING": 1 };
          if ((statusOrder[local.status] || 0) > (statusOrder[bt.status] || 0)) {
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
            settlementPrice: local?.settlementPrice || bt.settlementPrice,
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
      const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();

        // Profile not found on backend → always trigger onboarding (strict)
        if (!data || data.error) {
          setUserProfile({ address, isInitial: true });
          setShowOnboarding(true);
        } else {
          // Valid profile — clear onboarding gate, set profile globally
          setUserProfile(data);
          setShowOnboarding(false);
        }
      } else {
        // Non-200 response — treat as no profile, force onboarding
        setUserProfile({ address, isInitial: true });
        setShowOnboarding(true);
      }
    } catch (e) {
      setUserProfile({ address, isInitial: true });
      setShowOnboarding(true);
    } finally {
      setProfileChecked(true);
    }
  }, [address]);

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
      const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature: sig })
      }).catch(err => {
        throw new Error(`Connection to Backend Failed`);
      });

      if (!res.ok) {
        let errData = { error: "Unknown Error" };
        try { errData = await res.json(); } catch (e) { }
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
        }).catch(e => { });
      }

      setIsSignerInitializing(false);
      notify("Auto-Signer Activated (Server-Managed)", "success");

    } catch (err) {
      notify("Setup failed", "error");
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
        setTreasuryBalance(parseFloat(ethers.formatEther(bal)));
      } catch (e) { }
    };
    fetchTreasury();
    // ... existing ...
  }, []); // Keeping original dep array

  // Execute trade
  const executeTrade = async (params = null) => {
    if (isExecuting) return;

    // Determine if we are placing a Rounds trade vs Classic trade
    const activeType = params?.type || (gameMode === 'rounds' ? 'rounds' : 'classic');
    const isRounds = activeType === 'round' || activeType === 'rounds';

    if (platformSettings.tradingHalted) {
      return notify("TRADING HALTED BY ADMIN - Operations Paused", "error");
    }

    const activeDirection = params?.direction || direction;
    const activeAmount = params?.amount || amount;
    const activeDuration = params?.duration || duration;

    let activePrice = parseFloat(price);
    if (!activePrice || activePrice <= 0) {
      return notify("Waiting for price feed sync...", "error");
    }
    if (!activeDirection) return notify("Select UP or DOWN first", "error");
    if (!activeAmount || parseFloat(activeAmount) <= 0) return notify("Enter a valid amount", "error");

    const currentBal = sessionMode ? sessionBalance : balance;
    const sanitizedAmount = (activeAmount || "0").toString().replace(',', '.');
    const stakeAmt = parseFloat(sanitizedAmount);

    // For session trades, require a small margin (0.1 USDC) for gas to avoid "Insufficient funds for gas" errors
    const gasMargin = sessionMode ? 0.1 : 0;

    if (stakeAmt + gasMargin > currentBal) {
      return notify(`Insufficient ${network === 'arc' ? 'USDC' : 'SOL'}. ${sessionMode ? `Session wallet needs at least ${stakeAmt + gasMargin} USDC (Stake + Gas room)` : `Balance: ${currentBal.toFixed(3)}`}`, "error");
    }

    if (Number(activeAmount) < parseFloat(platformSettings.minBet) && activeType !== 'rounds') {
      return notify(`Min trade: ${platformSettings.minBet} ${network === 'arc' ? 'USDC' : 'SOL'}`, "error");
    }

    // Ensure active expansion pane is controlled if necessary
    if (typeof setShowActiveExpanded === 'function') setShowActiveExpanded(false);

    // setIsExecuting(true); // REMOVED global block for burst mode

    // Generate truly unique bet ID immediately
    const addressSuffix = address ? parseInt(address.slice(-4), 16) : 0;
    const tradeId = Date.now() * 1000 + Math.floor(Math.random() * 1000000) + addressSuffix;
    const dirVal = (activeDirection === "buy" || activeDirection === "UP") ? 1 : 0;
    const entryPriceParams = Math.floor(activePrice * 100000000);
    const ASSET_ID_MAP = { 'eth': 0, 'btc': 1, 'sol': 2, 'mon': 3, 'jup': 4, 'xrp': 5 };
    const assetId = ASSET_ID_MAP[activeMarket?.id?.toLowerCase()] || 0;
    const activeUserAddr = (sessionMode && evmSessionWallet) ? evmSessionWallet.address : address;
    const now = Date.now();
    const amtNum = parseFloat(activeAmount);

    setIsExecuting(true);
    notify("Processing Trade...", "pending");

    try {
      if (!isConnected) {
        throw new Error("Please connect wallet first");
      }
      const amountWei = parseUnits(parseFloat(sanitizedAmount).toFixed(18), 18);
      let txHash;

      // ─── ROUNDS P2P (REAL CONTRACT & SESSION SUPPORT) ───
      if (activeType === 'rounds') {
        const roundId = params.roundId || params.poolId;
        const dirVal = (activeDirection === "UP" ? 1 : 0);
        const amountWei = parseEther(parseFloat(sanitizedAmount).toFixed(6));

        // --- OPTIMISTIC BALANCE DEDUCTION (instant UI feedback) ---
        if (sessionMode) {
          setSessionBalance(prev => Math.max(0, prev - amtNum));
        } else {
          setEvmBalance(prev => Math.max(0, parseFloat(prev || '0') - amtNum).toString());
        }
        lastOptimisticActionTime.current = Date.now();

        if (sessionMode && evmSessionWallet) {
          // AUTO-SIGNER MODE
          const res = await fetch(`${KEEPER_URL_ROUNDS}/rounds/session-enter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address, // main address
              roundId: roundId.toString(),
              direction: dirVal === 1 ? "UP" : "DOWN",
              amount: sanitizedAmount
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Auto-signer failed to enter round");
          txHash = data.txHash;
        } else {
          // STANDARD WALLET MODE
          if (!walletClient) throw new Error("Wallet not connected");

          const ROUND_CONTRACT = ARC_ROUNDS_CONTRACT_ADDRESS;
          txHash = await walletClient.sendTransaction({
            to: ROUND_CONTRACT,
            value: amountWei,
            account: address,
            data: encodeFunctionData({
              abi: [{ name: "enterRound", type: "function", inputs: [{ name: "_roundId", type: "uint256" }, { name: "_direction", type: "uint8" }] }],
              functionName: 'enterRound',
              args: [BigInt(roundId), dirVal]
            })
          });
        }

        notify("Broadcasting Entry...", "pending");

        // --- INSTANT UI START FOR ROUNDS ---
        const roundTrade = {
          id: `round-${roundId}-${Date.now()}`,
          type: 'rounds',
          amount: activeAmount,
          entryPrice: activePrice,
          direction: activeDirection,
          timestamp: new Date().toLocaleTimeString(),
          symbol: activeMarket?.symbol || 'ETH',
          status: 'LOCKED',
          poolId: roundId,
          tx: txHash,
          confirmed: false // Marker for pending confirmation
        };
        const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (String(t.id || t.tx) !== String(item.id || item.tx)))];
        setTradeHistory(prev => dedupeAndAdd(prev, roundTrade));
        setRoundsTradeHistory(prev => dedupeAndAdd(prev, roundTrade));
        setIsExecuting(false); // RELEASE BLOCK IMMEDIATELY for burst mode

        // Background Confirmation
        publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 }).then((receipt) => {
          if (!receipt || (receipt.status !== "success" && receipt.status !== 1)) {
            // Restore balance if tx failed
            if (sessionMode) {
              setSessionBalance(prev => prev + amtNum);
            } else {
              setEvmBalance(prev => (parseFloat(prev || '0') + amtNum).toString());
            }
            notify("Round entry failed on-chain.", "error");
            // Optionally remove from state if failed
            setRoundsTradeHistory(prev => prev.filter(t => t.tx !== txHash));
          } else {
            setRoundsTradeHistory(prev => prev.map(t => t.tx === txHash ? { ...t, confirmed: true } : t));
          }
        }).catch(err => {
          console.error("Rounds confirmation error:", err);
          if (sessionMode) setSessionBalance(prev => prev + amtNum);
          else setEvmBalance(prev => (parseFloat(prev || '0') + amtNum).toString());
        });

        notify("Joined the Round Successfully!", "success");
        triggerGlobalRefresh();
        return;
      }

      if (sessionMode) {
        // --- STEP 1: INSTANT UI FEEDBACK (OPTIMISTIC) ---
        const confirmedNow = Date.now();
        const optimisticTrade = {
          id: tradeId,
          direction: (dirVal === 1 ? "UP" : "DOWN"),
          amount: Number(amount).toFixed(3),
          entryPrice: activePrice.toFixed(8),
          timestamp: confirmedNow,
          status: "PENDING",
          tx: null, // Filled later
          nonce: tradeId,
          userPublicKey: activeUserAddr,
          owner: address,
          sessionOwner: activeUserAddr,
          duration: activeDuration,
          network: "arc",
          startTime: confirmedNow,
          expiryMs: confirmedNow + (activeDuration * 1000),
          symbol: activeMarket?.symbol || 'ETH',
          isSessionTrade: true,
          confirmed: false, 
          isOptimistic: true // Marker for local cleanup if failed
        };

        const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (String(t.id) !== String(item.id)))];
        
        setSessionBalance(prev => Math.max(0, prev - amtNum));
        setActiveTrades(prev => dedupeAndAdd(prev, optimisticTrade));
        setTradeHistory(prev => dedupeAndAdd(prev, optimisticTrade));
        setIsExecuting(false); // RELEASE BUTTON IMMEDIATELY FOR INSTANT FEEL
        triggerGlobalRefresh(true);
        notify("Broadcasting Trade...", "pending");

        // --- STEP 2: BACKGROUND EXECUTION ---
        (async () => {
          try {
            const res = await fetch(`${KEEPER_URL_ARC}/session/trade`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                address,
                tradeParams: {
                  id: tradeId.toString(),
                  direction: dirVal,
                  duration: Number(activeDuration),
                  entryPrice: entryPriceParams.toString(),
                  marketId: assetId,
                  amount: sanitizedAmount
                }
              })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Session trade failed");
            
            txHash = data.txHash;

            // Update optimistic trade with real TX hash
            setActiveTrades(prev => prev.map(t => t.id === tradeId ? { ...t, tx: txHash } : t));
            setTradeHistory(prev => prev.map(t => t.id === tradeId ? { ...t, tx: txHash } : t));

            // Background Confirmation
            publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 180_000 }).then((receipt) => {
              if (!receipt || (receipt.status !== "success" && receipt.status !== 1)) {
                setSessionBalance(prev => prev + amtNum);
                setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
                notify("Transaction reverted on-chain.", "error");
              } else {
                setActiveTrades(prev => prev.map(t => t.id === tradeId ? { ...t, confirmed: true } : t));
              }
            }).catch(() => {
              setSessionBalance(prev => prev + amtNum);
              setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            });

          } catch (err) {
            // ROLLBACK OPTIMISTIC STATE
            setSessionBalance(prev => prev + amtNum);
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
            notify(`Execution Error: ${err.message}`, "error");
          }
        })();

        return; // Exit main flow as background process is running
      } else {
        if (!walletClient) throw new Error("Wallet not connected");
        txHash = await walletClient.writeContract({
          address: ARC_CONTRACT_ADDRESS,
          abi: ArcABI.abi,
          functionName: 'placeBet',
          args: [BigInt(tradeId), Number(dirVal), BigInt(activeDuration), BigInt(entryPriceParams), Number(assetId), address],
          value: amountWei,
          account: address,
          gas: 800000n
        });

        notify("Trade Signed! Confirming on-chain...", "pending");

        // --- OPTIMISTIC DEDUCTION: Deduct right after signing (not after confirmation) ---
        setEvmBalance(prev => Math.max(0, parseFloat(prev || '0') - amtNum).toString());
        lastOptimisticActionTime.current = Date.now();

        // Wait for on-chain confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60000 });
        if (!receipt || (receipt.status !== "success" && receipt.status !== 1)) {
          // Restore balance on revert
          setEvmBalance(prev => (parseFloat(prev || '0') + amtNum).toString());
          throw new Error("Transaction Reverted on-chain");
        }

        const confirmedNow = Date.now();
        
        const strictTrade = {
          id: tradeId,
          direction: (dirVal === 1 ? "UP" : "DOWN"),
          amount: Number(amount).toFixed(3),
          entryPrice: activePrice.toFixed(8),
          timestamp: confirmedNow,
          status: "PENDING",
          tx: txHash,
          nonce: tradeId,
          userPublicKey: address,
          owner: address,
          duration: activeDuration,
          network: "arc",
          startTime: confirmedNow,
          expiryMs: confirmedNow + (activeDuration * 1000),
          symbol: activeMarket?.symbol || 'ETH',
          isSessionTrade: false,
          confirmed: true,
        };

        const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (String(t.id || t.tx) !== String(item.id || item.tx)))];
        setActiveTrades(prev => dedupeAndAdd(prev, strictTrade));
        setTradeHistory(prev => dedupeAndAdd(prev, strictTrade));

        // Balance already deducted optimistically above — DON'T deduct again
        triggerGlobalRefresh(true);

        // Tell backend to track it (Ping handles updating backend startTime correctly)
        const pingPayload = vaultClient.encryptPayload({
          id: tradeId.toString(),
          address, amount: activeAmount, direction: dirVal, duration: Number(activeDuration),
          entryPrice: entryPriceParams.toString(),
          symbol: activeMarket?.symbol || 'ETH'
        });

        fetch(`${KEEPER_URL_ARC}/trade-ping`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-session-id': vaultClient.sessionId 
          },
          body: JSON.stringify(pingPayload)
        }).catch(() => { });

        notify("Trade Confirmed & Started!", "success");
      }

      setIsExecuting(false);

    } catch (err) {
      notify(err.message, "error");
      setIsExecuting(false);
    }
  };


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
      }
    };

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

        // Record history for precise expiry price retrieval (keep 200-item buffer for chart context)
        const now = Date.now();
        priceHistoryRef.current.push({ p: truncated, t: now });
        if (priceHistoryRef.current.length > 200) priceHistoryRef.current.shift();

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
            localStorage.setItem('15market_listed_tokens', remoteStr);
          }
        }

        // 2. Fetch Remote Active Market (LIVE SYNC)
        const activeRes = await fetch(`${targetUrl}/active-market`);
        const activeData = await activeRes.json();
        if (activeData && activeData.activeId) {
          const currentLocalActiveId = localStorage.getItem('15market_active_token_id');
          if (currentLocalActiveId !== activeData.activeId) {
            localStorage.setItem('15market_active_token_id', activeData.activeId);
          }
        }

        // 3. Fetch Remote Platform Settings
        const settingsRes = await fetch(`${targetUrl}/settings`);
        const settingsData = await settingsRes.json();
        if (settingsData) {
          const settingsStr = JSON.stringify(settingsData);
          if (localStorage.getItem('15market_citadel_settings') !== settingsStr) {
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

    localStorage.setItem('15market_active_token_id', newMarket.id);
    setActiveMarket(newMarket);
    priceHistoryRef.current = []; // Clear history to avoid phantom lines when switching tokens

    // Sync with keeper
    try {
      await fetch(`${KEEPER_URL_ARC}/active-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeId: newMarket.id })
      });
    } catch (e) {
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
      
      const wbRes = await fetch(`${targetUrl}/winner-banner`);
      if (wbRes.ok) {
        const wbData = await wbRes.json();
        setWinnerBanner(wbData);
      }

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

  // Result Resolution - SYNCED WITH SERVER
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  useEffect(() => {
    fetch(`${KEEPER_URL_ARC}/time`).then(r => r.json()).then(d => {
      setServerTimeOffset(d.time - Date.now());
    }).catch(() => { });
  }, []);

  useEffect(() => {
    const checkAndResolve = () => {
      const now = Date.now() + serverTimeOffset;
      const pendingTrades = activeTrades.filter(t => t.status === "PENDING");

      for (const trade of pendingTrades) {
        const start = trade.startTime || (trade.id > 1000000000000 ? trade.id : Math.floor(trade.id / 100) * 1000);
        const expiryMs = trade.expiryMs || (start + (trade.duration * 1000));

        if (now >= expiryMs && (trade.confirmed || trade.tx)) {
          if (!resolvingInProgress.current.has(trade.id)) {
            resolvingInProgress.current.add(trade.id);

            // ACCURACY UPGRADE: Find the price in history closest to the exact expiry time
            let capturedPrice = parseFloat(priceRef.current);
            if (priceHistoryRef.current.length > 0) {
              const closest = priceHistoryRef.current.reduce((prev, curr) =>
                Math.abs(curr.t - expiryMs) < Math.abs(prev.t - expiryMs) ? curr : prev
              );
              // Only use history if it's within 1s of expiry
              if (Math.abs(closest.t - expiryMs) < 1000) {
                capturedPrice = closest.p;
              }
            }

            // Determine Outcome Locally
            const ePrice = parseFloat(trade.entryPrice);
            const isUp = String(trade.direction) === "1" || String(trade.direction).toUpperCase() === "UP";
            const diff = capturedPrice - ePrice;
            const isWon = isUp ? diff > 0 : diff < 0;
            const finalStatus = isWon ? "WON" : "LOST";
            const settlementPriceStr = capturedPrice.toFixed(2);

            // Calculate expected payout so it's not erased by frontend reconciler
            const durationNum = trade.duration || 15;
            const multiplierAmt = durationNum <= 5 ? 2.90 : (durationNum <= 10 ? 2.40 : 1.90);
            const amtParsed = parseFloat(trade.amount);
            const calcPayout = isWon ? (amtParsed * multiplierAmt).toFixed(2) : "0.00";

            // 🔒 LOCK THE RESULT: Store in ref so reconciler never overwrites this
            const tradeIdStr = String(trade.id);
            lockedResults.current.set(tradeIdStr, { status: finalStatus, settlementPrice: settlementPriceStr, payout: calcPayout });

            // Also record in tradeHistory immediately with locked result

            setTradeHistory(prev => {
              const existing = prev.find(t => String(t.id || t.tx || t.nonce) === tradeIdStr);
              if (existing) {
                return prev.map(t =>
                  String(t.id || t.tx || t.nonce) === tradeIdStr
                    ? { ...t, status: finalStatus, settlementPrice: settlementPriceStr, payout: calcPayout }
                    : t
                );
              }
              return [{ ...trade, status: finalStatus, settlementPrice: settlementPriceStr, payout: calcPayout }, ...prev];
            });

            // Update activeTrades with locked final status
            setActiveTrades(prev => prev.map(t =>
              t.id === trade.id ? { ...t, status: finalStatus, settlementPrice: settlementPriceStr, payout: calcPayout } : t
            ));

            // Explicit Lock Nudge: Send EXACT price to backend to guarantee outcome matches
            const settlePayload = vaultClient.encryptPayload({
                id: trade.id,
                exitPrice: capturedPrice
            });

            fetch(`${KEEPER_URL_ARC}/settle`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-session-id': vaultClient.sessionId
              },
              body: JSON.stringify(settlePayload)
            }).catch(() => { });
          }
        }
      }
    };
    const interval = setInterval(checkAndResolve, 500);
    return () => clearInterval(interval);
  }, [activeTrades, serverTimeOffset]);

  // Safety Cleanup: Remove finalized trades after showing result
  useEffect(() => {
    const finalStatuses = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"];
    const finished = activeTrades.filter(t => finalStatuses.includes(t.status));

    finished.forEach(trade => {
      const tid = trade.id || trade.tx || trade.nonce;
      if (tid && !cleanupTimers.current[tid]) {
        // Start a removal timer ONLY if one doesn't exist for this specific trade
        cleanupTimers.current[tid] = setTimeout(() => {
          // 🗑️ Mark as permanently removed so the reconciler never re-adds it
          removedTradeIds.current.add(String(tid));
          setActiveTrades(prev => prev.filter(t => (t.id || t.tx || t.nonce) !== tid));
          delete cleanupTimers.current[tid];
          // Auto-cleanup the removed set after 10 minutes to keep memory bounded
          setTimeout(() => removedTradeIds.current.delete(String(tid)), 10 * 60 * 1000);
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
                setTimeout(() => creditedPayouts.current.delete(betId), 5 * 60 * 1000);

                const sessionAddrLower = evmSessionWallet?.address?.toLowerCase();
                const mainAddrLower = address?.toLowerCase();

                if (sessionAddrLower && normalizedUser === sessionAddrLower) {
                  setSessionBalance(prev => prev + payoutNum);
                } else if (mainAddrLower && normalizedUser === mainAddrLower) {
                  setEvmBalance(prev => {
                    const current = parseFloat(prev || '0');
                    return (current + payoutNum).toFixed(6);
                  });
                }
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

  // --- OPTIMISTIC PAYOUT CREDITOR ---
  // If a trade hits WON status (from LiveExecution or Resolver), credit balance immediately
  useEffect(() => {
    const winningTrades = activeTrades.filter(t => t.status === "WON" && !t.balanceApplied);

    winningTrades.forEach(trade => {
      const betId = (trade.id || trade.nonce || trade.tx).toString();
      if (creditedPayouts.current.has(betId)) return;

      // Calculate payout: Stake * Multiplier
      const amt = parseFloat(trade.amount);
      const duration = trade.duration || 15;
      const multiplier = duration <= 5 ? 2.90 : (duration <= 10 ? 2.40 : 1.90);
      const payout = amt * multiplier;

      creditedPayouts.current.add(betId);
      // Clean up tracking after 10 mins (plenty of time for on-chain event to confirm)
      setTimeout(() => creditedPayouts.current.delete(betId), 600000);

      const isSession = trade.isSessionTrade || trade.sessionOwner;

      if (isSession) {
        setSessionBalance(prev => prev + payout);
      } else {
        setEvmBalance(prev => {
          const current = parseFloat(prev || '0');
          return (current + payout).toFixed(6);
        });
      }

      // Mark as applied so the chain listener doesn't double-credit
      setActiveTrades(prev => prev.map(t =>
        (t.id?.toString() === betId || t.nonce?.toString() === betId) ? { ...t, balanceApplied: true, payout: payout.toString() } : t
      ));

      notify(`INSTANT WIN! +${payout.toFixed(2)} USDC`, "success");
    });
  }, [activeTrades, evmSessionWallet, notify]);

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
        }).catch(e => {});

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

  if (platformSettings.maintenanceMode) {
    return (
      <div className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center p-8 text-center ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'}`}>
        <div className="w-24 h-24 bg-[#3CB371]/10 rounded-[32px] flex items-center justify-center mb-8 border border-[#3CB371]/20">
          <Settings className="text-[#3CB371] w-12 h-12 animate-spin-slow" />
        </div>
        <h1 className={`text-4xl font-black uppercase tracking-tighter mb-4 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
          Under Maintenance
        </h1>
        <p className={`text-sm max-w-xs font-medium leading-relaxed ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'}`}>
          We are currently upgrading the platform to provide the best trading experience. Please check back shortly.
        </p>
        <div className="mt-12 py-2 px-6 rounded-full border border-[#3CB371]/10 text-[10px] font-black uppercase tracking-widest text-[#3CB371]">
          Precision V2 Upgrade in Progress
        </div>
      </div>
    );
  }

  if (!authenticated) return (
    <div className={themeClass}>
      <LandingPage theme={theme} onToggle={toggleTheme} />
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
      className={`${isSmallScreen ? 'h-[100dvh] overflow-hidden' : 'min-h-screen h-screen overflow-hidden'} font-sans flex flex-col items-center ${themeClass}`}
      style={{
        color: theme === 'light' ? '#1f2937' : '#ffffff',
        transition: "color 0.3s ease"
      }}>



      <DissolveTransition isAnimating={isAnimatingTheme} targetTheme={targetTheme} />

      {view === "dashboard" ? (
        <DashboardPage
          onBack={() => setView("trading")}
          onAdmin={() => setView("admin")}
          wallet={wallet}
          sessionBalance={sessionBalance}
          onRefill={handleRefill}
          onWithdraw={handleWithdraw}
          treasuryBalance={treasuryBalance}
          autoSignerFees={autoSignerFees}
          userProfile={userProfile}
          theme={theme}
          isSmallScreen={isSmallScreen}
          evmSessionWallet={evmSessionWallet}
          transactionHistory={transactionHistory}
          uiVersion={uiVersion}
          onViewReceipt={(tx) => {
            setSelectedTransaction(tx);
            setIsTransactionReceiptOpen(true);
          }}
        />
      ) : view === "admin" ? (
        <AdminDashboard
          onBack={() => setView("dashboard")}
          theme={theme}
          notify={notify}
          platformSettings={platformSettings}
        />
      ) : (
        <div className="w-full flex-1 flex flex-col items-center flex-shrink-0 py-0 overflow-hidden min-h-0">

          <header className={`w-full max-w-[1600px] px-2 md:px-6 flex items-center justify-between mb-0 relative z-50 ${isSmallScreen ? 'py-0 h-[48px]' : 'py-1 lg:py-0'}`}>
            <div className="flex items-center transition-all duration-500 h-full"
              style={{ paddingLeft: !isSmallScreen ? (showSideHistory ? '268px' : '36px') : '0px' }}>
              <img src="/logo.png" alt="logo" className={`${isSmallScreen ? 'h-[64px] -my-[8px] ml-1' : 'h-[54px] lg:h-[72px]'} w-auto drop-shadow-[0_0_50px_rgba(60,179,113,0.3)] transition-all ${theme === 'light' ? 'invert hue-rotate-180' : ''}`} />
            </div>



            <div className="hidden lg:flex items-center gap-3 px-2 py-1">
              {/* Branded Game Mode Switcher - Large Screens */}
              <div className={`flex items-center p-1.5 rounded-[22px] border backdrop-blur-3xl shadow-2xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40 border-[#3CB371]/20' : 'bg-black/40 border-white/5'} scale-90 origin-right`}>
                <motion.div
                  className="absolute top-1.5 bottom-1.5 rounded-[18px] bg-gradient-to-br from-[#48c97f] to-[#1e5a38] shadow-[0_0_20px_rgba(60,179,113,0.4)]"
                  initial={false}
                  animate={{ x: gameMode === 'classic' ? 0 : 90, width: 90 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
                {[{ key: 'classic', Icon: Zap, label: 'Classic' }, { key: 'rounds', Icon: Layers, label: 'Rounds' }].map(({ key, Icon, label }) => (
                  <button key={key} onClick={() => { setGameMode(key); setView('trading'); }}
                    className={`relative z-10 flex items-center justify-center gap-2 h-8 w-[90px] transition-all duration-300`}>
                    <Icon size={12} className={`transition-colors duration-300 ${gameMode === key ? 'text-white' : (theme === 'light' ? 'text-black/30' : 'text-white/20')}`} />
                    <span className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-300 ${gameMode === key ? 'text-white' : (theme === 'light' ? 'text-black/40' : 'text-white/20')}`}>{label}</span>
                  </button>
                ))}
              </div>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <WalletBalance network={network} theme={theme} balanceOverride={sessionMode ? sessionBalance : parseFloat(evmBalance)} sessionMode={sessionMode} />
              <button onClick={() => setView("dashboard")} className="p-2 rounded-full border backdrop-blur-md transition-all group active:scale-95"
                style={{
                  backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                }}>
                <User size={18} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
              </button>
              <UnifiedWalletButton theme={theme} />
            </div>

            <div className="flex lg:hidden landscape:hidden items-center gap-1.5 md:gap-2">
              {/* Branded Game Mode Switcher - Mobile */}
              <div className={`flex items-center p-0.5 rounded-full border backdrop-blur-3xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40 border-[#3CB371]/20' : 'bg-black/40 border-white/5'}`}>
                <motion.div
                  className="absolute top-0.5 bottom-0.5 rounded-full bg-gradient-to-br from-[#48c97f] to-[#1e5a38]"
                  initial={false}
                  animate={{ x: gameMode === 'classic' ? 0 : 54, width: 54 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
                {[{ key: 'classic', Icon: Zap }, { key: 'rounds', Icon: Layers }].map(({ key, Icon }) => (
                  <button key={key} onClick={() => { setGameMode(key); setView('trading'); }}
                    className={`relative z-10 flex items-center justify-center h-[28px] w-[54px] transition-all duration-300`}>
                    <Icon size={11} className={`transition-colors duration-300 ${gameMode === key ? 'text-white' : (theme === 'light' ? 'text-black/30' : 'text-white/20')}`} />
                  </button>
                ))}
              </div>
              <div className="scale-[0.8] origin-center -mx-1.5">
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
              </div>
              <button onClick={() => setView("dashboard")} className="h-[32px] w-[32px] flex items-center justify-center rounded-full border backdrop-blur-md transition-all group active:scale-95"
                style={{
                  backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                }}>
                <User size={14} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
              </button>
              <div className="scale-[0.9] origin-right ml-[-2px]">
                <UnifiedWalletButton theme={theme} />
              </div>
            </div>
          </header>

          {/* Global V2 Architectural Separator (Runs across the screen) */}
          <div className={`w-full flex flex-col relative z-[60] ${isSmallScreen ? '-mt-[2px] mb-[2px] gap-[2px]' : '-mt-1 md:mt-0 mb-[2px] md:mb-[4px]'}`}>
            <div className="w-full h-[1.5px] bg-[#3CB371] shadow-[0_0_15px_rgba(60,179,113,0.3)]" />
            <div className="w-full h-[1.5px] bg-[#3CB371] shadow-[0_0_20px_rgba(60,179,113,0.4)]" />
            {isSmallScreen && (
              <div className="w-full mt-[2px]">
                <GlobalTradeScroller theme={theme} />
              </div>
            )}
          </div>




          <div className={`w-full ${uiVersion === 'v2' ? 'max-w-[1600px] px-2 md:px-6 lg:px-8 focus-visible:outline-none' : 'max-w-4xl lg:max-w-7xl px-4 sm:px-6 lg:px-8'} flex flex-col items-center flex-1 min-h-0`}>
            <RoundsAccessGate theme={theme} active={gameMode === 'rounds'} verified={hasRoundsAccess} onUnlock={() => console.log('[AccessGate] Rounds access verified & unlocked')}>
                <div className={`w-full flex lg:flex-row landscape:flex-row flex-col ${isSmallScreen ? 'gap-[2px]' : 'gap-0 lg:gap-1'} mb-0 md:mb-0 relative z-0 ${isSmallScreen ? 'flex-1 overflow-hidden' : 'h-auto lg:h-[calc(100vh-105px)] landscape:h-[calc(100vh-105px)]'} min-h-0`}>
                  {/* V2 Integrated Content Container */}
                  <motion.div
                    layout
                    className={`w-full lg:w-[70%] flex flex-col gap-0.5 ${isSmallScreen ? 'flex-1 min-h-0' : 'h-full flex-1'} min-h-0 transition-all duration-500 relative`}
                    style={{ paddingLeft: !isSmallScreen && showSideHistory ? (isSmallScreen ? '0px' : '220px') : (!isSmallScreen ? '36px' : '0px') }}>

                    {!isSmallScreen && (
                      <SideHistoryPane
                        isOpen={showSideHistory}
                        onToggle={() => setShowSideHistory(!showSideHistory)}
                        tradeHistory={gameMode === 'rounds' ? roundsTradeHistory : tradeHistory}
                        theme={theme}
                        setSelectedPnLTrade={setSelectedPnLTrade}
                        setIsPnLOpen={setIsPnLOpen}
                      />
                    )}

                    {!isSmallScreen && (
                      <div className={`w-full md:w-full relative z-[45] overflow-hidden mb-1 md:rounded-full`}>
                        <GlobalTradeScroller theme={theme} />
                      </div>
                    )}


                    {/* Chart Container - flex-1 fills all remaining vertical space on mobile */}
                    <div className={`${isSmallScreen ? 'flex-1' : 'flex-[2] min-h-[280px]'} lg:min-h-[400px] lg:h-full lg:min-h-0 rounded-[32px] overflow-hidden border transition-all duration-300 ${isSmallScreen ? 'backdrop-blur-2xl' : 'glass-panel chart-glow'} flex flex-col w-full min-h-0`}
                      style={{
                        background: isSmallScreen 
                          ? (theme === 'light' ? 'rgba(180, 217, 199, 0.2)' : 'rgba(255, 255, 255, 0.12)') 
                          : (theme === 'light' ? 'rgba(60, 179, 113, 0.08)' : 'rgba(10, 10, 10, 0.7)'),
                        boxShadow: isSmallScreen
                          ? (theme === 'light' 
                            ? '0 15px 45px -10px rgba(60,179,113,0.08), inset 0 5px 35px rgba(255,255,255,0.95), inset 0 -4px 20px rgba(60,179,113,0.1)' 
                            : '0 30px 90px rgba(0,0,0,0.8), inset 0 0 60px rgba(60,179,113,0.2), inset 0 2px 4px rgba(255,255,255,0.1)')
                          : (theme === 'light'
                            ? '0 10px 40px rgba(0, 0, 0, 0.04), inset 0 0 40px rgba(60, 179, 113, 0.05)'
                            : `0 0 60px ${GREEN}10, inset 0 0 40px ${GREEN}05`),
                        borderColor: isSmallScreen
                          ? (theme === 'light' ? 'rgba(60, 179, 113, 0.35)' : 'rgba(255, 255, 255, 0.08)')
                          : (theme === 'light' ? 'rgba(60, 179, 113, 0.15)' : `${GREEN}15`)
                      }}>
                      <div className="flex-1 w-full h-full flex relative">
                        {/* Chart Area */}
                        <div className="flex-1 w-full h-full relative min-w-0">
                          {gameMode === 'rounds' ? (
                            <RoundsChart
                              theme={theme}
                              currentPrice={price}
                              entryPrice={roundsChartState?.entryPrice || price}
                              timeLeft={roundsChartState?.timeLeft || 0}
                              totalDuration={roundsChartState?.phase === 'entry' ? 10 : 15}
                              pools={roundsChartState?.pools || { long: 0, short: 0 }}
                              userDirection={roundsChartState?.userDirection}
                              odds={roundsChartState?.odds}
                              onResult={roundsChartState?.onResult}
                              isSettled={roundsChartState?.isSettled}
                              phase={roundsChartState?.phase || 'entry'}
                              result={roundsChartState?.result}
                              priceHistory={priceHistoryRef.current}
                            />
                          ) : (
                            <CustomChart
                              symbol={activeMarket.binance}
                              theme={theme}
                              network={network}
                              activeMarket={activeMarket}
                              uiVersion={uiVersion}
                              setActiveMarket={handleMarketChange}
                              activeTrades={activeTrades}
                              currentPrice={price}
                              priceHistory={priceHistoryRef.current}
                            />
                          )}
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
                    className={`w-full lg:w-[30%] flex flex-col gap-1 ${isSmallScreen ? 'h-auto flex-none relative' : 'h-full flex-1'} min-h-0`}
                  >
                    {/* Trade Terminal / Active Section Side-by-Side on Mobile (Restored for balance) */}
                    <div className={`w-full flex-row lg:flex-row gap-1 lg:gap-3 ${isSmallScreen ? 'flex flex-1 min-h-0 pb-[34px] px-1' : 'hidden md:hidden lg:hidden'}`}>
                      {/* Terminal Area */}
                      <div className={`flex-1 min-h-0 min-h-[180px] lg:min-h-[320px] flex flex-col ${gameMode === 'rounds' ? '' : `rounded-[32px] lg:rounded-[32px] overflow-hidden border glass-panel p-2 ${theme === 'light' ? 'shadow-sm' : 'shadow-lg'}`}`}
                        style={{
                          background: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'transparent' : 'rgba(10,10,10,0.8)'),
                          borderColor: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'rgba(60, 179, 113, 0.15)' : 'rgba(255,255,255,0.05)')
                        }}>
                        {gameMode === 'rounds' ? (
                          <RoundsTerminal
                            price={price}
                            balance={balance}
                            executeTrade={executeTrade}
                            isExecuting={isExecuting}
                            theme={theme}
                            sessionMode={sessionMode}
                            sessionBalance={sessionBalance}
                            amount={amount}
                            handleAmountChange={handleAmountChange}
                            sliderValue={sliderValue}
                            handleSliderChange={handleSliderChange}
                            activeMarket={activeMarket}
                            onRoundPhaseChange={handleRoundPhaseChange}
                            maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                          />
                        ) : (
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
                            maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                            tradingHalted={platformSettings.tradingHalted}
                            uiVersion={uiVersion}
                          />
                        )}
                      </div>

                      {/* ACTIVE EXECUTION - Hidden entirely in Rounds mode */}
                      {(gameMode !== 'rounds') && (
                        <div className={`flex-1 min-h-0 rounded-[32px] overflow-hidden border glass-panel p-2 ${theme === 'light' ? 'shadow-sm' : 'shadow-lg'} flex flex-col`}
                          style={{
                            background: theme === 'light' ? 'transparent' : 'rgba(10,10,10,0.8)',
                            borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.15)' : 'rgba(255,255,255,0.05)'
                          }}>
                          <div className="flex flex-col h-full min-h-0">
                            <LiveExecution
                              activeTrades={activeTrades} setActiveTrades={setActiveTrades} price={price}
                              setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
                              theme={theme} currentNetwork={network}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* V2 Mobile History Drawer - Integrated into the terminal section */}
                    {isSmallScreen && (
                      <MobileBottomHistoryPane
                        isOpen={showMobileHistory}
                        onToggle={() => setShowMobileHistory(!showMobileHistory)}
                        tradeHistory={gameMode === 'rounds' ? roundsTradeHistory : tradeHistory}
                        theme={theme}
                        setSelectedPnLTrade={setSelectedPnLTrade}
                        setIsPnLOpen={setIsPnLOpen}
                        userProfile={userProfile}
                      />
                    )}
                    {/* Compact spacer */}

                    {!isSmallScreen && (
                      /* Existing Desktop V2 Layout */
                      <>
                        {/* Global System Banner */}
                        <AnimatePresence>
                          {platformSettings.systemBanner && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className={`w-full overflow-hidden relative z-[100] border-b ${platformSettings.bannerLevel === 'error' ? 'bg-red-500/10 border-red-500/20' :
                                  platformSettings.bannerLevel === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20' :
                                    platformSettings.bannerLevel === 'success' ? 'bg-[#3CB371]/10 border-[#3CB371]/20' :
                                      'bg-blue-500/10 border-blue-500/20'
                                }`}
                            >
                              <div className="max-w-[1400px] mx-auto px-6 py-2 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full animate-pulse ${platformSettings.bannerLevel === 'error' ? 'bg-red-500' :
                                      platformSettings.bannerLevel === 'warning' ? 'bg-yellow-500' :
                                        platformSettings.bannerLevel === 'success' ? 'bg-[#3CB371]' :
                                          'bg-blue-500'
                                    }`} />
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${platformSettings.bannerLevel === 'error' ? 'text-red-500' :
                                      platformSettings.bannerLevel === 'warning' ? 'text-yellow-500' :
                                        platformSettings.bannerLevel === 'success' ? 'text-[#3CB371]' :
                                          'text-blue-500'
                                    }`}>
                                    {platformSettings.systemBanner}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Navigation Bar - TOP BAR */}
                        {/* Trading Terminal Box - Dynamic height to maximize active trades space */}
                        <div className={`rounded-[22px] md:rounded-[32px] overflow-hidden transition-all duration-500 flex flex-col ${showActiveExpanded ? 'h-0 opacity-0 pointer-events-none mb-0 w-0' : (gameMode === 'rounds' ? 'lg:h-full w-full' : 'h-fit w-full lg:w-full')} min-h-0 ${gameMode === 'rounds' ? 'border-none bg-transparent shadow-none' : 'border glass-panel'}`}
                          style={{
                            background: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'rgba(240, 250, 245, 0.9)' : 'rgba(10,10,10,0.8)'),
                            borderColor: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'rgba(60, 179, 113, 0.18)' : 'rgba(255,255,255,0.05)')
                          }}>
                          <div className={`${showActiveExpanded ? 'h-0 overflow-hidden' : `${gameMode === 'rounds' ? 'p-0 flex-1 h-full' : 'p-2 lg:p-4'}`} flex flex-col min-h-0`}>
                            {gameMode === 'rounds' ? (
                              <RoundsTerminal
                                price={price}
                                balance={balance}
                                executeTrade={executeTrade}
                                isExecuting={isExecuting}
                                theme={theme}
                                sessionMode={sessionMode}
                                sessionBalance={sessionBalance}
                                amount={amount}
                                handleAmountChange={handleAmountChange}
                                sliderValue={sliderValue}
                                handleSliderChange={handleSliderChange}
                                activeMarket={activeMarket}
                                onRoundPhaseChange={handleRoundPhaseChange}
                                maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                              />
                            ) : (
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
                                maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                                tradingHalted={platformSettings.tradingHalted}
                                uiVersion={uiVersion}
                              />
                            )}
                          </div>
                        </div>

                        {/* Active Trade / Controls Box — hidden in Rounds */}
                        {gameMode !== 'rounds' && (
                          <div className={`flex-1 min-h-[160px] md:min-h-0 rounded-[22px] md:rounded-[32px] overflow-hidden border glass-panel transition-all duration-500 flex flex-col ${showActiveExpanded ? 'w-full' : 'w-full lg:w-full'}`}
                            style={{
                              background: theme === 'light' ? 'rgba(240, 250, 245, 0.9)' : 'rgba(10,10,10,0.8)',
                              borderColor: theme === 'light' ? 'rgba(60, 179, 113, 0.18)' : 'rgba(255,255,255,0.05)'
                            }}>
                            <div className="p-1 lg:p-3 flex flex-col h-full min-h-0">
                              <LiveExecution
                                activeTrades={activeTrades} setActiveTrades={setActiveTrades} price={price}
                                setSelectedPnLTrade={setSelectedPnLTrade} setIsPnLOpen={setIsPnLOpen}
                                theme={theme} currentNetwork={network}
                                isTruncated={uiVersion === 'v2' && !showActiveExpanded}
                                isExpanded={showActiveExpanded}
                                setIsExpanded={setShowActiveExpanded}
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                </div>


              {/* Forced Orientation Overlay for V2 Mobile */}
              {showPortraitLock && <PortraitPrompt theme={theme} />}


            </RoundsAccessGate>



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
        theme={theme}
      />
      <PnLModal isOpen={isPnLOpen} onClose={() => setIsPnLOpen(false)} trade={selectedPnLTrade} theme={theme} />



      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
      </AnimatePresence>

      <footer className={`${isSmallScreen ? 'hidden' : 'fixed bottom-1 left-0 w-full px-8 z-[100] opacity-30 hover:opacity-100 transition-opacity pointer-events-none'} flex items-center justify-between gap-6 flex-none bg-transparent`}
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

      {/* GET STEALTH VERIFICATION OVERLAY */}
      <AnimatePresence>
        {isGlobalLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-2xl"
          >
            <div className="flex flex-col items-center gap-10 max-w-sm w-full p-8 text-center">
              <img src="/logo.png" alt="logo" className="h-[48px] md:h-[64px] w-auto drop-shadow-[0_0_40px_rgba(60,179,113,0.4)] transition-all" />
              <MascotLoader 
                progress={globalLoadingProgress} 
                status="running" 
                label="INITIALIZING..." 
                theme="dark" 
              />
            </div>
            
            {/* Visual Flair */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden origin-center">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#3CB371]/5 rounded-full blur-[120px] animate-pulse" />
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#3CB371]/30 to-transparent animate-scanLine" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Flow for new users */}
      {showOnboarding && address && !isGlobalLoading && (
        <OnboardingFlow
          address={address}
          theme={theme}
          onComplete={(profile) => {
            setShowOnboarding(false);
            performStealthChecks(address); // Final refresh
          }}
        />
      )}
    </motion.div >
  );
}
