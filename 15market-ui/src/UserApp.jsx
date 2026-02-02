import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAppKitAccount, useAppKitProvider, useAppKitNetwork, useDisconnect } from "@reown/appkit/react";
import { defaultConnection as connection } from "./api/program";
import { rotateRpc, SOLANA_RPC_FALLBACKS } from "./api/program";
import { hasPendingWalletRequests, clearWalletStorage } from "./utils/walletCleanup";
import { useWriteContract, useAccount, useSwitchChain, useWatchContractEvent, useBalance, useSendTransaction, useSignMessage } from "wagmi";
import { parseEther, parseUnits } from "viem";
import * as ethers from "ethers";
import ArcABI from "./abi/ArcPrediction.json";

import { WalletBalance } from "./components/WalletBalance";
import { LAMPORTS_PER_SOL, SystemProgram, PublicKey, SendTransactionError, Keypair, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { getProgram, BN, programID } from "./api/program";
import { getMarketPda, getBetPda, getTreasuryPda, getProfilePda } from "./api/pdas";
import { GlobalTradeScroller } from "./components/GlobalTradeScroller";
import { ProfileModal } from "./components/ProfileModal";
import { PnLModal } from "./components/PnLModal";
import { MessageSquare, User } from "lucide-react";
import { Stamp } from "./components/Stamp";
import { LandingPage } from "./components/LandingPage";
import { DashboardPage } from "./components/DashboardPage";

import MessagingSystem from "./components/MessagingSystem";
import { ARC_CONTRACT_ADDRESS, ARC_USDC_ADDRESS, KEEPER_URL, ADMIN_TOKEN, ARC_RPC, ARC_RPC_BACKUP } from "./constants";
import { Trophy, Calendar, CheckCircle, ChevronRight, Image as ImageIcon, PartyPopper, Settings, LogOut, Coins, Menu, X } from "lucide-react";

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isPnLOpen, setIsPnLOpen] = useState(false);
  const [selectedPnLTrade, setSelectedPnLTrade] = useState(null);
  const [view, setView] = useState("trading"); // "trading", "dashboard", or "history"

  const [campaigns, setCampaigns] = useState([]);
  const [winnerBanner, setWinnerBanner] = useState(null);
  const [enrollments, setEnrollments] = useState({}); // { campaignId: boolean }
  const [userLocation, setUserLocation] = useState(null); // { country, countryCode, lat, lng }

  // Initialize network state BEFORE using it in wallet memo and balance hooks
  const currentNetwork = useMemo(() => localStorage.getItem("15market_network") || "solana", []);
  const [network, setNetwork] = useState(currentNetwork);

  // Theme state
  // Theme state
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

  const { address, isConnected } = useAppKitAccount();
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { walletProvider } = useAppKitProvider('solana');
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const { data: evmBalance, refetch: refetchEvmBalance } = useBalance({
    address: address,
    chainId: network === 'arc' ? 5042002 : undefined,
    query: {
      enabled: network === 'arc',
      refetchInterval: 5000,
    }
  });

  const authenticated = isConnected;

  // Solana Balance Polling
  useEffect(() => {
    if (!isConnected || network !== 'solana' || !address) {
      if (!isConnected) console.log("[BALANCE] Not connected, skipping Solana fetch");
      return;
    }

    const fetchSolBalance = async () => {
      try {
        if (address.startsWith('0x')) return;

        const currentRpc = connection.rpcEndpoint;
        console.log(`[BALANCE] Fetching Solana balance from ${currentRpc} for: ${address}...`);

        const pubKey = new PublicKey(address);
        const bal = await connection.getBalance(pubKey, 'confirmed');
        const solVal = bal / LAMPORTS_PER_SOL;

        setBalance(solVal);
        console.log(`[BALANCE] Success! Balance: ${solVal} SOL`);
      } catch (e) {
        console.error("[BALANCE] Solana balance fetch error:", e.message);
        // Automatic RPC Rotation
        const failedUrl = connection.rpcEndpoint;
        const { rotateRpc } = await import("./api/program");
        rotateRpc(failedUrl);
      }
    };

    fetchSolBalance();
    const intv = setInterval(fetchSolBalance, 10000);
    return () => clearInterval(intv);
  }, [isConnected, network, address]);

  const wallet = useMemo(() => {
    if (!isConnected || !address) return { connected: false };

    // Solana compatibility wrapper - only attempt to create PublicKey if on Solana network
    try {
      const isSolana = network === 'solana';
      return {
        connected: true,
        publicKey: isSolana ? new PublicKey(address) : null,
        signTransaction: async (tx) => {
          if (!walletProvider) throw new Error("Wallet not connected");
          return await walletProvider.signTransaction(tx);
        },
        signAllTransactions: async (txs) => {
          if (!walletProvider) throw new Error("Wallet not connected");
          return await walletProvider.signAllTransactions(txs);
        },
        signMessage: async (msg) => {
          if (!walletProvider) throw new Error("Wallet not connected");
          const encoded = new TextEncoder().encode(msg);
          return await walletProvider.signMessage(encoded);
        }
      };
    } catch (e) {
      console.error("Wallet wrapper error:", e);
      return { connected: false };
    }
  }, [isConnected, address, walletProvider, network]);

  const user = useMemo(() => {
    if (isConnected && address) return { wallet: { address } };
    return null;
  }, [isConnected, address]);

  const login = () => {
    // handled by button
    console.log("Login requested");
  };

  const GREEN = theme === 'light'
    ? (network === "solana" ? "#059669" : "#2563eb") // Light mode: Darker Green / Darker Blue
    : (network === "solana" ? "#3CB371" : "#3B82F6"); // Dark mode: Original Green / Arc Blue
  const CORAL = "#FF7F50";

  useEffect(() => {
    localStorage.setItem("15market_network", network);
  }, [network]);

  const themeClass = network === "solana" ? "" : `theme-${network}`;

  // Session Wallet State
  const [sessionMode, setSessionMode] = useState(false);
  const [sessionKeypair, setSessionKeypair] = useState(null);
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
    return saved ? JSON.parse(saved) : { solana: 0, arc: 0 };
  });

  const [platformSettings, setPlatformSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_citadel_settings");
      return saved ? JSON.parse(saved) : { minBet: 0.1, maxBet: 5.0, maintenanceMode: false, tradingHalted: false };
    } catch (e) { return { minBet: 0.1, maxBet: 5.0, maintenanceMode: false, tradingHalted: false }; }
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

  useEffect(() => {
    localStorage.setItem("15market_citadel_settings", JSON.stringify(platformSettings));
  }, [platformSettings]);

  useEffect(() => {
    localStorage.setItem("15market_autosigner_fees", JSON.stringify(autoSignerFees));
  }, [autoSignerFees]);

  const recordFee = async (network, amount) => {
    // 1. Update local state for instant UI feedback
    setAutoSignerFees(prev => ({
      ...prev,
      [network]: prev[network] + amount
    }));

    // 2. Persist to Keeper Backend
    const targetUrl = network === 'arc' ? KEEPER_URL_ARC : KEEPER_URL_SOLANA;
    try {
      await fetch(`${targetUrl}/record-fee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ADMIN_TOKEN
        },
        body: JSON.stringify({ network, amount })
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

  const { caipNetwork } = useAppKitNetwork();
  const { disconnect } = useDisconnect();
  const navigate = useNavigate();

  const handleNetworkSwitch = async (newNetwork) => {
    if (network === newNetwork) return;

    if (isConnected && caipNetwork?.id) {
      const isSolanaWallet = String(caipNetwork.id).startsWith('solana');
      const targetIsSolana = newNetwork === 'solana';

      // Strict Disconnect on VM Mismatch
      if (isSolanaWallet !== targetIsSolana) {
        await disconnect();
        notify("Wallet disconnected for network switch", "info");
      }
    }



    setNetwork(newNetwork);
  };

  // Clear stale wallet states on app mount
  useEffect(() => {
    const checkAndCleanup = async () => {
      if (hasPendingWalletRequests()) {
        console.log("⚠️ Detected stale wallet connection requests, cleaning up...");
        await clearWalletStorage();
        notify("Cleared stale wallet connection", "info");
      }
    };
    checkAndCleanup();
  }, []); // Run once on mount

  // Auto-Switch UI Network based on Wallet
  // useEffect(() => {
  //   if (isConnected && caipNetwork?.id) {
  //     const caipId = String(caipNetwork.id);
  //     console.log("Network Detection:", caipId, "Current UI:", network);

  //     if (caipId.startsWith('solana') && network !== 'solana') {
  //       console.log("Switching UI to Solana...");
  //       setNetwork('solana');
  //       localStorage.setItem("15market_network", 'solana');
  //       notify("Switched to Solana Mode", "success");
  //     } else if (caipId.startsWith('eip155') && network !== 'arc') {
  //       console.log("Switching UI to Arc...");
  //       setNetwork('arc');
  //       localStorage.setItem("15market_network", 'arc');
  //       notify("Switched to Arc Mode", "success");
  //     }
  //   }
  // }, [isConnected, caipNetwork, network, notify]);

  // Force Chain Switch when network state changes to 'arc'


  // Debug logging for connection issues
  useEffect(() => {
    if (isConnected) {
      console.log(`Connected to: ${caipNetwork?.name || 'Unknown'} (ID: ${chainId})`);
      if (network === 'arc' && chainId !== 5042002) {
        notify("Wrong network detected. Please switch to Arc Testnet.", "error");
      } else if (network === 'arc' && chainId === 5042002) {
        notify("Connected to Arc Network", "success");
      }
    }
  }, [isConnected, caipNetwork, chainId, network, notify]);

  // Dynamic Market State


  const [activeMarket, setActiveMarket] = useState(() => {
    const defaultTokens = [
      { id: 'sol', symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', pair: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' },
      { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pair: 'GHm8da6zV8x69R7L6vAcTAVH7shU6fupB6itE8pXg573', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f8dc41b5e', binance: 'BTCUSDT', kraken: 'BTCUSD', gecko: 'bitcoin' },
      { id: 'eth', symbol: 'ETH', name: 'Ethereum', pair: '716YvEi9Y3q6Sst77sH7q2X2fA7rhtq8K8fJ9f2r7f7C', pythId: '0xffb26477e64e100806440db74f762a40788d7734bcc991d798150495f5431682', binance: 'ETHUSDT', kraken: 'ETHUSD', gecko: 'ethereum' },
      { id: 'jup', symbol: 'JUP', name: 'Jupiter', pair: '6U6MAtfR3sY8W7S6W3L1f2n7L5fU9J6U2S2S2S2S2S2S', pythId: '0x0a049d6824976cfdc3c0f2ee054e7d1e92d528b8b989498877171d0e12d00996', binance: 'JUPUSDT', kraken: 'JUPUSD', gecko: 'jupiter-exchange-solana' },
    ];

    const saved = localStorage.getItem('15market_listed_tokens');
    const listed = saved ? JSON.parse(saved) : defaultTokens;

    const activeId = localStorage.getItem('15market_active_token_id') || 'sol';
    return listed.find(t => t.id === activeId) || listed[0];
  });

  // Sync Market Changes (Across Ports via Keeper)
  useEffect(() => {
    const syncMarket = async () => {
      try {
        const targetUrl = network === 'arc' ? KEEPER_URL_ARC : KEEPER_URL_SOLANA;
        // 1. Fetch Remote Listings from Keeper (Source of Truth - Network Specific)
        const res = await fetch(`${targetUrl}/listings`);
        const remoteListings = await res.json();

        if (Array.isArray(remoteListings) && remoteListings.length > 0) {
          const currentListedStr = localStorage.getItem('15market_listed_tokens');
          const remoteStr = JSON.stringify(remoteListings);

          if (currentListedStr !== remoteStr) {
            console.log(`🔄 Market listings updated from ${network} Keeper.`);
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
            console.log(`🛡️ Syncing platform settings from ${network} Keeper.`);
            setPlatformSettings(settingsData);
          }
        }


      } catch (e) {
        // Fallback to local storage if keeper is down
      }

      const listed = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
      const activeId = localStorage.getItem('15market_active_token_id') || 'sol'; // Default to SOL as per request
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

  const fetchCampaigns = useCallback(async () => {
    try {
      const targetUrl = network === 'arc' ? KEEPER_URL_ARC : KEEPER_URL_SOLANA;
      const res = await fetch(`${targetUrl}/campaigns`);
      if (!res.ok) return;
      const data = await res.json();
      setCampaigns(data);

      const wbRes = await fetch(`${KEEPER_URL_SOLANA}/winner-banner`);
      if (wbRes.ok) {
        const wbData = await wbRes.json();
        setWinnerBanner(wbData && wbData.winnerAddress ? wbData : null);
      }

      if (address && data.length > 0) {
        // Check enrollments for all active campaigns
        const active = data.filter(c => Date.now() < c.endTime);
        const newEnrollments = { ...enrollments };
        let changed = false;

        for (const c of active) {
          if (newEnrollments[c.id] === undefined) {
            const eRes = await fetch(`${KEEPER_URL_SOLANA}/enroll?campaignId=${c.id}&address=${address}`);
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
      const res = await fetch(`${KEEPER_URL_SOLANA}/enroll`, {
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
    if (network === 'solana') return "0.005"; // ~1 USD at $200 SOL
    return "0.1"; // 0.1 USDC minimum for Arc/Base
  }, [network]);

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
    // Solana Session Key
    const savedKey = localStorage.getItem("15market_session_key");
    if (savedKey) {
      try {
        const secret = new Uint8Array(JSON.parse(savedKey));
        setSessionKeypair(Keypair.fromSecretKey(secret));
      } catch (e) { console.error("Session key failed:", e); }
    } else {
      const newKp = Keypair.generate();
      localStorage.setItem("15market_session_key", JSON.stringify(Array.from(newKp.secretKey)));
      setSessionKeypair(newKp);
    }

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
      const balanceWei = await evmSessionWallet.provider.getBalance(evmSessionWallet.address);
      setSessionBalance(parseFloat(ethers.formatEther(balanceWei)));
    } catch (err) {
      console.error("EVM Session bal fetch failed:", err);
    }
  }, [evmSessionWallet]);

  // Update Session Balance - REAL-TIME via account listener (Solana) + Polling (EVM)
  useEffect(() => {
    if (network === 'solana') {
      if (!connection || !sessionKeypair) return;

      const updateSolanaSessionBal = async () => {
        try {
          const bal = await connection.getBalance(sessionKeypair.publicKey, "confirmed");
          setSessionBalance(bal / LAMPORTS_PER_SOL);
          // console.log("Session Balance Updated:", bal / LAMPORTS_PER_SOL);
        } catch (err) { }
      };

      updateSolanaSessionBal();

      const subId = connection.onAccountChange(
        sessionKeypair.publicKey,
        (info) => {
          setSessionBalance(info.lamports / LAMPORTS_PER_SOL);
        },
        "confirmed"
      );

      // Fallback Polling (Every 3s) to be 100% sure
      const poller = setInterval(updateSolanaSessionBal, 3000);

      return () => {
        connection.removeAccountChangeListener(subId);
        clearInterval(poller);
      };
    } else if (network === 'arc') {
      if (!evmSessionWallet) return;

      console.log("🔗 Connecting to Arc RPC:", ARC_RPC);

      updateEvmSessionBal();
      // Increase polling to 5s to avoid timeout/rate-limiting on public RPC
      const interval = setInterval(updateEvmSessionBal, 5000);
      return () => clearInterval(interval);
    }
  }, [connection, sessionKeypair, evmSessionWallet, network, updateEvmSessionBal]);

  // Fetch wallet balance
  useEffect(() => {
    if (network === 'solana') {
      if (!connection || !wallet.publicKey) return;

      const fetchSolBalance = async () => {
        try {
          const bal = await connection.getBalance(wallet.publicKey);
          setBalance(bal / LAMPORTS_PER_SOL);
        } catch (e) { console.error("Bal fetch error:", e); }
      };

      fetchSolBalance();

      // Fallback Polling if balance is 0 (RPC can be laggy)
      const pollId = setInterval(() => {
        if (balance === 0) fetchSolBalance();
      }, 2000);

      const id = connection.onAccountChange(wallet.publicKey, (info) => {
        setBalance(info.lamports / LAMPORTS_PER_SOL);
      });

      return () => {
        connection.removeAccountChangeListener(id);
        clearInterval(pollId);
      };
    } else {
      // Arc / Base Balance from Wagmi
      if (evmBalance) {
        setBalance(parseFloat(evmBalance.formatted));
      } else {
        setBalance(0);
      }
    }
  }, [connection, wallet.publicKey, network, evmBalance]);

  // Fetch current user profile
  useEffect(() => {
    if (!isConnected || !address) {
      setUserProfile(null);
      setProfileChecked(false);
      setShowOnboarding(false);
      return;
    }

    const fetchMyProfile = async () => {
      try {
        let profile = null;

        // 1. Try Solana On-Chain
        if (network === 'solana' && wallet.publicKey) {
          const program = getProgram(wallet, connection);
          const [profilePda] = getProfilePda(wallet.publicKey);
          profile = await program.account.userProfile.fetchNullable(profilePda);
        }

        // 2. Try Keeper (Hybrid/Arc Fallback)
        if (!profile) {
          const res = await fetch(`${KEEPER_URL_SOLANA}/profile?address=${address}`);
          if (res.ok) {
            const data = await res.json();
            if (data) profile = data;
          }
        }

        if (profile) {
          setUserProfile(profile);
          // Trigger onboarding if X account is not linked
          if (!profile.xHandle) {
            setShowOnboarding(true);
          } else {
            setShowOnboarding(false);
          }
        } else {
          setUserProfile(null);
          setShowOnboarding(true);
        }

      } catch (err) {
        console.error("My profile error:", err);
      } finally {
        setProfileChecked(true);
      }
    };
    fetchMyProfile();
  }, [isConnected, address, network, isProfileOpen]);

  const handleOnboardingComplete = async (onboardingData) => {
    try {
      if (network === 'solana' && wallet.publicKey) {
        // Create On-Chain Profile
        const program = getProgram(wallet, connection);
        const [profilePda] = getProfilePda(wallet.publicKey);
        await program.methods
          .syncProfile(onboardingData.username, onboardingData.twitterHandle || "", "")
          .accounts({
            profile: profilePda,
            user: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        notify("On-chain profile created!", "success");
      }

      // Sync to Keeper for all networks (Global Identity - Solana Hub)
      await fetch(`${KEEPER_URL_SOLANA}/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          username: onboardingData.username,
          xHandle: onboardingData.twitterHandle,
          xProfileImage: onboardingData.twitterImage || "",
          tosAccepted: onboardingData.tosAccepted,
          network
        })
      });

      setUserProfile({
        username: onboardingData.username,
        xHandle: onboardingData.twitterHandle,
        xProfileImage: onboardingData.twitterImage || "",
        tosAccepted: onboardingData.tosAccepted
      });
      setShowOnboarding(false);
      notify("Welcome to 15market, " + onboardingData.username, "success");
    } catch (err) {
      console.error("Profile sync failed:", err);
      notify("Failed to setup profile. Check SOL balance.", "error");
    }
  };

  // Slider / amount handlers - active balance aware
  const activeBal = useMemo(() => (sessionMode ? sessionBalance : balance), [sessionMode, sessionBalance, balance]);

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

  // Shared Price Fetch Logic
  const priceRef = useRef(price);
  useEffect(() => { priceRef.current = price; }, [price]);

  const fetchCurrentPrice = async () => {
    try {
      const sources = [];

      // 1. Pyth Source
      if (activeMarket.pythId) {
        sources.push({
          name: "pyth",
          url: `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${activeMarket.pythId}`,
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
          const res = await fetch(`${src.url}${src.url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
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
  };

  useEffect(() => {
    let active = true;
    const loop = async () => {
      if (!active) return;
      await fetchCurrentPrice();
      if (active) setTimeout(loop, 300);
    };
    loop();
    return () => { active = false; };
  }, [activeMarket.id]);

  // Sync Loader
  useEffect(() => {
    // Simple fallback loader
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    // Attempt to hydrate price in background
    if (parseFloat(price) <= 0) fetchCurrentPrice();

    return () => clearTimeout(timer);
  }, []);

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
        let userPub;
        let pollInterval;
        const isSolanaTrade = capturedTrade.network === 'solana';

        if (isSolanaTrade) {
          try {
            userPub = capturedTrade.userPublicKey ? new PublicKey(capturedTrade.userPublicKey) : wallet.publicKey;
            if (!userPub) {
              resolvingInProgress.current.delete(capturedTrade.id);
              return;
            }
          } catch (e) {
            console.error("Solana PK error:", e);
            resolvingInProgress.current.delete(capturedTrade.id);
            return;
          }

          const program = getProgram(wallet, connection);
          const [betPda] = getBetPda(userPub, program.programId, capturedTrade.nonce);

          const checkAndFinalize = async () => {
            try {
              const betAcc = await program.account.bet.fetchNullable(betPda);
              if (!betAcc) {
                const [profilePda] = getProfilePda(userPub, program.programId);
                const currentProfile = await program.account.userProfile.fetchNullable(profilePda).catch(() => null);
                let settleUSD = parseFloat(capturedPrice) || parseFloat(priceRef.current);
                const entryUSD = parseFloat(capturedTrade.entryPrice);
                const isWinByPrice = (settleUSD > 0) && (capturedTrade.direction === "buy" ? (settleUSD >= entryUSD) : (settleUSD <= entryUSD));
                const finalStatus = isWinByPrice ? "WON" : "LOST";

                if (currentProfile) setUserProfile(currentProfile);

                setTradeHistory(prev => prev.map(t => t.id === capturedTrade.id ? { ...t, status: finalStatus, settlementPrice: settleUSD.toFixed(4) } : t));
                setActiveTrades(prev => prev.map(t => t.id === capturedTrade.id ? { ...t, status: finalStatus, settlementPrice: settleUSD.toFixed(4) } : t));
                resolvingInProgress.current.delete(capturedTrade.id);

                const refreshBalance = () => {
                  connection.getBalance(userPub, "confirmed").then(bal => {
                    if (sessionKeypair && userPub.equals(sessionKeypair.publicKey)) setSessionBalance(bal / LAMPORTS_PER_SOL);
                    else setBalance(bal / LAMPORTS_PER_SOL);
                  }).catch(e => console.error("Balance refresh failed", e));
                };

                // Multi-stage refresh to catch propagation
                refreshBalance();
                setTimeout(refreshBalance, 1000);
                setTimeout(refreshBalance, 2500);

                return true;
              }
            } catch (err) { console.error("Finalize error:", err); }
            return false;
          };

          if (await checkAndFinalize()) return;
          pollInterval = setInterval(async () => {
            if (await checkAndFinalize()) clearInterval(pollInterval);
          }, 1200);
        }

        // Universal Timeout (20s) for all networks
        setTimeout(async () => {
          if (pollInterval) clearInterval(pollInterval);
          if (resolvingInProgress.current.has(capturedTrade.id)) {
            let status = "TIMEOUT";
            if (isSolanaTrade) {
              const [tPda] = getTreasuryPda(programID);
              const currentTreasury = await connection.getBalance(tPda).catch(() => 0);
              const mult = capturedTrade.duration <= 5 ? 6.98 : (capturedTrade.duration <= 10 ? 4.98 : 1.98);
              const neededForPayout = (parseFloat(capturedTrade.amount) * mult) * LAMPORTS_PER_SOL;
              const isActuallyWin = (parseFloat(capturedPrice) || parseFloat(priceRef.current)) > parseFloat(capturedTrade.entryPrice);
              if (isActuallyWin && currentTreasury < neededForPayout) status = "PAYOUT_DELAYED";
            }

            setTradeHistory(prev => prev.map(t => t.id === capturedTrade.id ? { ...t, status: status } : t));
            setActiveTrades(prev => prev.map(t => t.id === capturedTrade.id ? { ...t, status: status } : t));
            resolvingInProgress.current.delete(capturedTrade.id);
          }
        }, 35000);
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
    if (Number(amount) < parseFloat(minStake)) return notify(`Min trade: ${minStake} ${network === 'solana' ? 'SOL' : 'USDC'}`, "error");

    if (network === 'arc' || network === 'base') {
      setIsExecuting(true);
      try {
        if (!user?.wallet) {
          notify("Please connect wallet first", "error");
          setIsExecuting(false);
          return;
        }

        // Amount to correct units (USDC on Arc might be 6 or 18)
        const amountWei = parseUnits(amount.toString(), evmBalance?.decimals || 18);
        const tradeId = Date.now();
        const ASSET_ID_MAP = { 'sol': 5, 'btc': 0, 'eth': 1, 'mon': 2, 'jup': 3, 'xrp': 4 };
        const assetId = ASSET_ID_MAP[activeMarket?.id] || 0;

        const dirVal = (direction === "buy" || direction === "UP") ? 1 : 0;
        // Entry Price (8 decimals)
        const entryPriceParams = Math.floor(activePrice * 100000000);

        let txHash;
        if (sessionMode && sessionBalance >= (Number(amount) + 0.005)) {
          notify(`Auto-signing on Arc...`, "success");
          try {
            const provider = new ethers.JsonRpcProvider(ARC_RPC, undefined, { staticNetwork: true });
            const feeData = await provider.getFeeData();

            const sessionWallet = new ethers.Wallet(evmSessionWallet.privateKey, provider);
            const contract = new ethers.Contract(ARC_CONTRACT_ADDRESS, ArcABI.abi, sessionWallet);


            console.log("Arc Auto-Sign params:", { dirVal, duration, entryPriceParams, assetId, value: amountWei.toString() });

            const tx = await contract.placeBet(
              BigInt(tradeId),
              Number(dirVal),
              BigInt(duration),
              BigInt(entryPriceParams),
              Number(assetId),
              {
                value: amountWei,
                gasLimit: 600000n, // Hardcode gas to bypass flaky RPC simulation
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || undefined,
                maxFeePerGas: feeData.maxFeePerGas || undefined
              }
            );
            txHash = tx.hash;
            notify(`Trade triggered!`, "success");
          } catch (autoErr) {
            console.error("Auto-sign failed:", autoErr);
            throw new Error(`Auto-sign failed: ${autoErr.reason || autoErr.message}`);
          }
        } else {
          notify(`Confirm on ${network === 'arc' ? 'Arc' : 'Base'}...`, "success");


          try {
            const hash = await writeContractAsync({
              address: ARC_CONTRACT_ADDRESS,
              abi: ArcABI.abi,
              functionName: 'placeBet',
              args: [BigInt(tradeId), Number(dirVal), BigInt(duration), BigInt(entryPriceParams), Number(assetId)],
              value: amountWei,
              gas: 600000n // Hardcode gas to bypass flaky RPC simulation
            });
            txHash = hash;
          } catch (simErr) {
            console.error("Direct trade simulation failed:", simErr);
            throw new Error(`Trade failed: ${simErr.shortMessage || simErr.message}`);
          }
        }

        notify(`Trade executed on ${network === 'arc' ? 'Arc' : 'Base'}!`, "success");

        // OPTIMISTIC BALANCE DEDUCTION
        if (sessionMode) {
          setSessionBalance(prev => Math.max(0, prev - parseFloat(amount)));
        } else {
          setBalance(prev => Math.max(0, prev - parseFloat(amount)));
        }

        const activeUserAddr = (sessionMode && sessionBalance >= (Number(amount) + 0.001)) ? evmSessionWallet.address : user.wallet.address;
        const newTrade = {
          id: tradeId, direction, amount: Number(amount).toFixed(4), entryPrice: activePrice.toFixed(4),
          timestamp: new Date().toLocaleTimeString(), status: "PENDING", tx: txHash, nonce: tradeId,
          userPublicKey: activeUserAddr, duration, network: network, startTime: Date.now()
        };
        setTradeHistory(prev => [newTrade, ...prev]);
        setActiveTrades(prev => [newTrade, ...prev]);
        setDirection(null);
        setAmount("");
        setTimeLeft(duration);
        setTimerActive(true);

        // Send Globe Ping (Push to Reactive Escrow - Arc Specific Keeper)
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
            direction: (direction === "buy" || direction === "UP") ? 1 : 0,
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
      return;
    }

    try {
      let activeWallet = wallet;
      if (sessionMode && sessionBalance >= (Number(amount) + 0.005)) {
        activeWallet = {
          publicKey: sessionKeypair.publicKey,
          signTransaction: async (tx) => { tx.partialSign(sessionKeypair); return tx; },
          signAllTransactions: async (txs) => { txs.forEach(t => t.partialSign(sessionKeypair)); return txs; }
        };
      } else if (!wallet.publicKey) {
        notify("Connect wallet or fund auto-sign first", "error");
        setIsExecuting(false);
        return;
      }

      // OPTIMISTIC BALANCE DEDUCTION - Do this FIRST to prevent race conditions
      const amountNum = parseFloat(amount);
      if (sessionMode) {
        setSessionBalance(prev => Math.max(0, prev - amountNum));
      } else {
        setBalance(prev => Math.max(0, prev - amountNum));
      }

      setIsExecuting(true);
      const program = getProgram(activeWallet, connection);

      const ASSET_ID_MAP = { 'sol': 5, 'btc': 0, 'eth': 1, 'mon': 2, 'jup': 3, 'xrp': 4 };
      const assetId = ASSET_ID_MAP[activeMarket.id] || 0;
      // Encode Asset ID in Nonce Trick: (Timestamp * 100) + AssetID
      const nonceValue = Math.floor(Date.now() / 1000) * 100 + assetId;
      const nonceBN = new BN(nonceValue.toString());

      const [marketPda] = getMarketPda(program.programId);
      const [betPda] = getBetPda(activeWallet.publicKey, program.programId, nonceValue);
      const [treasuryPda] = getTreasuryPda(program.programId);

      const modifyUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 });
      // Ultra Priority Fee for instant execution
      const addFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000000 });

      // Build Instruction
      const ix = await program.methods
        .placeBet(
          (direction === "buy" || direction === "UP") ? 1 : 0,
          new BN(Math.floor(amountNum * LAMPORTS_PER_SOL)),
          new BN(Math.floor(activePrice * 1000000)),
          nonceBN,
          duration
        )
        .accounts({
          market: marketPda,
          bet: betPda,
          treasury: treasuryPda,
          user: activeWallet.publicKey,
          systemProgram: SystemProgram.programId
        })
        .remainingAccounts(
          sessionMode ? [{ pubkey: wallet.publicKey, isWritable: false, isSigner: false }] : []
        )
        .instruction();

      // Manual Transaction Construction for better control
      const transaction = new Transaction().add(modifyUnits, addFee, ix);

      // Wrapper to ensure we don't hang forever
      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("RPC_TIMEOUT")), ms));

      const { blockhash, lastValidBlockHeight } = await Promise.race([
        getRecentBlockhashWithRetry(connection),
        timeout(10000)
      ]);

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = activeWallet.publicKey;

      // Sign & Send
      const signedTx = await activeWallet.signTransaction(transaction);
      const tx = await Promise.race([
        connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true,
          preflightCommitment: "confirmed"
        }),
        timeout(8000)
      ]);

      // Background Confirmation (Don't await this to prevent UI blocking)
      (async () => {
        try {
          await pollConfirmation(tx, blockhash, lastValidBlockHeight);
        } catch (e) {
          console.warn("Confirmation slow/failed:", e);
        }
      })();

      const newTrade = {
        id: nonceValue, direction, amount: amountNum.toFixed(4), entryPrice: activePrice.toFixed(4),
        timestamp: new Date().toLocaleTimeString(), status: "PENDING", tx, nonce: nonceValue,
        userPublicKey: activeWallet.publicKey.toBase58(), duration, network: 'solana',
        startTime: Date.now()
      };
      setTradeHistory(prev => [newTrade, ...prev]);
      setActiveTrades(prev => [newTrade, ...prev]);
      setDirection(null);
      setAmount("");
      setSliderValue(0);
      setTimeLeft(duration);
      setTimerActive(true);
      notify("Trade executed successfully!", "success");

      // Send Globe Ping (Push to Reactive Escrow - Solana Specific Keeper)
      fetch(`${KEEPER_URL_SOLANA}/trade-ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(userLocation || { country: 'Unknown', countryCode: 'XX', lat: 0, lng: 0 }),
          amount: amountNum,
          network: 'solana',
          address: activeWallet.publicKey.toBase58(), // This is the 'owner'
          id: newTrade.id,
          expiry: Math.floor(newTrade.startTime / 1000) + newTrade.duration,
          // Enhanced data for faster settlement
          entryPrice: activePrice,
          direction: (direction === "buy" || direction === "UP") ? 1 : 0,
          duration: duration,
          symbol: activeMarket.symbol,
          mainOwner: wallet.publicKey?.toBase58() || activeWallet.publicKey.toBase58()
        })
      }).catch(() => { });
    } catch (err) {
      console.error(err);
      console.error("Solana Execution Error:", err);
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      notify(`Trade failed: ${msg}`, "error");

      // Restore balance on failure
      const amountNum = parseFloat(amount);
      if (sessionMode) {
        setSessionBalance(prev => prev + amountNum);
      } else {
        setBalance(prev => prev + amountNum);
      }
    } finally { setIsExecuting(false); }
  };

  // Arc Settlement Listener
  useWatchContractEvent({
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
            // INSTANT BALANCE REFRESH
            if (normalizedUser === mainAddr) {
              refetchEvmBalance();
            } else if (normalizedUser === sessionAddr) {
              updateEvmSessionBal();
            }
          } else {
            notify(`Arc Trade LOST. Price: $${priceUSD}`, "error");
            // Even on loss, refresh to reflect stake removal if it was pending
            if (normalizedUser === mainAddr) refetchEvmBalance();
            else updateEvmSessionBal();
          }
        }
      });
    },
  });

  const getRecentBlockhashWithRetry = async (conn) => {
    const commitments = ['processed', 'confirmed', 'finalized'];
    const maxRpcAttempts = SOLANA_RPC_FALLBACKS.length;

    for (let rpcAttempt = 0; rpcAttempt < maxRpcAttempts; rpcAttempt++) {
      for (const commitment of commitments) {
        let retries = 2;
        while (retries > 0) {
          try {
            const bh = await conn.getLatestBlockhash(commitment);
            if (bh) {
              console.log(`✅ [BLOCKHASH] Fetched on RPC ${rpcAttempt + 1}, commitment: ${commitment}`);
              return bh;
            }
          } catch (e) {
            console.warn(`⚠️ [BLOCKHASH] Failed (${commitment}, RPC ${rpcAttempt + 1}/${maxRpcAttempts}):`, e.message);
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 800));
          }
        }
      }

      // All commitments failed on this RPC, try next one
      if (rpcAttempt < maxRpcAttempts - 1) {
        console.warn(`🔄 [BLOCKHASH] All commitments failed, rotating RPC...`);
        conn = rotateRpc(conn.rpcEndpoint);
      }
    }

    throw new Error("Failed to fetch blockhash after trying all RPCs and commitments.");
  };

  const pollConfirmation = async (sig, blockhash, lastValidBlockHeight) => {
    const start = Date.now();
    while (Date.now() - start < 60000) { // Max 60 seconds
      try {
        const { value: status } = await connection.getSignatureStatus(sig);
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          return { value: { err: status.err } };
        }

        const currentHeight = await connection.getBlockHeight();
        if (currentHeight > lastValidBlockHeight) {
          // Final check after expiry
          const { value: finalStatus } = await connection.getSignatureStatus(sig);
          if (finalStatus?.confirmationStatus === 'confirmed' || finalStatus?.confirmationStatus === 'finalized') {
            return { value: { err: finalStatus.err } };
          }
          throw new Error("Transaction expired: block height exceeded");
        }
      } catch (e) {
        if (e.message.includes("expired")) throw e;
        console.warn("Poll check failed, retrying...", e);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("Confirmation polling timed out");
  };

  const handleRefill = useCallback(async (amt) => {
    try {
      const amtNum = parseFloat(amt);
      const feePercent = 0.01; // 1% Protocol Fee for both networks as requested
      const fee = amtNum * feePercent;
      const netAmt = amtNum - fee;

      if (network === 'solana') {
        if (!wallet.publicKey) {
          notify("Wallet not connected for Solana refill", "error");
          return;
        }
        notify(`Charging 1% Auto-Signer Fee (${fee.toFixed(6)} SOL)...`, "info");

        // Add Priority Fees to Refill
        const units = ComputeBudgetProgram.setComputeUnitLimit({ units: 80000 });
        const price = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000000 });

        const [treasuryPda] = getTreasuryPda(programID);

        const tx = new Transaction().add(
          units,
          price,
          // 1. Send Net Amount to Session Wallet
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: sessionKeypair.publicKey,
            lamports: Math.floor(netAmt * LAMPORTS_PER_SOL),
          }),
          // 2. Send Fee to Treasury
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: treasuryPda,
            lamports: Math.floor(fee * LAMPORTS_PER_SOL),
          })
        );

        const bhStart = Date.now();
        const { blockhash, lastValidBlockHeight } = await getRecentBlockhashWithRetry(connection);
        console.log(`[REFILL] Blockhash fetched in ${Date.now() - bhStart}ms: ${blockhash}`);

        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;

        notify("Please sign in wallet...", "success");
        const signStart = Date.now();
        const signed = await wallet.signTransaction(tx);
        console.log(`[REFILL] Transaction signed in ${Date.now() - signStart}ms`);

        try {
          const sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: true,
            preflightCommitment: "confirmed"
          });

          notify(`Refill broadcast: ${sig.slice(0, 8)}...`, "success");
          console.log(`[REFILL] Transaction broadcasted: ${sig}. Waiting for confirmation...`);
          const result = await pollConfirmation(sig, blockhash, lastValidBlockHeight);

          if (result.value.err) {
            console.error("[REFILL] Transaction landed but failed:", result.value.err);
            throw new Error("Transaction failed on-chain");
          }

          notify("Refill confirmed! (Fee collected)", "success");
          console.log("[REFILL] ✅ Success!");
          recordFee('solana', fee);
          setSessionBalance(prev => prev + netAmt);

        } catch (sendErr) {
          notify(`Refill failed: ${sendErr.message}`, "error");
        }
      } else if (network === 'arc') {
        if (!address) {
          notify("Connect EVM wallet for Arc refill", "error");
          return;
        }
        notify(`Charging 1% Auto-Signer Fee (${fee.toFixed(6)} USDC)...`, "success");

        try {
          // Net to Session
          const hashMatch = await sendTransactionAsync({
            to: evmSessionWallet.address,
            value: parseEther(netAmt.toFixed(18)),
            chainId: 5042002
          });

          // Fee to Treasury
          await sendTransactionAsync({
            to: ARC_CONTRACT_ADDRESS,
            value: parseEther(fee.toFixed(18)),
            chainId: 5042002
          });

          notify(`Refill Successful! Fee: ${fee.toFixed(4)} USDC`, "success");
          recordFee('arc', fee);
        } catch (evmErr) {
          const msg = evmErr.shortMessage || evmErr.message || "EVM Error";
          notify(`Refill failed: ${msg}`, "error");
        }
      }
    } catch (e) {
      const msg = e.shortMessage || e.message || "Refill failed";
      notify(`Refill failed: ${msg}`, "error");
    }
  }, [wallet, sessionKeypair, evmSessionWallet, connection, network, address, sendTransactionAsync, notify, recordFee]);

  const handleWithdraw = useCallback(async (amt) => {
    console.log("🏦 Withdrawal Initiated:", amt);
    try {
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid withdrawal amount", "error");
        return;
      }

      const fee = amtNum * 0.01; // 1% Fee
      const netAmt = amtNum - fee;
      const currency = network === 'solana' ? 'SOL' : 'USDC';

      // 1. FORCED WALLET CALL: Authorization Signature
      // This satisfies the requirement to "call the wallet" explicitly.
      notify("Sign the withdrawal authorization in your wallet...", "info");
      const authHeader = `--- 15MARKET PROTOCOL ---`;
      const authBody = `ACTION: SECURE SCAN SWEEP\nAMOUNT: ${amt} ${currency}\nWALLET: ${address || wallet.publicKey?.toBase58()}\nTIMESTAMP: ${Date.now()}`;
      const authMsg = `${authHeader}\n${authBody}`;

      if (network === 'solana') {
        if (!wallet.publicKey || !sessionKeypair) {
          notify("Connection Error: Wallet or Session not ready", "error");
          return;
        }

        // Force wallet prompt
        await wallet.signMessage(authMsg);

        notify(`Charging 1% Auto-Signer Fee (${fee.toFixed(6)} SOL)...`, "info");

        // Convert to Number to check against current balance
        const currentBal = await connection.getBalance(sessionKeypair.publicKey, "confirmed");

        // Fee deduction: Subtract ~0.00001 SOL (5000 lamports * 2 for safety) if withdrawing everything
        const txFeeBuffer = 10000;
        let finalLamports = Math.floor(netAmt * LAMPORTS_PER_SOL);
        let finalFeeLamports = Math.floor(fee * LAMPORTS_PER_SOL);

        if (finalLamports + finalFeeLamports >= currentBal - txFeeBuffer) {
          // Adjust if total exceeds balance
          const totalAvailable = currentBal - txFeeBuffer;
          // Recalculate net and fee proportionally based on the available amount
          const totalRequestedLamports = Math.floor(amtNum * LAMPORTS_PER_SOL);
          if (totalRequestedLamports === 0) { // Avoid division by zero
            finalLamports = 0;
            finalFeeLamports = 0;
          } else {
            finalLamports = Math.floor(totalAvailable * (netAmt / amtNum));
            finalFeeLamports = Math.max(0, totalAvailable - finalLamports);
          }
        }

        if (finalLamports <= 0) {
          notify("Insufficient balance for transaction fee", "error");
          return;
        }

        const [treasuryPda] = getTreasuryPda(programID);

        const tx = new Transaction().add(
          // 1. Send Net to Main Wallet
          SystemProgram.transfer({
            fromPubkey: sessionKeypair.publicKey,
            toPubkey: wallet.publicKey,
            lamports: finalLamports,
          }),
          // 2. Send Fee to Treasury
          SystemProgram.transfer({
            fromPubkey: sessionKeypair.publicKey,
            toPubkey: treasuryPda,
            lamports: finalFeeLamports,
          })
        );

        const { blockhash } = await getRecentBlockhashWithRetry(connection);
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey; // Invoke main wallet for fees

        // Sign with session wallet first
        tx.partialSign(sessionKeypair);

        // Invoke browser wallet for final signature and gas authorization
        notify("Authorizing withdrawal in wallet...", "info");
        const signedTx = await wallet.signTransaction(tx);

        const sig = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed"
        });

        notify("Withdrawal broadcasted. Finalizing...", "success");
        const confirmed = await connection.confirmTransaction(sig, 'confirmed');

        if (confirmed.value.err) throw new Error("Transaction confirmed but failed");

        recordFee('solana', finalFeeLamports / LAMPORTS_PER_SOL);
        notify("SOL Withdrawal Successful! (Fee collected)", "success");

      } else if (network === 'arc') {
        if (!address || !evmSessionWallet) {
          notify("Identity Error: Connect your main wallet and ensure auto-signer is active.", "error");
          return;
        }

        // Force wallet prompt
        await signMessageAsync({ message: authMsg });

        notify(`Charging 1% Protocol Fee (${fee.toFixed(4)} USDC)...`, "info");

        // 1. Fee to Contract
        await evmSessionWallet.sendTransaction({
          to: ARC_CONTRACT_ADDRESS,
          value: parseEther(fee.toFixed(18)),
        });

        // 2. Net to Main
        const tx = await evmSessionWallet.sendTransaction({
          to: address,
          value: parseEther(netAmt.toFixed(18)),
        });

        notify("Sweep broadcasted. Waiting for confirmation...", "info");
        await tx.wait();
        recordFee('arc', fee);
        notify("Arc Withdrawal Successful!", "success");
      }
    } catch (e) {
      console.error("Withdraw error:", e);
      const msg = e.reason || e.message || "Withdraw failed";
      notify(msg, "error");
    }
  }, [wallet, wallet?.publicKey, sessionKeypair, evmSessionWallet, network, address, connection, notify, recordFee, signMessageAsync]);

  if (isLoading) return (
    <div className="fixed inset-0 z-[100] backdrop-blur-sm flex flex-col items-center justify-center">
      <motion.div animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }} transition={{ duration: 2, repeat: Infinity }} className="relative">
        <div className="absolute inset-0 blur-[60px] bg-[#3CB371] opacity-20" />
        <img src="/logo.png" alt="logo" className="h-24 lg:h-32 w-auto relative z-10 drop-shadow-[0_0_40px_#3CB37160]" />
      </motion.div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden relative border border-white/5">
          <motion.div className="absolute inset-y-0 left-0 bg-[#3CB371]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.3 }} />
        </div>
        <p className="text-[10px] font-black uppercase text-[#3CB371]">Beta Testing is Live</p>
      </div>
    </div>
  );

  if (!authenticated) return <LandingPage currentNetwork={network} onNetworkChange={handleNetworkSwitch} />;

  if (view === "dashboard") return (
    <DashboardPage
      onBack={() => setView("trading")}
      wallet={wallet}
      connection={connection}
      sessionKeypair={sessionKeypair}
      sessionBalance={sessionBalance}
      onRefill={handleRefill}
      onWithdraw={handleWithdraw}
      treasuryBalance={treasuryBalance}
      currentNetwork={network}
      autoSignerFees={autoSignerFees}
      userProfile={userProfile}
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
          <img src="/logo.png" alt="logo" className={`h-16 lg:h-24 w-auto drop-shadow-[0_0_40px_var(--primary-glow)] ${theme === 'light' ? 'invert hue-rotate-180' : ''}`} />
        </div>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-12">
          {/* Dashboard/Trading links removed from navbar per request */}
        </div>



        {/* Desktop Controls */}
        <div className="hidden lg:flex items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <WalletBalance network={network} theme={theme} balanceOverride={activeBal} sessionMode={sessionMode} />

          {uiVersion === 'v1' && (
            <>
              {/* Notifications Placeholder */}
              <div className="relative group">
                <button className={`p-2.5 rounded-xl border backdrop-blur-md transition-all ${theme === 'light' ? 'bg-black/[0.03] border-black/5 hover:bg-black/[0.08]' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.08]'}`}>
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#3CB371] border-2 border-[#050505] flex items-center justify-center">
                    <span className="text-[8px] font-black text-white">2</span>
                  </div>
                  <svg className={`w-5 h-5 ${theme === 'light' ? 'text-black/60' : 'text-white/60'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>

              <button onClick={() => setView("dashboard")} className="p-2.5 rounded-xl border backdrop-blur-md transition-all group active:scale-95"
                style={{
                  backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                }}>
                <User size={20} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
              </button>
            </>
          )}

          <UnifiedWalletButton currentNetwork={network} onNetworkChange={handleNetworkSwitch} theme={theme} />
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

          <UnifiedWalletButton currentNetwork={network} onNetworkChange={handleNetworkSwitch} theme={theme} />
        </div>
      </header>

      {/* LAYOUT SWITCHER */}
      {/* V1 LAYOUT (Only layout now) */}
      <>
        <div className="w-full max-w-7xl mb-4 lg:mb-10 flex items-center justify-between">
          <div className="w-full -mx-2 lg:mx-0">
            <GlobalTradeScroller wallet={wallet} connection={connection} theme={theme} currentNetwork={network} />
          </div>
        </div>

        <div className="w-full max-w-7xl grid grid-cols-12 gap-2 lg:gap-6 mb-10 relative z-0">
          {/* Chart - Responsive - Full width */}
          <div className={`col-span-12 flex flex-col gap-3 rounded-[24px] lg:rounded-[32px] relative z-0 shadow-2xl transition-all duration-300 mb-2 overflow-hidden border h-[300px] sm:h-[400px] lg:h-[500px] glass-panel`}
            style={{
              background: theme === 'light' ? '#ffffff' : 'rgba(10, 10, 10, 0.7)',
              boxShadow: `0 0 60px ${GREEN}30, 0 0 20px ${GREEN}20, inset 0 0 40px ${GREEN}05`,
              borderColor: `${GREEN}40`
            }}>
            <CustomChart symbol={activeMarket.binance} theme={theme} network={network} currentPrice={price} activeMarket={activeMarket} uiVersion={uiVersion} setActiveMarket={setActiveMarket} />
          </div>

          {/* Terminal - 50/50 split on desktop and mobile */}
          <div className="col-span-6 lg:col-span-6 flex flex-col">
            <TradeTerminal
              activeTrade={activeTrade} sessionMode={sessionMode} setSessionMode={setSessionMode} price={price}
              sessionBalance={sessionBalance} direction={direction} setDirection={setDirection} duration={duration}
              setDuration={setDuration} amount={amount} handleAmountChange={handleAmountChange} balance={balance}
              sliderValue={sliderValue} handleSliderChange={handleSliderChange} executeTrade={executeTrade}
              theme={theme} minStake={minStake} timerActive={activeTrades.length > 0} isExecuting={isExecuting} wallet={wallet}
              refillAmount={refillAmount} setRefillAmount={setRefillAmount} onRefill={handleRefill} onWithdraw={handleWithdraw}
              CORAL={CORAL} GREEN={GREEN} currentNetwork={network} chainId={chainId} switchChain={switchChain}
              evmSessionWallet={evmSessionWallet} sessionKeypair={sessionKeypair} hasProfile={!!userProfile}
              activeMarket={activeMarket}
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
          sessionKeypair={sessionKeypair} evmSessionWallet={evmSessionWallet}
          theme={theme} currentNetwork={network}
        />
      </>

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
                  Payout Propagated: <span className="text-yellow-500">+{(parseFloat(winnerBanner.amount) * 1.95).toFixed(4)} {currentNetwork === 'arc' ? 'USDC' : 'SOL'}</span>
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
        connection={connection}
        theme={theme}
        toggleTheme={toggleTheme}
        userProfile={userProfile}
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
      />

    </motion.div>
  );
}
