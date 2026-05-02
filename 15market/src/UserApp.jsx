import { useEffect, useState, useCallback, useRef, useMemo, Component } from "react";
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
// Rounds chart logic merged into LiveStreamingChart/CustomChart for performance
import RoundsAccessGate from "./components/RoundsAccessGate";
import { OnboardingFlow } from "./components/OnboardingFlow";
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
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-[#3CB371] rounded-xl font-black uppercase text-xs tracking-widest">Restart Terminal</button>
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
  const { isConnected, address, chainId: connectedChainId, status } = useAccount();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

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

  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [globalLoadingProgress, setGlobalLoadingProgress] = useState(0);
  const [isAppReady, setIsAppReady] = useState(false);
  const isInitializing = status === 'reconnecting' || (status === 'connecting' && !isConnected);

  const [loadingProgress, setLoadingProgress] = useState(0);

  const activeTrade = activeTrades[0] || null; 

  // Safety Timeout: Reset and trigger whenever a GLOBAL load starts
  useEffect(() => {
    if (isGlobalLoading) {
      const timer = setTimeout(() => {
        setIsAppReady(true); 
        setIsGlobalLoading(false);
      }, 4000); // 4s absolute maximum wait for any sequence
      return () => clearTimeout(timer);
    }
  }, [isGlobalLoading]);

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

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [hasRoundsAccess, setHasRoundsAccess] = useState(null); // null = unknown, true/false = verified

  const performStealthChecks = useCallback(async (addr) => {
    if (!addr) return;
    
    setIsGlobalLoading(true);
    setGlobalLoadingProgress(0);
    setIsOffline(!navigator.onLine);

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
          const id = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout
          try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return res;
          } catch (e) {
            clearTimeout(id);
            throw e;
          }
        };

        // 1. Database User Verification (SILENT)
        const profileRes = await fetchWithTimeout(`${KEEPER_URL_ARC}/profiles/${addr.toLowerCase()}`).catch(() => null);
        
        if (profileRes && profileRes.ok) {
          const pData = await profileRes.json();
          setUserProfile(pData);
          if (!pData.username) {
             setShowOnboarding(true);
             localStorage.removeItem(`15market_onboarded_${addr.toLowerCase()}`);
          } else {
             setShowOnboarding(false);
             localStorage.setItem(`15market_onboarded_${addr.toLowerCase()}`, 'true');
          }
        } else {
          // Force onboarding if profile missing or 404
          setUserProfile({ address: addr, isInitial: true });
          setShowOnboarding(true);
          localStorage.removeItem(`15market_onboarded_${addr.toLowerCase()}`);
        }

        // 2. Authoritative Session Sync (Ensures balance is live & non-mock)
        const sessionRes = await fetchWithTimeout(`${KEEPER_URL_ARC}/session/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr.toLowerCase() })
        }).catch(() => null);
        
        if (sessionRes && sessionRes.ok) {
          const sData = await sessionRes.json();
          setSessionBalance(parseFloat(sData.balance || 0));
        }

        // 3. Rounds Access Check
        const roundsRes = await fetchWithTimeout(`${KEEPER_URL_ROUNDS}/access/check/${addr.toLowerCase()}`).catch(() => ({ ok: false }));
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

    // Retry loop if offline or network fail
    let success = await runChecks();
    if (!success) {
      const retryInterval = setInterval(async () => {
        if (navigator.onLine) {
          success = await runChecks();
          if (success) clearInterval(retryInterval);
        } else {
          setIsOffline(true);
        }
      }, 3000);
      
      // We don't block the UI forever if it's already cached
      if (localStorage.getItem(`15market_onboarded_${addr.toLowerCase()}`) === 'true') {
        setTimeout(() => { if (!success) setIsGlobalLoading(false); }, 10000);
      }
    }

    // Wrap up: Instant delivery
    const finish = () => {
      clearInterval(progressInterval);
      setGlobalLoadingProgress(100);
      setIsGlobalLoading(false);
    };

    if (success) {
      finish();
    } else {
      // If still failing after initial wait, but we have local proof, let them in
      if (localStorage.getItem(`15market_onboarded_${addr.toLowerCase()}`) === 'true') {
        finish();
      }
    }
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
    const interval = setInterval(fetchGlobalSettings, 30000); // 30s sync for maintenance (optimized)

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
  const [sessionMode, setSessionMode] = useState(true);
  const [evmSessionWallet, setEvmSessionWallet] = useState(null);
  const [sessionBalance, setSessionBalance] = useState(0);
  // Ref that always mirrors sessionBalance — used by async callbacks to avoid stale closures
  const sessionBalanceRef = useRef(0);
  const [refillAmount, setRefillAmount] = useState("0.1");
  const [isSessionSynced, setIsSessionSynced] = useState(() => localStorage.getItem("15market_session_synced") === "true");
  const [isSignerInitializing, setIsSignerInitializing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  
  // Security Handshake Purged

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [toast, setToast] = useState(null); // { message, type, onClick }

  const notify = useCallback((message, type = 'success', onClick = null) => {
    setToast({ message, type, onClick });
  }, []);

  const resolvingInProgress = useRef(new Set()); // Tracks IDs of trades currently being resolved
  const activeTradesRef = useRef([]);
  const tradeHistoryRef = useRef([]);
  const priceRef = useRef("0.00");
  const lastPriceUpdateRef = useRef(Date.now());
  const priceHistoryRef = useRef([]);
  const lastOptimisticActionTime = useRef(0);
  // 🔒 RESULT LOCK: Once a trade expires and the frontend resolves it, its outcome is stored here.
  // The reconciler will NEVER downgrade a locked result, preventing glitches.
  const lockedResults = useRef(new Map()); // tradeId → { status, settlementPrice }
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      setIsSmallScreen(window.innerWidth < 1024); 
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
    fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'488cf3'},body:JSON.stringify({sessionId:'488cf3',...payload,timestamp:Date.now()})}).catch(()=>{});
  }, []);

  const handleRoundsUnlock = useCallback(() => {
    console.log('[AccessGate] Rounds access verified & unlocked');
  }, []);




  // Custom balance fetcher (Replaces Wagmi useBalance)
  // 1. Core Balance Fetchers
  const refetchEvmBalance = useCallback(async (force = false) => {
    if (!address) return;

    try {
      // Priority 1: Backend Proxy (Faster, handles indexing)
      const res = await fetch(`${KEEPER_URL_ARC}/balance/${address}`);
      let formatted;
      
      if (res.ok) {
        const data = await res.json();
        formatted = data.balance;
      } else {
        // Priority 2: Direct Blockchain Core Fallback (If backend is down/slow)
        const balWei = await publicClient.getBalance({ address });
        formatted = formatUnits(balWei, 18);
      }

      const newBalNum = parseFloat(formatted);

      // Guard period for optimistic updates: 20s to cover on-chain confirmation + backend indexing
      const msSinceLastAction = Date.now() - lastOptimisticActionTime.current;
      if (!force && msSinceLastAction < 20000) return;

      if (Math.abs(newBalNum - parseFloat(evmBalance || '0')) > 0.000001 || (newBalNum > 0 && evmBalance === "0")) {
        setEvmBalance(formatted);
      }
    } catch (e) { 
      // Last resort: standard blockchain fetch
      try {
        const balWei = await publicClient.getBalance({ address });
        setEvmBalance(formatUnits(balWei, 18));
      } catch (err) {}
    }
  }, [address]);

  // Keep sessionBalanceRef in sync with sessionBalance state so async
  // callbacks always read the live value without stale-closure issues.
  useEffect(() => {
    sessionBalanceRef.current = sessionBalance;
  }, [sessionBalance]);

  const updateEvmSessionBal = useCallback(async (force = false) => {
    if (!address) return;
    
    // GUARD: If user just performed an optimistic action (Trade/Deposit), 
    // ignore backend syncs for 15s to allow chain confirmation.
    const msSinceAction = Date.now() - lastOptimisticActionTime.current;
    if (msSinceAction < 20000 && !force) return;

    try {
      // Read the real on-chain EOA session wallet balance from backend
      const res = await fetch(`${KEEPER_URL_ARC}/session/balance/${address}`);
      if (res.ok) {
        const data = await res.json();
        const bal = parseFloat(data.balance);
        const currentBal = sessionBalanceRef.current;
        if (Math.abs(bal - currentBal) > 0.0001 || force) {
          setSessionBalance(bal);
        }
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
        body: JSON.stringify({ address })
      }).catch(err => {
        throw new Error(`Connection to Backend Failed`);
      });

      if (!res.ok) throw new Error(`Backend init failed`);

      const data = await res.json();
      const sessionObj = { address: data.sessionAddress, isRemote: true };
      
      setEvmSessionWallet(sessionObj);
      setSessionBalance(parseFloat(data.balance));
      setIsSessionSynced(true);
      setSessionMode(true);
      localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);

      setIsSignerInitializing(false);
      // notify("Trading Wallet Synced", "success");

    } catch (err) {
      setIsSignerInitializing(false);
      console.warn("Session init fallback:", err.message);
    }
  }, [address]);

  const fetchMyProfile = useCallback(async () => {
    if (!address) return;
    try {
      // STEALTH: Pre-check returning user status via hint
      const hint = localStorage.getItem(`15market_profile_exists_${address.toLowerCase()}`);

      const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) {
          setUserProfile(data);
          
          if (!data.username) {
             setShowOnboarding(true);
             localStorage.removeItem(`15market_profile_exists_${address.toLowerCase()}`);
          } else {
             setShowOnboarding(false);
             localStorage.setItem(`15market_profile_exists_${address.toLowerCase()}`, "true");
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
         setShowOnboarding(true);
         localStorage.removeItem(`15market_profile_exists_${address.toLowerCase()}`);
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

  // AUTO-INITIALIZE Session Wallet as soon as any address is available
  useEffect(() => {
    if (address && !evmSessionWallet && !isSignerInitializing && !hasInitAttempted.current) {
        hasInitAttempted.current = true;
        initializeSessionWallet();
    }
  }, [address, evmSessionWallet, isSignerInitializing, initializeSessionWallet]);

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

  // Periodic session balance refresh (every 12s) — catches cases where
  // socket balance_update events are missed and no other trigger fires.
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      // Only poll if we're not in the optimistic guard window
      const msSinceAction = Date.now() - lastOptimisticActionTime.current;
      if (msSinceAction > 8000) {
        updateEvmSessionBal(false);
      }
    }, 12000);
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
      // GUARD: If user just performed an optimistic action, ignore socket updates for 15s
      // EXCEPT for winnings, which we always want to see instantly.
      const msSinceAction = Date.now() - lastOptimisticActionTime.current;
      const isWinningEvent = data.reason === 'WIN' || data.reason === 'WIN_PAYOUT' || data.reason === 'WIN_PAYOUT_SETTLED';
      
      if (msSinceAction < 15000 && !isWinningEvent) return;

      const val = data.balance || data.available;
      if (val !== undefined) {
        setSessionBalance(parseFloat(val));
      }

      if (data.reason === 'WIN' || data.reason === 'WIN_PAYOUT' || data.reason === 'WIN_PAYOUT_SETTLED') {
        const payoutAmt = parseFloat(data.payout || 0);
        const reasonLabel = data.reason === 'WIN_PAYOUT_SETTLED' ? 'Confirmed' : 'Received';
        
        notify(`Payout ${reasonLabel}: +$${payoutAmt.toFixed(2)}`, "success", () => {
          // Find the trade in history or active to show receipt
          const tid = String(data.betId || data.txHash);
          const trade = [...activeTrades, ...tradeHistory].find(t => String(t.id || t.tx || t.nonce) === tid);
          if (trade) {
             setSelectedTransaction({
                ...trade,
                tx: data.txHash || trade.tx
             });
             setIsTransactionReceiptOpen(true);
          }
        });

        if (data.reason === 'WIN_PAYOUT_SETTLED') {
           const tid = String(data.betId || data.txHash);
           setActiveTrades(prev => prev.map(t => String(t.id || t.tx || t.nonce) === tid ? { ...t, payoutSettled: true, tx: data.txHash || t.tx } : t));
           setTradeHistory(prev => prev.map(t => String(t.id || t.tx || t.nonce) === tid ? { ...t, payoutSettled: true, tx: data.txHash || t.tx } : t));
        }
        triggerGlobalRefresh(true);
      }
    });

    const unbindSettled = socketService.on('trade_settled', (data) => {
      console.log("[Socket] Trade Settled authoritative update:", data);
      const tid = String(data.id || data.betId);
      
      const updateFn = (t) => {
        if (String(t.id || t.tx || t.nonce) === tid) {
          return { 
            ...t, 
            status: data.status || (data.won ? 'WON' : 'LOST'),
            exitPrice: data.exitPrice,
            payout: data.payout,
            confirmed: true
          };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));

      if (data.won) {
         // Mark as payout pending for visual indicators
         setActiveTrades(prev => prev.map(t => String(t.id || t.nonce) === tid ? { ...t, payoutSettled: false } : t));
         setTradeHistory(prev => prev.map(t => String(t.id || t.nonce) === tid ? { ...t, payoutSettled: false } : t));
      }
    });

    const unbindPayout = socketService.on('payout_completed', (data) => {
      console.log("[Socket] Payout Completed:", data);
      const tid = String(data.betId);
      
      const updateFn = (t) => {
        if (String(t.id || t.tx || t.nonce) === tid) {
          return { 
            ...t, 
            status: 'PAID',
            payoutTx: data.txHash,
            payoutPending: false,
            confirmed: true
          };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
      notify(`Payout Confirmed: +$${parseFloat(data.payout || 0).toFixed(2)}`, "success");
      triggerGlobalRefresh(true);
    });

    const unbindTick = socketService.on('trade_tick', (data) => {
      const tid = String(data.betId);
      setActiveTrades(prev => prev.map(t => {
        if (String(t.id || t.nonce) === tid) {
          return { ...t, currentPrice: data.currentPrice, isWinning: data.isWinning };
        }
        return t;
      }));
    });

    const unbindExpired = socketService.on('trade_expired', (data) => {
       const tid = String(data.betId);
       setActiveTrades(prev => prev.map(t => {
         if (String(t.id || t.nonce) === tid) {
           return { ...t, status: 'RESOLVING', exitPrice: data.exitPrice };
         }
         return t;
       }));
    });

    const unbindErr = socketService.on('terminal_error', (data) => {
      notify(data.message, "error");
      console.error("[Terminal Error]", data);
    });

    return () => {
      unbindBal();
      unbindSettled();
      unbindPayout();
      unbindTick();
      unbindExpired();
      unbindErr();
    };
  }, [address, notify, triggerGlobalRefresh]);
  
  // 🔒 Result Lock Synchronizer: Propagation of local locks to state
  useEffect(() => {
    const lockSyncInterval = setInterval(() => {
      if (lockedResults.current.size === 0) return;
      
      let changed = false;
      const historyCopy = [...tradeHistoryRef.current];
      const activeCopy = [...activeTradesRef.current];
      
      lockedResults.current.forEach((val, id) => {
        const tid = String(id);
        
        // 1. Update History
        const hIdx = historyCopy.findIndex(t => String(t.id || t.tx || t.nonce) === tid);
        if (hIdx !== -1 && historyCopy[hIdx].status === 'PENDING') {
          historyCopy[hIdx] = { ...historyCopy[hIdx], status: val.status, settlementPrice: val.settlementPrice };
          changed = true;
        }
        
        // 2. Update Active
        const aIdx = activeCopy.findIndex(t => String(t.id || t.tx || t.nonce) === tid);
        if (aIdx !== -1 && activeCopy[aIdx].status === 'PENDING') {
          activeCopy[aIdx] = { ...activeCopy[aIdx], status: val.status, settlementPrice: val.settlementPrice };
          changed = true;
        }
      });
      
      if (changed) {
        setTradeHistory(historyCopy);
        setActiveTrades(activeCopy);
      }
    }, 500);
    
    return () => clearInterval(lockSyncInterval);
  }, []);


  // Periodic Universal Sync (Optimized for Instant Pulse Mode)
  useEffect(() => {
    if (address) {
      // 1. Instant Retention: Load session wallet from storage as soon as main wallet connects
      let stored;
      try {
        stored = localStorage.getItem(`15market_session_addr_${address.toLowerCase()}`);
      } catch (e) { console.warn("[Security] LocalStorage access restricted"); }

      if (stored && (!evmSessionWallet || evmSessionWallet.address !== stored)) {
        setEvmSessionWallet({ address: stored, isRemote: true });
      }

      // 2. Initial Fetch (Balance only syncs on Mount or Transaction)
      triggerGlobalRefresh(true);
      fetchMyProfile();
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
    postDebugLog({runId:'initial',hypothesisId:'H1',location:'UserApp.jsx:executeTrade:entry',message:'executeTrade entry',data:{probeId,isExecuting,gameMode,paramsType:params?.type || null,sessionMode,sessionBalance:sessionBalanceRef.current,amount,duration,direction}});
    // #endregion
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

    // For the embedded session model, the stake comes from the session wallet balance.
    const currentBal = sessionBalance;
    const sanitizedAmount = (activeAmount || "0").toString().replace(',', '.');
    const stakeAmt = parseFloat(sanitizedAmount);

    // Reserve a tiny margin for gas (USDC is gas on Arc)
    const gasMargin = 0.001; 

    if (stakeAmt + gasMargin > currentBal) {
      return notify(`Insufficient Session Balance. Need at least ${(stakeAmt + gasMargin).toFixed(4)} USDC. Please Refill.`, "error");
    }
    // #region agent log
    postDebugLog({runId:'initial',hypothesisId:'H2',location:'UserApp.jsx:executeTrade:validated',message:'trade validated pre-submit',data:{probeId,activeType,stakeAmt,currentBal,gasMargin,activeDirection,activeDuration}});
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
    const entryPriceParams = (assetId === 2) ? Math.floor(activePrice * 1000000) : Math.floor(activePrice * 100);
    const activeUserAddr = (sessionMode && evmSessionWallet) ? evmSessionWallet.address : address;
    const now = Date.now();
    const amtNum = parseFloat(activeAmount);

    // --- INSTANT UI START ---
    setIsExecuting(true);
    // Short lockout to prevent accidental double-clicks, but released almost immediately
    setTimeout(() => setIsExecuting(false), 800);

    try {
      if (!isConnected) {
        throw new Error("Please connect wallet first");
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
        postDebugLog({runId:'initial',hypothesisId:'H3',location:'UserApp.jsx:executeTrade:rounds:deduct1',message:'rounds first optimistic deduction applied',data:{probeId,amtNum,balanceBefore:sessionBalanceRef.current}});
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

        // --- INSTANT UI START FOR ROUNDS ---
        lastOptimisticActionTime.current = Date.now();
        setSessionBalance(prev => Math.max(0, prev - amtNum));
        // #region agent log
        postDebugLog({runId:'initial',hypothesisId:'H3',location:'UserApp.jsx:executeTrade:rounds:deduct2',message:'rounds second optimistic deduction applied',data:{probeId,amtNum,balanceBefore:sessionBalanceRef.current}});
        // #endregion

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
      const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => String(t.id) !== String(item.id))];
      const optimisticTrade = {
        id: tradeId,
        direction: dirVal === 1 ? 'UP' : 'DOWN',
        amount: Number(activeAmount).toFixed(3),
        entryPrice: activePrice.toFixed(2),
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
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s for on-chain stake move
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
            // Restore balance on failure
            notify(data.error || 'Trade failed', 'error');
            setSessionBalance(prev => prev + amtNum);
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
            return;
          }

          // ✅ Trade Active (On-chain stake moved)
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

          if (data.newBalance !== undefined) {
            setSessionBalance(parseFloat(data.newBalance));
          }

          notify('Trade Active ✓', 'success');
        } catch (err) {
          clearTimeout(timeoutId);
          console.error('[Trade] Execution error:', err.message);
          setSessionBalance(prev => prev + amtNum);
          setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
          setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
          notify(err.name === 'AbortError' ? '⚡ Network Congested — Trade Cancelled' : err.message, 'error');
        }
      };

      backgroundTrade();
      
      // Safety: If backend hangs forever, we still want to let the user trade again
      setTimeout(() => {
        setIsExecuting(false);
      }, 5000);

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

    const unbindSettings = socketService.on('settings_updated', (newSettings) => {
      setPlatformSettings(prev => ({ ...prev, ...newSettings }));
      localStorage.setItem('15market_citadel_settings', JSON.stringify(newSettings));
    });

    // ── BACKEND-AUTHORITATIVE SETTLEMENT ──
    // The backend is the ONLY source of truth for trade results.
    const unbindSettled = socketService.on('trade_settled', (data) => {
      if (!data?.betId && !data?.id) return;

      const isMine = data.userAddr &&
        address && data.userAddr.toLowerCase() === address.toLowerCase();
      if (!isMine) return;

      const betId       = String(data.betId || data.id);
      const finalStatus = data.won ? 'WON' : 'LOST';
      const exitPrice   = data.exitPrice ? parseFloat(data.exitPrice).toFixed(2) : '0.00';
      const payout      = data.payout ? parseFloat(data.payout).toFixed(4) : '0.00';

      console.log(`[Settlement] Backend settled #${betId}: ${finalStatus} @ $${exitPrice}`);
      lockedResults.current.set(betId, { status: finalStatus, settlementPrice: exitPrice });
      removedTradeIds.current.add(betId);

      // Build the fully-settled trade record
      const settledRecord = {
        id:              betId,
        nonce:           betId,
        status:          finalStatus,
        settlementPrice: exitPrice,
        entryPrice:      data.entryPrice ? parseFloat(data.entryPrice).toFixed(2) : '0.00',
        exitPrice,
        payout,
        won:             data.won,
        direction:       data.direction === 1 || data.direction === 'UP' ? 'UP' : 'DOWN',
        amount:          data.amount,
        symbol:          data.symbol || 'ETH',
        duration:        data.duration,
        timestamp:       data.timestamp || Date.now(),
        txHash:          data.txHash || null,
        tx:              data.txHash || null,
        backendSettled:  true,
        balanceApplied:  true,
      };

      // Allow the reconciler to handle the removal after a grace period
      // setActiveTrades(prev => prev.filter(t => String(t.id) !== betId && String(t.nonce) !== betId));

      // Upsert into tradeHistory with final WON/LOST status
      setTradeHistory(prev => {
        const exists = prev.find(t => String(t.id || t.nonce) === betId);
        if (exists) {
          return prev.map(t => String(t.id || t.nonce) === betId ? { ...t, ...settledRecord } : t);
        }
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

    return () => {
      unbindSettings();
      unbindSettled();
    };
  }, [notify, updateEvmSessionBal, refetchEvmBalance, address, evmSessionWallet]);

  // ── Backend-Authoritative Trade Ticks ────────────────────────────────────────
  // The backend TradeMonitor emits trade_tick every second per active trade.
  // We use these to drive the countdown and live price in ActiveTradesSidebar.
  useEffect(() => {
    if (!address) return;

    const unbindTick = socketService.on('trade_tick', (data) => {
      setActiveTrades(prev => prev.map(t =>
        String(t.id) === String(data.betId) || String(t.nonce) === String(data.betId)
          ? { ...t, timeLeft: data.timeLeft, livePrice: data.currentPrice, isWinning: data.isWinning }
          : t
      ));
    });

    const unbindExpired = socketService.on('trade_expired', (data) => {
      const bid = String(data.betId);
      console.log(`[Trade] Authority Locked: #${bid} -> ${data.won ? 'WON' : 'LOST'} @ $${data.exitPrice}`);
      lockedResults.current.set(bid, { status: data.won ? 'WON' : 'LOST', settlementPrice: data.exitPrice });
      
      setActiveTrades(prev => prev.map(t => 
        String(t.id) === bid || String(t.nonce) === bid 
          ? { ...t, won: data.won, livePrice: data.exitPrice, timeLeft: 0 } 
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
        postDebugLog({runId:'initial',hypothesisId:'H9',location:'UserApp.jsx:syncMarket:override',message:'syncMarket changed active market and reset price',data:{from:activeMarket?.id,to:resolvedMarket?.id}});
        // #endregion
        // #region agent log
        fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de7e69'},body:JSON.stringify({sessionId:'de7e69',runId:'initial',hypothesisId:'H3',location:'UserApp.jsx:syncMarket:override',message:'syncMarket overriding active market from localStorage/listings',data:{from:activeMarket?.id,to:resolvedMarket?.id,listingHasBinance:!!resolvedMarket?.binance,listingHasPyth:!!resolvedMarket?.pythId},timestamp:Date.now()})}).catch(()=>{});
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
    fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de7e69'},body:JSON.stringify({sessionId:'de7e69',runId:'initial',hypothesisId:'H4',location:'UserApp.jsx:handleMarketChange:entry',message:'User requested market switch',data:{current:activeMarket?.id,next:newMarket?.id,nextHasBinance:!!newMarket?.binance,nextHasPyth:!!newMarket?.pythId},timestamp:Date.now()})}).catch(()=>{});
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
          return Array.from(hMap.values()).sort((a,b) => b.id - a.id);
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
      let activeSessionWallet = evmSessionWallet;
      if (!activeSessionWallet?.address) {
        notify("Initializing trading wallet...", "pending");
        try {
          // Trigger the init call directly
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
        // Ensure user is on the correct chain (Arc Testnet)
        try {
          await switchChainAsync({ chainId: 5042002 });
        } catch (switchErr) {
          console.warn("Chain switch failed or rejected:", switchErr.message);
        }

        // Fetch current gas price from Arc Testnet (Viem syntax)
        let txParams = {
          to: activeSessionWallet.address,
          value: parseEther(amtNum.toString()),
          account: address,
        };

        try {
          const feeData = await publicClient.estimateFeesPerGas();
          if (feeData.maxFeePerGas) {
            // EIP-1559 (Modern)
            txParams.maxFeePerGas = (feeData.maxFeePerGas * 125n) / 100n;
            txParams.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 125n) / 100n;
          } else if (feeData.gasPrice) {
            // Legacy
            txParams.gasPrice = (feeData.gasPrice * 125n) / 100n;
          }
        } catch (feeErr) {
          console.warn("[Deposit] Fee estimation failed, using wallet defaults:", feeErr.message);
        }

        console.log(`[Deposit] Initiating tx to ${activeSessionWallet.address} for ${amtNum} USDC`);

        // Step 1: Send native USDC directly to the Session EOA
        const hash = await walletClient.sendTransaction(txParams);

        notify("Deposit Broadcasted! Waiting for confirmation...", "success");

        // Step 2: Notify backend to credit balance immediately (Optimistic)
        fetch(`${KEEPER_URL_ARC}/session/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, amount: amtNum, txHash: hash })
        }).catch(() => {});

        // Step 3: Optimistic local UI update (Both wallets)
        setSessionBalance(prev => prev + amtNum);
        setEvmBalance(prev => {
          const current = parseFloat(prev || '0');
          return (current - amtNum).toFixed(6);
        });
        lastOptimisticActionTime.current = Date.now();

        // Step 3: Wait for confirmation, then do a hard refresh
        publicClient.waitForTransactionReceipt({ hash }).then(() => {
          notify("Deposit Confirmed!", "success");
          setTimeout(() => updateEvmSessionBal(true), 2000);
          setTimeout(() => refetchEvmBalance(true), 2000);
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

      } catch (evmErr) {
        notify(`Deposit failed: ${evmErr.shortMessage || evmErr.message}`, "error");
      }
    } finally {
      setIsExecuting(false);
    }
  }, [address, notify, evmBalance, evmSessionWallet, updateEvmSessionBal, refetchEvmBalance, isExecuting, walletClient]);


  const handleWithdraw = useCallback(async (amt) => {
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

      // --- AUTO-INITIALIZE SESSION WALLET IF MISSING ---
      let activeSessionWallet = evmSessionWallet;
      if (!activeSessionWallet) {
        notify("Initializing trading wallet...", "pending");
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

      const gasBuffer = 0.01;
      const netAmt = amtNum - gasBuffer;

      if (netAmt <= 0) {
        notify("Amount too low for gas", "error");
        return;
      }

      setIsExecuting(true);
      notify("Sign to authorize withdrawal...", "pending");

      // Require user to sign an authorization message.
      const authMsg = `--- 15MARKET PROTOCOL ---\nACTION: WITHDRAW FROM AUTO-SIGNER\nAMOUNT: ${amt} USDC\nTO: ${address}\nTIMESTAMP: ${Date.now()}`;
      try {
        if (walletClient) {
          await walletClient.signMessage({ message: authMsg, account: address });
        } else if (window.ethereum) {
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

      // Fix floating-point precision before sending
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

      // --- OPTIMISTIC UI UPDATE ---
      setSessionBalance(prev => Math.max(0, prev - amtNum));
      setEvmBalance(prev => {
        const current = parseFloat(prev || '0');
        return (current + cleanNetAmt).toFixed(6);
      });
      lastOptimisticActionTime.current = Date.now();

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





  return (
    <ErrorBoundary>
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
          wallet={wallet}
          sessionBalance={sessionBalance}
          evmBalance={parseFloat(evmBalance || "0")}
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
              <div className="flex items-center gap-2">
                {/* Desktop: Only show session balance per user request */}
                <WalletBalance network={network} theme={theme} balanceOverride={sessionBalance} label="SESSION" />
              </div>
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
              <div className="scale-[0.8] origin-center -mx-1.5 flex items-center gap-1">
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
            <RoundsAccessGate 
              theme={theme} 
              active={gameMode === 'rounds'} 
              verified={hasRoundsAccess} 
              onUnlock={handleRoundsUnlock}
            >
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
                    <div className={`${isSmallScreen ? 'flex-1' : 'flex-[2] min-h-[280px]'} lg:min-h-[400px] lg:h-full lg:min-h-0 rounded-[32px] overflow-hidden border transition-all duration-300 ${isSmallScreen ? 'glass-panel backdrop-blur-3xl' : 'glass-panel chart-glow'} flex flex-col w-full min-h-0`}
                      style={{
                        background: isSmallScreen 
                          ? (theme === 'light' ? 'rgba(180, 217, 199, 0.2)' : 'rgba(10, 10, 10, 0.85)') 
                          : (theme === 'light' ? 'rgba(60, 179, 113, 0.08)' : 'rgba(10, 10, 10, 0.7)'),
                        boxShadow: isSmallScreen
                          ? (theme === 'light' 
                            ? '0 15px 45px -10px rgba(60,179,113,0.08), inset 0 5px 35px rgba(255,255,255,0.95), inset 0 -4px 20px rgba(60,179,113,0.1)' 
                            : '0 30px 90px rgba(0,0,0,0.8), inset 0 0 60px rgba(60,179,113,0.05), inset 0 2px 4px rgba(255,255,255,0.05)')
                          : (theme === 'light'
                            ? '0 10px 40px rgba(0, 0, 0, 0.04), inset 0 0 40px rgba(60, 179, 113, 0.05)'
                            : `0 0 60px ${GREEN}10, inset 0 0 40px ${GREEN}05`),
                        borderColor: isSmallScreen
                          ? (theme === 'light' ? 'rgba(60, 179, 113, 0.35)' : 'rgba(255, 255, 255, 0.05)')
                          : (theme === 'light' ? 'rgba(60, 179, 113, 0.15)' : `${GREEN}15`)
                      }}>
                      <div className="flex-1 w-full h-full flex relative">
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
                              lockedResults={lockedResults}
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
        sessionBalance={sessionBalance}
        evmBalance={evmBalance}
        onRefill={handleRefill}
        onWithdraw={handleWithdraw}
        transactionHistory={transactionHistory}
        onViewReceipt={(tx) => {
          setSelectedTransaction(tx);
          setIsTransactionReceiptOpen(true);
        }}
        notify={notify}
        theme={theme}
        onUpdate={() => performStealthChecks(address)}
      />
      <PnLModal isOpen={isPnLOpen} onClose={() => setIsPnLOpen(false)} trade={selectedPnLTrade} theme={theme} />



      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={closeToast} 
            onClick={toast.onClick}
          />
        )}
      </AnimatePresence>

      {/* Network Status Overlay */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-0 left-0 w-full z-[200000] bg-red-600/90 backdrop-blur-xl border-b border-white/10"
          >
            <div className="flex items-center justify-center gap-3 py-1.5 px-4 overflow-hidden">
              <div className="flex items-center gap-2">
                <Activity size={10} className="text-white animate-pulse" />
                <span className="text-[9px] font-black text-white uppercase tracking-[0.3em]">
                  Disconnected • Internet Connection Lost
                </span>
              </div>
            </div>
          </motion.div>
        )}
        
        {isOnline && navigator.onLine && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ 
              opacity: [0, 1, 1, 0],
              height: ['auto', 'auto', 'auto', 0]
            }}
            transition={{ duration: 3, times: [0, 0.1, 0.9, 1] }}
            className="fixed top-0 left-0 w-full z-[199999] bg-[#3CB371]/90 backdrop-blur-xl border-b border-white/10 overflow-hidden"
          >
            <div className="flex items-center justify-center gap-3 py-1.5 px-4">
              <span className="text-[9px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-2">
                <CheckCircle size={10} />
                Network Reconnected • System Online
              </span>
            </div>
          </motion.div>
        )}
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

      {/* OVERLAY: Landing Page (Not Connected) */}
      <AnimatePresence>
        {!isConnected && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000]"
          >
            <LandingPage theme={theme} onToggle={toggleTheme} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Removed Global Initial Loader with Lane as requested */}

      {/* Removed Signer Sync Loader with Lane as requested */}

      {/* OVERLAY: Maintenance Mode */}
      {platformSettings.maintenanceMode && (
        <div className={`fixed inset-0 z-[3000] flex flex-col items-center justify-center p-8 text-center ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'}`}>
          <div className="w-24 h-24 bg-[#3CB371]/10 rounded-[32px] flex items-center justify-center mb-8 border border-[#3CB371]/20">
            <Settings className="text-[#3CB371] w-12 h-12 animate-spin-slow" />
          </div>
          <h1 className={`text-4xl font-black uppercase tracking-tighter mb-4 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
            Under Maintenance
          </h1>
          <p className={`text-sm max-w-xs font-medium leading-relaxed ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'}`}>
            We are currently upgrading the platform to provide the best trading experience. Please check back shortly.
          </p>
        </div>
      )}
    </motion.div >
    </ErrorBoundary>
  );
}
