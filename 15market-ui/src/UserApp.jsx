import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
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
import { publicClient } from "./paraClient";

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
  const [price, setPrice] = useState("0.00");
  const staticPriceFails = useRef(0);
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const [balance, setBalance] = useState(0);
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

  // Custom balance fetcher (Replaces Wagmi useBalance)
  const refetchEvmBalance = useCallback(async () => {
    if (!address) return;
    try {
      const b = await publicClient.getBalance({ address });
      setEvmBalance(formatUnits(b, 18));
    } catch (e) {
      console.error("Failed to fetch balance:", e);
    }
  }, [address]);

  useEffect(() => {
    refetchEvmBalance();
    const interval = setInterval(refetchEvmBalance, 10000);
    return () => clearInterval(interval);
  }, [refetchEvmBalance]);

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
      const timer = setTimeout(() => {
        if (!isConnected) setAuthenticated(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  const wallet = useMemo(() => {
    if (!isConnected || !address) return { connected: false };

    try {
      return {
        connected: true,
        address: address,
        publicKey: null,
        signTransaction: async (tx) => {
          throw new Error("signTransaction not supported. Use writeContract for EVM transactions.");
        },
        signAllTransactions: async (txs) => {
          throw new Error("signAllTransactions not supported.");
        },
        signMessage: async (msg) => {
          throw new Error("signMessage not supported. Use Wagmi signing methods.");
        }
      };
    } catch (e) {
      console.error("Wallet wrapper error:", e);
      return { connected: false };
    }
  }, [isConnected, address]);

  const login = () => {
    console.warn("login() called but Para SDK is removed. Use UnifiedWalletButton instead.");
  };

  const user = useMemo(() => {
    if (isConnected && address) return { wallet: { address } };
    return null;
  }, [isConnected, address]);

  const GREEN = "#3CB371";
  const CORAL = "#3CB371";

  useEffect(() => {
    localStorage.setItem("15market_network", "arc");
  }, []);

  const themeClass = "theme-arc";

  // Session Wallet State
  const [sessionMode, setSessionMode] = useState(false);
  const [evmSessionWallet, setEvmSessionWallet] = useState(null);
  const [sessionBalance, setSessionBalance] = useState(0);
  const [refillAmount, setRefillAmount] = useState("0.1");
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const resolvingInProgress = useRef(new Set()); // Tracks IDs of trades currently being resolved
  const [toast, setToast] = useState(null); // { message, type }

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
    const interval = setInterval(fetchTreasury, 15000);
    return () => clearInterval(interval);
  }, []);

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
        const addressesToFetch = [address];
        if (evmSessionWallet?.address) addressesToFetch.push(evmSessionWallet.address);

        const fetchPromises = addressesToFetch.map(async (addr) => {
          const [resT, resA] = await Promise.all([
            fetch(`${KEEPER_URL_ARC}/trades/${addr}`),
            fetch(`${KEEPER_URL_ARC}/active-bets/${addr}`)
          ]);
          if (resT.ok && resA.ok) {
            const t = await resT.json();
            const a = await resA.json();
            return [...t, ...a];
          }
          return [];
        });

        const results = await Promise.all(fetchPromises);
        const backendAllRaw = results.flat();

        if (backendAllRaw.length >= 0) {
          // Normalized trades from backend
          const backendAll = backendAllRaw.map(t => ({
            ...t,
            // Normalize direction: 1 -> UP, 0 -> DOWN (matches Contract mapping)
            direction: typeof t.direction === 'number' ? (t.direction === 1 ? "UP" : "DOWN") : t.direction,
            status: t.status || (t.settled ? (t.won ? "WON" : "LOST") : "PENDING"),
            owner: t.owner || t.user || t.userPublicKey || t.userAddress
          }));

          // Merge backend trades with local trades to prevent flickering/overwriting
          setTradeHistory(prev => {
            const merged = [...backendAll];
            prev.forEach(local => {
              if (!merged.find(m => String(m.id) === String(local.id))) {
                merged.push(local);
              }
            });
            // Sort merged history by timestamp descending, normalizing s vs ms
            const sorted = merged.sort((a, b) => {
              const timeA = (a.timestamp || a.startTime || 0);
              const timeB = (b.timestamp || b.startTime || 0);
              const normA = timeA > 1000000000000 ? timeA : timeA * 1000;
              const normB = timeB > 1000000000000 ? timeB : timeB * 1000;
              return normB - normA;
            });

            // Save full merged history for this address
            localStorage.setItem("15market_history_v1", JSON.stringify(sorted.slice(0, 100)));
            return sorted;
          });

          // Update active trades - merge backend view with local-only view
          setActiveTrades(prev => {
            const backendActive = backendAll.filter(t => ["PENDING", "RESOLVING"].includes(t.status));
            const updatedActive = [...backendActive];
            // Keep local trades ONLY if backend doesn't know about them at all
            prev.forEach(local => {
              // Check if this local trade exists in the FULL backend list (history + active)
              // If backend knows about it (in any state), don't keep local stale copy
              const knownByBackend = backendAll.find(b => String(b.id) === String(local.id));

              if (!knownByBackend && local.status === "PENDING") {
                updatedActive.push(local);
              }
            });
            return updatedActive;
          });
        }
      } catch (e) {
        console.error("Failed to fetch trade history:", e);
      }
    };

    fetchTradeHistory();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchTradeHistory, 5000);
    return () => clearInterval(interval);
  }, [address, isConnected, network]);

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

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  const navigate = useNavigate();


  // Stale wallet cleanup replaced with Para SDK's internal handling
  useEffect(() => {
    // Para handles its own session persistence, no manual cleanup needed here
  }, []); // Run once on mount

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

      // 1. Pyth Sources (Multiple Hermers endpoints for redundancy)
      if (activeMarket.pythId) {
        const pythIdClean = activeMarket.pythId.replace('0x', '');

        // Try both v2 latest with/without 0x and beta
        sources.push({
          name: "pyth",
          url: `https://hermes.pyth.network/v2/updates/price/latest?ids=${pythIdClean}`,
          parse: d => {
            const p = d.parsed?.[0]?.price;
            return p ? parseFloat(p.price) * Math.pow(10, p.expo) : null;
          }
        });

        sources.push({
          name: "pyth-bench",
          url: `https://benchmarks.pyth.network/v1/updates/price/latest?ids=${pythIdClean}`,
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

  // Session Wallet Initialization
  useEffect(() => {
    // EVM Session Wallet
    const savedEvmKey = localStorage.getItem("15market_evm_session_key");

    // Robust Provider Setup with Timeout
    const fetchReq = new ethers.FetchRequest(ARC_RPC);
    fetchReq.timeout = 30000; // 30s timeout for slow public RPC
    const provider = new ethers.JsonRpcProvider(fetchReq, { chainId: 5042002, name: 'arc-testnet' }, { staticNetwork: true });
    if (savedEvmKey) {
      try {
        const wallet = new ethers.Wallet(savedEvmKey, provider);
        setEvmSessionWallet(wallet);
      } catch (e) { console.error("EVM Session key failed:", e); }
    } else {
      const wallet = ethers.Wallet.createRandom().connect(provider);
      localStorage.setItem("15market_evm_session_key", wallet.privateKey);
      setEvmSessionWallet(wallet);
    }
  }, []);



  const updateEvmSessionBal = useCallback(async () => {
    if (!evmSessionWallet) return;
    try {
      // console.log("🔄 [SESSION] Syncing balance...");
      const provider = evmSessionWallet.provider;
      const balanceWei = await provider.getBalance(evmSessionWallet.address);
      const bal = parseFloat(ethers.formatUnits(balanceWei, 18));

      if (bal !== sessionBalance) {
        console.log(`💰 [SESSION] Balance updated: ${sessionBalance} -> ${bal}`);
        setSessionBalance(bal);
      }
    } catch (err) {
      console.error("❌ [SESSION BALANCE] Fetch failed:", err);
    }
  }, [evmSessionWallet, sessionBalance]);

  // Update Session Balance - Polling (Arc)
  useEffect(() => {
    if (!evmSessionWallet) return;

    updateEvmSessionBal();
    // Poll every 5s for Arc Session balance
    const interval = setInterval(updateEvmSessionBal, 5000);
    return () => clearInterval(interval);
  }, [evmSessionWallet, updateEvmSessionBal]);

  // Main Wallet Balance Sync - ROBUST DUAL-PATH FETCHING WITH PARA CLIENT
  const fetchBalance = useCallback(async () => {
    if (!isConnected || !address) {
      setBalance(0);
      return;
    }

    // Method 1: Para Balance (Reactive via evmBalance state)
    if (evmBalance) {
      const bal = parseFloat(evmBalance);
      setBalance(bal);
    }

    // Method 2: Manual RPC Fallback (Using publicClient)
    try {
      const balWei = await publicClient.getBalance({ address });
      const bal = parseFloat(formatUnits(balWei, 18)); // Arc Native USDC uses 18 decimals

      setBalance(prev => {
        if (Math.abs(prev - bal) > 0.0001) return bal;
        return prev;
      });
    } catch (e) {
      // Quiet fail for background polling
    }
  }, [isConnected, address, evmBalance]);

  // Global Refresh Trigger (Exposed for events)
  const triggerGlobalRefresh = useCallback(() => {
    console.log("🔄 [REFRESH] Triggering global balance sync...");
    fetchBalance();
    if (refetchEvmBalance) refetchEvmBalance();
    if (updateEvmSessionBal) updateEvmSessionBal();
  }, [fetchBalance, refetchEvmBalance, updateEvmSessionBal]);

  // Aggressive Refresh (Multi-stage update)
  const aggressiveRefresh = useCallback(() => {
    console.log("🚀 [REFRESH] Starting multi-stage balance sync...");
    triggerGlobalRefresh();
    // 5 stages of refresh to catch the chain update
    [1000, 3000, 7000, 12000, 20000].forEach(delay => {
      setTimeout(() => {
        triggerGlobalRefresh();
        // Force refetch main balance explicitly
        if (refetchEvmBalance) refetchEvmBalance();
      }, delay);
    });
  }, [triggerGlobalRefresh, refetchEvmBalance]);

  useEffect(() => {
    const interval = setInterval(fetchBalance, 10000);
    fetchBalance();
    return () => clearInterval(interval);
  }, [fetchBalance]);



  // Fetch current user profile - STRICT REDIS VERIFICATION
  useEffect(() => {
    if (!isConnected || !address) {
      setUserProfile(null);
      setProfileChecked(false);
      setShowOnboarding(false); // Only false if not connected at all
      return;
    }

    // MANDATORY RESET: Assume onboarding is needed until proven otherwise
    setShowOnboarding(true);

    // OPTIMISTIC UI: Check cache for verified profile
    const cachedProfile = localStorage.getItem(`15market_profile_${address.toLowerCase()}`);
    if (cachedProfile) {
      try {
        const parsed = JSON.parse(cachedProfile);
        // Check if username and TOS exist (X linking is optional now)
        if (parsed.username && parsed.tosAccepted) {
          setUserProfile(parsed);
          setShowOnboarding(false); // UNLOCK
        }
      } catch (e) { }
    }

    // AUTHORITATIVE CHECK: Always verify with Redis (source of truth)
    const fetchMyProfile = async () => {
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/profile?address=${address}`);
        if (res.ok) {
          const profile = await res.json();

          // REQUIREMENT: Onboarding is reserved ONLY for users who have NEVER interacted before.
          // If profile exists with data OR has a trade history, we skip onboarding.
          const hasTraded = profile && profile.totalTrades > 0;
          const isRegistered = profile && profile.username && profile.tosAccepted;

          if (isRegistered || hasTraded) {
            // User is verified OR a returning participant - allow access
            setUserProfile(profile);
            setShowOnboarding(false);

            // Only cache fully registered profiles to prevent prompt on refresh
            if (isRegistered) {
              localStorage.setItem(`15market_profile_${address.toLowerCase()}`, JSON.stringify(profile));
            }
          } else {
            // New user with no profile and no trades - SHOW ONBOARDING
            setUserProfile(profile || null);
            setShowOnboarding(true);
            localStorage.removeItem(`15market_profile_${address.toLowerCase()}`);
          }
        } else {
          // API error - safer to assume not verified, but don't block if we have a cache
          const cached = localStorage.getItem(`15market_profile_${address.toLowerCase()}`);
          if (cached) {
            try { setUserProfile(JSON.parse(cached)); } catch (e) { setShowOnboarding(true); }
            setShowOnboarding(false);
          } else {
            setShowOnboarding(true);
          }
        }
      } catch (err) {
        console.error("Profile verification failed:", err);
        // On error, only show onboarding if no cache exists to prevent blocking on network flickers
        const cached = localStorage.getItem(`15market_profile_${address.toLowerCase()}`);
        if (cached) {
          try { setUserProfile(JSON.parse(cached)); } catch (e) { setShowOnboarding(true); }
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true);
        }
      } finally {
        setProfileChecked(true);
      }
    };
    fetchMyProfile();
  }, [isConnected, address]);

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

    setUserProfile(localProfile);
    localStorage.setItem(`15market_profile_${address.toLowerCase()}`, JSON.stringify(localProfile));

    try {
      // Sync with backend in background
      const res = await fetch(`${KEEPER_URL_ARC}/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          username: onboardingData.username,
          xHandle: onboardingData.twitterHandle,
          xProfileImage: onboardingData.twitterImage || "",
          discordHandle: "",
          tosAccepted: onboardingData.tosAccepted
        })
      });

      if (!res.ok) console.warn("Background profile sync failed");
      else notify("Welcome to 15market, " + onboardingData.username, "success");

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

  // Result Resolution - Polling for all pending trades
  useEffect(() => {
    const checkAndResolve = async () => {
      const now = Date.now();
      const pendingTrades = activeTrades.filter(t => t.status === "PENDING" || t.status === "RESOLVING");

      for (const trade of pendingTrades) {
        const start = trade.startTime || (trade.nonce > 1000000000000 ? trade.nonce : Math.floor(trade.nonce / 100) * 1000);
        const elapsed = (now - start) / 1000;
        if (elapsed < trade.duration) continue;
        if (resolvingInProgress.current.has(trade.id)) continue;

        resolvingInProgress.current.add(trade.id);

        // Optimistic Resolution
        let capturedPrice = parseFloat(priceRef.current);
        if (trade.status === "RESOLVING" && trade.settlementPrice) {
          capturedPrice = parseFloat(trade.settlementPrice);
        }

        // Determine result immediately (Client-Side Optimism)
        // If price is valid, we show the result instantly rather than "Resolving..."
        // The chain will confirm later, but this feels "Instant"
        let optimisticStatus = "RESOLVING";

        if (capturedPrice > 0) {
          const entry = parseFloat(trade.entryPrice);
          const isWin = trade.direction === "buy" || trade.direction === "UP"
            ? (capturedPrice >= entry)
            : (capturedPrice <= entry);
          optimisticStatus = isWin ? "WON" : "LOST";
        }

        const updatePayload = {
          ...trade,
          status: optimisticStatus,
          settlementPrice: capturedPrice.toFixed(4),
          optimistic: true // Marker so we know it's not final settled yet
        };

        // Instant UI Update
        setActiveTrades(prev => prev.map(t => t.id === trade.id ? updatePayload : t));
        setTradeHistory(prev => prev.map(t => t.id === trade.id ? updatePayload : t));

        // Trigger background settlement verification/payout
        resolveBet(trade, capturedPrice);
      }
    };

    const resolveBet = async (capturedTrade, capturedPrice) => {
      try {
        // Arc resolution is handled via on-chain events (useWatchContractEvent)
        // and background keeper settlement.
        // We just need to manage the local resolving lock.

        setTimeout(() => {
          if (resolvingInProgress.current.has(capturedTrade.id)) {
            resolvingInProgress.current.delete(capturedTrade.id);
          }
        }, 35000); // Expiry safety
      } catch (err) {
        console.error("Resolution loop crash:", err);
        resolvingInProgress.current.delete(capturedTrade.id);
      }
    };

    const interval = setInterval(checkAndResolve, 1000); // 1s is plenty for resolution check
    return () => clearInterval(interval);
  }, [activeTrades, wallet.publicKey]); // Removed price from dependency array

  // Safety Cleanup: Insures terminal is never stuck in processing state
  useEffect(() => {
    const finalStatuses = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"];
    const toRemove = activeTrades.filter(t => finalStatuses.includes(t.status));

    if (toRemove.length > 0) {
      const timer = setTimeout(() => {
        setActiveTrades(prev => prev.filter(t => !finalStatuses.includes(t.status)));
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [activeTrades]);



  // Platform Settings Sync


  // Execute trade
  const executeTrade = async () => {
    if (isExecuting) return;

    // Check Kill Switch
    if (platformSettings.tradingHalted) {
      return notify("TRADING HALTED BY ADMIN - Operations Paused", "error");
    }

    let activePrice = parseFloat(price);
    if (!activePrice || activePrice <= 0) return;
    if (!direction) return notify("Select UP or DOWN first", "error");
    if (!amount || parseFloat(amount) <= 0) return notify("Enter a valid amount", "error");
    if (Number(amount) < parseFloat(minStake)) return notify(`Min trade: ${minStake} ${network === 'arc' ? 'USDC' : 'SOL'}`, "error");

    // console.log("🎯 [TRADE] Initiating trade...");

    setIsExecuting(true);
    try {
      if (!isConnected) {
        notify("Please connect wallet first", "error");
        setIsExecuting(false);
        return;
      }

      const tradeId = Date.now();
      const dirVal = (direction === "buy" || direction === "UP") ? 1 : 0; // Match Contract: 1=UP, 0=DOWN
      const entryPriceParams = Math.floor(activePrice * 100000000);
      let txHash;

      // Arc Trade logic (EVM)
      const amountWei = parseUnits(amount.toString(), 18); // Arc Native USDC uses 18 decimals
      const ASSET_ID_MAP = { 'sol': 5, 'btc': 0, 'eth': 1, 'mon': 2, 'jup': 3, 'xrp': 4 };
      const assetId = ASSET_ID_MAP[activeMarket?.id] || 0;

      if (sessionMode && sessionBalance >= (Number(amount) + 0.005)) {
        console.log("✅ [TRADE] Using AUTO-SIGNER (Session Wallet)");
        const feePercent = 0.001; // 0.1% Auto-Signer Fee
        const signerFee = Number(amount) * feePercent;
        const feeWei = parseUnits(signerFee.toFixed(18), 18); // Arc Native USDC uses 18 decimals

        notify(`Auto-signing on Arc (0.1% fee: ${signerFee.toFixed(4)} USDC)...`, "success");
        const provider = new ethers.JsonRpcProvider(ARC_RPC, undefined, { staticNetwork: true });
        const wallet = new ethers.Wallet(evmSessionWallet.privateKey, provider);
        const contract = new ethers.Contract(ARC_CONTRACT_ADDRESS, ArcABI.abi, wallet);

        const tx = await contract.placeBet(
          BigInt(tradeId),
          Number(dirVal),
          BigInt(duration),
          BigInt(entryPriceParams),
          Number(assetId),
          evmSessionWallet.address, // Correct: Reward goes back to Auto-signer
          {
            value: amountWei,
            gasLimit: 600000n,
          }
        );
        txHash = tx.hash;
        console.log("📤 [TRADE] Auto-signed tx:", txHash);

        // Take fee from session wallet to treasury
        setTimeout(async () => {
          try {
            await wallet.sendTransaction({
              to: ARC_CONTRACT_ADDRESS,
              value: feeWei,
              gasLimit: 50000n
            });
            recordFee('arc', signerFee);
            console.log("✅ [TRADE] Auto-signer fee collected:", signerFee);
          } catch (feeErr) {
            console.error("Signer fee failed:", feeErr);
          }
        }, 100);
      } else {
        console.log("📝 [TRADE] Using MAIN WALLET (Manual signature required via Para)");

        // 🛡️ [NETWORK] Enforce Arc Testnet 5042002
        if (chainId !== 5042002) {
          console.log("🌐 [TRADE] Network mismatch detected. Current:", chainId, "Required: 5042002");
          notify("Please switch your wallet to Arc Testnet (Chain 5042002)", "info");
        }

        console.log("📝 [TRADE] Main wallet trade params prepared");
        notify(`Confirm on Arc...`, "success");

        try {
          // Initialize viem wallet client with Para provider
          const { createWalletClient, custom } = await import("viem");
          const paraProvider = await para.getProvider();
          const walletClient = createWalletClient({
            chain: arcTestnet,
            transport: custom(paraProvider)
          });

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
          console.log("📤 [TRADE] Main wallet tx successful:", txHash);
        } catch (mainWalletError) {
          console.error("❌ [TRADE] Main wallet error detail:", mainWalletError.message);

          if (mainWalletError.message?.includes("user rejected")) {
            notify("Transaction rejected in wallet", "error");
          } else if (mainWalletError.message?.includes("insufficient funds")) {
            notify("Insufficient funds for trade + gas", "error");
          } else {
            notify(`Trade failed: ${mainWalletError.shortMessage || "Transaction error"}`, "error");
          }
          throw mainWalletError;
        }
      }
      notify(`Arc Trade Executed!`, "success");

      if (sessionMode) {
        const feePercent = 0.001;
        const signerFee = Number(amount) * feePercent;
        setSessionBalance(prev => Math.max(0, prev - parseFloat(amount) - signerFee));
      } else {
        setBalance(prev => Math.max(0, prev - parseFloat(amount)));
      }

      const activeUserAddr = (sessionMode && sessionBalance >= (Number(amount) + 0.001)) ? evmSessionWallet.address : (address || user?.wallet?.address);
      const newTrade = {
        id: tradeId, direction, amount: Number(amount).toFixed(4), entryPrice: activePrice.toFixed(4),
        timestamp: Date.now(), status: "PENDING", tx: txHash, nonce: tradeId,
        userPublicKey: activeUserAddr, owner: activeUserAddr, duration, network: network, startTime: Date.now()
      };
      setTradeHistory(prev => [newTrade, ...prev]);
      setActiveTrades(prev => [newTrade, ...prev]);
      setDirection(null);
      setAmount("");
      setTimeLeft(duration);
      setTimerActive(true);

      const PING_URL = KEEPER_URL_ARC;
      fetch(`${PING_URL}/trade-ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(userLocation || { country: 'Unknown', countryCode: 'XX', lat: 0, lng: 0 }),
          amount: amount,
          network: network,
          address: activeUserAddr,
          id: newTrade.id,
          expiry: Math.floor(newTrade.startTime / 1000) + newTrade.duration,
          entryPrice: activePrice,
          direction: dirVal,
          duration: duration,
          symbol: activeMarket.symbol
        })
      }).catch(() => { });
    } catch (err) {
      console.error("Arc Trade Error:", err);
      notify("Trade failed: " + (err.shortMessage || err.message), "error");
    } finally {
      setIsExecuting(false);
    }
  };

  // Arc Settlement Listener (Native Viem Watcher)
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
            const finalStatus = won ? "WON" : "LOST";
            const priceUSD = (Number(settlementPrice) / 100000000).toFixed(4);
            const formattedPayout = (Number(payout) / 10 ** 18).toFixed(4);

            const updateTrade = (t) => {
              const isMatch = (t.tx && t.tx.toLowerCase() === log.transactionHash.toLowerCase()) ||
                (t.nonce && t.nonce.toString() === betId);
              if (isMatch) {
                return { ...t, status: finalStatus, settlementPrice: priceUSD, payout: formattedPayout };
              }
              return t;
            };

            setTradeHistory(prev => prev.map(updateTrade));
            setActiveTrades(prev => prev.map(updateTrade));

            if (won) {
              notify(`Arc Trade WON! +${formattedPayout} USDC`, "success");
              aggressiveRefresh();
            } else {
              notify(`Arc Trade LOST. Price: $${priceUSD}`, "error");
              aggressiveRefresh();
            }
          }
        });
      },
    });
    return () => unwatch();
  }, [address, evmSessionWallet, notify, aggressiveRefresh]);



  const handleRefill = useCallback(async (amt) => {
    // console.log("🔵 [REFILL] Starting refill process...");
    if (isExecuting) return;

    try {
      const amtNum = parseFloat(amt);
      const feePercent = 0.01; // 1% Protocol Fee
      const fee = amtNum * feePercent;

      if (!address || !evmSessionWallet) {
        console.error("❌ [REFILL] Wallet not connected");
        notify("Connect Arc wallet for refill", "error");
        return;
      }

      if (!address || !evmSessionWallet) {
        console.error("❌ [REFILL] Wallet not connected");
        notify("Connect Arc wallet for refill", "error");
        return;
      }

      // 🛡️ [NETWORK] Enforce Arc Testnet
      if (chainId !== 5042002) {
        notify("Please switch to Arc Network to deposit", "info");
      }

      // 🛡️ [BALANCE] Use updated balance
      const currentBal = parseFloat(evmBalance);
      if (currentBal < amtNum) {
        console.error("❌ [REFILL] Insufficient status balance");
        notify(`Insufficient status balance. You have ${currentBal.toFixed(4)} USDC`, "error");
        return;
      }

      setIsExecuting(true);
      notify(`Initiating Refill (${amtNum} USDC)...`, "success");

      try {
        const { createWalletClient, custom } = await import("viem");
        const paraProvider = await para.getProvider();
        const walletClient = createWalletClient({
          chain: arcTestnet,
          transport: custom(paraProvider)
        });

        const hash = await walletClient.sendTransaction({
          to: evmSessionWallet.address,
          value: parseUnits(amtNum.toFixed(18), 18),
          account: address
        });

        console.log("📤 [REFILL] tx successful:", hash);
        notify("Refill Transaction Broadcasted", "success");

        // Wait for refill to land
        publicClient.waitForTransactionReceipt({ hash }).then(() => {
          console.log("✅ [REFILL] Confirmed");
          notify("Refill Confirmed!", "success");
          setTimeout(() => {
            updateEvmSessionBal();
            refetchEvmBalance();
          }, 2000);
        });
        // This keeps user experience to just ONE signature
        setTimeout(async () => {
          try {
            console.log("💸 [REFILL] Sending fee to treasury...", { fee, to: ARC_CONTRACT_ADDRESS });
            const tx = await evmSessionWallet.sendTransaction({
              to: ARC_CONTRACT_ADDRESS,
              value: parseUnits(fee.toFixed(18), 18), // Arc Native USDC uses 18 decimals
            });
            console.log("📤 [REFILL] Fee tx broadcasted:", tx.hash);
            await tx.wait();
            console.log("✅ [REFILL] Fee tx confirmed");
            recordFee('arc', fee);
            notify(`System Fee of ${fee.toFixed(4)} USDC processed.`, "info");
          } catch (feeErr) {
            console.error("❌ [REFILL] Delayed fee payment failed:", feeErr);
          }
        }, 5000); // Increased delay to allow main tx to confirm or at least be broadcasted

        notify(`Refill Success!`, "success");
        console.log("🎉 [REFILL] Refill complete!");

        // Record locally
        const newTx = {
          id: `dep_${Date.now()}`,
          type: 'DEPOSIT',
          amount: amtNum.toFixed(4),
          timestamp: Date.now(),
          tx: hash,
          network: 'arc'
        };
        setTransactionHistory(prev => {
          const updated = [newTx, ...prev];
          localStorage.setItem("15market_transactions_v1", JSON.stringify(updated.slice(0, 50)));
          return updated;
        });

        // Refresh balance
        setTimeout(() => {
          updateEvmSessionBal();
          refetchEvmBalance();
        }, 3000);
      } catch (evmErr) {
        console.error("❌ [REFILL] EVM Error:", evmErr);
        const msg = evmErr.shortMessage || evmErr.message || "EVM Error";
        notify(`Refill failed: ${msg}`, "error");
      }
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, recordFee, balance, updateEvmSessionBal, isExecuting, chainId, refetchEvmBalance]);

  const handleWithdraw = useCallback(async (amt) => {
    // console.log("🔵 [WITHDRAW] Starting withdrawal process...");
    if (isExecuting) return;

    try {
      // Step 1: Validate amount
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        console.error("❌ [WITHDRAW] Invalid amount:", amt);
        notify("Invalid withdrawal amount", "error");
        return;
      }

      // Step 2: Check session wallet exists
      if (!evmSessionWallet) {
        console.error("❌ [WITHDRAW] Session wallet not initialized!");
        notify("Session wallet not ready. Please refresh the page.", "error");
        return;
      }

      // 🛡️ [NETWORK] Enforce Arc Testnet
      if (chainId !== 5042002) {
        notify("Please switch to Arc Network to withdraw", "info");
      }

      // console.log("✅ [WITHDRAW] Session wallet exists");

      // Step 3: Check session balance
      if (sessionBalance < amtNum) {
        console.error("❌ [WITHDRAW] Insufficient balance");
        notify(`Insufficient balance. You have ${sessionBalance.toFixed(4)} USDC`, "error");
        return;
      }

      const fee = amtNum * 0.01; // 1% Fee
      const gasBuffer = 0.005; // Leave 0.005 for gas
      const netAmt = amtNum - fee - gasBuffer;

      console.log("💰 [WITHDRAW] Calculated amounts:", { amtNum, fee, gasBuffer, netAmt });

      if (netAmt <= 0) {
        console.error("❌ [WITHDRAW] Net amount too low after fees");
        notify("Amount too low after fees/gas", "error");
        return;
      }

      // Step 4: Check wallet connection
      if (!address) {
        console.error("❌ [WITHDRAW] No wallet address");
        notify("Identity Error: Connect your wallet", "error");
        return;
      }

      setIsExecuting(true);

      // Step 5: Request signature
      notify("Sign the withdrawal authorization in your wallet...", "info");
      const authMsg = `--- 15MARKET PROTOCOL ---\nACTION: SECURE SCAN SWEEP\nAMOUNT: ${amt} USDC\nWALLET: ${address}\nTIMESTAMP: ${Date.now()}`;

      console.log("📝 [WITHDRAW] Requesting signature...");
      try {
        await wallet.signMessage(authMsg);
        console.log("✅ [WITHDRAW] Signature received");
      } catch (sigErr) {
        console.error("❌ [WITHDRAW] Signature rejected:", sigErr);
        notify("Signature rejected", "error");
        setIsExecuting(false);
        return;
      }

      notify(`Charging 1% Protocol Fee (${fee.toFixed(4)} USDC)...`, "info");

      // Step 6: Send fee to contract
      console.log("💸 [WITHDRAW] Sending fee to contract...", { fee, to: ARC_CONTRACT_ADDRESS });
      const feeTx = await evmSessionWallet.sendTransaction({
        to: ARC_CONTRACT_ADDRESS,
        value: parseUnits(fee.toFixed(18), 18), // Arc Native USDC uses 18 decimals
      });
      console.log("📤 [WITHDRAW] Fee tx broadcasted:", feeTx.hash);

      notify("Processing protocol fee...", "info");
      await feeTx.wait();
      console.log("✅ [WITHDRAW] Fee tx confirmed");

      // Step 7: Send net amount to main wallet
      console.log("💸 [WITHDRAW] Sending net amount to main wallet...", { netAmt, to: address });
      const sweepTx = await evmSessionWallet.sendTransaction({
        to: address,
        value: parseUnits(netAmt.toFixed(18), 18), // Arc Native USDC uses 18 decimals
      });
      console.log("📤 [WITHDRAW] Sweep tx broadcasted:", sweepTx.hash);

      notify("Sweep broadcasted. Waiting for confirmation...", "info");
      await sweepTx.wait();
      console.log("✅ [WITHDRAW] Sweep tx confirmed");

      recordFee('arc', fee);
      notify("Arc Withdrawal Successful!", "success");
      console.log("🎉 [WITHDRAW] Withdrawal complete!");

      // Refresh balance
      setTimeout(() => {
        updateEvmSessionBal();
        refetchEvmBalance();
      }, 2000);
    } catch (e) {
      console.error("❌ [WITHDRAW] Error:", e);
      notify("Withdrawal failed: " + (e.shortMessage || e.message), "error");
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, recordFee, wallet, sessionBalance, updateEvmSessionBal, isExecuting, chainId, refetchEvmBalance]);

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

  if (!authenticated) return <LandingPage />;

  if (view === "dashboard") return (
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
  );



  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`min-h-screen font-sans flex flex-col items-center px-2 lg:px-6 py-4 lg:py-10 overflow-x-hidden ${themeClass}`}
      style={{
        color: theme === 'light' ? '#1f2937' : '#ffffff',
        transition: "color 0.3s ease"
      }}>

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
          <WalletBalance network={network} theme={theme} balanceOverride={balance} sessionMode={sessionMode} />

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
        <GlobalTradeScroller wallet={wallet} theme={theme} currentNetwork={network} />
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
              activeTrade={activeTrade} sessionMode={sessionMode} setSessionMode={setSessionMode} price={price}
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
      </div>
    </motion.div>
  );
}
