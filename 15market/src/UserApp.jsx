import { useEffect, useState, useCallback, useRef, useMemo, Component, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTradingWallet } from './hooks/useTradingWallet';
import { GlobalTradeScroller } from "./components/GlobalTradeScroller";
import { RoundsTradeScroller } from "./components/RoundsTradeScroller";
import {
  MessageSquare, User, Trophy, Calendar, CheckCircle, ChevronRight,
  Image as ImageIcon, PartyPopper, Settings, LogOut, Coins, Menu, X, Shield, Lock,
  History, ChevronUp, ChevronDown, Share2, ExternalLink, Zap, Activity, TrendingUp,
  Maximize2, RotateCw, Layers
} from "lucide-react";
import { Stamp } from "./components/Stamp";
import { parseEther, parseUnits } from "viem";
// Solana imports removed

import * as ethers from "ethers";
import { publicClient } from "./client";

import { WalletBalance } from "./components/WalletBalance";
import { LandingPage } from "./components/LandingPage";
import { DashboardPage } from "./components/DashboardPage";
import ComingSoonPage from "./components/ComingSoonPage";
import { CircleWalletPage } from "./components/CircleWalletPage";
import { CopyTradingPage } from "./components/CopyTradingPage";
import { DocsPage } from "./components/DocsPage";
import AssistedTradingPage from "./components/AssistedTradingPage";
import CampaignsHub from "./components/CampaignsHub";

// Lazy load conditionally rendered components
const ProfileModal = lazy(() => import("./components/ProfileModal").then(m => ({ default: m.ProfileModal })));
const PnLModal = lazy(() => import("./components/PnLModal").then(m => ({ default: m.PnLModal })));
const TransactionReceiptModal = lazy(() => import("./components/TransactionReceiptModal").then(m => ({ default: m.TransactionReceiptModal })));
const OnboardingFlow = lazy(() => import("./components/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));
const MessagingSystem = lazy(() => import("./components/MessagingSystem"));
const RoundsAccessGate = lazy(() => import("./components/RoundsAccessGate"));

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
import SuccessOverlay from "./components/SuccessOverlay";
import { ThemeToggle } from "./components/ThemeToggle";
import SideHistoryPane from "./components/SideHistoryPane";
import WalletConnectionLoading from "./components/WalletConnectionLoading";
import GlobalLoader from "./components/GlobalLoader";

import { RoundsTerminal } from "./components/RoundsTerminal";
// Rounds chart logic merged into LiveStreamingChart/CustomChart for performance
import { socketService } from './utils/socket';
import { priceSocketService } from './utils/priceSocket';

// Robust Error Boundary to prevent platform-wide crashes
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("Platform Error caught by Boundary:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[1000] bg-[#050505] flex flex-col items-center justify-center p-8 text-center text-white">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
            <Shield className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter mb-2">Platform Interrupted</h1>
          <p className="text-xs text-white/40 mb-8 max-w-xs">{this.state.error?.message || "An unexpected error occurred in the UI layer."}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-[#249C6C] rounded-xl font-black uppercase text-xs tracking-widest">Restart Terminal</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      background: theme === 'light' ? '#CFDCD5' : 'rgba(5, 5, 5, 0.98)'
    }}
  >
    <div className="relative mb-12">
      <motion.div
        animate={{ rotate: 90 }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
        className="relative"
      >
        <div className="w-32 h-20 rounded-2xl border-4 border-[#249C6C]/30 flex items-center justify-center">
          <div className="w-1 h-8 rounded-full bg-[#249C6C]/20 absolute -right-1" />
          <div className="w-2 h-2 rounded-full bg-[#249C6C]/20 absolute left-4" />
        </div>
      </motion.div>
      <motion.div
        animate={{ opacity: [0, 1, 0], x: [20, 0, -20] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute -top-8 left-1/2 -translate-x-1/2"
      >
        <RotateCw className="w-8 h-8 text-[#249C6C]" />
      </motion.div>
    </div>

    <h2 className="text-3xl font-black text-[#249C6C] uppercase tracking-tighter mb-4">
      Rotate Your Device
    </h2>
    <p className="text-white/40 text-sm font-medium max-w-xs leading-relaxed"
      style={{ color: theme === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>
      Expert-level trading requires a wider field of view. Please turn your screen to <span className="text-[#249C6C] font-bold">Landscape</span> to access the Precision V2 Terminal.
    </p>

    <div className="mt-12 flex items-center gap-3 py-2 px-4 rounded-full bg-[#249C6C]/10 border border-[#249C6C]/20">
      <Maximize2 className="w-4 h-4 text-[#249C6C]" />
      <span className="text-[10px] font-black uppercase tracking-widest text-[#249C6C]">Desktop Mode Optimization</span>
    </div>
  </motion.div>
);

/**
 * Mobile Bottom History Pane for V2 (Slide-up drawer style)
 */
const MobileBottomHistoryPane = ({ isOpen, onToggle, tradeHistory, theme, onViewReceipt, userProfile }) => {
  const isDark = theme !== 'light';

  return (
    <motion.div
      initial={false}
      animate={{
        y: isOpen ? 0 : 'calc(100% - 48px + 1%)',
      }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed inset-x-0 bottom-0 z-[110] flex flex-col pointer-events-none"
      style={{ height: '279px' }}
    >
      <div className={`
        w-full h-full pointer-events-auto
        backdrop-blur-xl border-t rounded-t-[40px]
        flex flex-col overflow-hidden
        ${isDark
          ? 'bg-[#0D2B1D]/80 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-white/10'
          : 'bg-[#CFDCD5]/80 shadow-2xl border-t-[2px] border-[#249C6C]'}
      `}>
        {/* Horizontal Toggle Handle Bar */}
        <div
          onClick={onToggle}
          className={`
            w-full h-12 flex items-center justify-center cursor-pointer 
            transition-all duration-300 relative shrink-0
            ${isDark
              ? 'bg-white/5 border-b border-white/5'
              : 'bg-[#249C6C] border-b border-[#249C6C]/20'}
          `}
        >
          {/* Branded "Glow Line" at the top edge */}
          {isDark && <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#2EC47C] to-transparent opacity-90" />}

          <div className="flex items-center justify-center gap-3 w-full">
            <History size={14} className={isDark ? "text-white" : "text-white"} style={isDark ? { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' } : {}} />
            <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${isDark ? "text-white" : "text-white"}`}
              style={{ fontFamily: '"Comfortaa", cursive' }}>
              TRADE HISTORY ({userProfile?.stats?.totalTrades || tradeHistory.length})
            </span>
            {isOpen ? <ChevronDown size={12} className={isDark ? "text-white/80" : "text-white/80"} /> : <ChevronUp size={12} className={isDark ? "text-white/80" : "text-white/80"} />}
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
              const isWin = trade.status === 'WON' || trade.status === 'PAID';
              const isLoss = trade.status === 'LOST';

              return (
                <div
                  key={trade.id}
                  className={`
                    p-4 rounded-2xl border transition-all active:scale-[0.98]
                    ${isDark ? 'bg-white/5 border-white/5' : 'bg-white/40 border-[#249C6C]/20 shadow-sm'}
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`
                        text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter
                        ${trade.direction === 'UP' ? 'bg-[#249C6C]/20 text-[#249C6C]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}
                      `}>
                        {trade.direction === 'UP' ? 'LONG' : (trade.direction === 'DOWN' ? 'SHORT' : trade.direction)}
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>
                        {trade.symbol?.toUpperCase() || 'BTC'}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-black uppercase ${isWin ? 'text-[#249C6C]' : isLoss ? 'text-[#FF7F50]' : (isDark ? 'text-white/40' : 'text-[#0a261a]/40')}`}>
                        {isWin ? `+$${Number(trade.payout || 0).toFixed(2)}` : trade.status}
                      </span>
                      {isWin && (trade.payoutSettled || trade.status === 'PAID') && (
                        <span className="text-[10px] font-bold italic text-yellow-400 tracking-wider">
                          paid
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className={`text-[10px] font-medium ${isDark ? 'opacity-40 text-white' : 'text-[#0a261a]/60'}`}>
                      ${Number(trade.entryPrice).toFixed(2)} • {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onViewReceipt(trade)}
                        className={`p-1.5 rounded-full border transition-all ${isDark ? 'bg-white/5 border-transparent text-white/40 hover:text-white' : 'bg-transparent border-[#249C6C]/20 text-[#0a261a]/40 hover:text-[#0a261a]/60 hover:bg-[#249C6C]/5'}`}
                      >
                        <Share2 size={12} />
                      </button>
                      <a
                        href={`https://testnet.arcscan.app/tx/${trade.tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1.5 rounded-full border transition-all ${isDark ? 'bg-white/5 border-transparent text-white/40 hover:text-white' : 'bg-transparent border-[#249C6C]/20 text-[#0a261a]/40 hover:text-[#0a261a]/60 hover:bg-[#249C6C]/5'}`}
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
  const { isConnected, address: wagmiAddress, chainId: connectedChainId, status } = useAccount();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();

  // Smart wallet (ERC-4337 via Pimlico) — used for CCTP source-chain gas
  const { smartWalletAddress, isSmartWalletReady } = useTradingWallet();

  // Authoritative address derivation: Prioritize Wagmi (External), then Smart Wallet, then EOA
  const address = useMemo(() => {
    if (wagmiAddress) return wagmiAddress;
    if (smartWalletAddress) return smartWalletAddress;
    if (user?.wallet?.address) return user.wallet.address;
    return null;
  }, [smartWalletAddress, wagmiAddress, user]);

  const embeddedWallet = useMemo(() => {
    if (!wallets || !Array.isArray(wallets)) return null;
    return wallets.find((w) => w.walletClientType === 'privy');
  }, [wallets]);

  const [theme, setTheme] = useState(() => localStorage.getItem('15market_theme') || 'dark');
  const [isAnimatingTheme, setIsAnimatingTheme] = useState(false);
  const [targetTheme, setTargetTheme] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('15market_theme', theme);
  }, [theme]);

  const isLight = theme === 'light';

  const toggleTheme = useCallback(() => {
    if (isAnimatingTheme) return;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    // Show the branded loading modal during the switch
    setIsGlobalLoading(true);

    setTargetTheme(nextTheme);
    setIsAnimatingTheme(true);

    // Sync theme swap with the mid-point of the transition
    setTimeout(() => {
      setTheme(nextTheme);
    }, 450);

    // Complete the transition and hide the loader
    setTimeout(() => {
      setIsAnimatingTheme(false);
      setTargetTheme(null);
      setIsGlobalLoading(false);
    }, 1800);
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
  const [direction, setDirection] = useState("DOWN");
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

  // Show the branded splash on initial page load, cleared after health check passes
  const [isGlobalLoading, setIsGlobalLoading] = useState(true);
  const [globalLoadingProgress, setGlobalLoadingProgress] = useState(0);
  const [isAppReady, setIsAppReady] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [healthProgress, setHealthProgress] = useState(0);
  const isInitializing = status === 'reconnecting' || (status === 'connecting' && !isConnected);

  const [loadingProgress, setLoadingProgress] = useState(0);

  const activeTrade = activeTrades[0] || null;

  // Backend Health Gate: Poll /health until backend responds, progress drives the three dots
  useEffect(() => {
    if (backendReady) return;

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 10;

    const checkHealth = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'OK' && !cancelled) {
            setHealthProgress(1);
            setBackendReady(true);
            setTimeout(() => {
              setIsGlobalLoading(false);
              setIsAppReady(true);
            }, 400);
            return;
          }
        }
      } catch (e) { }

      if (cancelled) return;
      attempt++;
      setHealthProgress(Math.min(0.1 + (attempt / maxAttempts) * 0.85, 0.95));
      const delay = Math.min(1500 + attempt * 500, 6000);
      setTimeout(checkHealth, delay);
    };

    checkHealth();
    return () => { cancelled = true; };
  }, [backendReady]);

  // Loading progress animation
  useEffect(() => {
    if (!isAppReady) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => (prev < 98 ? prev + (100 - prev) * 0.1 : prev));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
    }
  }, [isAppReady]);


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
  const [view, setView] = useState("trading"); // "trading", "dashboard", "history", or "circle_wallet"
  const [circleWalletMode, setCircleWalletMode] = useState(null); // 'send' or 'receive'
  const [showCircleWallet, setShowCircleWallet] = useState(false);

  // WalletConnectionLoading disabled — Turnkey modal now opens instantly on click.
  // The branded splash runs on page load instead (isGlobalLoading above).
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const wasConnectedRef = useRef(isConnected);

  // PERSISTENCE: Transaction History

  // PERSISTENCE: Transaction History
  useEffect(() => {
    localStorage.setItem("15market_transactions_v1", JSON.stringify(transactionHistory));
  }, [transactionHistory]);

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

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [hasRoundsAccess, setHasRoundsAccess] = useState(null); // null = unknown, true/false = verified
  const [liveOdds, setLiveOdds] = useState(null);

const performStealthChecks = useCallback(async (addr) => {
    if (!addr) return;

    setIsGlobalLoading(true);
    setGlobalLoadingProgress(0);
    setIsOffline(!navigator.onLine);

    // Adaptive timeout based on network conditions
    const getTimeout = () => {
        // Try to get network information if available
        if (navigator.connection && navigator.connection.effectiveType) {
            switch (navigator.connection.effectiveType) {
                case 'slow-2g':
                    return 8000; // 8 seconds for slow 2G
                case '2g':
                    return 6000; // 6 seconds for 2G
                case '3g':
                    return 4000; // 4 seconds for 3G
                default:
                    return 3000; // 3 seconds for 4G or better
            }
        }
        return 3000; // Default 3 seconds
    };

    const progressInterval = setInterval(() => {
        setGlobalLoadingProgress(prev => {
            if (prev < 90) return prev + (Math.random() * 10);
            return prev;
        });
    }, 100);

    const runChecks = async () => {
        try {
            if (!navigator.onLine) {
                setIsOffline(true);
                return false;
            }
            setIsOffline(false);

            // Timeout helper to prevent infinite loading if backend hangs
            const fetchWithTimeout = async (url, options = {}) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), getTimeout());
                try {
                    const res = await fetch(url, { ...options, signal: controller.signal });
                    clearTimeout(id);
                    return res;
                } catch (e) {
                    clearTimeout(id);
                    throw e;
                }
            };

            // Run checks in parallel to reduce total time
            const [profileRes, sessionRes, roundsRes] = await Promise.all([
                fetchWithTimeout(`${KEEPER_URL_ARC}/profiles/${addr.toLowerCase()}`).catch(() => null),
                fetchWithTimeout(`${KEEPER_URL_ARC}/session/init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: addr.toLowerCase() })
                }).catch(() => null),
                fetchWithTimeout(`${KEEPER_URL_ROUNDS}/access/check/${addr.toLowerCase()}`).catch(() => ({ ok: false }))
            ]);

            // Process profile result
            const localOnboarded = localStorage.getItem(`15market_onboarded_${addr.toLowerCase()}`) === 'true';
            if (profileRes && profileRes.ok) {
                const pData = await profileRes.json();
                setUserProfile(pData);
                if (!pData.username && !localOnboarded) {
                    setShowOnboarding(true);
                    localStorage.removeItem(`15market_onboarded_${addr.toLowerCase()}`);
                } else {
                    setShowOnboarding(false);
                    localStorage.setItem(`15market_onboarded_${addr.toLowerCase()}`, 'true');
                }
            } else {
                // Do NOT force onboarding if they are already onboarded locally!
                if (localOnboarded) {
                    setShowOnboarding(false);
                } else {
                    setShowOnboarding(true);
                }
            }

            // Process session result
            if (sessionRes && sessionRes.ok) {
                const sData = await sessionRes.json();
                setSessionBalance(parseFloat(sData.balance || 0));
            }

            // Process rounds result
            if (roundsRes && roundsRes.ok) {
                const rData = await roundsRes.json();
                setHasRoundsAccess(rData.authorized === true);
            } else {
                setHasRoundsAccess(false); // Resolve to false if server is unreachable
            }

            return true;
        } catch (e) {
            console.warn("[StealthChecks] Attempt failed:", e.message);
            return false;
        }
    };

    // Retry loop with exponential backoff for poor networks
    let success = await runChecks();
    let retryCount = 0;
    const maxRetries = navigator.onLine ? 3 : 0; // Fewer retries if initially offline
    
    while (!success && retryCount < maxRetries) {
        retryCount++;
        // Exponential backoff: 1s, 2s, 4s, etc. but cap at 10s
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (navigator.onLine) {
            success = await runChecks();
            if (success) break;
        } else {
            setIsOffline(true);
        }
    }

    // Stealth checks no longer dismiss the loader.
    // The health gate (backendReady effect) handles loader dismissal.
    // These checks just populate profile/session/rounds data in the background.
    clearInterval(progressInterval);
    setGlobalLoadingProgress(100);
}, [address]);

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

    const syncLocal = () => {
      try {
        const loaded = JSON.parse(localStorage.getItem('15market_citadel_settings'));
        if (loaded) setPlatformSettings(loaded);
      } catch (e) { }
    };
    window.addEventListener('storage', syncLocal);

    return () => {
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

  // Auto-switch to Arc Testnet if wallet is on the wrong network (unless bridging)
  useEffect(() => {
    if (view !== 'circle_wallet' && isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
      switchChain?.({ chainId: ARC_CHAIN_ID });
    }
  }, [isConnected, connectedChainId, switchChain, view]);

  const [evmBalance, setEvmBalance] = useState("0");
  const [pendingStakes, setPendingStakes] = useState({}); // Tracking hash -> amount
  const [sessionMode, setSessionMode] = useState(true);
  const [evmSessionWallet, setEvmSessionWallet] = useState(null);
  const [sessionBalance, setSessionBalance] = useState(0);
  // Ref that always mirrors sessionBalance — used by async callbacks to avoid stale closures
  const sessionBalanceRef = useRef(0);
  const [depositAmount, setDepositAmount] = useState("0.1");
  const [isSessionSynced, setIsSessionSynced] = useState(() => localStorage.getItem("15market_session_synced") === "true");
  const [isSignerInitializing, setIsSignerInitializing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);

  // Security Handshake Purged

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [toast, setToast] = useState(null); // { message, type, onClick }
  const [successOverlay, setSuccessOverlay] = useState(null); // { title }

  const notify = useCallback((message, type = 'success', onClick = null) => {
    setToast({ id: Date.now() + Math.random(), message, type, onClick });
  }, []);

  const resolvingInProgress = useRef(new Set()); // Tracks IDs of trades currently being resolved
  const activeTradesRef = useRef([]);
  const tradeHistoryRef = useRef([]);
  const priceRef = useRef("0.00");
  const lastPriceUpdateRef = useRef(Date.now());
  const priceHistoryRef = useRef([]);
  const lastOptimisticActionTime = useRef(0);
  // 🗑️ REMOVED TRADES: IDs of trades that have been fully removed from activeTrades.
  // Prevents the reconciler from re-inserting them from backend data.
  const removedTradeIds = useRef(new Set());
  const cleanupTimers = useRef({});
  const tickProbeRef = useRef({});
  const execProbeSeqRef = useRef(0);
  const priceProbeRef = useRef({ start: 0, success: 0, fail: 0 });

  // Orientation & Device Detection (Decoupled & Robust)
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [isLandscapeBlocked, setIsLandscapeBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const portrait = window.innerHeight > window.innerWidth;
      const small = window.innerWidth < 1024;
      const shortSide = Math.min(window.innerWidth, window.innerHeight);
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      setIsPortrait(portrait);
      setIsSmallScreen(small && portrait);
      // Block landscape on mobile-class devices only
      setIsLandscapeBlocked(!portrait && shortSide < 600 && isMobile);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const showPortraitLock = false;

  const postDebugLog = useCallback((payload) => {

  }, []);

  const handleRoundsUnlock = useCallback(() => {
    console.log('[AccessGate] Rounds access verified & unlocked');
  }, []);




  // Custom balance fetcher (Replaces Wagmi useBalance)
  // 1. Core Balance Fetchers
  const refetchEvmBalance = useCallback(async (force = false) => {
    if (!address) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${KEEPER_URL_ARC}/balance/${address}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const formatted = data.balance;
        if (force) {
          setEvmBalance(formatted);
        } else {
          const msSinceLastAction = Date.now() - lastOptimisticActionTime.current;
          if (msSinceLastAction < 20000) return;
          setEvmBalance(prev => {
            const current = parseFloat(prev || '0');
            const newBal = parseFloat(formatted || '0');
            return Math.abs(newBal - current) > 0.000001 ? formatted : prev;
          });
        }
      }
    } catch (e) { }
  }, [address]);

  // Keep sessionBalanceRef in sync with sessionBalance state so async
  // callbacks always read the live value without stale-closure issues.
  useEffect(() => {
    sessionBalanceRef.current = sessionBalance;
  }, [sessionBalance]);

  const updateEvmSessionBal = useCallback(async (force = false) => {
    if (!address) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${KEEPER_URL_ARC}/session/balance/${address}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const bal = parseFloat(data.balance);
        if (isNaN(bal)) return;
        setSessionBalance(bal);
      }
    } catch (err) { }
  }, [address]);

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
      const mergedMap = new Map();

      // Helper to get a canonical ID for a trade
      const getTradeKey = (t) => String(t.id || t.nonce || t.tx || t.txHash || "");

      // First, populate with backend trades (Source of Truth)
      backendAll.forEach(bt => {
        const key = getTradeKey(bt);
        if (key) mergedMap.set(key, bt);
      });

      // Then, merge with local trades, preserving authoritative fields
      prev.forEach(local => {
        const key = getTradeKey(local);
        if (!key) return;

        const bt = mergedMap.get(key);
        if (bt) {
          // If in both, merge them with a status hierarchy
          const statusOrder = { "PAID": 4, "WON": 3, "LOST": 3, "RESOLVING": 2, "PENDING": 1, "TIMEOUT": 0 };
          const finalStatus = (statusOrder[local.status] || 0) > (statusOrder[bt.status] || 0) ? local.status : bt.status;

          mergedMap.set(key, {
            ...bt,
            ...local, // Prefer local fields for UI state (optimistic, etc)
            status: finalStatus,
            // But prefer backend for finalized result fields
            won: bt.won !== undefined ? bt.won : local.won,
            isWinning: bt.isWinning !== undefined ? bt.isWinning : local.isWinning,
            exitPrice: bt.exitPrice || local.exitPrice,
            payout: bt.payout || local.payout,
          });
        } else {
          // If only local, keep it if it's recent or final
          const isFinal = ["WON", "LOST", "PAID"].includes(local.status);
          const isRecent = (Date.now() - (local.timestamp || Date.now())) < 600000;
          if (isFinal || isRecent) {
            mergedMap.set(key, local);
          }
        }
      });

      return Array.from(mergedMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100);
    });

    // 4. Update Active Trades (Monotonic Status)
    setActiveTrades(prev => {
      const now = Date.now();
      const GHOST_GRACE = 5000;
      const mergedMap = new Map();
      const getTradeKey = (t) => String(t.id || t.nonce || t.tx || t.txHash || "");

      // 1. Process Backend Active Trades
      backendAll.filter(t => {
        const tid = getTradeKey(t);
        if (removedTradeIds.current.has(tid)) return false;
        return ["PENDING", "RESOLVING", "WON", "LOST"].includes(t.status);
      }).forEach(t => {
        const key = getTradeKey(t);
        const local = prev.find(p => getTradeKey(p) === key);

        const startTime = (t.timestamp || t.startTime || local?.startTime || now);
        const normStart = startTime > 1000000000000 ? startTime : startTime * 1000;
        const expiryMs = local?.expiryMs || t.expiryMs || (normStart + (t.duration * 1000));

        // Only keep in active view if not too old
        if (now <= (expiryMs + GHOST_GRACE)) {
          mergedMap.set(key, {
            ...local,
            ...t,
            startTime: normStart,
            expiryMs,
            confirmed: true
          });
        }
      });

      // 2. Process Local Active Trades (might be optimistic)
      prev.forEach(local => {
        const key = getTradeKey(local);
        if (!key || mergedMap.has(key)) return;

        const normExp = local.expiryMs || ((local.timestamp || local.startTime || now) + (local.duration * 1000));
        if (now <= (normExp + GHOST_GRACE)) {
          mergedMap.set(key, { ...local, expiryMs: normExp });
        }
      });

      return Array.from(mergedMap.values());
    });
  }, [triggerGlobalRefresh]);

  /**
   * Initialize Server-Side Session Wallet (Stateless & Secure)
   */
  const initializeSessionWallet = useCallback(async () => {
    if (!address) return;

    try {
      setIsSignerInitializing(true);

      const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.toLowerCase() })
      }).catch(err => {
        throw new Error(`Connection to Backend Failed`);
      });

      if (!res.ok) throw new Error(`Backend init failed (${res.status})`);

      const data = await res.json();
      if (!data.sessionAddress) throw new Error("No session address returned");

      const sessionObj = { address: data.sessionAddress, isRemote: true };

      setEvmSessionWallet(sessionObj);
      setSessionBalance(parseFloat(data.balance) || 0);
      setIsSessionSynced(true);
      setSessionMode(true);
      localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);

      setIsSignerInitializing(false);

    } catch (err) {
      setIsSignerInitializing(false);
      hasInitAttempted.current = false; // Allow automatic retries if it failed
      console.warn("Session init fallback:", err.message);
      // Cached address (if any) is already shown via the fast-path in the useEffect below
    }
  }, [address]);

  const fetchMyProfile = useCallback(async () => {
    if (!address) return;
    try {
      // STEALTH: Pre-check returning user status via hint
      // STEALTH: Pre-check returning user status via hint and canonical onboarding flag
      const canonicalOnboarded = localStorage.getItem(`15market_onboarded_${address.toLowerCase()}`) === "true";
      const hint = localStorage.getItem(`15market_profile_exists_${address.toLowerCase()}`) || (canonicalOnboarded ? "true" : null);

      const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) {
          setUserProfile(data);

          if (!data.username && !canonicalOnboarded) {
            setShowOnboarding(true);
            localStorage.removeItem(`15market_profile_exists_${address.toLowerCase()}`);
            localStorage.removeItem(`15market_onboarded_${address.toLowerCase()}`);
          } else {
            setShowOnboarding(false);
            localStorage.setItem(`15market_profile_exists_${address.toLowerCase()}`, "true");
            localStorage.setItem(`15market_onboarded_${address.toLowerCase()}`, "true");
          }

          // Persistent History Sync: Merge backend profile trades into UI history
          if (Array.isArray(data.trades)) {
            reconcileTrades(data.trades);
          }
          // AUTO-INIT session wallet for returning users
          if (!evmSessionWallet && !isSignerInitializing) {
            initializeSessionWallet();
          }
        }
      } else if (res.status === 404) {
        // Profile wiped or never existed
        if (canonicalOnboarded || hint === "true") {
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true);
          localStorage.removeItem(`15market_profile_exists_${address.toLowerCase()}`);
          localStorage.removeItem(`15market_onboarded_${address.toLowerCase()}`);
        }
      }
    } catch (e) {
      console.error("Profile fetch error:", e);
      // In case of network failure, only bypass if they were previously verified
      if (localStorage.getItem(`15market_profile_exists_${address.toLowerCase()}`) === "true") {
        setShowOnboarding(false);
      }
    } finally {
      setProfileChecked(true);
    }
  }, [address, initializeSessionWallet]);

  const hasInitAttempted = useRef(false);
  useEffect(() => { hasInitAttempted.current = false; }, [address]);

  // AUTO-INITIALIZE Session Wallet as soon as any address is available.
  // FAST PATH: Restore cached session address immediately so the UI shows the
  // wallet address right away before the network call completes.
  useEffect(() => {
    if (!address) return;

    // Instantly restore cached address for returning users
    const cachedAddr = localStorage.getItem(`15market_session_addr_${address.toLowerCase()}`);
    if (cachedAddr && !evmSessionWallet) {
      setEvmSessionWallet({ address: cachedAddr, isRemote: true, cached: true });
    }

    // Always fire a background network sync (for fresh balance + confirming address)
    if (!isSignerInitializing && !hasInitAttempted.current) {
      hasInitAttempted.current = true;
      initializeSessionWallet();
    }
  }, [address, evmSessionWallet, isSignerInitializing, initializeSessionWallet]);

  // 3. Aggressive Logic (Optimized: fewer redundant refreshes)
  const aggressiveRefresh = useCallback((force = false) => {
    triggerGlobalRefresh(force);
    setTimeout(() => triggerGlobalRefresh(force), 1000);
    fetchMyProfile();
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

  // Periodic session balance refresh (every 5s) — always sync with backend.
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      updateEvmSessionBal(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [address, updateEvmSessionBal]);

  // Real-time Balance Sync
  useEffect(() => {
    if (!address) return;
    // JOIN room once per address change
    socketService.emit('join_user', address.toLowerCase());
  }, [address]);

  useEffect(() => {
    if (!address) return;

    // Bind Socket listeners
    const unbindBal = socketService.on('balance_update', (data) => {
      // Always accept balance updates from the backend — it is the source of truth.
      const val = data.balance || data.available;
      if (val !== undefined && val !== null) {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed >= 0) {
          setSessionBalance(parsed);
        }
      }

      if (data.reason === 'WIN' || data.reason === 'WIN_PAYOUT' || data.reason === 'WIN_PAYOUT_SETTLED') {
        const payoutAmt = parseFloat(data.payout || 0);
        const reasonLabel = data.reason === 'WIN_PAYOUT_SETTLED' ? 'Confirmed' : 'Received';

        notify(`$${payoutAmt.toFixed(2)} has been added to your balance`, "success", () => {
          // Find the trade in history or active to show receipt
          const tid = String(data.betId || "");
          const tx = String(data.txHash || "");
          const trade = [...activeTrades, ...tradeHistory].find(t =>
            (tid && String(t.id || t.nonce) === tid) ||
            (tx && String(t.tx || t.txHash) === tx)
          );
          if (trade) {
            setSelectedTransaction({
              ...trade,
              tx: data.txHash || trade.tx
            });
            setIsTransactionReceiptOpen(true);
          }
        });

        if (data.reason === 'WIN_PAYOUT_SETTLED') {
          const tid = String(data.betId || "");
          const tx = String(data.txHash || "");
          const matchFn = t => (tid && String(t.id || t.nonce) === tid) || (tx && String(t.tx || t.txHash) === tx);
          setActiveTrades(prev => prev.map(t => matchFn(t) ? { ...t, payoutSettled: true, payout: payoutAmt > 0 ? payoutAmt : t.payout, tx: data.txHash || t.tx } : t));
          setTradeHistory(prev => prev.map(t => matchFn(t) ? { ...t, payoutSettled: true, payout: payoutAmt > 0 ? payoutAmt : t.payout, tx: data.txHash || t.tx } : t));
        }
        // Also write payout to trade record on WIN_PAYOUT (instant credit)
        if (data.reason === 'WIN_PAYOUT' && payoutAmt > 0) {
          const tid = String(data.betId || "");
          const matchFn = t => (tid && String(t.id || t.nonce) === tid);
          setActiveTrades(prev => prev.map(t => matchFn(t) ? { ...t, payout: payoutAmt } : t));
          setTradeHistory(prev => prev.map(t => matchFn(t) ? { ...t, payout: payoutAmt } : t));
        }
        triggerGlobalRefresh(true);
      }
    });

    // trade_tick and trade_expired handlers consolidated in authoritative block (line ~2130)

    const unbindSettled = socketService.on('trade_settled', (data) => {
      console.log("[Socket] Trade Settled:", data);
      const tid = String(data.betId || data.tradeId);
      const updateFn = (t) => {
        if (String(t.id || t.nonce) === tid) {
          return {
            ...t,
            status: data.won ? 'WON' : 'LOST',
            won: data.won,
            confirmed: true,
            payoutPending: data.won && t.status !== 'PAID',
            payout: data.payout !== undefined ? parseFloat(data.payout) : t.payout,
            exitPrice: data.exitPrice || t.exitPrice,
            settlementPrice: data.exitPrice || t.settlementPrice,
            amount: data.amount || t.amount,
          };
        }
        return t;
      };
      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
    });

    // Redundant trade_settled listener removed. Consolidation into the main listener below.

    const unbindPayout = socketService.on('payout_completed', (data) => {
      console.log("[Socket] Payout Completed:", data);
      const tid = String(data.betId || data.tradeId);
      const payoutAmt = parseFloat(data.payout || 0);

      const updateFn = (t) => {
        if (String(t.id || t.tx || t.nonce) === tid) {
          return {
            ...t,
            status: 'PAID',
            payoutTx: data.txHash || data.tx,
            tx: data.txHash || data.tx,
            payoutPending: false,
            confirmed: true,
            payout: payoutAmt > 0 ? payoutAmt : t.payout,
          };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
      if (payoutAmt > 0) {
        notify(`Payout Confirmed: +$${payoutAmt.toFixed(2)}`, "success");
      }
      triggerGlobalRefresh(true);
    });

    const unbindPayoutFailed = socketService.on('payout_failed', (data) => {
      console.warn("[Socket] Payout Failed:", data);
      const tid = String(data.betId || data.tradeId);

      const updateFn = (t) => {
        if (String(t.id || t.tx || t.nonce) === tid) {
          return {
            ...t,
            status: 'PAYOUT_FAILED',
            payoutPending: false,
            error: data.message || "On-chain payout failed"
          };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
      notify(`Payout Failed: ${data.message || "Network Error"}`, "error");
    });

    // Consolidated trade_tick and trade_expired listeners moved to authoritative block below.


    // Redundant trade_settled listener removed. Consolidation into the main listener below.


    const unbindErr = socketService.on('terminal_error', (data) => {
      notify(data.message, "error");
      console.error("[Terminal Error]", data);
    });

    return () => {
      unbindBal();
      unbindPayout();
      unbindPayoutFailed();
      unbindSettled();
      unbindErr();
    };
  }, [address, notify, triggerGlobalRefresh]);




  // Periodic Universal Sync (Optimized for Instant Pulse Mode)
  useEffect(() => {
    if (address) {
      // 1. Initial Fetch (Balance only syncs on Mount or Transaction)
      triggerGlobalRefresh(true);
      fetchMyProfile();

      // 2. Ensure session wallet is initialized immediately if missing
      // (Consolidated with the auto-init logic above to prevent loops)
    }
  }, [address, triggerGlobalRefresh, fetchMyProfile]);

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

  const wallet = useMemo(() => {
    if (!address) return { connected: false };

    return {
      connected: true,
      address: address,
      publicKey: null
    };
  }, [isConnected, address]);

  const login = () => {
  };

  const userObj = useMemo(() => {
    if (isConnected && address) return { wallet: { address } };
    return null;
  }, [isConnected, address]);

  const GREEN = "#249C6C";
  const CORAL = "#FF4444";

  useEffect(() => {
    localStorage.setItem("15market_network", "arc");
  }, []);

  const themeClass = "theme-arc";

  const toggleSessionMode = () => {
    // Session mode is now the only mode. This just ensures we are synced.
    if (!evmSessionWallet) {
      initializeSessionWallet();
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
      } catch (e) {
        console.warn("Treasury fetch error:", e.message);
      }
    };
    fetchTreasury();
  }, []);

  // Execute trade
  const executeTrade = async (params = null) => {
    const probeId = `exec-${Date.now()}-${++execProbeSeqRef.current}`;
    // #region agent log
    postDebugLog({ runId: 'initial', hypothesisId: 'H1', location: 'UserApp.jsx:executeTrade:entry', message: 'executeTrade entry', data: { probeId, isExecuting, gameMode, paramsType: params?.type || null, sessionMode, sessionBalance: sessionBalanceRef.current, amount, duration, direction } });
    // #endregion
    // Determine if we are placing a Rounds trade vs Classic trade
    const activeType = params?.type || (gameMode === 'rounds' ? 'rounds' : 'classic');
    const isRounds = activeType === 'round' || activeType === 'rounds';

    // For rounds, block double-submission. For classic, allow burst mode (multiple concurrent trades).
    if (isRounds && isExecuting) return;

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

    // For the embedded session model, the stake comes from the session wallet balance.
    const currentBal = sessionBalance;
    const sanitizedAmount = (activeAmount || "0").toString().replace(',', '.');
    const stakeAmt = parseFloat(sanitizedAmount);
    if (isNaN(stakeAmt) || stakeAmt <= 0) {
      return notify("Invalid trade amount", "error");
    }

    // Reserve a tiny margin for gas (USDC is gas on Arc)
    const gasMargin = 0.001;

    if (stakeAmt + gasMargin > currentBal) {
      return notify(`Insufficient Session Balance. Need at least ${(stakeAmt + gasMargin).toFixed(4)} USDC. Please Deposit.`, "error");
    }
    // #region agent log
    postDebugLog({ runId: 'initial', hypothesisId: 'H2', location: 'UserApp.jsx:executeTrade:validated', message: 'trade validated pre-submit', data: { probeId, activeType, stakeAmt, currentBal, gasMargin, activeDirection, activeDuration } });
    // #endregion

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
    const ASSET_ID_MAP = { 'eth': 0, 'btc': 1, 'sol': 2, 'mon': 3, 'jup': 4, 'xrp': 5 };
    const assetId = ASSET_ID_MAP[activeMarket?.id?.toLowerCase()] || 0;
    // Guard against NaN: if activePrice is invalid, abort early
    if (isNaN(activePrice) || activePrice <= 0) {
      return notify("Price feed not ready. Please wait.", "error");
    }
    const entryPriceParams = (assetId === 2) ? Math.floor(activePrice * 1000000) : Math.floor(activePrice * 100);
    const activeUserAddr = (sessionMode && evmSessionWallet) ? evmSessionWallet.address : address;
    const now = Date.now();
    const amtNum = parseFloat(activeAmount);

    // --- INSTANT UI START ---
    // Only lock for rounds. Classic trades allow burst mode (multiple concurrent).
    if (isRounds) {
      setIsExecuting(true);
      setTimeout(() => setIsExecuting(false), 2000);
    }

    try {
      if (!address) {
        throw new Error("Please sign in or connect wallet to trade");
      }

      let txHash;

      // ─── ROUNDS P2P (REAL CONTRACT & SESSION SUPPORT) ───
      if (activeType === 'rounds') {
        const roundId = params.roundId || params.poolId;
        const dirVal = (activeDirection === "UP" ? 1 : 0);
        const amountWei = parseEther(parseFloat(sanitizedAmount).toFixed(6));

        // --- OPTIMISTIC BALANCE DEDUCTION (instant UI feedback) ---
        setSessionBalance(prev => Math.max(0, prev - amtNum));
        lastOptimisticActionTime.current = Date.now();
        // #region agent log
        postDebugLog({ runId: 'initial', hypothesisId: 'H3', location: 'UserApp.jsx:executeTrade:rounds:deduct1', message: 'rounds first optimistic deduction applied', data: { probeId, amtNum, balanceBefore: sessionBalanceRef.current } });
        // #endregion

        if (evmSessionWallet) {
          // AUTO-SIGNER MODE (SESSION WALLET)
          const res = await fetch(`${KEEPER_URL_ROUNDS}/session-enter`, {
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
          if (!res.ok) throw new Error(data.error || "Trading wallet failed to enter round");
          txHash = data.txHash;
        } else {
          throw new Error("Trading wallet is still syncing. Please wait 1 second and try again.");
        }

        notify("Broadcasting Entry...", "pending");

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
            setSessionBalance(prev => prev + amtNum);
            notify("Round entry failed on-chain.", "error");
            // Optionally remove from state if failed
            setRoundsTradeHistory(prev => prev.filter(t => t.tx !== txHash));
          } else {
            setRoundsTradeHistory(prev => prev.map(t => t.tx === txHash ? { ...t, confirmed: true } : t));
          }
        }).catch(err => {
          console.error("Rounds confirmation error:", err);
          setSessionBalance(prev => prev + amtNum);
        });

        notify("Joined the Round Successfully!", "success");
        triggerGlobalRefresh();
        return;
      }

      // ─── CLASSIC TRADING — EMBEDDED WALLET MODEL ───────────────────────────────
      // Step 1: Frontend calls /session/execute
      // Step 2: Backend derivations session wallet and sends stake to treasury on-chain
      // Step 3: Backend returns the txHash and registers the trade

      // --- Show trade card as PENDING immediately (Optimistic) ---
      const confirmedNow = Date.now();
      const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (
        String(t.id) !== String(item.id) &&
        (!item.tx || String(t.tx) !== String(item.tx)) &&
        (!item.nonce || String(t.nonce) !== String(item.nonce))
      ))];
      const exactEntryPrice = (assetId === 2) ? (entryPriceParams / 1000000) : (entryPriceParams / 100);
      const optimisticTrade = {
        id: tradeId,
        direction: dirVal === 1 ? 'UP' : 'DOWN',
        amount: Number(activeAmount).toFixed(3),
        entryPrice: exactEntryPrice.toString(),
        timestamp: confirmedNow,
        status: 'PENDING',
        tx: null,
        nonce: tradeId,
        userPublicKey: address,
        owner: address,
        duration: activeDuration,
        network: 'arc',
        startTime: confirmedNow,
        expiryMs: confirmedNow + (activeDuration * 1000),
        symbol: activeMarket?.symbol || 'ETH',
        confirmed: false,
        isOptimistic: true,
      };
      setActiveTrades(prev => dedupeAndAdd(prev, optimisticTrade));
      setTradeHistory(prev => dedupeAndAdd(prev, optimisticTrade));

      // Optimistic deduction for instant UI feel
      setSessionBalance(prev => Math.max(0, prev - amtNum));
      lastOptimisticActionTime.current = Date.now();

      // --- Execute Trade via Backend ---
      const backgroundTrade = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s — chain confirmation can take time
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              address,
              tradeParams: {
                id: tradeId.toString(),
                direction: dirVal,
                duration: Number(activeDuration),
                entryPrice: entryPriceParams.toString(),
                marketId: assetId,
                amount: sanitizedAmount,
              }
            })
          });
          clearTimeout(timeoutId);
          const data = await res.json();

          if (!res.ok) {
            // Restore balance ONLY on definitive failure (not timeout)
            notify(data.error || 'Trade failed', 'error');
            setSessionBalance(prev => prev + amtNum);
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
            return;
          }

          // ✅ Trade Active (On-chain stake confirmed)
          const confirmedTradeId = data.tradeId || tradeId;
          const txHash = data.txHash;

          setActiveTrades(prev => prev.map(t =>
            t.id === tradeId
              ? { ...t, id: confirmedTradeId, tx: txHash, confirmed: true, status: 'PENDING' }
              : t
          ));
          setTradeHistory(prev => prev.map(t =>
            t.id === tradeId
              ? { ...t, id: confirmedTradeId, tx: txHash, confirmed: true, status: 'PENDING' }
              : t
          ));

          notify('Trade Active ✓', 'success');
        } catch (err) {
          clearTimeout(timeoutId);
          console.error('[Trade] Execution error:', err.message);
          // On timeout/abort, DON'T restore balance — the backend may still be processing.
          // The backend's balance_update event will reconcile the actual balance.
          // Only restore on definitive non-timeout errors.
          if (err.name !== 'AbortError') {
            setSessionBalance(prev => prev + amtNum);
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
          }
          notify(err.name === 'AbortError' ? '⏳ Trade processing — balance will sync when confirmed' : err.message, 'error');
        }
      };

      backgroundTrade();

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
    // 30s fallback poll — socket events handle instant updates now
    const interval = setInterval(fetchTradeHistory, 30000);
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


  const defaultTokens = useMemo(() => ([
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', pair: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', pythId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT', kraken: 'ETHUSD' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pair: '0xCBCdAf43E4E8BA277685D62aA137BA4904f421ac', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT', kraken: 'XBTUSD' },
    { id: 'sol', symbol: 'SOL', name: 'Solana', pair: '0x127452f3f1da03d95f9bbd58a2d10c1154b33001', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT', kraken: 'SOLUSD' },
    { id: 'mon', symbol: 'MON', name: 'Monad', pythId: '0x0000000000000000000000000000000000000000000000000000000000000000', binance: 'MONUSDT' },
  ]), []);

  const mergeMarketWithDefault = useCallback((market) => {
    if (!market?.id) return market;
    const fallback = defaultTokens.find(t => t.id === market.id);
    return fallback ? { ...fallback, ...market } : market;
  }, [defaultTokens]);

  const [activeMarket, setActiveMarket] = useState(() => {

    const saved = localStorage.getItem('15market_listed_tokens');
    const listed = saved ? JSON.parse(saved) : defaultTokens;

    const activeId = localStorage.getItem('15market_active_token_id') || 'eth';
    const selected = listed.find(t => t.id === activeId) || listed[0];
    const fallback = defaultTokens.find(t => t.id === selected?.id);
    return fallback ? { ...fallback, ...selected } : selected;
  });





  // ─── UNIFIED PRICE CONSUMPTION ───
  // Uses the dedicated price-frontend service for ultra-low-latency streaming.
  const oraclePricesRef = useRef({ btc: 0, eth: 0, sol: 0, ts: {} });
  const [streamStatus, setStreamStatus] = useState('connecting');

  useEffect(() => {
    // 1. Unified High-Speed Price Stream (Terminal + Chart Consistency)
    // We use the direct Pyth feed here to ensure the terminal price is as fluid as the chart.
    const unbindDirect = priceSocketService.on('price', (data) => {
      const { key, price, ts } = data;
      if (oraclePricesRef.current[key] !== undefined) {
        oraclePricesRef.current[key] = price;
        oraclePricesRef.current.ts[key] = ts;
        setStreamStatus('active');
        lastPriceUpdateRef.current = Date.now();

        // Immediate UI update if we were stuck at 0.00
        if (priceRef.current === "0.00" || priceRef.current === "0") {
          const pStr = (Math.floor(price * 100) / 100).toFixed(2);
          setPrice(pStr);
          priceRef.current = pStr;
        }
      }
    });

    // 2. Backend Feed (Execution Reference)
    // We still listen to the backend but it doesn't overwrite the high-speed UI stream.
    const unbindBackend = socketService.on('price', (data) => {
      // Just used for internal health/sync checks if needed
    });

    // Watchdog: If no price update for any asset in 5 seconds, mark as stalled
    const watchdog = setInterval(() => {
      const now = Date.now();
      const lastUpdate = lastPriceUpdateRef.current || 0;
      if (now - lastUpdate > 5000) {
        setStreamStatus('stalled');
      } else if (streamStatus === 'stalled' || streamStatus === 'connecting') {
        setStreamStatus('active');
      }
    }, 2000);

    return () => {
      unbindDirect();
      unbindBackend();
      clearInterval(watchdog);
    };
  }, []);

  // 2. Metronome: 200ms Pulse loop (5Hz) to drive UI/Chart
  // This achieves the "standardized/consistent" flow we discussed
  useEffect(() => {
    const pulseLoop = setInterval(() => {
      const currentAssetId = activeMarket?.id?.toLowerCase();
      const p = oraclePricesRef.current[currentAssetId];
      const sourceTs = oraclePricesRef.current.ts[currentAssetId] || Date.now();

      if (typeof p === 'number' && p > 0) {
        const truncated = Math.floor(p * 100) / 100;
        const pStr = truncated.toFixed(2);

        setPrice(pStr);
        priceRef.current = pStr;

        priceHistoryRef.current.push({ p: truncated, t: sourceTs });
        if (priceHistoryRef.current.length > 500) priceHistoryRef.current.shift();

        lastPriceUpdateRef.current = Date.now();
      }
    }, 200);

    return () => clearInterval(pulseLoop);
  }, [activeMarket]);

  // ─── SOCKET.IO: Trade events + Backend-Authoritative Settlement ───
  useEffect(() => {
    socketService.connect();

    const unbindSettings = socketService.on('settings_update', (newSettings) => {
      setPlatformSettings(prev => {
        const updated = { ...prev, ...newSettings };
        localStorage.setItem('15market_citadel_settings', JSON.stringify(updated));
        return updated;
      });
    });

    const unbindLiveOdds = socketService.on('live_odds', (data) => {
      setLiveOdds(data);
    });

    // ── BACKEND-AUTHORITATIVE SETTLEMENT ──
    // The backend is the ONLY source of truth for trade results.
    const unbindSettled = socketService.on('trade_settled', (data) => {
      if (!data?.betId && !data?.id) return;

      const isMine = data.userAddr &&
        address && data.userAddr.toLowerCase() === address.toLowerCase();
      if (!isMine) return;

      const betId = String(data.betId || data.id);
      const finalStatus = data.won ? 'WON' : 'LOST';
      const exitPrice = data.exitPrice ? parseFloat(data.exitPrice).toFixed(2) : '0.00';
      const payout = data.payout ? parseFloat(data.payout).toFixed(4) : '0.00';

      console.log(`[Settlement] Backend settled #${betId}: ${finalStatus} @ $${exitPrice}`);
      lockedResults.current.set(betId, { status: finalStatus, settlementPrice: exitPrice });
      removedTradeIds.current.add(betId);

      // Build the fully-settled trade record
      // NOTE: Backend sends 'stakeTxHash', not 'txHash'
      const resolvedTxHash = data.txHash || data.stakeTxHash || null;
      const settledRecord = {
        id: betId,
        nonce: betId,
        status: finalStatus,
        settlementPrice: exitPrice,
        entryPrice: data.entryPrice ? parseFloat(data.entryPrice).toFixed(2) : '0.00',
        exitPrice,
        payout,
        won: data.won,
        direction: data.direction === 1 || data.direction === 'UP' ? 'UP' : 'DOWN',
        amount: data.amount,
        symbol: data.symbol || 'ETH',
        duration: data.duration,
        timestamp: data.timestamp || Date.now(),
        txHash: resolvedTxHash,
        tx: resolvedTxHash,
        backendSettled: true,
        balanceApplied: true,
      };

      // Allow the reconciler to handle the removal after a grace period
      // setActiveTrades(prev => prev.filter(t => String(t.id) !== betId && String(t.nonce) !== betId));

      // Upsert into tradeHistory and setActiveTrades with final WON/LOST status
      const updateFn = (t) => {
        if (String(t.id) === betId || String(t.nonce) === betId ||
            (resolvedTxHash && (String(t.tx) === String(resolvedTxHash) || String(t.txHash) === String(resolvedTxHash)))) {
          return { ...t, ...settledRecord };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => {
        const existing = prev.find(t =>
          String(t.id) === betId || String(t.nonce) === betId ||
          (resolvedTxHash && (String(t.tx) === String(resolvedTxHash) || String(t.txHash) === String(resolvedTxHash)))
        );
        if (existing) return prev.map(updateFn);
        return [settledRecord, ...prev];
      });

      if (data.won) {
        notify(`🏆 Trade WON! +$${payout}`, 'success');
      } else {
        notify('Trade LOST.', 'error');
      }

      // Refresh main wallet balance (winnings may have been sent back)
      lastOptimisticActionTime.current = 0;
      setTimeout(() => {
        updateEvmSessionBal(true);
        refetchEvmBalance(true);
      }, 1500);
    });

    const unbindBroadcast = socketService.on('broadcast', (data) => {
      console.log(`[Broadcast] New announcement: ${data.message}`);
      // Show notification instantly
      notify(`📢 ${data.message}`, 'info');

      // Update system banner if it's maintenance or emergency
      if (data.type === 'MAINTENANCE' || data.type === 'EMERGENCY') {
        setPlatformSettings(prev => ({
          ...prev,
          systemBanner: data.message,
          bannerLevel: data.type === 'EMERGENCY' ? 'error' : 'info'
        }));
      }
    });

    const unbindProviderUpdate = socketService.on('provider_application_update', (appStatus) => {
      setUserProfile(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isProvider: appStatus.status === 'APPROVED',
          providerApplication: appStatus
        };
      });
      if (appStatus.status === 'APPROVED') {
        notify('Provider Application Approved! Generate your wallet.', 'success');
      } else if (appStatus.status === 'REJECTED') {
        notify('Provider Application Rejected.', 'error');
      }
    });

    return () => {
      unbindSettings();
      unbindSettled();
      unbindBroadcast();
      unbindProviderUpdate();
    };
  }, [notify, updateEvmSessionBal, refetchEvmBalance, address, evmSessionWallet]);

  // ── Backend-Authoritative Trade Ticks ────────────────────────────────────────
  // The backend TradeMonitor emits trade_tick every second per active trade.
  // We use these to drive the countdown and live price in ActiveTradesSidebar.
  useEffect(() => {
    if (!address) return;

    const unbindTick = socketService.on('trade_tick', (data) => {
      setActiveTrades(prev => prev.map(t => {
        const isTarget = (String(t.id) === String(data.betId) || String(t.nonce) === String(data.betId));
        if (!isTarget) return t;

        // CRITICAL: If the trade is already 'Locked' (has a final result or hit 0 time), 
        // we IGNORE future ticks to prevent the result from flipping back and forth.
        const isFrontendExpired = t.timeLeft <= 0 || t.won !== undefined || t.status === 'RESOLVING';
        if (isFrontendExpired) return t;

        return {
          ...t,
          timeLeft: data.timeLeft,
          livePrice: data.currentPrice,
          lastTickPrice: data.currentPrice,
          isWinning: data.isWinning
        };
      }));
    });

    const unbindExpired = socketService.on('trade_expired', (data) => {
      const bid = String(data.betId);
      console.log(`[Trade] Authority Locked: #${bid} -> ${data.won ? 'WON' : 'LOST'} @ $${data.exitPrice}`);
      lockedResults.current.set(bid, { status: data.won ? 'WON' : 'LOST', settlementPrice: data.exitPrice });

      setActiveTrades(prev => prev.map(t =>
        String(t.id) === bid || String(t.nonce) === bid
          ? { ...t, won: data.won, livePrice: data.exitPrice, timeLeft: 0, status: 'RESOLVING' }
          : t
      ));
    });

    return () => { unbindTick(); unbindExpired(); };
  }, [address, postDebugLog]);

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

        // 2. Fetch Remote Platform Settings
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

      // NO LONGER FORCIBLY OVERWRITING activeId FROM BACKEND
      // Use local selection as the authority
      const listed = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
      const activeId = localStorage.getItem('15market_active_token_id') || 'eth';
      const market = listed.find(t => t.id === activeId);
      const resolvedMarket = mergeMarketWithDefault(market);

      if (resolvedMarket && resolvedMarket.id !== activeMarket.id) {
        // #region agent log
        postDebugLog({ runId: 'initial', hypothesisId: 'H9', location: 'UserApp.jsx:syncMarket:override', message: 'syncMarket changed active market and reset price', data: { from: activeMarket?.id, to: resolvedMarket?.id } });
        // #endregion
        // #region agent log

        // #endregion
        // Re-sync with current local authority
        setActiveMarket(resolvedMarket);
        setPrice("0");
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
    // #region agent log

    // #endregion
    if (!newMarket || newMarket.id === activeMarket.id) return;

    localStorage.setItem('15market_active_token_id', newMarket.id);
    const resolvedMarket = mergeMarketWithDefault(newMarket);

    // Explicitly reset price to trigger loading modal in CustomChart
    setPrice("0");
    priceRef.current = "0";
    priceHistoryRef.current = [];

    setActiveMarket(resolvedMarket);

    // Sync with keeper
    try {
      await fetch(`${KEEPER_URL_ARC}/active-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeId: newMarket.id })
      });
    } catch (e) {
    }

    // Trigger price fetch for new market (now handled by embedded service)
  }, [activeMarket.id, mergeMarketWithDefault]);

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

  // Session Wallet - AUTO RESTORE/FETCH
  useEffect(() => {
    if (!address) return;

    // Default to true as the primary trading account
    setSessionMode(true);

    const storedAddr = localStorage.getItem(`15market_session_addr_${address.toLowerCase()}`);
    if (storedAddr) {
      setEvmSessionWallet({ address: storedAddr, isRemote: true });
    }
    // Automatically retrieve the derived session wallet without user signatures
    updateEvmSessionBal(true);
  }, [address, updateEvmSessionBal]);

  // NOTE: The actual "creation" now happens via handleSyncSession which we will rename/auto-trigger
  // We need to auto-trigger the sync if the user toggles session mode and has no key.









  // Slider / amount handlers - active balance aware
  const activeBal = useMemo(() => {
    const bal = sessionMode ? sessionBalance : parseFloat(evmBalance || '0');
    return bal;
  }, [sessionMode, sessionBalance, evmBalance]);

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

  // Emergency Garbage Collection for Stuck Trades
  useEffect(() => {
    setActiveTrades(prev => {
      const now = Date.now();
      let changed = false;
      const cleaned = prev.map(t => {
        const start = t.startTime || (t.id > 1000000000000 ? t.id : Math.floor(t.id / 100) * 1000);
        // If a trade has been stuck in PENDING/RESOLVING for > 2 minutes past its theoretical lifespan, mark it as LOST.
        if ((t.status === "PENDING" || t.status === "RESOLVING") && (now - start > 120000)) {
          changed = true;
          return { ...t, status: "LOST", payout: "0.00" };
        }
        return t;
      });

      if (changed) {
        setTradeHistory(h => {
          const hMap = new Map();
          h.forEach(x => hMap.set(x.id, x));
          cleaned.forEach(c => hMap.set(c.id, c));
          return Array.from(hMap.values()).sort((a, b) => b.id - a.id);
        });
      }
      return changed ? cleaned : prev;
    });
  }, []);

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
    // Result Resolution is now handled by the backend.
    // The frontend will receive 'balance_update' and 'trade_settled' events via Socket.io.
  }, [activeTrades, serverTimeOffset]);

  // Safety Cleanup: Remove finalized trades after showing result
  useEffect(() => {
    const finalStatuses = ["WON", "LOST", "PAID", "RESOLVING", "TIMEOUT", "PAYOUT_DELAYED"];
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
        }, 2000); // 2 seconds to see result, then auto-remove
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



  // Arc Settlement Listener
  // REMOVED: publicClient.watchContractEvent — it polled the RPC continuously via HTTP,
  // exhausting the browser connection pool and freezing the platform after deposit/withdraw.
  // The backend already sends 'trade_settled', 'trade_expired', and 'balance_update' via socket,
  // making this redundant. All settlement state is now handled via socket events.

  // --- TRADE STATUS SYNC ---
  // When a trade hits WON status, just update the UI. Balance crediting is handled
  // entirely by the backend via `balance_update` socket event after on-chain confirmation.
  // This effect ONLY cleans up the trade card status — no balance crediting.
  useEffect(() => {
    const winningTrades = activeTrades.filter(t => t.status === "WON" && !t.balanceApplied);
    if (winningTrades.length === 0) return;

    // Mark as applied so we don't process again
    setActiveTrades(prev => prev.map(t =>
      t.status === "WON" && !t.balanceApplied ? { ...t, balanceApplied: true } : t
    ));
  }, [activeTrades]);


  /**
   * DEPOSIT HANDLER
   * ---------------
   * Manages the flow of moving funds from the user's primary wallet (MetaMask/Base)
   * into the server-side Trading Session Wallet (EOA).
   * 
   * CRITICAL LOGIC:
   * 1. 1% PLATFORM FEE: We split the user's deposit on-chain. 99% goes to the session wallet, 
   *    and 1% goes to the Platform Treasury immediately.
   * 2. OPTIMISTIC CREDITING: We notify the backend to credit the 99% amount immediately 
   *    to provide a zero-latency trading experience.
   * 3. MULTI-TRANSACTION FLOW: This involves two separate on-chain transactions.
   * 
   * @param {string|number} amt - The amount of USDC to deposit.
   */
  const handleDeposit = useCallback(async (amt) => {
    if (isExecuting) return; // Prevent double-submission

    try {
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid deposit amount", "error");
        return;
      }

      if (!address) {
        notify("Connect your wallet first", "error");
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

      // --- AUTO-INITIALIZE SESSION WALLET IF MISSING ---
      // This ensures that new users have a trading wallet derived before their first deposit
      let activeSessionWallet = evmSessionWallet;
      if (!activeSessionWallet?.address) {
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
          });
          if (res.ok) {
            const data = await res.json();
            activeSessionWallet = { address: data.sessionAddress, isRemote: true };
            setEvmSessionWallet(activeSessionWallet);
            setSessionBalance(parseFloat(data.balance));
            localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);
          } else {
            throw new Error("Backend failed to initialize session");
          }
        } catch (initErr) {
          notify("Failed to initialize trading wallet. Please refresh.", "error");
          setIsExecuting(false);
          return;
        }
      }

      notify(`Confirm deposit of ${amtNum} USDC in your wallet...`, "pending");

      try {
        // Enforce correct network (Arc Testnet) before proceeding with transfers
        try {
          await switchChainAsync({ chainId: 5042002 });
        } catch (switchErr) {
          console.warn("Chain switch failed or rejected:", switchErr.message);
        }

        // --- 1% PLATFORM FEE SPLIT CALCULATION ---
        // This is done client-side to ensure full transparency on Etherscan
        const platformFeeRate = 0.01;
        const feeAmt = amtNum * platformFeeRate;
        const depositAmt = amtNum - feeAmt;

        console.log(`[Deposit] Splitting: ${depositAmt.toFixed(4)} to Session, ${feeAmt.toFixed(4)} to Treasury`);

        // STEP 1: Send 1% Fee directly to Treasury
        if (!walletClient) throw new Error("Wallet not connected — please reconnect and try again");

        const feeTx = await walletClient.sendTransaction({
          to: ARC_CONTRACT_ADDRESS,
          value: parseEther(feeAmt.toFixed(18)),
          account: address,
        });

        // STEP 2: Send remaining 99% to the user's Session Trading Wallet
        const hash = await walletClient.sendTransaction({
          to: activeSessionWallet.address,
          value: parseEther(depositAmt.toFixed(18)),
          account: address,
        });


        // STEP 3: Backend Synchronization
        // Inform the backend of the successful deposit so it can credit the user history
        fetch(`${KEEPER_URL_ARC}/session/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, amount: depositAmt, txHash: hash })
        }).catch(() => { });

        // STEP 4: Optimistic Local State Update
        // Provides immediate visual feedback to the user before block confirmation
        setSessionBalance(prev => prev + depositAmt);
        setEvmBalance(prev => {
          const current = parseFloat(prev || '0');
          return (current - amtNum).toFixed(6);
        });
        lastOptimisticActionTime.current = Date.now();

        // STEP 5: Show success immediately — socket balance_update handles real balance
        setSuccessOverlay({ title: 'DEPOSIT SUCCESSFUL' });

        const newTx = {
          id: `dep_${Date.now()}`,
          type: 'DEPOSIT',
          amount: amtNum.toFixed(4),
          timestamp: Date.now(),
          tx: hash,
          network: 'arc'
        };
        setTransactionHistory(prev => [newTx, ...prev]);

      } catch (evmErr) {
        notify(`Deposit failed: ${evmErr.shortMessage || evmErr.message}`, "error");
      }
    } finally {
      setIsExecuting(false);
    }
  }, [address, notify, evmBalance, evmSessionWallet, updateEvmSessionBal, refetchEvmBalance, isExecuting, walletClient]);


  /**
   * WITHDRAW (CASHOUT) HANDLER
   * --------------------------
   * Withdraws winnings from the Session Trading Wallet back to the user's primary wallet.
   * 
   * CRITICAL LOGIC:
   * 1. SIGNATURE AUTHORIZATION: User must sign a "Withdrawal Authorization" message 
   *    locally. This proves that the session wallet owner (derived from user address)
   *    is the one initiating the withdrawal.
   * 2. BACKEND WITHDRAW: The backend receives the authorization and signs an on-chain 
   *    transfer from the EOA to the user.
   * 3. GAS BUFFER: A small amount (0.01 USDC) is reserved to cover network gas fees.
   * 
   * IMPACT IF BUGGED: Funds would stay stuck in the session wallet.
   */
  const handleWithdraw = useCallback(async (amt, destination = null) => {
    if (isExecuting) return;

    try {
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid withdrawal amount", "error");
        return;
      }

      if (!address) {
        notify("Connect your wallet", "error");
        return;
      }

      // Ensure session wallet is ready
      let activeSessionWallet = evmSessionWallet;
      if (!activeSessionWallet) {
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
          });
          if (res.ok) {
            const data = await res.json();
            activeSessionWallet = { address: data.sessionAddress, isRemote: true };
            setEvmSessionWallet(activeSessionWallet);
            setSessionBalance(parseFloat(data.balance));
            localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);
          } else {
            throw new Error("Backend failed to initialize session");
          }
        } catch (initErr) {
          notify("Trading wallet not ready. Please refresh.", "error");
          return;
        }
      }

      if (sessionBalance < amtNum) {
        notify(`Insufficient balance. You have ${sessionBalance.toFixed(4)} USDC`, "error");
        return;
      }

      const targetAddr = destination || address;
      const isExternal = destination && destination.toLowerCase() !== address.toLowerCase();

      // Reserving a small amount for gas to ensure the transaction doesn't fail on-chain
      const gasBuffer = 0.01;
      const netAmt = amtNum - gasBuffer;

      if (netAmt <= 0) {
        notify("Amount too low for gas", "error");
        return;
      }

      setIsExecuting(true);
      notify(isExternal ? `Authorizing transfer to ${destination.slice(0, 6)}...` : "Sign to authorize withdrawal...", "pending");

      // --- SECURITY SIGNATURE ---
      const authMsg = `--- 15MARKET PROTOCOL ---\nACTION: ${isExternal ? 'EXTERNAL TRANSFER' : 'WITHDRAW FROM AUTO-SIGNER'}\nAMOUNT: ${amt} USDC\nTO: ${targetAddr}\nTIMESTAMP: ${Date.now()}`;
      let signature = "authorized"; // Fallback placeholder if verification is disabled on backend

      try {
        if (embeddedWallet) {
          // Privy Embedded Wallet (Seamless/Integrated)
          signature = await embeddedWallet.sign(authMsg);
        } else if (walletClient) {
          // Wagmi / External Wallet
          signature = await walletClient.signMessage({ message: authMsg, account: address });
        } else if (window.ethereum) {
          // Direct EIP-1193 Injection
          const msgHex = '0x' + Array.from(new TextEncoder().encode(authMsg)).map(b => b.toString(16).padStart(2, '0')).join('');
          signature = await window.ethereum.request({ method: 'personal_sign', params: [msgHex, address] });
        } else {
          throw new Error("No wallet available to sign");
        }
      } catch (sigErr) {
        if (sigErr.code === 4001 || sigErr.message?.includes('rejected') || sigErr.message?.includes('denied')) {
          notify("Transfer cancelled by user", "error");
        } else {
          notify("Signature failed: " + (sigErr.shortMessage || sigErr.message), "error");
        }
        setIsExecuting(false);
        return;
      }

      notify("Processing...", "pending");

      const cleanNetAmt = parseFloat(netAmt.toFixed(6));

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 60000);

      let res;
      try {
        res = await fetch(`${KEEPER_URL_ARC}/session/cashout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            address,
            amount: cleanNetAmt,
            destination: targetAddr,
            signature: signature,
            message: authMsg
          })
        });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw new Error("Network timeout. Try again.");
        }
        throw fetchErr;
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Transfer failed");
      }

      const data = await res.json();
      const withdrawalHash = data.txHash;

      setSuccessOverlay({
        title: isExternal ? 'TRANSFER SUCCESSFUL' : 'WITHDRAWAL SUCCESSFUL',
      });

      setSessionBalance(prev => Math.max(0, prev - amtNum));
      if (!isExternal) {
        setEvmBalance(prev => {
          const current = parseFloat(prev || '0');
          return (current + cleanNetAmt).toFixed(6);
        });
      }
      lastOptimisticActionTime.current = Date.now();

      const newTx = {
        id: `tx-${Date.now()}`,
        type: isExternal ? "TRANSFER" : "WITHDRAW",
        amount: amtNum.toFixed(4),
        timestamp: Date.now(),
        tx: withdrawalHash,
        to: targetAddr,
        network: 'arc'
      };

      setTransactionHistory(prev => [newTx, ...prev]);

      fetch(`${KEEPER_URL_ARC}/push-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, transaction: newTx })
      }).catch(() => { });

      // Single delayed refresh — socket balance_update handles trading balance
      setTimeout(() => refetchEvmBalance(true), 3000);
    } catch (e) {
      notify("Transfer failed: " + (e.shortMessage || e.message), "error");
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, sessionBalance, updateEvmSessionBal, isExecuting, refetchEvmBalance, walletClient]);





  return (
    <div className={`min-h-screen ${!isSmallScreen ? 'h-screen' : ''} w-full text-current selection:bg-[#249C6C]/30 selection:text-white transition-colors duration-500 overflow-hidden font-sans relative ${isLight ? 'bg-[#CFDCD5]' : 'bg-black'}`}>
      <div className={`fixed inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? '' : 'hidden'}`} />

      {/* Landscape Blocker — branded fullscreen gate for mobile devices in landscape */}
      <AnimatePresence>
        {isLandscapeBlocked && (
          <motion.div
            key="landscape-blocker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center ${isLight ? 'bg-[#CFDCD5]' : 'bg-black'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
          >
            {/* Subtle background glow */}
            <div className={`absolute top-[30%] left-1/2 -translate-x-1/2 w-80 h-80 ${isLight ? 'bg-[#249C6C]/8' : 'bg-[#249C6C]/10'} rounded-full blur-[120px]`} />
            <div className={`absolute bottom-[20%] right-[20%] w-60 h-60 ${isLight ? 'bg-[#249C6C]/5' : 'bg-[#249C6C]/5'} rounded-full blur-[100px]`} />

            {/* Logo */}
            <img src={isLight ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="h-16 w-auto mb-8 opacity-80" />

            {/* Rotate-to-portrait animated icon */}
            <div className="relative mb-6">
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Landscape phone (faded, the "from" state) */}
                <rect x="6" y="22" width="36" height="24" rx="4" stroke="#249C6C" strokeWidth="1.5" opacity="0.25" />
                <line x1="10" y1="34" x2="10.01" y2="34" stroke="#249C6C" strokeWidth="2" strokeLinecap="round" opacity="0.25" />

                {/* Portrait phone (bright, the "to" state) */}
                <g className="animate-pulse">
                  <rect x="40" y="10" width="24" height="36" rx="4" stroke="#249C6C" strokeWidth="2" fill="none" />
                  <line x1="52" y1="40" x2="52.01" y2="40" stroke="#249C6C" strokeWidth="2.5" strokeLinecap="round" />
                </g>

                {/* Curved arrow from landscape to portrait */}
                <path d="M30 50 C30 60, 45 62, 48 50" stroke="#249C6C" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <polyline points="45,53 48,50 51,53" stroke="#249C6C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Message */}
            <h2 className={`text-lg font-black tracking-tight mb-2 text-center px-8 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
              Rotate Your Device
            </h2>
            <p className={`text-xs font-medium text-center px-12 leading-relaxed max-w-sm ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>
              The 15market trading experience is optimized for portrait mode on mobile devices. Please rotate your phone, or switch to a desktop browser for the full experience.
            </p>

            {/* Subtle brand accent line */}
            <div className="mt-8 w-16 h-[2px] bg-gradient-to-r from-transparent via-[#249C6C]/40 to-transparent rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isConnected && address && !isAppReady && (
          <motion.div
            key="platform-mask"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className={`fixed inset-0 z-[5000] ${theme === 'light' ? 'bg-[#c8eadd]' : 'bg-[#050505]'}`}
          />
        )}
        {isWalletLoading && (
          <WalletConnectionLoading theme={theme} onFinish={() => setIsWalletLoading(false)} />
        )}
        {isGlobalLoading && (
           <GlobalLoader theme={theme} progress={healthProgress} />
        )}
      </AnimatePresence>

      <ErrorBoundary>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`min-h-screen ${!isSmallScreen ? 'h-screen' : ''} w-full overflow-hidden font-sans flex flex-col items-center ${themeClass}`}
          style={{
            color: theme === 'light' ? '#1f2937' : '#ffffff',
            transition: "color 0.3s ease"
          }}>



          <DissolveTransition isAnimating={isAnimatingTheme} targetTheme={targetTheme} />

          {view === "dashboard" ? (
            <DashboardPage
              onBack={() => setView("trading")}
              wallet={wallet}
              sessionBalance={sessionBalance}
              evmBalance={evmBalance}
              onDeposit={handleDeposit}
              onWithdraw={handleWithdraw}
              treasuryBalance={treasuryBalance}
              autoSignerFees={autoSignerFees}
              userProfile={userProfile}
              theme={theme}
              isSmallScreen={isSmallScreen}
              evmSessionWallet={evmSessionWallet}
              isSignerInitializing={isSignerInitializing}
              onRetryInit={initializeSessionWallet}
              transactionHistory={transactionHistory}
              onViewReceipt={(tx) => { setSelectedTransaction(tx); setIsTransactionReceiptOpen(true); }}
              uiVersion={uiVersion}
              onOpenCircleWallet={(initialMode) => {
                setCircleWalletMode(initialMode);
                setView("circle_wallet");
              }}
              onDocs={() => setView("docs")}
              onCampaign={() => setView("campaigns")}
              onAssistedTrading={() => setView("assisted")}
              onCopyTrading={() => setView("copyTrading")}
              onSelect={(type) => setView("comingsoon")}
            />
          ) : view === "comingsoon" ? (
            <ComingSoonPage onBack={() => setView("dashboard")} theme={theme} />
          ) : view === "circle_wallet" ? (
            <CircleWalletPage
              address={address}
              wagmiAddress={wagmiAddress}
              isLight={theme === 'light'}
              notify={notify}
              onBack={() => {
                setView("dashboard");
                setCircleWalletMode(null);
              }}
              initialMode={circleWalletMode}
              evmBalance={evmBalance}
              sessionBalance={sessionBalance}
              sessionAddress={evmSessionWallet?.address}
              wallets={wallets || []}
              walletClient={walletClient}
              switchChainAsync={switchChainAsync}
              smartWalletAddress={smartWalletAddress}
              onWithdraw={handleWithdraw}
              triggerGlobalRefresh={triggerGlobalRefresh}
            />
          ) : view === "copyTrading" ? (
            <CopyTradingPage
              address={address}
              isLight={theme === 'light'}
              notify={notify}
              onBack={() => setView("dashboard")}
              profile={userProfile}
              user={user}
              tradeHistory={tradeHistory}
            />
          ) : view === "campaigns" ? (
            <CampaignsHub
              campaigns={campaigns}
              enrollments={enrollments}
              address={address}
              theme={theme}
              onBack={() => setView("dashboard")}
              handleEnroll={handleEnroll}
            />
          ) : view === "docs" ? (
            <DocsPage
              theme={theme}
              onBack={() => setView("dashboard")}
              onToggleTheme={toggleTheme}
              isSmallScreen={isSmallScreen}
            />
          ) : view === "assisted" ? (
            <AssistedTradingPage
              theme={theme}
              onBack={() => setView("dashboard")}
              onSelect={(type) => type === 'copytrading' ? setView("copyTrading") : setView("comingsoon")}
              isSmallScreen={isSmallScreen}
            />
          ) : (
            <div className="w-full flex-1 flex flex-col items-center flex-shrink-0 py-0 overflow-hidden min-h-0">

              <header className={`w-full max-w-[1600px] px-4 md:px-6 flex items-center justify-between mb-0 relative z-[160] safe-top ${isSmallScreen ? 'h-auto py-1' : 'h-20 lg:h-24'}`}
                style={isSmallScreen ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' } : {}}>
                <div className="flex items-center transition-all duration-500 h-full"
                  style={{ paddingLeft: !isSmallScreen ? (showSideHistory ? '268px' : '36px') : '0px' }}>
                  <img src={theme === 'light' ? '/goblogo.png' : '/gowlogo.png'} alt="logo" className={`${isSmallScreen ? 'h-[64px]' : 'h-[72px] lg:h-[84px]'} w-auto drop-shadow-[0_0_50px_rgba(36, 156, 108,0.3)] transition-all`} />
                </div>

                <div className="hidden lg:flex items-center gap-3 px-2 py-1 scale-[0.8] origin-right">
                  {authenticated && (
                    <>
                      {/* Branded Game Mode Switcher - Large Screens */}
                      <div className={`flex items-center p-1.5 rounded-[22px] border backdrop-blur-3xl shadow-2xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40 border-[#249C6C]/20' : 'bg-black/40 border-white/5'} scale-90 origin-right`}>
                        <motion.div
                          className="absolute top-1.5 bottom-1.5 rounded-[18px] bg-gradient-to-br from-[#2EC47C] to-[#14472C] shadow-[0_0_20px_rgba(36, 156, 108,0.4)]"
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
                      <div className="flex items-center gap-3">
                        <WalletBalance network={network} theme={theme} balanceOverride={sessionBalance} />
                      </div>
                      <button onClick={() => setView("dashboard")} className="w-10 h-10 rounded-full border backdrop-blur-md transition-all group active:scale-95 overflow-hidden flex items-center justify-center p-[2px]"
                        style={{
                          backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                          borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                        }}>
                        {(userProfile?.avatar || userProfile?.xProfileImage) ? (
                          <img src={userProfile?.avatar || userProfile?.xProfileImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <User size={18} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
                        )}
                      </button>
                    </>
                  )}
                  <UnifiedWalletButton theme={theme} />
                </div>

                <div className="flex lg:hidden landscape:hidden items-center gap-1.5 md:gap-2 scale-[0.8] origin-right">
                  {authenticated && (
                    <>
                      {/* Branded Game Mode Switcher - Mobile */}
                      <div className={`flex items-center p-0.5 rounded-full border backdrop-blur-3xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40 border-[#249C6C]/20' : 'bg-black/40 border-white/5'}`}>
                        <motion.div
                          className="absolute top-0.5 bottom-0.5 rounded-full bg-gradient-to-br from-[#2EC47C] to-[#14472C]"
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
                      <div className="scale-[0.8] origin-center -mx-1.5 flex items-center gap-1">
                        <ThemeToggle theme={theme} onToggle={toggleTheme} />
                      </div>
                      <button onClick={() => setView("dashboard")} className="h-[32px] w-[32px] flex items-center justify-center rounded-full border backdrop-blur-md transition-all group active:scale-95 overflow-hidden p-[1px]"
                        style={{
                          backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                          borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                        }}>
                        {(userProfile?.avatar || userProfile?.xProfileImage) ? (
                          <img src={userProfile?.avatar || userProfile?.xProfileImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <User size={14} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
                        )}
                      </button>
                    </>
                  )}
                  <div className="scale-[0.9] origin-right ml-[-2px]">
                    <UnifiedWalletButton theme={theme} />
                  </div>
                </div>
              </header>

              {/* Winner/Campaign Banner (Authoritative UX) */}
              <AnimatePresence>
                {winnerBanner && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className={`w-full overflow-hidden relative z-[101] border-b ${theme === 'light' ? 'bg-yellow-500/10 border-[#249C6C]/20' : 'bg-gradient-to-r from-yellow-500/10 via-[#249C6C]/5 to-yellow-500/10 border-white/5'}`}
                  >
                    <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-2 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Trophy className="w-3 h-3 md:w-4 md:h-4 text-yellow-500 animate-bounce" />
                        <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-[#0a261a]' : 'text-[#249C6C]'}`}>
                          {winnerBanner.text || "New Winner Leaderboard is Live!"}
                        </span>
                      </div>
                      {winnerBanner.cta && (
                        <button className="px-3 py-0.5 md:py-1 bg-[#249C6C] text-white text-[8px] md:text-[9px] font-black uppercase rounded-full tracking-tighter hover:scale-105 transition-transform">
                          {winnerBanner.cta}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* DESKTOP-ONLY: Weighted Green Line Separator (LOCKED POSITION) */}
              {!isSmallScreen && (
                <div className="w-full flex flex-col relative z-[170] -mt-2 md:mt-0 lg:-mt-4 mb-2">
                  <div className="w-full h-[2px] bg-[#249C6C] shadow-[0_0_15px_rgba(36, 156, 108,0.6)]" />
                </div>
              )}

              {/* MAIN CONTENT CONTAINER (LOCKED DESKTOP MARGIN: lg:mt-2) */}
              <div className={`w-full ${uiVersion === 'v2' ? 'max-w-[1600px] px-2 md:px-6 lg:px-8 focus-visible:outline-none' : 'max-w-4xl lg:max-w-7xl px-4 sm:px-6 lg:px-8'} flex flex-col items-center flex-1 min-h-0 h-full lg:mt-2 relative z-10`}>
                <Suspense fallback={<div className="h-[200px] flex items-center justify-center animate-pulse">Loading Rounds Access...</div>}>
                  <RoundsAccessGate
                    theme={theme}
                    active={gameMode === 'rounds'}
                    verified={hasRoundsAccess}
                    onUnlock={handleRoundsUnlock}
                  >
                  {/* MOBILE FULL-WIDTH SCROLLER (Matching Desktop Design) */}
                  {isSmallScreen && (
                    <div className="h-7 mb-1.5 overflow-hidden relative z-[50]" style={{ width: '105vw', marginLeft: '-8px', transform: 'translateX(3%)' }}>
                      <GlobalTradeScroller theme={theme} />
                    </div>
                  )}

                  <div className={`w-full flex lg:flex-row landscape:flex-row flex-col ${isSmallScreen ? 'gap-[2px]' : 'gap-0 lg:gap-1'} ${isSmallScreen ? 'mb-0' : 'mb-5 md:mb-5'} relative z-0 flex-1 min-h-0`}>
                    {/* V2 Integrated Content Container */}
                    <motion.div
                      layout={!isSmallScreen}
                      className={`w-full lg:w-[70%] flex flex-col gap-0.5 ${isSmallScreen ? 'flex-1 min-h-[200px] pb-[281px]' : 'h-full flex-1 min-h-0'} transition-all duration-500 relative`}
                      style={{ paddingLeft: !isSmallScreen && showSideHistory ? '202px' : (!isSmallScreen ? '20px' : '0px') }}>

                      {!isSmallScreen && (
                        <SideHistoryPane
                          isOpen={showSideHistory}
                          onToggle={() => setShowSideHistory(!showSideHistory)}
                          tradeHistory={gameMode === 'rounds' ? roundsTradeHistory : tradeHistory}
                          theme={theme}
                          onViewReceipt={(tx) => { setSelectedTransaction(tx); setIsTransactionReceiptOpen(true); }}
                        />
                      )}

                      {!isSmallScreen && (
                        <div className={`w-full md:w-full relative z-[45] overflow-hidden mb-1 md:rounded-full`}>
                          <GlobalTradeScroller theme={theme} />
                        </div>
                      )}


                      {/* Chart Container Wrapper for Shadow - PREVENTS CLIPPING */}
                      <div className="flex-1 w-full flex flex-col relative z-0"
                        style={{
                          filter: theme === 'light' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.10))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'
                        }}>
                        {/* CHART CONTAINER (LOCKED DESKTOP HEIGHT: lg:min-h-[470px]) */}
                        <div className={`${isSmallScreen ? 'flex-grow h-full' : 'flex-[2] min-h-[280px]'} lg:min-h-[380px] lg:h-full lg:min-h-0 rounded-[32px] overflow-hidden border transition-all duration-300 ${isSmallScreen ? 'glass-panel backdrop-blur-3xl' : 'glass-panel chart-glow'} flex flex-col w-full ${isSmallScreen ? '' : 'min-h-0'} relative z-10`}
                          style={{
                            background: isSmallScreen
                              ? (theme === 'light' ? 'rgba(180, 217, 199, 0.2)' : 'rgba(10, 10, 10, 0.85)')
                              : (theme === 'light' ? 'rgba(36, 156, 108, 0.08)' : 'rgba(10, 10, 10, 0.7)'),
                            boxShadow: theme === 'light'
                              ? 'none'
                              : (isSmallScreen
                                ? '0 30px 90px rgba(0,0,0,0.8), inset 0 0 60px rgba(36, 156, 108,0.05), inset 0 2px 4px rgba(255,255,255,0.05)'
                                : `0 0 60px ${GREEN}10, inset 0 0 40px ${GREEN}05`),
                            borderColor: isSmallScreen
                              ? (theme === 'light' ? 'rgba(36, 156, 108, 0.35)' : 'rgba(255, 255, 255, 0.05)')
                              : (theme === 'light' ? 'rgba(36, 156, 108, 0.15)' : `${GREEN}15`)
                          }}>
                          {isSmallScreen ? (
                            <CustomChart
                              symbol={activeMarket?.binance || 'BTCUSDT'}
                              theme={theme}
                              network={network}
                              activeMarket={activeMarket}
                              uiVersion={uiVersion}
                              setActiveMarket={handleMarketChange}
                              activeTrades={activeTrades}
                              currentPrice={price}
                              priceHistory={priceHistoryRef.current}
                            />
                          ) : (
                            <div className="flex-1 w-full h-full flex flex-row relative">
                              {/* Chart Area */}
                              <div className="flex-1 w-full h-full relative min-w-0">
                                <CustomChart
                                  symbol={activeMarket?.binance || 'BTCUSDT'}
                                  theme={theme}
                                  network={network}
                                  activeMarket={activeMarket}
                                  uiVersion={uiVersion}
                                  setActiveMarket={handleMarketChange}
                                  activeTrades={activeTrades}
                                  currentPrice={price}
                                  priceHistory={priceHistoryRef.current}
                                />
                              </div>

                              {/* Slim Order Book Area (Hidden on Mobile or when History is Open) */}
                              <div className={`hidden ${showSideHistory ? 'lg:hidden' : 'lg:flex'} w-[120px] xl:w-[150px] flex-col border-l transition-all duration-300 ${theme === 'light' ? 'border-[#249C6C]/10 bg-[#e6f4ed]/30' : 'border-white/5 bg-black/20'}`}>
                                <div className={`px-4 py-3 border-b text-[10px] font-black tracking-widest uppercase flex items-center gap-2 ${theme === 'light' ? 'text-[#0a261a]/60 border-[#249C6C]/10' : 'text-white/40 border-white/5'}`}>
                                  Order Book
                                </div>
                                <div className="flex-1 overflow-hidden p-2">
                                  <OrderBook price={price} theme={theme} symbol={activeMarket.symbol} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>

                    <motion.div
                      layout={!isSmallScreen}
                      style={isSmallScreen ? { height: 'auto', flex: 'none' } : undefined}
                      className={`w-full lg:w-[30%] flex flex-col ${isSmallScreen ? 'fixed inset-x-0 bottom-[48px] z-[90] px-1' : 'h-full flex-1 gap-1 min-h-0'}`}
                    >
                      {/* Trade Terminal / Active Section — Locked just above bottom pane handle */}
                      <div className={`w-full flex-row lg:flex-row gap-1 lg:gap-3 ${isSmallScreen ? 'flex h-[231px] min-h-0' : 'hidden md:hidden lg:hidden'}`}>
                        {/* Terminal Area */}
                        <div className={`flex-none w-1/2 flex flex-col ${gameMode === 'rounds' ? '' : `rounded-[32px] lg:rounded-[32px] border glass-panel p-1 ${theme === 'light' ? 'shadow-none' : 'shadow-lg'}`}`}
                          style={{
                            background: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'transparent' : 'rgba(10,10,10,0.8)'),
                            borderColor: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'rgba(36, 156, 108, 0.15)' : 'rgba(255,255,255,0.05)'),
                            filter: gameMode === 'rounds' ? 'none' : (theme === 'light' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.10))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))')
                          }}>
                          {gameMode === 'rounds' ? (
                            <RoundsTerminal
                              price={price}
                              balance={parseFloat(evmBalance || '0')}
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
                              setDuration={setDuration} amount={amount} handleAmountChange={handleAmountChange} balance={parseFloat(evmBalance || '0')}
                              sliderValue={sliderValue} handleSliderChange={handleSliderChange} executeTrade={executeTrade}
                              theme={theme} minStake={platformSettings.minBet} timerActive={activeTrades.length > 0} isExecuting={isExecuting} wallet={wallet}
                              depositAmount={depositAmount} setDepositAmount={setDepositAmount} onDeposit={handleDeposit} onWithdraw={handleWithdraw}
                              CORAL={CORAL} GREEN={GREEN} currentNetwork={network} chainId={chainId}
                              evmSessionWallet={evmSessionWallet} hasProfile={!!userProfile}
                              activeMarket={activeMarket}
                              maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                              tradingHalted={platformSettings.tradingHalted}
                              uiVersion={uiVersion}
                              liveOdds={liveOdds}
                            />
                          )}
                        </div>
 
                        {/* ACTIVE EXECUTION - Hidden entirely in Rounds mode */}
                        {(gameMode !== 'rounds') && (
                          <div className={`flex-1 min-h-0 rounded-[32px] overflow-hidden border glass-panel p-2 ${theme === 'light' ? 'shadow-sm' : 'shadow-lg'} flex flex-col`}
                            style={{
                              background: theme === 'light' ? 'transparent' : 'rgba(10,10,10,0.8)',
                              borderColor: theme === 'light' ? 'rgba(36, 156, 108, 0.15)' : 'rgba(255,255,255,0.05)',
                              filter: theme === 'light' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.10))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'
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
                      {/* V2 Mobile History Drawer integrated at bottom level */}
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
                                    platformSettings.bannerLevel === 'success' ? 'bg-[#249C6C]/10 border-[#249C6C]/20' :
                                      'bg-blue-500/10 border-blue-500/20'
                                  }`}
                              >
                                <div className="max-w-[1400px] mx-auto px-6 py-2 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full animate-pulse ${platformSettings.bannerLevel === 'error' ? 'bg-red-500' :
                                      platformSettings.bannerLevel === 'warning' ? 'bg-yellow-500' :
                                        platformSettings.bannerLevel === 'success' ? 'bg-[#249C6C]' :
                                          'bg-blue-500'
                                      }`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${platformSettings.bannerLevel === 'error' ? 'text-red-500' :
                                      platformSettings.bannerLevel === 'warning' ? 'text-yellow-500' :
                                        platformSettings.bannerLevel === 'success' ? 'text-[#249C6C]' :
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
                          <div className={`rounded-[22px] md:rounded-[32px] transition-all duration-500 flex flex-col ${showActiveExpanded ? 'h-0 opacity-0 pointer-events-none mb-0 w-0' : (gameMode === 'rounds' ? 'lg:h-full w-full' : 'w-full lg:w-full')} ${gameMode === 'rounds' ? 'border-none bg-transparent shadow-none' : 'border glass-panel'}`}
                            style={{
                              background: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'rgba(240, 250, 245, 0.9)' : 'rgba(10,10,10,0.8)'),
                              borderColor: gameMode === 'rounds' ? 'transparent' : (theme === 'light' ? 'rgba(36, 156, 108, 0.18)' : 'rgba(255,255,255,0.05)'),
                              filter: gameMode === 'rounds' ? 'none' : (theme === 'light' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.10))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))')
                            }}>
                            <div className={`${showActiveExpanded ? 'h-0 overflow-hidden' : `${gameMode === 'rounds' ? 'p-0 flex-1 h-full' : 'p-2 lg:p-2.5'}`} flex flex-col`}>
                              {gameMode === 'rounds' ? (
                                <RoundsTerminal
                                  price={price}
                                  balance={parseFloat(evmBalance || '0')}
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
                                  setDuration={setDuration} amount={amount} handleAmountChange={handleAmountChange} balance={parseFloat(evmBalance || '0')}
                                  sliderValue={sliderValue} handleSliderChange={handleSliderChange} executeTrade={executeTrade}
                                  theme={theme} minStake={platformSettings.minBet} timerActive={activeTrades.length > 0} isExecuting={isExecuting} wallet={wallet}
                                  depositAmount={depositAmount} setDepositAmount={setDepositAmount} onDeposit={handleDeposit} onWithdraw={handleWithdraw}
                                  CORAL={CORAL} GREEN={GREEN} currentNetwork={network} chainId={chainId}
                                  evmSessionWallet={evmSessionWallet} hasProfile={!!userProfile}
                                  activeMarket={activeMarket}
                                  maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                                  tradingHalted={platformSettings.tradingHalted}
                                  uiVersion={uiVersion}
                                  liveOdds={liveOdds}
                                />
                              )}
                            </div>
                          </div>

                          {/* ACTIVE TRADES (LOCKED DESKTOP HEIGHT: lg:min-h-[200px]) */}
                          {gameMode !== 'rounds' && (
                            <div className={`flex-1 min-h-[160px] md:min-h-0 lg:min-h-[180px] rounded-[22px] md:rounded-[32px] border glass-panel transition-all duration-500 flex flex-col ${showActiveExpanded ? 'w-full' : 'w-full lg:w-full'}`}
                              style={{
                                background: theme === 'light' ? 'rgba(240, 250, 245, 0.9)' : 'rgba(10,10,10,0.8)',
                                borderColor: theme === 'light' ? 'rgba(36, 156, 108, 0.18)' : 'rgba(255,255,255,0.05)',
                                filter: theme === 'light' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.10))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'
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
                </Suspense>

              </div>
            </div>
          )
          }



           <Suspense fallback={<div className="h-[400px] flex items-center justify-center animate-pulse">Loading Profile...</div>}>
             <ProfileModal
               isOpen={isProfileOpen}
               onClose={() => setIsProfileOpen(false)}
               wallet={wallet}
               evmSessionWallet={evmSessionWallet}
               userProfile={userProfile}
               isSignerInitializing={isSignerInitializing}
               onRetryInit={initializeSessionWallet}
               sessionBalance={sessionBalance}
               evmBalance={evmBalance}
               onDeposit={handleDeposit}
               onWithdraw={handleWithdraw}
               transactionHistory={transactionHistory}
               onViewReceipt={(tx) => {
                 setSelectedTransaction(tx);
                 setIsTransactionReceiptOpen(true);
               }}
               notify={notify}
             />
            </Suspense>
           


          <AnimatePresence>
            {toast && (
              <Toast
                key={toast.id || toast.message}
                message={toast.message}
                type={toast.type}
                isSmallScreen={isSmallScreen}
                onClose={closeToast}
                onClick={toast.onClick}
              />
            )}
          </AnimatePresence>

          {successOverlay && (
            <SuccessOverlay
              show={!!successOverlay}
              title={successOverlay.title}
              onDone={() => setSuccessOverlay(null)}
            />
          )}

          {/* Network Status Overlay */}
          <AnimatePresence>
            {!isOnline && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.4 }}
                className="fixed top-0 left-0 w-full z-[200000] pointer-events-none"
                style={{ height: '120px' }}
              >
                <div className="absolute top-0 left-0 w-full h-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(220,38,38,0.4) 0%, rgba(220,38,38,0.15) 40%, rgba(220,38,38,0.05) 70%, transparent 100%)',
                  }}
                />
              </motion.div>
            )}

            {isOnline && navigator.onLine && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: [0, 1, 1, 0], y: [0, 0, 0, -40] }}
                transition={{ duration: 2.5, times: [0, 0.1, 0.5, 1] }}
                exit={{ opacity: 0, y: -60 }}
                className="fixed top-0 left-0 w-full z-[200000] pointer-events-none"
                style={{ height: '120px' }}
              >
                <div className="absolute top-0 left-0 w-full h-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(36,156,108,0.4) 0%, rgba(36,156,108,0.15) 40%, rgba(36,156,108,0.05) 70%, transparent 100%)',
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <footer className={`${isSmallScreen ? 'hidden' : 'fixed bottom-1 left-0 w-full px-8 z-[100] opacity-30 hover:opacity-100 transition-opacity pointer-events-none'} flex items-center justify-between gap-6 flex-none bg-transparent`}
            style={{ fontFamily: 'Arial, sans-serif' }}>
            <div className="flex items-center gap-4 pointer-events-auto">
              <img src={theme === 'light' ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="h-[15px] lg:h-[20px] w-auto opacity-60" />
              <span className={`text-[7px] lg:text-[9px] font-bold tracking-widest ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                © 2026 15market
              </span>
            </div>
            <span className={`text-[7px] lg:text-[9px] font-medium tracking-widest pointer-events-auto ${theme === 'light' ? 'text-black/60' : 'text-white/60'}`}>
              Built by 15labs
            </span>
          </footer>
           <Suspense fallback={<div className="h-[400px] flex items-center justify-center animate-pulse">Loading Transaction Details...</div>}>
             <TransactionReceiptModal
               isOpen={isTransactionReceiptOpen}
               onClose={() => setIsTransactionReceiptOpen(false)}
               transaction={selectedTransaction}
             />
           </Suspense>


           {/* Onboarding Flow for new users */}
           {showOnboarding && address && !isGlobalLoading && (
             <Suspense fallback={<div className="h-[500px] flex items-center justify-center animate-pulse">Loading Onboarding...</div>}>
               <OnboardingFlow
                 address={address}
                 theme={theme}
                 evmSessionWallet={evmSessionWallet}
                 onComplete={(profile) => {
                   setShowOnboarding(false);
                   performStealthChecks(address); // Final refresh
                 }}
               />
             </Suspense>
           )}

          {/* Landing Page removed — users land directly on trading view with Connect button in navbar */}

          {/* Removed Global Initial Loader with Lane as requested */}

          {/* Removed Signer Sync Loader with Lane as requested */}

          {/* OVERLAY: Maintenance Mode */}
          {platformSettings.maintenanceMode && (
            <div className={`fixed inset-0 z-[3000] flex flex-col items-center justify-center p-8 text-center ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'}`}>
              <div className="w-24 h-24 bg-[#249C6C]/10 rounded-[32px] flex items-center justify-center mb-8 border border-[#249C6C]/20">
                <Settings className="text-[#249C6C] w-12 h-12 animate-spin-slow" />
              </div>
              <h1 className={`text-4xl font-black uppercase tracking-tighter mb-4 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                Under Maintenance
              </h1>
              <p className={`text-sm max-w-xs font-medium leading-relaxed ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'}`}>
                We are currently upgrading the platform to provide the best trading experience. Please check back shortly.
              </p>
            </div>
          )}

          {/* Authoritative Mobile History Drawer (Unconstrained) */}
          {isSmallScreen && view === "trading" && (
            <MobileBottomHistoryPane
              isOpen={authenticated && showMobileHistory}
              onToggle={() => {
                if (!authenticated) {
                  notify('Please connect your wallet or login to view trade history.', 'error');
                  return;
                }
                setShowMobileHistory(!showMobileHistory);
              }}
              tradeHistory={gameMode === 'rounds' ? roundsTradeHistory : tradeHistory}
              theme={theme}
              onViewReceipt={(tx) => { setSelectedTransaction(tx); setIsTransactionReceiptOpen(true); }}
              userProfile={userProfile}
            />
          )}
        </motion.div >
      </ErrorBoundary>
    </div>
  );
}
