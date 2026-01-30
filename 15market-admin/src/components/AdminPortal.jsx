import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    BarChart3,
    ShieldCheck,
    Settings,
    LogOut,
    Search,
    PlusCircle,
    AlertCircle,
    CheckCircle2,
    MoreVertical,
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    TrendingDown,
    Gavel,
    Coins,
    ShieldAlert,
    Zap,
    Cpu,
    Globe,
    Activity,
    Server,
    Terminal as TerminalIcon,
    Lock,
    Eye,
    Database,
    MessageSquare,
    Megaphone,
    Clock,
    Trophy,
    Calendar,
    X,
    BarChart as BarChartIcon,
    Sliders,
    Save,
    RefreshCw,
    ToggleLeft,
    ToggleRight,
    User,
    Shield,
    Image as ImageIcon,
    Copy
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import MessagingSystem from './MessagingSystem';
import { GlobalTradeScroller } from './GlobalTradeScroller';
import { GlobalExpansionMap } from './GlobalExpansionMap';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { getTreasuryPda, getBetPda } from '../api/pdas';
import { programID } from '../api/program';
import idl from '../idl/sol_prediction.json';
import { Buffer } from 'buffer';
import { AdminAuthDB } from '../utils/adminAuthDb';
import bs58 from 'bs58';

import { KEEPER_URL, ADMIN_TOKEN } from '../constants';

// RBAC Roles
const ROLES = {
    ROOT: 'ROOT',
    MODERATOR: 'MODERATOR',
    LISTER: 'LISTER'
};

// --- HELPER COMPONENTS (Moved outside to prevent re-creation and hook issues) ---
const NavItem = React.memo(({ icon: Icon, label, id, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${active
            ? 'bg-[#3CB371] text-white shadow-[0_0_20px_rgba(60,179,113,0.3)]'
            : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
    >
        <Icon size={20} />
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
    </button>
));

const StatCard = React.memo(({ icon: Icon, label, value, trend, positive, onClick }) => (
    <div
        onClick={onClick}
        className={`bg-black/40 border border-white/5 p-6 rounded-[24px] relative overflow-hidden group transition-all ${onClick ? 'cursor-pointer hover:border-[#3CB371]/30 hover:bg-black/60' : ''}`}
    >
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Icon size={48} />
        </div>
        <div className="relative z-10">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-1">{label}</p>
            <h4 className="text-2xl font-black text-white mb-2">{value}</h4>
            <div className={`flex items-center gap-1 text-[10px] font-bold ${positive ? 'text-[#3CB371]' : 'text-[#FF4444]'}`}>
                {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {trend}
                <span className="text-white/20 ml-1">since yesterday</span>
            </div>
        </div>
    </div>
));

const DISCONNECTED_WALLET = { connected: false };

const AdminPortal = React.memo(({ onBack, connection, price }) => {
    // Auth State - SECURED
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    const [activeTab, setActiveTab] = useState('dashboard');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [metrics, setMetrics] = useState({
        totalWallets: '...',
        totalVolume: '...',
        activeUsers: '...',
        pendingDisputes: 0,
        avgExecutionTime: '42ms',
        networkHealth: '100%',
        treasuryBalance: '...'
    });
    const [keeperLogs, setKeeperLogs] = useState([]);
    const [escrowBalance, setEscrowBalance] = useState(0);
    const [escrowStats, setEscrowStats] = useState({
        solana: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 },
        arc: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 }
    }); // Unified stats from keeper
    const [liveEscrowBuffer, setLiveEscrowBuffer] = useState(new Map());

    const [selectedDispute, setSelectedDispute] = useState(null);
    const [activeCase, setActiveCase] = useState(null); // Missing state variable
    const [isMessagingOpen, setIsMessagingOpen] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [isLoading, setIsLoading] = useState(false); // Track loading state
    const [messages, setMessages] = useState({}); // { disputeId: [msgs] }
    const [newMessage, setNewMessage] = useState('');
    const [keeperHealth, setKeeperHealth] = useState({ connected: true, failCount: 0, lastCheck: Date.now() });
    const keeperHealthRef = useRef(keeperHealth);

    useEffect(() => {
        keeperHealthRef.current = keeperHealth;
    }, [keeperHealth]);


    const [protocolData, setProtocolData] = useState({ activeList: [], totalVolume: 0, wallets: 0, profiles: [] });
    const [tradeHistory, setTradeHistory] = useState([]); // Settled trades from Solana + Arc
    const [historyFilter, setHistoryFilter] = useState({ network: 'ALL', search: '' }); // ALL, SOLANA, ARC
    const [adminNetwork, setAdminNetwork] = useState('SOLANA'); // 'SOLANA' | 'ARC'
    const [loginForm, setLoginForm] = useState({ username: '', password: '', securityCode: '' });
    const [authError, setAuthError] = useState(null);

    // Protocol Revenue Tracker (Shared via localStorage with UserApp for demo)
    const [autoSignerFees, setAutoSignerFees] = useState(() => {
        const saved = localStorage.getItem("15market_autosigner_fees");
        return saved ? JSON.parse(saved) : { solana: 0, arc: 0 };
    });

    // Refresh revenue every 10 seconds from Keeper Backend
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${KEEPER_URL}/protocol-stats`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.autoSignerFees) {
                        setAutoSignerFees(data.autoSignerFees);
                        localStorage.setItem("15market_autosigner_fees", JSON.stringify(data.autoSignerFees));
                    }
                }
            } catch (e) { console.warn("Admin Revenue Sync Failed:", e.message); }
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Real-time Arc Treasury Balance
    const [arcTreasuryBalance, setArcTreasuryBalance] = useState(0);

    useEffect(() => {
        let interval;
        const fetchArcBalance = async () => {
            try {
                const ARC_RPC = "https://rpc.testnet.arc.network";
                const ARC_CONTRACT = "0x041e80256b3C72a0e16d78753F28f14A40d78c08";
                const provider = new ethers.JsonRpcProvider(ARC_RPC, undefined, { staticNetwork: true });
                const bal = await provider.getBalance(ARC_CONTRACT);
                const formattedBal = parseFloat(ethers.formatEther(bal)) || 0;
                console.log(`📡 [ARC_POLL] Treasury Balance: ${formattedBal} USDC`);
                setArcTreasuryBalance(formattedBal);
            } catch (e) {
                console.warn("Real-time Arc balance fetch failed:", e.message);
            }
        };

        if (isLoggedIn && adminNetwork === 'ARC') {
            fetchArcBalance();
            interval = setInterval(fetchArcBalance, 5000); // 5s polling
        }
        return () => clearInterval(interval);
    }, [isLoggedIn, adminNetwork]);

    // Force re-render every second to update expiry status in real-time
    const [tick, setTick] = useState(0);
    const nowRef = useRef(Date.now() / 1000);

    // High-frequency UI tick (10s) to drive "Frontend-Only" timers - Optimized to reduce re-renders
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now() / 1000;
            nowRef.current = now;
            setTick(prev => prev + 1);
        }, 10000); // OPTIMIZED: Increased from 5s to 10s
        return () => clearInterval(interval);
    }, []);

    // Master Authority State (Autonomous Signatures)
    const [masterKeypair, setMasterKeypair] = useState(null);
    const [masterImportKey, setMasterImportKey] = useState('');
    const [masterBalance, setMasterBalance] = useState(0);

    // Custom Styled Notification System
    const [notification, setNotification] = useState(null); // { type: 'success' | 'error' | 'info', title: '...', message: '...' }
    const [confirmAction, setConfirmAction] = useState(null); // { title: '...', message: '...', onConfirm: () => void }

    // Treasury State - Protocol Unified
    const [treasuryStats, setTreasuryStats] = useState({ balance: 0, pda: null });
    const [treasuryAction, setTreasuryAction] = useState('DEPOSIT'); // 'DEPOSIT' | 'WITHDRAW'
    const [networkTime, setNetworkTime] = useState(Date.now() / 1000);
    const [clockOffset, setClockOffset] = useState(0);

    const [isTreasuryModalOpen, setIsTreasuryModalOpen] = useState(false);

    // Campaign Management State
    const [campaigns, setCampaigns] = useState([]);
    const [winnerBanner, setWinnerBanner] = useState(null);
    const [newCampaign, setNewCampaign] = useState({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        network: 'general',
        reboot: 'none', // none, daily, weekly, monthly
        prize: ''
    });
    const [enrollmentsMap, setEnrollmentsMap] = useState({}); // { campaignId: count }
    const [winnersMap, setWinnersMap] = useState({}); // { campaignId: address }
    const [winnerImages, setWinnerImages] = useState({}); // { campaignId: url }

    // Campaign Analytics
    const [selectedCampaignForAnalytics, setSelectedCampaignForAnalytics] = useState(null);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [campaignTradesData, setCampaignTradesData] = useState([]);

    const notify = useCallback((type, title, message) => {
        setNotification({ type, title, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);


    const fetchCampaigns = useCallback(async () => {
        try {
            // Campaigns
            try {
                const res = await fetch(`${KEEPER_URL}/campaigns`);
                const data = await res.json();
                setCampaigns(data);
            } catch (e) { }

            // Winner Banner
            try {
                const wbRes = await fetch(`${KEEPER_URL}/winner-banner`);
                const wbData = await wbRes.json();
                setWinnerBanner(wbData);
            } catch (e) { }


        } catch (e) { console.error("Failed to fetch campaigns/stats", e); }
    }, []);

    useEffect(() => {
        if (isLoggedIn) {
            fetchCampaigns();
            // OPTIMIZED: Increased from 5s to 15s to prevent UI freezing
            const interval = setInterval(fetchCampaigns, 15000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, fetchCampaigns]);

    const handleCreateCampaign = async () => {
        if (!newCampaign.title || !newCampaign.startTime || !newCampaign.endTime) {
            notify('error', 'MISSING FIELDS', 'Please fill in all required campaign details.');
            return;
        }

        try {
            const campaign = {
                id: 'camp_' + Date.now(),
                ...newCampaign,
                createdAt: Date.now(),
                startTime: new Date(newCampaign.startTime).getTime(),
                endTime: new Date(newCampaign.endTime).getTime()
            };

            const updated = [...campaigns, campaign];
            const res = await fetch(`${KEEPER_URL}/campaigns`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN
                },
                body: JSON.stringify(updated)
            });

            if (res.ok) {
                notify('success', 'CAMPAIGN READY', `Campaign "${campaign.title}" has been scheduled.`);
                setCampaigns(updated);
                setNewCampaign({ title: '', description: '', startTime: '', endTime: '', network: 'general', reboot: 'none', prize: '' });
            }
        } catch (e) { notify('error', 'SAVE FAILED', e.message); }
    };

    const handleDeleteCampaign = async (id) => {
        try {
            const updated = campaigns.filter(c => c.id !== id);
            await fetch(`${KEEPER_URL}/campaigns`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN
                },
                body: JSON.stringify(updated)
            });
            setCampaigns(updated);
            notify('info', 'CAMPAIGN REMOVED', 'The campaign record has been purged.');
        } catch (e) { }
    };

    const handlePublishWinner = async (campaign) => {
        const winnerAddr = winnersMap[campaign.id];
        const winnerImg = winnerImages[campaign.id];

        if (!winnerAddr) {
            notify('error', 'NO WINNER', 'Define a winner address first.');
            return;
        }

        try {
            const banner = {
                campaignId: campaign.id,
                campaignTitle: campaign.title,
                winnerAddress: winnerAddr,
                winnerImage: winnerImg || 'https://images.unsplash.com/photo-1579546678183-a9a1a494dea9',
                prize: campaign.prize,
                timestamp: Date.now()
            };

            const res = await fetch(`${KEEPER_URL}/winner-banner`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN
                },
                body: JSON.stringify(banner)
            });

            if (res.ok) {
                setWinnerBanner(banner);
                notify('success', 'WINNER BROADCASTED', `Victory banner for ${campaign.title} is now live.`);
            }
        } catch (e) { }
    };

    const handleViewAnalytics = async (campaignId) => {
        const campaign = campaigns.find(c => c.id === campaignId);
        setSelectedCampaignForAnalytics(campaign);
        setLeaderboardData([]);
        setCampaignTradesData([]);

        try {
            const [lbRes, trRes] = await Promise.all([
                fetch(`${KEEPER_URL}/leaderboard?campaignId=${campaignId}`),
                fetch(`${KEEPER_URL}/campaign-trades?campaignId=${campaignId}`)
            ]);

            if (lbRes.ok) setLeaderboardData(await lbRes.json());
            if (trRes.ok) setCampaignTradesData(await trRes.json());
        } catch (e) {
            console.error("Analytics fetch failed:", e);
            notify('error', 'DATA SYNC ERROR', 'Could not retrieve campaign analytics.');
        }
    };

    // Sync Master Key from Storage
    useEffect(() => {
        setMasterKeypair(null);
        setMasterBalance(0);

        const storageKey = '15market_citadel_master_protocol';
        const saved = localStorage.getItem(storageKey);

        if (saved) {
            try {
                const arr = JSON.parse(saved);
                const kp = Keypair.fromSecretKey(new Uint8Array(arr));
                setMasterKeypair(kp);
            } catch (e) { console.error("Master key load failed", e); }
        }
    }, []);

    // Derived Admin Wallet
    const adminWallet = useMemo(() => {
        if (!masterKeypair) return { connected: false };
        return {
            publicKey: masterKeypair.publicKey,
            signTransaction: async (tx) => { tx.partialSign(masterKeypair); return tx; },
            signAllTransactions: async (txs) => { txs.forEach(t => t.partialSign(masterKeypair)); return txs; },
            connected: true
        };
    }, [masterKeypair]);

    // Helper to get Anchor Program instance
    const getProgram = (wallet, conn) => {
        const provider = new AnchorProvider(
            conn,
            wallet,
            { commitment: "confirmed" }
        );
        return new Program(idl, programID, provider);
    };

    // Update Master Balance
    useEffect(() => {
        if (!adminWallet.publicKey || !connection) return;

        const updateMasterBal = async () => {
            try {
                const b = await connection.getBalance(adminWallet.publicKey);
                setMasterBalance(b / LAMPORTS_PER_SOL);
            } catch (e) { }
        };

        updateMasterBal();
        const interval = setInterval(updateMasterBal, 10000);

        const solSubId = connection.onAccountChange(adminWallet.publicKey, (info) => {
            setMasterBalance(info.lamports / LAMPORTS_PER_SOL);
        });

        return () => {
            clearInterval(interval);
            if (solSubId) connection.removeAccountChangeListener(solSubId);
        };
    }, [adminWallet.publicKey, connection]);

    const handleImportMaster = () => {
        try {
            const arr = JSON.parse(masterImportKey);
            if (!Array.isArray(arr) || arr.length !== 64) throw new Error("Invalid Secret Key Array");
            const kp = Keypair.fromSecretKey(new Uint8Array(arr));
            setMasterKeypair(kp);
            localStorage.setItem('15market_citadel_master_protocol', JSON.stringify(arr));
            notify('success', 'MASTER AUTHORITY LINKED', `Citadel now operates with autonomous protocol signatures.`);
            setMasterImportKey('');
        } catch (e) {
            notify('error', 'IMPORT FAILED', 'Invalid format. Please paste the Secret Key Array [12,34,...]');
        }
    };

    // Drains the Admin/Master Wallet itself (Emergency)
    const drainAuthorityWallet = async (destination, amtUnit) => {
        if (!adminWallet.publicKey || !connection) return;
        try {
            const destPub = new PublicKey(destination);
            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: adminWallet.publicKey,
                    toPubkey: destPub,
                    lamports: Math.floor(amtUnit * LAMPORTS_PER_SOL)
                })
            );
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = adminWallet.publicKey;
            const signed = await adminWallet.signTransaction(tx);
            const sig = await connection.sendRawTransaction(signed.serialize());
            notify('success', 'DRAIN SUCCESSFUL', `Sweep completed. TX: ${sig.slice(0, 8)}...`);
        } catch (e) {
            notify('error', 'DRAIN FAILED', e.message);
        }
    };


    // Dispute Management
    const [selectedDisputeIds, setSelectedDisputeIds] = useState([]);
    const [disputeFilterState, setDisputeFilterState] = useState({ status: 'ALL' });


    // Staff Management State
    const [staffMembers, setStaffMembers] = useState([
        { id: 1, address: 'Global Root', role: 'admin', key: 'ROOT_AUTH', status: 'ACTIVE' },
        { id: 2, address: '8xJ...4k2', role: 'moderator', key: 'MOD_KEY_01', status: 'ACTIVE' }
    ]);
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [newStaff, setNewStaff] = useState({ address: '', role: 'moderator' });

    // Global Broadcast State
    const [broadcasts, setBroadcasts] = useState(() => {
        const saved = localStorage.getItem('15market_admin_broadcast');
        return saved ? JSON.parse(saved) : [];
    });
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [newBroadcast, setNewBroadcast] = useState({
        message: '',
        duration: 30, // seconds
        type: 'EMERGENCY' // EMERGENCY, MAINTENANCE, ANNOUNCEMENT
    });

    // Cleanup expired broadcasts locally to keep UI in sync
    useEffect(() => {
        const timer = setInterval(() => {
            setBroadcasts(prev => {
                const filtered = prev.filter(b => b.expiry > Date.now());
                if (filtered.length !== prev.length) {
                    localStorage.setItem('15market_admin_broadcast', JSON.stringify(filtered));
                }
                return filtered;
            });
            // OPTIMIZED: Increased from 5s to 30s - broadcasts don't need frequent cleanup
        }, 30000);
        return () => clearInterval(timer);
    }, []);

    const handleSendBroadcast = () => {
        if (!newBroadcast.message) return;
        const msg = {
            id: Date.now(),
            text: newBroadcast.message,
            expiry: Date.now() + (newBroadcast.duration * 1000),
            type: newBroadcast.type,
            sender: currentUser?.username || 'SYSTEM'
        };
        const updated = [msg]; // Only one active broadcast at a time for the marquee
        setBroadcasts(updated);
        localStorage.setItem('15market_admin_broadcast', JSON.stringify(updated));
        setIsBroadcastModalOpen(false);
        setNewBroadcast({ message: '', duration: 30, type: 'EMERGENCY' });
        notify('success', 'SIGNAL BROADCAST', 'The announcement has been pushed to all active terminals.');
    };

    // --- TOKEN LISTING ENGINE ---

    const VERIFIED_SUGGESTIONS = [
        { id: 'sol', symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', pair: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' },
        { id: 'jup', symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiZJpEGkW4eePUMJuC9eJ9FNoAnatUnat5yW6H6j', pair: 'ABySmsN7X4f5hNoRiaK29Uj3uK59at8vD5j5z2r5G9oP', pythId: '0x07f1f31f90e542bb00e4085f1c91f9302e6d6282d8c30d70da6b9fcc9cc1f50a', binance: 'JUPUSDT' },
        { id: 'bonk', symbol: 'BONK', name: 'Bonk', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixeb6f3E9pTEUkD5Y67', pair: '8S89R89n8R9n8R9n8R9n8R9n8R9n8R9n8R9n8R9n', pythId: '0x72813589988168f003f533f5727d530f9ca21976f9d311978897829ec311654', binance: 'BONKUSDT' },
        { id: 'trump', symbol: 'TRUMP', name: 'Official TRUMP', mint: '6p6xgHy9S7Bn3KyjzC98725y0y4s2Ooyb4w6w4Ooyb4w', pair: 'D1x1D1x1D1x1D1x1D1x1D1x1D1x1D1x1D1x1D1x1', pythId: '', binance: '' },
        { id: 'btc', symbol: 'WBTC', name: 'WBTC', mint: '3NZ9J7zBW1rj9n2g779YtRwWc6mC8K6mC8K6mC8K6mC8', pair: 'G1x1G1x1G1x1G1x1G1x1G1x1G1x1G1x1G1x1G1x1', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f8dc41b5e', binance: 'BTCUSDT' },
        { id: 'eth', symbol: 'ETH', name: 'ETH', mint: '7vfCXTUXpS6NL57f495146p6xgHy9S7Bn3KyjzC9872', pair: 'H1x1H1x1H1x1H1x1H1x1H1x1H1x1H1x1H1x1H1x1', pythId: '0xffb26477e64e100806440db74f762a40788d7734bcc991d798150495f5431682', binance: 'ETHUSDT' },
    ];

    const [listedTokens, setListedTokens] = useState(() => {
        const saved = localStorage.getItem('15market_listed_tokens');
        return saved ? JSON.parse(saved) : VERIFIED_SUGGESTIONS.slice(0, 3);
    });

    const [activeTokenId, setActiveTokenId] = useState(() => {
        const saved = localStorage.getItem('15market_active_token_id');
        return saved || 'sol';
    });

    // 🔄 STANDALONE MARKET SYNC (KEEPER BRIDGE)
    const syncWithKeeper = async (tokens) => {
        try {
            const res = await fetch(`${KEEPER_URL}/listings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN
                },
                body: JSON.stringify(tokens)
            });
            if (res.ok) console.log("✅ Market listings synced with Keeper.");
        } catch (e) {
            console.error("❌ Market sync failed (Is Keeper running?):", e.message);
        }
    };

    useEffect(() => {
        const fetchRemoteTokens = async () => {
            try {
                // 1. Fetch Listings
                const res = await fetch(`${KEEPER_URL}/listings`);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setListedTokens(data);
                    localStorage.setItem('15market_listed_tokens', JSON.stringify(data));
                }

                // 2. Fetch Active Market
                const activeRes = await fetch(`${KEEPER_URL}/active-market`);
                const activeData = await activeRes.json();
                if (activeData.activeId) {
                    setActiveTokenId(activeData.activeId);
                    localStorage.setItem('15market_active_token_id', activeData.activeId);
                }
            } catch (e) { console.warn("Keeper sync failed, using local."); }
        };
        fetchRemoteTokens();
    }, []);

    const [newTokenForm, setNewTokenForm] = useState({
        symbol: '',
        name: '',
        mint: '',
        pair: '',
        pythId: '',
        binance: ''
    });

    const handleListToken = async (token) => {
        const existing = listedTokens.find(t => t.symbol === token.symbol);
        if (existing) {
            notify('info', 'ALREADY LISTED', 'This token is already in the market registry.');
            return;
        }

        const updated = [...listedTokens, { ...token, id: token.symbol.toLowerCase() }];
        setListedTokens(updated);
        localStorage.setItem('15market_listed_tokens', JSON.stringify(updated));
        await syncWithKeeper(updated); // Push to Keeper for UI Sync
        notify('success', 'ASSET LISTED', `${token.symbol} is now active globally.`);
    };

    const handleSetActiveMarket = async (tokenId) => {
        setActiveTokenId(tokenId);
        localStorage.setItem('15market_active_token_id', tokenId);

        try {
            await fetch(`${KEEPER_URL}/active-market`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN
                },
                body: JSON.stringify({ activeId: tokenId })
            });
            notify('success', 'GLOBAL MARKET SWITCHED', `Citadel has set ${tokenId.toUpperCase()} as the primary market.`);
        } catch (e) {
            notify('warning', 'LOCAL SWITCH ONLY', 'Market switched locally but Keeper sync failed.');
        }
    };

    const handleDelistToken = (id) => {
        if (id === activeTokenId) {
            notify('info', 'PROTECTED ASSET', 'Cannot delist the active market asset. Switch to another first.');
            return;
        }

        setConfirmAction({
            title: 'DELIST ASSET',
            message: `Are you sure you want to remove ${id.toUpperCase()} from the listed registry? This will hide the market from the terminal.`,
            onConfirm: async () => {
                const updated = listedTokens.filter(t => t.id !== id);
                setListedTokens(updated);
                localStorage.setItem('15market_listed_tokens', JSON.stringify(updated));
                await syncWithKeeper(updated); // Push to Keeper for UI Sync
                notify('success', 'ASSET REMOVED', `${id.toUpperCase()} has been delisted.`);
            }
        });
    };

    // Platform Settings State
    const [platformSettings, setPlatformSettings] = useState(() => {
        const saved = localStorage.getItem('15market_citadel_settings');
        return saved ? JSON.parse(saved) : {
            minBet: 0.1,
            maxBet: 5.0,
            maintenanceMode: false,
            autoSettle: true,
            aiArbiterSensitivity: 0.5,
            rpcEndpoint: 'https://api.devnet.solana.com',
            priceFeedInterval: 1000,
            tradingHalted: false,
            treasuryThreshold: 0.5,
            maxConcurrentTrades: 50,
            defaultBroadcastDuration: 60
        };
    });

    useEffect(() => {
        localStorage.setItem('15market_citadel_settings', JSON.stringify(platformSettings));
    }, [platformSettings]);

    const handleSaveSettings = () => {
        notify('success', 'CONFIGURATION STORED', 'Citadel operational parameters updated across all clusters.');
    };

    const handleToggleSetting = (key) => {
        setPlatformSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const updateSetting = (key, val) => {
        setPlatformSettings(prev => ({ ...prev, [key]: val }));
    };

    const [disputes, setDisputes] = useState([
        { id: 1, user: '8xJ...4k2', type: 'Bet Resolution', reason: 'Price discrepancy', status: 'PENDING', date: '2025-12-30', amount: '0.5 SOL', category: 'Technical' },
        { id: 2, user: '3mP...9s1', type: 'Wallet Error', reason: 'Failed to settle', status: 'RESOLVED', date: '2025-12-29', amount: '1.2 SOL', category: 'Payment' }
    ]);

    // Sync disputes with live trade history
    useEffect(() => {
        const syncWithHistory = () => {
            const saved = localStorage.getItem("15market_history_v1");
            if (!saved) return;

            const history = JSON.parse(saved);
            const stuckTrades = history.filter(t => t.status === "STUCK" || t.status === "TIMEOUT" || t.status === "PENDING" || t.status === "DISPUTED");

            setDisputes(prev => {
                const combined = [...prev];
                stuckTrades.forEach(trade => {
                    const exists = combined.find(d => d.id === trade.id);
                    if (!exists) {
                        combined.push({
                            id: trade.id,
                            user: trade.userPublicKey ? `${trade.userPublicKey.slice(0, 4)}...${trade.userPublicKey.slice(-4)}` : "Anonym",
                            type: "Automated Dispute",
                            reason: trade.status === "STUCK" ? "Resolution Failed" : "Processing Timeout",
                            status: "PENDING",
                            date: new Date().toISOString().split('T')[0],
                            amount: `${trade.amount} SOL`,
                            category: "Technical",
                            network: trade.network || 'protocol',
                            originalTrade: trade
                        });
                    }
                });
                return combined;
            });
        };

        syncWithHistory();
        // OPTIMIZED: Increased from 5s to 20s to prevent UI freezing
        const interval = setInterval(syncWithHistory, 20000);
        return () => clearInterval(interval);
    }, []);

    const sendMessage = () => {
        if (!newMessage.trim() || !activeCase) return;

        const msg = {
            sender: 'ADMIN',
            text: newMessage,
            time: new Date().toLocaleTimeString(),
            id: Date.now()
        };

        setMessages(prev => ({
            ...prev,
            [activeCase.id]: [...(prev[activeCase.id] || []), msg]
        }));

        setNewMessage('');
    };

    const handleAction = async (disputeId, action) => {
        const dispute = disputes.find(d => d.id === disputeId);
        if (!dispute) return;

        if (action === 'REFUND') {
            setConfirmAction({
                title: `INITIATE ROBUST REFUND`,
                message: `Executing refund for user ${dispute.user}. This will attempt to settle the trade as WON on-chain to return funds and clear escrow.`,
                onConfirm: async () => {
                    try {
                        const recipient = dispute.originalTrade?.userPublicKey || dispute.user;
                        const amount = parseFloat(dispute.amount);

                        // If it's a real on-chain trade, settle it properly
                        if (dispute.originalTrade) {
                            console.log(`🔗 Attempting on-chain settlement for REFUND:`, dispute.id);
                            await handleOnChainSettle(dispute.originalTrade, true);
                        } else {
                            // Manual transfer fallback
                            const userPub = new PublicKey(recipient);
                            const tx = new Transaction().add(
                                SystemProgram.transfer({
                                    fromPubkey: adminWallet.publicKey,
                                    toPubkey: userPub,
                                    lamports: amount * LAMPORTS_PER_SOL
                                })
                            );
                            const signed = await adminWallet.signTransaction(tx);
                            const sig = await connection.sendRawTransaction(signed.serialize());
                            await connection.confirmTransaction(sig, 'confirmed');
                        }

                        notify('success', 'REFUND SUCCESSFUL', `Stake returned/settled as WIN.`);
                        finalizeAction(disputeId, action);
                    } catch (err) {
                        console.error("Refund failed:", err);
                        notify('error', 'REFUND FAILED', err.message || 'Blockchain transfer failed.');
                    }
                }
            });
            return;
        }

        if (action === 'SETTLE') {
            setConfirmAction({
                title: 'VERIFY ON-CHAIN LOSS',
                message: `This will settle the trade as a LOSS on-chain, moving the stake to the treasury and clearing escrow.`,
                onConfirm: async () => {
                    try {
                        if (dispute.originalTrade) {
                            await handleOnChainSettle(dispute.originalTrade, false);
                        }
                        notify('success', 'SETTLEMENT SUCCESSFUL', `Trade marked as LOSS on-chain. Treasury balanced.`);
                        finalizeAction(disputeId, action);
                    } catch (err) {
                        notify('error', 'SETTLEMENT FAILED', err.message);
                    }
                }
            });
            return;
        }

        finalizeAction(disputeId, action);
    };

    const finalizeAction = (disputeId, action) => {
        setDisputes(prev => prev.map(d => {
            if (d.id === disputeId) {
                const status = action === 'REFUND' ? 'REFUNDED' : 'SETTLED';

                // If it was a real trade from history, update the master history too
                if (d.originalTrade) {
                    const saved = localStorage.getItem("15market_history_v1");
                    if (saved) {
                        const history = JSON.parse(saved);
                        const updatedHistory = history.map(t =>
                            t.id === d.id ? { ...t, status: action === 'REFUND' ? 'WON' : 'LOST', manualAction: action } : t
                        );
                        localStorage.setItem("15market_history_v1", JSON.stringify(updatedHistory));
                    }
                }

                return { ...d, status };
            }
            return d;
        }));

        // Add internal system message
        const systemMsg = {
            sender: 'SYSTEM',
            text: `Manual intervention applied: Trade marked as ${action === 'REFUND' ? 'REFUNDED (Stake Returned)' : 'SETTLED (Loss Verified)'}. Result synced to user dashboard.`,
            time: new Date().toLocaleTimeString()
        };

        setMessages(prev => ({
            ...prev,
            [disputeId]: [...(prev[disputeId] || []), systemMsg]
        }));

        if (activeCase?.id === disputeId) {
            setActiveCase(curr => ({ ...curr, status: action === 'REFUND' ? 'REFUNDED' : 'SETTLED' }));
        }
    };

    const handleBulkAction = async (action) => {
        if (selectedDisputeIds.length === 0) return;

        setConfirmAction({
            title: 'BULK ACTION AUTHORIZATION',
            message: action === 'REFUND'
                ? `Confirm BULK REFUND for ${selectedDisputeIds.length} disputes? This will execute multiple on-chain transfers.`
                : `Mark ${selectedDisputeIds.length} disputes as SETTLED in the system?`,
            onConfirm: async () => {
                for (const id of selectedDisputeIds) {
                    await handleAction(id, action);
                }
                setSelectedDisputeIds([]);
                notify('success', 'BATCH PROCESSED', `Operation completed for ${selectedDisputeIds.length} cases.`);
            }
        });
    };

    const handleOnChainSettle = async (betData, userWon) => {
        if (!adminWallet || !adminWallet.publicKey) {
            notify('error', 'CITADEL ADVISORY', 'Authorize Master Authority to execute on-chain settlements.');
            return;
        }

        const actionLabel = userWon ? "WIN (Payout Profit)" : "LOSS (Take Stake)";

        setConfirmAction({
            title: 'ESTABLISH ON-CHAIN VERDICT',
            message: `MANUAL SETTLE Bet ${betData.publicKey.slice(0, 8)} as ${actionLabel}?`,
            onConfirm: async () => {
                try {
                    const program = getProgram(adminWallet, connection);
                    const userPub = new PublicKey(betData.owner);
                    const [betPda] = PublicKey.findProgramAddressSync(
                        [Buffer.from("bet_v6"), userPub.toBuffer(), new BN(betData.nonce).toArrayLike(Buffer, 'le', 8)],
                        program.programId
                    );

                    const [treasuryPda] = getTreasuryPda(program.programId);

                    console.log(`📡 [MANUAL_SETTLE] Relaying on-chain ${userWon ? 'WIN' : 'LOSS'} for:`, betPda.toBase58());

                    const tx = await program.methods
                        .settleBet(userWon)
                        .accounts({
                            bet: betPda,
                            owner: userPub,
                            treasury: treasuryPda,
                            keeper: adminWallet.publicKey,
                            systemProgram: SystemProgram.programId
                        })
                        .rpc();

                    await connection.confirmTransaction(tx, 'confirmed');
                    notify('success', 'SETTLEMENT EXECUTED', `Trade settled as ${userWon ? 'WON' : 'LOST'}.`);
                    triggerAnalysis();
                } catch (err) {
                    console.error("Manual settle failed:", err);
                    notify('error', 'SETTLEMENT FAILED', err.message);
                }
            }
        });
    };

    const triggerAnalysis = useCallback(async () => {
        if (!connection) return;

        // SKIP if keeper is down - prevent pile-up
        if (!keeperHealthRef.current.connected) {
            console.log('⚠️ [SKIP_ANALYSIS] Keeper down, waiting for recovery...');
            return;
        }

        // Prevent concurrent calls
        if (triggerAnalysis.isRunning) {
            console.log('⏳ Analysis already in progress, skipping...');
            return;
        }

        triggerAnalysis.isRunning = true;

        try {
            // 1. Fetch Treasury
            const [treasuryPda] = getTreasuryPda(programID);
            const treasuryBal = await connection.getBalance(treasuryPda);
            setTreasuryStats({ balance: treasuryBal / LAMPORTS_PER_SOL, pda: treasuryPda.toBase58() });

            // 2. Fetch Keeper Stats (Escrow)
            const statsRes = await fetch(`${KEEPER_URL}/escrow-stats`);
            if (statsRes.ok) {
                const stats = await statsRes.json();
                setEscrowStats({
                    solana: stats.solana || { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 },
                    arc: stats.arc || { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 }
                });
            }

            // 3. Fetch Protocol Data (Active Bets & Stats) from Keeper (OFFLOADED FROM RPC)
            const [activeRes, protoRes] = await Promise.all([
                fetch(`${KEEPER_URL}/active-bets`),
                fetch(`${KEEPER_URL}/protocol-stats`)
            ]);

            if (activeRes.ok && protoRes.ok) {
                const activeBets = await activeRes.json();
                const protoStats = await protoRes.json();

                setProtocolData({
                    activeList: activeBets.map(b => ({
                        publicKey: b.id,
                        amount: b.amountLamports ? Number(b.amountLamports) / 1e9 : 0, // Fallback if format differs
                        owner: b.owner,
                        nonce: b.nonce,
                        direction: b.direction === 1 ? "buy" : "sell",
                        entryPrice: b.entryPrice,
                        duration: b.duration || 60,
                        timestamp: b.timestamp || (Date.now() / 1000 - 60),
                        isExpired: b.expiry < (Date.now() / 1000),
                        network: 'protocol'
                    })),
                    totalVolume: protoStats.totalVolume,
                    wallets: protoStats.wallets,
                    profiles: [] // Profiles not critically needed for dashboard
                });
            }

            // 4. Sync Clock
            const slot = await connection.getSlot();
            const ts = await connection.getBlockTime(slot);
            if (ts) setClockOffset(ts - (Date.now() / 1000));

            setLastSync(new Date().toLocaleTimeString());
        } catch (e) {
            console.error("Global Analysis Failed:", e);
        } finally {
            triggerAnalysis.isRunning = false;
        }
    }, [connection]);

    useEffect(() => {
        if (isLoggedIn) {
            triggerAnalysis();
            // OPTIMIZED: Reduced to 2s for instant treasury balance updates
            const interval = setInterval(triggerAnalysis, 2000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, triggerAnalysis]);

    // Fetch Trade History (Settled Trades from Solana + Arc)
    const fetchTradeHistory = useCallback(async () => {
        if (!connection) return;
        if (fetchTradeHistory.isRunning) return;

        fetchTradeHistory.isRunning = true;

        try {
            // 1. Fetch Unified History from Keeper (OFFLOADED FROM RPC)
            const res = await fetch(`${KEEPER_URL}/history`);
            if (res.ok) {
                const allTrades = await res.json();

                // Sort by timestamp (newest first)
                allTrades.sort((a, b) => b.timestamp - a.timestamp);

                // Limit to last 100 trades
                setTradeHistory(allTrades.slice(0, 100));
                console.log(`📜 [HISTORY] Loaded ${allTrades.length} trades from Keeper cache`);
            }
        } catch (e) {
            console.error("Trade History Fetch Error:", e);
        } finally {
            fetchTradeHistory.isRunning = false;
        }
    }, [connection]);

    useEffect(() => {
        if (isLoggedIn) {
            fetchTradeHistory();
            // OPTIMIZED: Increased from 15s to 60s to prevent UI freezing
            const interval = setInterval(fetchTradeHistory, 60000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, fetchTradeHistory]);

    const unifiedMetrics = useMemo(() => {
        const nowSeconds = nowRef.current + clockOffset;
        const liveValues = Array.from(liveEscrowBuffer.values()).filter(b => b.expiry > nowSeconds);

        // Network-aware active list
        const activeList = adminNetwork === 'SOLANA'
            ? (protocolData.activeList || [])
            : liveValues.filter(b => b.network === 'arc');

        // Sum volumes and wallets from both networks
        const solStats = escrowStats.solana || { totalVolume: 0, wallets: 0, stake: 0, count: 0, balance: 0, address: '' };
        const arcStats = escrowStats.arc || { totalVolume: 0, wallets: 0, stake: 0, count: 0, balance: 0, address: '' };

        let totalVolume = 0;
        let totalWallets = 0;

        if (adminNetwork === 'SOLANA') {
            totalVolume = parseFloat(solStats.totalVolume) || 0;
            totalWallets = parseInt(solStats.wallets) || 0;
        } else {
            // HYBRID VOLUME: Keeper Total + fresh unexpired pings for instant jump
            const freshArcPings = liveValues.filter(b => b.network === 'arc');
            const unconfirmedArcVol = freshArcPings.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

            totalVolume = (parseFloat(arcStats.totalVolume) || 0) + unconfirmedArcVol;
            totalWallets = parseInt(arcStats.wallets) || 0;
        }

        // Solana "Live" comes from protocolData. Arc comes solely from stats.
        let finalActiveStake = 0;
        let finalActiveCount = 0;

        if (adminNetwork === 'SOLANA') {
            const onChainList = protocolData.activeList || [];

            // HYBRID ESCROW: Combine on-chain data with "Fresh" pings from liveEscrowBuffer
            // Deduplicate using nonce/ID to ensure pings don't double-count once confirmed on-chain
            const onChainIds = new Set(onChainList.map(b => b.nonce?.toString()));
            const freshPings = liveValues.filter(b => b.network === 'solana' && !onChainIds.has(b.id));

            finalActiveStake = onChainList.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0) +
                freshPings.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

            finalActiveCount = onChainList.length + freshPings.length;
        } else {
            // Arc Hybrid: arcStats is reported by the Arc Keeper (on-chain aggregate)
            // freshArcPings are the direct inputs from the user app.
            const freshArcPings = liveValues.filter(b => b.network === 'arc');
            const pingsStake = freshArcPings.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

            // Use Math.max to prioritize the "instant" feel of pings while keeping the stats floor.
            finalActiveStake = Math.max(parseFloat(arcStats.stake) || 0, pingsStake);
            finalActiveCount = Math.max(parseInt(arcStats.count) || 0, freshArcPings.length);
        }

        // Determine currency unit based on network
        const currencyUnit = adminNetwork === 'SOLANA' ? 'SOL' : 'USDC';

        // Network-specific treasury/reserve balance
        // Solana: Use actual on-chain treasury balance
        // Arc: Use the balance reported by the Arc Keeper
        const PHYSICAL_TREASURY_BAL = adminNetwork === 'SOLANA'
            ? (treasuryStats.balance || 0)
            : arcTreasuryBalance; // Direct real-time fetch

        const RESERVE_ADDRESS = adminNetwork === 'SOLANA'
            ? treasuryStats.pda
            : (arcStats.address || 'Scanning...');

        const currentStats = {
            volume: (totalVolume || 0).toFixed(2),
            wallets: totalWallets,
            activeStakes: finalActiveStake.toFixed(2),
            totalPlatformFunds: PHYSICAL_TREASURY_BAL.toFixed(2),
            activeCount: finalActiveCount,
            unit: currencyUnit
        };

        return {
            activeList,
            totalVolume: totalVolume.toFixed(2),
            totalWallets,
            totalActiveStakes: finalActiveStake.toFixed(2),
            currentStats,
            displayReserve: PHYSICAL_TREASURY_BAL.toFixed(2),
            reserveAddress: RESERVE_ADDRESS,
            pendingDisputes: activeList.length,
            currencyUnit
        };
    }, [protocolData, escrowStats, liveEscrowBuffer, treasuryStats, clockOffset, adminNetwork]);



    // Trade History Filtering (Settled Trades Only)
    const filteredHistory = useMemo(() => {
        return tradeHistory.filter(trade => {
            // Network filter
            const matchesNetwork = historyFilter.network === 'ALL' ||
                (historyFilter.network === 'SOLANA' && trade.network === 'solana') ||
                (historyFilter.network === 'ARC' && trade.network === 'arc');

            // Search filter
            const matchesSearch = !historyFilter.search ||
                trade.owner?.toLowerCase().includes(historyFilter.search.toLowerCase()) ||
                trade.publicKey?.toLowerCase().includes(historyFilter.search.toLowerCase());

            return matchesNetwork && matchesSearch;
        });
    }, [tradeHistory, historyFilter.network, historyFilter.search]);

    // Filtered Disputes
    const filteredDisputes = useMemo(() => {
        return disputes.filter(d => {
            // Status match
            const matchesStatus = disputeFilterState.status === 'ALL' || d.status === disputeFilterState.status;

            // Network match: If on ARC dashboard, only show ARC disputes (usually automated)
            // If on SOLANA, only show Solana/Protocol disputes
            const matchesNetwork = (adminNetwork === 'SOLANA' && (d.network === 'solana' || d.network === 'protocol')) ||
                (adminNetwork === 'ARC' && d.network === 'arc');

            return matchesStatus && matchesNetwork;
        });
    }, [disputes, disputeFilterState, adminNetwork]);

    // Background Log Synchronization
    useEffect(() => {
        if (!isLoggedIn) return;

        const parseBetData = (logs) => {
            const betRegex = /\[BET_DATA\] ID:([^ ]+) \| AMT:([^ ]+) \| EXP:([^ ]+) \| NET:([^ \n]+)/g;
            const updates = new Map();
            let match;

            logs.forEach(logLine => {
                const msg = typeof logLine === 'string' ? logLine : (logLine.message || "");
                while ((match = betRegex.exec(msg)) !== null) {
                    const [_, id, amount, expiry, network] = match;
                    updates.set(id, {
                        id,
                        amount: parseFloat(amount),
                        expiry: parseFloat(expiry),
                        network: network || 'solana'
                    });
                }
            });

            if (updates.size > 0) {
                setLiveEscrowBuffer(prev => {
                    const next = new Map(prev);
                    updates.forEach((val, id) => {
                        if (!next.has(id)) next.set(id, val);
                    });

                    // Cleanup expired items to prevent memory bloat
                    const nowSec = Date.now() / 1000;
                    for (const [key, val] of next.entries()) {
                        if (val.expiry < nowSec - 60) { // Remove 60s after expiry
                            next.delete(key);
                        }
                    }

                    return next;
                });
            }
        };

        const fetchLogs = async () => {
            const currentHealth = keeperHealthRef.current;
            // Exponential backoff if keeper is unhealthy
            const timeSinceLastCheck = Date.now() - currentHealth.lastCheck;
            const backoffDelay = Math.min(60000, 5000 * Math.pow(2, currentHealth.failCount)); // Max 60s

            if (!currentHealth.connected && timeSinceLastCheck < backoffDelay) {
                return; // Skip this poll
            }

            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

                const res = await fetch(`${KEEPER_URL}/logs`, { signal: controller.signal });
                clearTimeout(timeout);

                if (res.ok) {
                    const data = await res.json();
                    if (activeTab === 'terminal') setKeeperLogs(data);
                    parseBetData(data);

                    // Reset health on success
                    if (!currentHealth.connected) {
                        console.log('✅ Keeper connection restored');
                    }
                    setKeeperHealth({ connected: true, failCount: 0, lastCheck: Date.now() });
                } else {
                    throw new Error(`Server returned ${res.status}`);
                }
            } catch (e) {
                const newFailCount = currentHealth.failCount + 1;
                setKeeperHealth({ connected: false, failCount: newFailCount, lastCheck: Date.now() });

                if (newFailCount === 1) {
                    console.warn('⚠️ Keeper connection lost, entering backoff mode');
                }
            }
        };

        fetchLogs();
        // OPTIMIZED: Increased from 10s to 20s to prevent UI freezing
        const interval = setInterval(fetchLogs, 20000);
        return () => clearInterval(interval);
    }, [isLoggedIn, activeTab]); // REMOVED keeperHealth to prevent infinite loop

    const nodeStats = [
        { name: 'US-East (RPC)', status: 'Optimal', latency: '22ms', load: 34 },
        { name: 'EU-West (RPC)', status: 'Active', latency: '48ms', load: 62 },
        { name: 'Protocol (Keeper)', status: 'Active', latency: '12ms', load: 15 }
    ];

    const distributionData = [
        { name: 'Protocol Vault', value: 95, color: '#3CB371' },
        { name: 'Misc', value: 5, color: '#ffffff20' }
    ];

    const chartData = [
        { name: '00:00', volume: 400, users: 24, treasury: 14200 },
        { name: '04:00', volume: 800, users: 32, treasury: 14400 },
        { name: '08:00', volume: 1500, users: 48, treasury: 14800 },
        { name: '12:00', volume: 2100, users: 64, treasury: 15100 },
        { name: '16:00', volume: 1800, users: 72, treasury: 15300 },
        { name: '20:00', volume: 2400, users: 84, treasury: 15420 },
    ];

    // Unified Treasury Balance is now handled by the updateBalances() loop in the monitoring effect above

    const handleDeposit = async (amt) => {
        if (!wallet || !wallet.publicKey) {
            notify('error', 'AUTH FAILED', 'Wallet connection required for deposits.');
            return;
        }
        try {
            const [pda] = getTreasuryPda(programID);
            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: pda,
                    lamports: parseFloat(amt) * LAMPORTS_PER_SOL
                })
            );
            const sig = await wallet.sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, 'confirmed');

            // Immediately update treasury balance to hide alert instantly
            const newBalance = await connection.getBalance(pda);
            setTreasuryStats({
                balance: newBalance / LAMPORTS_PER_SOL,
                pda: pda.toBase58()
            });

            notify('success', 'DEPOSIT CONFIRMED', `${amt} SOL injected into Treasury liquidity pool.`);
            setIsTreasuryModalOpen(false);
        } catch (err) {
            notify('error', 'DEPOSIT FAILED', err.message);
        }
    };

    const handleWithdraw = async (amt) => {
        if (!adminWallet || !adminWallet.publicKey) {
            notify('error', 'UNAUTHORIZED', 'Root Admin signature required for treasury extraction.');
            return;
        }

        const amtNum = parseFloat(amt);
        if (isNaN(amtNum) || amtNum <= 0) {
            notify('error', 'INVALID AMOUNT', 'Specify a valid amount for withdrawal.');
            return;
        }

        const currentBal = treasuryStats.balance;
        if (amtNum > currentBal) {
            notify('error', 'INSUFFICIENT FUNDS', 'Treasury balance is lower than the requested withdrawal amount.');
            return;
        }

        try {
            const program = getProgram(adminWallet, connection);
            if (!program) return;

            notify('info', 'EXTRACTING FUNDS', 'Broadcasting withdrawal instruction to Solana clusters...');

            const [marketPda] = getMarketPda(programID);
            const [treasuryPda] = getTreasuryPda(programID);

            const tx = await program.methods
                .withdrawTreasury(new BN((amtNum * LAMPORTS_PER_SOL).toString()))
                .accounts({
                    market: marketPda,
                    treasury: treasuryPda,
                    authority: adminWallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            notify('success', 'WITHDRAWAL SUCCESS', `Successfully extracted ${amt} SOL to Admin Authority wallet.`);

            // Refresh balance
            const bal = await connection.getBalance(treasuryPda);
            setTreasuryStats({ balance: bal / LAMPORTS_PER_SOL, pda: treasuryPda.toBase58() });

            setIsTreasuryModalOpen(false);
        } catch (err) {
            console.error("Withdrawal failed:", err);
            notify('error', 'WITHDRAWAL FAILED', err.message || 'An error occurred during treasury extraction.');
        }
    };

    const handleTreasuryAction = (amt) => {
        if (treasuryAction === 'DEPOSIT') {
            handleDeposit(amt);
        } else {
            handleWithdraw(amt);
        }
    };

    const handleAssignRole = () => {
        if (!newStaff.address) return;
        setStaffMembers([...staffMembers, {
            id: Date.now(),
            address: newStaff.address,
            role: newStaff.role,
            key: `AUTH_${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            status: 'ACTIVE'
        }]);
        setIsStaffModalOpen(false);
        setNewStaff({ address: '', role: 'moderator' });
    };

    const handleRevokeRole = (id) => {
        if (id === 1) {
            notify('error', 'ACCESS DENIED', 'Cannot revoke Global Root authority.');
            return;
        }

        setConfirmAction({
            title: 'REVOKE OPERATOR ACCESS',
            message: 'Are you sure you want to terminate this operator\'s access keys? They will no longer be able to log in to the Citadel.',
            onConfirm: () => {
                setStaffMembers(prev => prev.filter(s => s.id !== id));
                notify('success', 'ACCESS REVOKED', 'Operator privileges has been terminated.');
            }
        });
    };

    const handleLogin = async (e) => {
        if (e) e.preventDefault();
        setAuthError(null);

        try {
            const result = await AdminAuthDB.verifyCoordinates(loginForm.username, loginForm.password);

            if (result.success) {
                setIsLoggedIn(true);
                setCurrentUser({ username: result.user.username || 'Admin Staff', role: result.user.role || ROLES.MODERATOR });

                // Automatically link Master Authority if not already set (For Protocol Default)
                const storageKey = '15market_citadel_master_protocol';
                if (!localStorage.getItem(storageKey)) {
                    const keeperKey = [115, 158, 186, 9, 238, 165, 46, 111, 213, 187, 96, 61, 32, 72, 136, 41, 118, 180, 29, 127, 190, 219, 71, 166, 173, 188, 113, 25, 11, 90, 182, 176, 184, 245, 75, 239, 163, 125, 183, 66, 243, 208, 176, 159, 125, 216, 202, 96, 210, 219, 119, 83, 156, 192, 167, 72, 36, 175, 117, 16, 120, 105, 136, 117];
                    localStorage.setItem(storageKey, JSON.stringify(keeperKey));
                    setMasterKeypair(Keypair.fromSecretKey(new Uint8Array(keeperKey)));
                    console.log("🛡️ Master Authority Key auto-linked for Admin session.");
                }
                notify('success', 'ACCESS GRANTED', 'Session Initialized.');
            } else {
                notify('error', 'AUTH FAILED', result.message);
                setAuthError(result.message);
            }
        } catch (err) {
            console.error("Login Error:", err);
            notify('error', 'SYSTEM ERROR', err.message);
        }
    };



    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-[300] bg-[#000] flex items-center justify-center overflow-hidden">
                {/* Animated Background Gradients */}
                <div className="absolute top-0 -left-1/4 w-1/2 h-full bg-[#3CB371]/10 blur-[160px] animate-pulse" />
                <div className="absolute bottom-0 -right-1/4 w-1/2 h-full bg-[#3CB371]/5 blur-[160px]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-[480px] bg-[#050505]/80 backdrop-blur-2xl border border-white/10 p-12 rounded-[48px] relative z-20 shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
                >
                    <div className="flex flex-col items-center mb-12">
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className="relative mb-6"
                        >
                            <div className="absolute inset-0 blur-3xl bg-[#3CB371]/40 opacity-50" />
                            <img src="/logo.png" alt="15market" className="h-48 w-auto relative z-10 filter drop-shadow-[0_0_30px_rgba(60,179,113,0.6)]" />
                        </motion.div>
                        <h2 className="text-2xl font-black uppercase tracking-[0.3em] text-white">Citadel Access</h2>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] animate-ping" />
                            <p className="text-[10px] text-[#3CB371] font-black uppercase tracking-[0.2em]">Secure Node 01</p>
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Operator ID</label>
                                        <span className="text-[9px] text-white/10 font-mono">ROOT.AUTH</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={loginForm.username}
                                        onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-[#3CB371]/40 focus:bg-black/80 transition-all placeholder:text-white/5"
                                        placeholder="admin"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Pass-Key</label>
                                    <input
                                        type="password"
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-[#3CB371]/40 focus:bg-black/80 transition-all placeholder:text-white/5"
                                        placeholder="••••••••"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="group relative w-full bg-white text-black py-4.5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#3CB371] to-[#4ADE80] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <span className="relative z-10 group-hover:text-white transition-colors">Verify Credentials</span>
                                </button>
                            </motion.div>
                        </AnimatePresence>
                    </form>

                    <div className="mt-10 flex flex-col items-center gap-4">
                        <div className="h-[1px] w-12 bg-white/5" />
                        <button
                            onClick={onBack}
                            className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] hover:text-[#3CB371] transition-all"
                        >
                            Discard Session
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] bg-[#050505] flex overflow-hidden">
            {/* CONNECTION HEALTH WARNING */}
            <AnimatePresence>
                {!keeperHealth.connected && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="absolute top-0 left-0 w-full z-[1200] bg-red-500/90 text-white px-4 py-2 flex items-center justify-center gap-3 backdrop-blur-md shadow-lg"
                    >
                        <AlertCircle size={20} className="animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest">
                            Connection Lost: Trying to reconnect to Keeper Node (Attempt {keeperHealth.failCount})...
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Styled Notification Toast */}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 20, x: '-50%' }}
                        className="fixed bottom-10 left-1/2 z-[1000] w-full max-w-md"
                    >
                        <div className={`mx-4 p-5 rounded-[24px] border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-start gap-4 ${notification.type === 'success' ? 'bg-[#3CB371]/10 border-[#3CB371]/30' :
                            notification.type === 'error' ? 'bg-red-500/10 border-red-500/30' :
                                'bg-blue-500/10 border-blue-500/30'
                            }`}>
                            <div className={`p-2 rounded-xl ${notification.type === 'success' ? 'bg-[#3CB371]/20' :
                                notification.type === 'error' ? 'bg-red-500/20' :
                                    'bg-blue-500/20'
                                }`}>
                                {notification.type === 'success' ? <CheckCircle2 className="text-[#3CB371]" size={20} /> :
                                    notification.type === 'error' ? <ShieldAlert className="text-red-500" size={20} /> :
                                        <AlertCircle className="text-blue-500" size={20} />}
                            </div>
                            <div className="flex-1">
                                <h5 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${notification.type === 'success' ? 'text-[#3CB371]' :
                                    notification.type === 'error' ? 'text-red-500' :
                                        'text-blue-500'
                                    }`}>
                                    {notification.title}
                                </h5>
                                <p className="text-xs font-bold text-white/70 leading-relaxed uppercase tracking-widest">{notification.message}</p>
                            </div>
                            <button onClick={() => setNotification(null)} className="text-white/20 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Styled Confirmation Modal */}
            <AnimatePresence>
                {confirmAction && (
                    <div className="fixed inset-0 z-[1001] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setConfirmAction(null)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-lg bg-[#0D0D0D] border border-white/10 rounded-[40px] p-10 overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,1)]"
                        >
                            <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
                                <Gavel size={200} />
                            </div>

                            <div className="flex flex-col items-center text-center relative z-10">
                                <div className="p-5 bg-white/5 rounded-3xl mb-6 border border-white/10">
                                    <AlertCircle className="text-[#3CB371]" size={32} />
                                </div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-4">{confirmAction.title}</h3>
                                <p className="text-xs font-bold text-white/40 uppercase tracking-[0.1em] leading-relaxed mb-10 max-w-sm">
                                    {confirmAction.message}
                                </p>

                                <div className="flex gap-4 w-full">
                                    <button
                                        onClick={() => setConfirmAction(null)}
                                        className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl border border-white/5 transition-all"
                                    >
                                        Cancel Action
                                    </button>
                                    <button
                                        onClick={() => {
                                            confirmAction.onConfirm();
                                            setConfirmAction(null);
                                        }}
                                        className="flex-1 py-4 bg-[#3CB371] hover:bg-[#3CB371]/80 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-[0_10px_30px_rgba(60,179,113,0.3)]"
                                    >
                                        Authorize Execution
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Mobile Header / Navigation Bar */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#0D0D0D] border-b border-white/5 z-[260] flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="logo" className="h-8 w-auto" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Citadel</span>
                </div>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 bg-white/5 border border-white/10 rounded-xl"
                >
                    {isMobileMenuOpen ? <X size={20} className="text-white" /> : <MoreVertical size={20} className="text-white" />}
                </button>
            </div>

            {/* Sidebar Drawer */}
            <div className={`w-72 bg-[#0D0D0D] border-r border-white/5 flex flex-col p-6 transition-transform duration-300 transform lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-[20px_0_50px_rgba(0,0,0,0.8)]' : '-translate-x-full'
                } fixed lg:static inset-y-0 left-0 z-[300] lg:z-0`}>
                <div className="hidden lg:flex items-center justify-center mb-10 px-2">
                    <img src="/logo.png" alt="logo" className="h-24 w-auto drop-shadow-[0_0_15px_rgba(60,179,113,0.3)]" />
                </div>

                <div className="flex-1 space-y-2">
                    <NavItem
                        icon={BarChart3}
                        label="Overview"
                        id="dashboard"
                        active={activeTab === 'dashboard'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Gavel}
                        label="Disputes"
                        id="disputes"
                        active={activeTab === 'disputes'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Coins}
                        label="Listing"
                        id="listing"
                        active={activeTab === 'listing'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Megaphone}
                        label="Broadcasts"
                        id="broadcasts"
                        active={activeTab === 'broadcasts'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Users}
                        label="Directory"
                        id="directory"
                        active={activeTab === 'directory'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={TerminalIcon}
                        label="Terminal"
                        id="terminal"
                        active={activeTab === 'terminal'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Coins}
                        label="Treasury"
                        id="treasury"
                        active={activeTab === 'treasury'}
                        onClick={setActiveTab}
                    />
                    {currentUser?.role === ROLES.ROOT && (
                        <NavItem
                            icon={Lock}
                            label="Master Vault"
                            id="vault"
                            active={activeTab === 'vault'}
                            onClick={setActiveTab}
                        />
                    )}
                    {currentUser?.role === ROLES.ROOT && (
                        <NavItem
                            icon={ShieldCheck}
                            label="Staff Mgmt"
                            id="staff"
                            active={activeTab === 'staff'}
                            onClick={setActiveTab}
                        />
                    )}
                    <NavItem
                        icon={Trophy}
                        label="Campaigns"
                        id="campaigns"
                        active={activeTab === 'campaigns'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Settings}
                        label="Settings"
                        id="settings"
                        active={activeTab === 'settings'}
                        onClick={setActiveTab}
                    />
                    <NavItem
                        icon={Globe}
                        label="Global Reach"
                        id="globe"
                        active={activeTab === 'globe'}
                        onClick={setActiveTab}
                    />
                    <div className="h-[1px] w-full bg-white/5 my-4" />
                    <button
                        onClick={() => setIsMessagingOpen(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/40 hover:bg-white/5 hover:text-white"
                    >
                        <MessageSquare size={20} />
                        <span className="text-xs font-bold uppercase tracking-widest">Global Comms</span>
                    </button>
                </div>

                <div className="pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3 px-4 py-4 bg-white/5 rounded-2xl mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#3CB371]/20 flex items-center justify-center">
                            <Users size={16} className="text-[#3CB371]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-white">{currentUser?.username}</p>
                            <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{currentUser?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsLoggedIn(false)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/40 hover:text-[#FF4444] transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Terminate Session</span>
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[290]"
                    />
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden pt-16 lg:pt-0">
                <div className="z-50 border-b border-white/5 hidden lg:block">
                    <GlobalTradeScroller wallet={DISCONNECTED_WALLET} connection={connection} currentNetwork={adminNetwork} />
                </div>

                <div className="flex-1 overflow-y-auto bg-[#050505] p-4 lg:p-10 custom-scrollbar relative">
                    <div className="max-w-7xl mx-auto">
                        {/* SYSTEM EMERGENCY ALERTS */}
                        <AnimatePresence>
                            {(() => {
                                const pendingDisputes = unifiedMetrics.pendingDisputes;
                                const isLowTreasury = treasuryStats.balance < (platformSettings.treasuryThreshold || 0.5);
                                const isHighDisputes = pendingDisputes > 5;

                                if (!isLowTreasury && !isHighDisputes) return null;

                                return (
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="mb-8 p-6 bg-[#FF4444]/10 border border-[#FF4444]/30 rounded-[32px] flex items-center justify-between backdrop-blur-xl"
                                    >
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 bg-[#FF4444]/20 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(255,68,68,0.2)]">
                                                <ShieldAlert className="text-[#FF4444] animate-pulse" size={28} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                                                    {isLowTreasury ? "System Emergency: Treasury Depleted" : "Security Alert: High Dispute Load"}
                                                </h3>
                                                <div className="flex items-center gap-3 mt-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 w-fit">
                                                    <p className="text-[9px] font-mono text-[#FF4444]">{unifiedMetrics.reserveAddress || 'Scanning...'}</p>
                                                    <button
                                                        onClick={() => {
                                                            if (unifiedMetrics.reserveAddress) {
                                                                navigator.clipboard.writeText(unifiedMetrics.reserveAddress);
                                                                notify('info', 'DATA COPIED', 'Treasury address copied to clipboard.');
                                                            }
                                                        }}
                                                        className="text-[9px] font-black text-white/40 hover:text-white uppercase tracking-tighter"
                                                    >
                                                        [Copy Addr]
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            {isLowTreasury ? (
                                                <button
                                                    onClick={() => setIsTreasuryModalOpen(true)}
                                                    className="px-6 py-3 bg-[#FF4444] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(255,68,68,0.3)]"
                                                >
                                                    Deposit Now
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setActiveTab('disputes')}
                                                    className="px-6 py-3 bg-[#FF4444] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(255,68,68,0.3)]"
                                                >
                                                    Process Disputes
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })()}
                        </AnimatePresence>
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 lg:mb-10 gap-6">
                            <div>
                                <h1 className="text-2xl lg:text-3xl font-black text-white uppercase tracking-tight mb-1 mt-6 lg:mt-0">
                                    {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                                </h1>
                                <p className="text-[10px] lg:text-sm text-white/40 font-bold uppercase tracking-widest">
                                    System status: <span className="text-[#3CB371]">Operational</span> • {new Date().toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                {/* Network Switch */}
                                <div className="flex w-full sm:w-auto bg-black/40 p-1 rounded-xl border border-white/5">
                                    <button
                                        onClick={() => setAdminNetwork('SOLANA')}
                                        className={`flex-1 sm:px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${adminNetwork === 'SOLANA' ? 'bg-[#9945FF] text-white shadow-[0_0_20px_rgba(153,69,255,0.3)]' : 'text-white/20 hover:text-white'}`}
                                    >
                                        Solana
                                    </button>
                                    <button
                                        onClick={() => setAdminNetwork('ARC')}
                                        className={`flex-1 sm:px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${adminNetwork === 'ARC' ? 'bg-[#3B82F6] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'text-white/20 hover:text-white'}`}
                                    >
                                        Arc
                                    </button>
                                </div>

                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search hashes..."
                                        className="bg-black/60 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-[10px] uppercase font-bold outline-none w-full focus:border-[#3CB371]/30"
                                    />
                                </div>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {activeTab === 'dashboard' && (
                                <motion.div
                                    key="dashboard"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8 pb-20"
                                >
                                    {/* Advanced Command Header */}
                                    <div className={`flex flex-col lg:flex-row lg:items-center justify-between bg-[#111] border border-white/5 p-6 rounded-[32px] overflow-hidden relative transition-colors duration-500 ${adminNetwork === 'ARC' ? 'border-blue-500/10' : ''}`}>
                                        <div className={`absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l pointer-events-none ${adminNetwork === 'SOLANA' ? 'from-[#9945FF]/10' : 'from-[#3B82F6]/10'} to-transparent`} />
                                        <div className="flex flex-col md:flex-row md:items-center gap-6 relative z-10 w-full">
                                            <div className={`p-4 bg-black rounded-2xl border ${adminNetwork === 'SOLANA' ? 'border-[#9945FF]/20' : 'border-[#3B82F6]/20'} w-fit`}>
                                                <Activity className={`animate-pulse ${adminNetwork === 'SOLANA' ? 'text-[#9945FF]' : 'text-[#3B82F6]'}`} size={32} />
                                            </div>
                                            <div className="flex-1">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-1" style={{ color: adminNetwork === 'SOLANA' ? '#9945FF' : '#3B82F6' }}>
                                                        NODE STATUS {lastSync && `• SYNC: ${lastSync}`}
                                                    </p>
                                                    <h2 className="text-xl lg:text-3xl font-black text-white">{unifiedMetrics.currentStats.wallets} <span className="text-[10px] font-bold text-white/40 ml-2 uppercase tracking-widest">Active Users</span></h2>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <p className="text-[9px] font-mono text-white/20 uppercase tracking-widest">
                                                            Active Relay: {adminNetwork === 'SOLANA' ? 'Solana Protocol' : 'Arc Network'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-row md:flex-col lg:flex-row gap-6 md:gap-2 lg:gap-8 mt-4 md:mt-0 pt-4 md:pt-0 border-t border-white/5 md:border-t-0">
                                                <div className="text-left md:text-right">
                                                    <p className="text-[8px] lg:text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">PENDING</p>
                                                    <p className="text-lg lg:text-xl font-bold text-white leading-none">{unifiedMetrics.activeList.length} <span className="text-[10px] text-white/20">Trades</span></p>
                                                </div>
                                                <div className="text-left md:text-right">
                                                    <p className="text-[8px] lg:text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">VOLUME</p>
                                                    <p className="text-lg lg:text-xl font-bold font-mono leading-none" style={{ color: '#3CB371' }}>{unifiedMetrics.currentStats.volume} {unifiedMetrics.currencyUnit}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                        <StatCard
                                            icon={Activity}
                                            label="Total Trading Volume"
                                            value={`${unifiedMetrics.totalVolume} ${unifiedMetrics.currentStats.unit}`}
                                            trend="PLATFORM"
                                            positive={true}
                                        />
                                        <StatCard
                                            icon={ShieldCheck}
                                            label="In-Play Escrow"
                                            value={`${unifiedMetrics.currentStats.activeStakes} ${unifiedMetrics.currentStats.unit}`}
                                            trend="LIVE"
                                            positive={true}
                                        />
                                        <StatCard
                                            icon={Database}
                                            label={adminNetwork === 'SOLANA' ? "Active Treasury" : "Arc Treasury"}
                                            value={`${unifiedMetrics.displayReserve} ${unifiedMetrics.currencyUnit}`}
                                            trend="VAULT"
                                            positive={true}
                                        />
                                        <StatCard
                                            icon={TrendingUp}
                                            label="Protocol Revenue"
                                            value={`${(adminNetwork === 'SOLANA' ? (autoSignerFees?.solana || 0) : (autoSignerFees?.arc || 0)).toFixed(6)} ${unifiedMetrics.currencyUnit}`}
                                            trend="REVENUE"
                                            positive={true}
                                        />
                                    </div>

                                    {/* Map moved to separate tab */}

                                    {/* TRADE HISTORY */}
                                    <div className="bg-[#0D0D0D] border border-white/5 rounded-[48px] overflow-hidden">
                                        <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div>
                                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Platform Trade History</h3>
                                                <p className="text-[10px] font-bold text-white/20 mt-1">Settled trades from Solana and Arc networks</p>
                                            </div>

                                            <div className="flex flex-wrap gap-4">
                                                {/* Network Filter */}
                                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                                    {['ALL', 'SOLANA', 'ARC'].map(n => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setHistoryFilter(f => ({ ...f, network: n }))}
                                                            className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${historyFilter.network === n ? 'bg-[#3CB371] text-white' : 'text-white/20 hover:text-white'}`}
                                                        >
                                                            {n}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Search */}
                                                <div className="relative">
                                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                                                    <input
                                                        type="text"
                                                        placeholder="SEARCH WALLET / ID..."
                                                        value={historyFilter.search}
                                                        onChange={e => setHistoryFilter(f => ({ ...f, search: e.target.value }))}
                                                        className="bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-[9px] font-black text-white placeholder:text-white/10 outline-none focus:border-[#3CB371]/40 w-48"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-white/5 text-left">
                                                        <th className="px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Trade ID / User</th>
                                                        <th className="px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Network</th>
                                                        <th className="px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Direction / Entry</th>
                                                        <th className="px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-center">Stake</th>
                                                        <th className="px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Result</th>
                                                        <th className="px-8 py-4 text-right text-[9px] font-black text-white/20 uppercase tracking-widest">Timestamp</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.02]">
                                                    {filteredHistory.map((trade, idx) => (
                                                        <tr key={idx} className="hover:bg-white/[0.01] transition-all group">
                                                            <td className="px-8 py-5">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-mono text-white">ID: {trade.publicKey?.slice(0, 8) || trade.id}...</span>
                                                                    <span className="text-[8px] text-white/20 font-black uppercase mt-0.5">{trade.owner?.slice(0, 6)}...{trade.owner?.slice(-4)}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5">
                                                                <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter ${trade.network === 'solana' ? 'bg-[#9945FF]/10 text-[#9945FF]' : 'bg-blue-500/10 text-blue-500'}`}>
                                                                    {trade.network === 'solana' ? 'SOLANA' : 'ARC'}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-5">
                                                                <div className="flex flex-col">
                                                                    <span className={`text-[10px] font-black ${trade.direction === 'UP' ? 'text-[#3CB371]' : 'text-red-500'} uppercase tracking-tighter`}>{trade.direction} @ ${parseFloat(trade.entryPrice || 0).toFixed(4)}</span>
                                                                    <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest mt-0.5">Duration: {trade.duration}s</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5 text-center">
                                                                <span className="text-[11px] font-black text-white">{parseFloat(trade.amount || 0).toFixed(4)} {trade.network === 'solana' ? 'SOL' : 'USDC'}</span>
                                                            </td>
                                                            <td className="px-8 py-5">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${trade.status === 'ACTIVE' ? 'bg-blue-400' : (trade.won || trade.status === 'WON' ? 'bg-[#3CB371]' : 'bg-red-500')}`} />
                                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${trade.status === 'ACTIVE' ? 'text-blue-400' : (trade.won || trade.status === 'WON' ? 'text-[#3CB371]' : 'text-red-500')}`}>
                                                                        {trade.status === 'ACTIVE' ? 'ACTIVE' : (trade.won || trade.status === 'WON' ? 'WON' : 'LOST')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5 text-right">
                                                                <span className="text-[9px] font-mono text-white/40">
                                                                    {new Date(trade.timestamp).toLocaleString()}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {filteredHistory.length === 0 && (
                                                        <tr>
                                                            <td colSpan="6" className="px-8 py-20 text-center opacity-20">
                                                                <Activity size={48} className="mx-auto mb-4" />
                                                                <p className="text-[10px] font-black uppercase tracking-widest">No trade history found.</p>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'disputes' && (
                                <motion.div
                                    key="disputes"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-[#0D0D0D] border border-white/5 rounded-[32px] overflow-hidden">
                                        <div className="p-6 lg:p-8 border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
                                                <h3 className="text-sm font-black uppercase tracking-widest text-white">Disputes Queue</h3>
                                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                                    {['PENDING', 'RESOLVED', 'ALL'].map(s => (
                                                        <button
                                                            key={s}
                                                            onClick={() => setDisputeFilterState(f => ({ ...f, status: s }))}
                                                            className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${disputeFilterState.status === s ? 'bg-[#3CB371] text-white' : 'text-white/20 hover:text-white'}`}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {selectedDisputeIds.length > 0 && (
                                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                                                    <button
                                                        onClick={() => handleBulkAction('SETTLE')}
                                                        className="px-4 py-2 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-white/10 hover:bg-white/10"
                                                    >
                                                        Settle ({selectedDisputeIds.length})
                                                    </button>
                                                    <button
                                                        onClick={() => handleBulkAction('REFUND')}
                                                        className="px-4 py-2 bg-[#FF4444]/20 text-[#FF4444] text-[10px] font-black uppercase tracking-widest rounded-lg border border-[#FF4444]/20 hover:bg-[#FF4444]/30"
                                                    >
                                                        Refund ({selectedDisputeIds.length})
                                                    </button>
                                                </motion.div>
                                            )}
                                        </div>
                                        <div className="overflow-x-auto custom-scrollbar">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-white/5">
                                                        <th className="w-12 px-8 py-4">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 rounded border-white/10 bg-black cursor-pointer"
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedDisputeIds(filteredDisputes.map(d => d.id));
                                                                    } else {
                                                                        setSelectedDisputeIds([]);
                                                                    }
                                                                }}
                                                                checked={selectedDisputeIds.length > 0 && selectedDisputeIds.length === filteredDisputes.length}
                                                            />
                                                        </th>
                                                        <th className="text-left px-8 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Network</th>
                                                        <th className="text-left px-8 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">User Address</th>
                                                        <th className="text-left px-8 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Category</th>
                                                        <th className="text-left px-8 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Amount</th>
                                                        <th className="text-left px-8 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Status</th>
                                                        <th className="text-right px-8 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredDisputes.map((dispute) => (
                                                        <tr
                                                            key={dispute.id}
                                                            className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer ${selectedDisputeIds.includes(dispute.id) ? 'bg-[#3CB371]/5' : ''}`}
                                                            onClick={() => { setSelectedDispute(dispute); setActiveCase(dispute); }}
                                                        >
                                                            <td className="px-8 py-6" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 rounded border-white/10 bg-black cursor-pointer"
                                                                    checked={selectedDisputeIds.includes(dispute.id)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setSelectedDisputeIds(prev => [...prev, dispute.id]);
                                                                        } else {
                                                                            setSelectedDisputeIds(prev => prev.filter(id => id !== dispute.id));
                                                                        }
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <span className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter bg-[#3CB371]/10 text-[#3CB371]">
                                                                    PROTOCOL
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-6 font-mono text-xs text-white">{dispute.user}</td>
                                                            <td className="px-8 py-6 text-xs text-white/60">{dispute.category}</td>
                                                            <td className="px-8 py-6 text-xs text-white/60 font-mono">{dispute.amount}</td>
                                                            <td className="px-8 py-6">
                                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${dispute.status === 'PENDING' ? 'bg-[#FF8C00]/20 text-[#FF8C00]' :
                                                                    dispute.status === 'REFUNDED' ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-white/10 text-white/40'
                                                                    }`}>
                                                                    {dispute.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-6 text-right">
                                                                <button
                                                                    className="text-[10px] font-black uppercase tracking-widest text-[#3CB371] hover:underline"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedDispute(dispute);
                                                                        setActiveCase(dispute);
                                                                    }}
                                                                >
                                                                    Review Case
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </motion.div>
                            )
                            }
                            {
                                activeTab === 'treasury' && (
                                    <motion.div
                                        key="treasury"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="space-y-8"
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                            <div className="flex flex-col">
                                                <h3 className="text-xl lg:text-2xl font-black text-white uppercase tracking-tighter">
                                                    {adminNetwork === 'SOLANA' ? 'Protocol Liquidity Reserve (SOL)' : 'Arc Treasury (USDC)'}
                                                </h3>
                                                <p className="text-[9px] lg:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                                                    {adminNetwork === 'SOLANA' ? 'Real-time Solana treasury monitoring & management portal.' : 'Automated platform reserve tracking for Arc Network.'}
                                                </p>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="bg-[#3CB371]/10 border border-[#3CB371]/20 px-6 py-3 rounded-2xl flex flex-col items-center flex-1 lg:flex-none">
                                                    <p className="text-[8px] font-black text-[#3CB371] uppercase tracking-widest mb-1">Global Health</p>
                                                    <p className="text-xl font-black text-white uppercase">Optimal</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-8">
                                            {/* Unified Treasury Card */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-10 rounded-[48px] relative overflow-hidden group">
                                                <div className="flex items-center gap-4 mb-10">
                                                    <div className="w-14 h-14 bg-[#3CB371]/10 rounded-2xl flex items-center justify-center border border-[#3CB371]/20">
                                                        <Database size={28} className="text-[#3CB371]" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-lg font-black text-white uppercase italic">Protocol Treasury</h4>
                                                        <p className="text-[9px] font-black text-[#3CB371] uppercase tracking-widest">Global Liquidity Vault</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-8">
                                                    <div>
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Available Balance</p>
                                                        <p className="text-3xl lg:text-5xl font-black text-white tracking-tighter tabular-nums leading-none">
                                                            {unifiedMetrics.displayReserve} <span className="text-sm lg:text-xl font-bold text-white/40">{unifiedMetrics.currencyUnit}</span>
                                                        </p>
                                                    </div>

                                                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl relative overflow-hidden">
                                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                                            <Lock size={24} />
                                                        </div>
                                                        <p className="text-[9px] font-black text-[#3CB371] uppercase tracking-[0.2em] mb-2">Treasury Authority Address</p>

                                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                                            {/* QR Code Container */}
                                                            {unifiedMetrics.reserveAddress && (
                                                                <div className="p-3 bg-white rounded-xl shadow-lg shrink-0">
                                                                    <QRCodeCanvas
                                                                        value={unifiedMetrics.reserveAddress}
                                                                        size={100}
                                                                        level="H"
                                                                        bgColor="#FFFFFF"
                                                                        fgColor="#000000"
                                                                    />
                                                                </div>
                                                            )}

                                                            <div className="flex-1 w-full space-y-4">
                                                                <div className="flex items-center gap-3">
                                                                    <p className="text-[11px] font-mono font-bold text-white break-all bg-black/40 p-3 rounded-xl border border-white/5 flex-1">
                                                                        {unifiedMetrics.reserveAddress || 'Scanning...'}
                                                                    </p>
                                                                    {unifiedMetrics.reserveAddress && (
                                                                        <button
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(unifiedMetrics.reserveAddress);
                                                                                notify('success', 'COPIED', 'Treasury address copied to clipboard.');
                                                                            }}
                                                                            className="p-3 bg-[#3CB371]/20 hover:bg-[#3CB371]/30 rounded-xl border border-[#3CB371]/30 text-[#3CB371] transition-all"
                                                                        >
                                                                            <Copy size={16} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest leading-relaxed">
                                                                    Scan to fund the {adminNetwork === 'SOLANA' ? 'Protocol Liquidity Reserve' : 'Arc Treasury'}.
                                                                    Direct transfers are automatically detected and credited to the vault balance.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => setActiveTab('vault')}
                                                        className="w-full py-5 bg-[#3CB371]/10 hover:bg-[#3CB371]/20 border border-[#3CB371]/10 text-[#3CB371] text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl transition-all"
                                                    >
                                                        Manage Liquidity
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Alert */}
                                        <div className="bg-[#1A1010] border border-red-500/20 p-6 lg:p-8 rounded-[40px] flex flex-col md:flex-row items-center justify-between gap-6">
                                            <div className="flex items-center gap-6">
                                                <div className="p-4 bg-red-500/20 rounded-2xl border border-red-500/30 w-fit">
                                                    <ShieldAlert className="text-red-500" size={32} />
                                                </div>
                                                <div>
                                                    <h5 className="text-sm font-black text-white uppercase tracking-tight">Emergency Protocol Notice</h5>
                                                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                                                        Treasury withdrawal triggers a platform-wide verification.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-4 w-full md:w-auto">
                                                <button
                                                    onClick={() => {
                                                        setTreasuryAction('WITHDRAW');
                                                        setActiveTab('vault');
                                                    }}
                                                    className="w-full md:px-8 py-4 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg"
                                                >
                                                    Emergency Drain
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'vault' && (
                                    <motion.div
                                        key="vault"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="space-y-8"
                                    >
                                        <div className="flex flex-col">
                                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Master Vault Intelligence</h3>
                                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Autonomous signature management & liquidity extraction portal.</p>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {/* Master Key Import */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                                                    <Lock size={120} />
                                                </div>
                                                <h4 className="text-sm font-black text-white uppercase mb-6 flex items-center gap-2">
                                                    <ShieldCheck size={16} className="text-[#3CB371]" />
                                                    Master Authority Link
                                                </h4>
                                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-6 leading-relaxed">
                                                    By linking a Master Secret Key (e.g. Keeper Key), the Citadel gains the ability to sign transactions autonomously. This is required for high-speed manual settlements without browser wallet popups.
                                                </p>

                                                <div className="space-y-5">
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1 mb-1.5 block">Secret Key Array</label>
                                                        <textarea
                                                            value={masterImportKey}
                                                            onChange={e => setMasterImportKey(e.target.value)}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-[9px] font-mono font-bold text-white outline-none focus:border-[#3CB371]/40 h-24 resize-none"
                                                            placeholder="[12, 45, 233, ...]"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={handleImportMaster}
                                                        className="w-full py-4 bg-[#3CB371] hover:bg-[#3CB371]/80 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-[0_10px_30px_rgba(60,179,113,0.3)]"
                                                    >
                                                        Link Root Authority
                                                    </button>
                                                    {masterKeypair && (
                                                        <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                                                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Linked Authority Address</p>
                                                            <p className="text-[10px] font-mono text-[#3CB371] break-all mt-1">{masterKeypair.publicKey.toBase58()}</p>
                                                            <p className="text-[14px] font-black text-[#3CB371] mt-2">{masterBalance.toFixed(4)} SOL</p>
                                                        </div>
                                                    )}

                                                    <div className="p-4 bg-[#3CB371]/5 border border-[#3CB371]/10 rounded-2xl">
                                                        <p className="text-[8px] font-black text-[#3CB371] uppercase tracking-widest">Target Treasury Address ({adminNetwork === 'SOLANA' ? 'Solana PDA' : 'Arc Keeper'})</p>
                                                        <p className="text-[9px] font-mono text-white/60 break-all mt-1">{unifiedMetrics.reserveAddress || 'Scanning...'}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Treasury Console */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none text-[#3CB371]">
                                                    <Coins size={120} />
                                                </div>
                                                <h4 className="text-sm font-black text-white uppercase mb-6 flex items-center gap-2">
                                                    <Coins size={16} className="text-[#3CB371]" />
                                                    Treasury Console
                                                </h4>
                                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-6 leading-relaxed">
                                                    Directly manage protocol liquidity. Deposits inject capital into the Program PDA. Withdrawals transfer funds to the active Authority wallet.
                                                </p>

                                                <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5 mb-6">
                                                    <button
                                                        onClick={() => setTreasuryAction('DEPOSIT')}
                                                        className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${treasuryAction === 'DEPOSIT' ? 'bg-[#3CB371] text-white shadow-lg' : 'text-white/20 hover:text-white'}`}
                                                    >
                                                        Deposit
                                                    </button>
                                                    <button
                                                        onClick={() => setTreasuryAction('WITHDRAW')}
                                                        className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${treasuryAction === 'WITHDRAW' ? 'bg-red-500 text-white shadow-lg' : 'text-white/20 hover:text-white'}`}
                                                    >
                                                        Withdraw
                                                    </button>
                                                </div>

                                                <form className="space-y-5" onSubmit={(e) => {
                                                    e.preventDefault();
                                                    const formData = new FormData(e.target);
                                                    handleTreasuryAction(parseFloat(formData.get('amt')));
                                                }}>
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1 mb-1.5 block">Amount (SOL)</label>
                                                        <div className="relative">
                                                            <input
                                                                name="amt"
                                                                type="number"
                                                                step="0.0001"
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white outline-none focus:border-[#3CB371]/40"
                                                                placeholder={treasuryAction === 'WITHDRAW' ? `Max: ${treasuryStats.balance.toFixed(4)}` : "0.00"}
                                                                required
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    const input = e.target.parentElement.querySelector('input');
                                                                    if (treasuryAction === 'DEPOSIT') {
                                                                        input.value = Math.max(0, masterBalance - 0.005).toFixed(4);
                                                                    } else {
                                                                        const max = treasuryStats.balance;
                                                                        input.value = max.toFixed(4);
                                                                    }
                                                                }}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#3CB371] hover:underline"
                                                            >
                                                                MAX
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="submit"
                                                        disabled={!masterKeypair && !adminWallet.publicKey}
                                                        className={`w-full py-4 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${treasuryAction === 'DEPOSIT' ? 'bg-[#3CB371] hover:bg-[#3CB371]/80 shadow-[0_10px_30px_rgba(60,179,113,0.3)]' : 'bg-red-600 hover:bg-red-500 shadow-[0_10px_30px_rgba(255,0,0,0.2)]'}`}
                                                    >
                                                        {treasuryAction === 'DEPOSIT' ? 'Inject Liquidity' : 'Execute Withdrawal'}
                                                    </button>

                                                    <div
                                                        className="text-center pt-2 cursor-pointer opacity-20 hover:opacity-100 transition-opacity"
                                                        onClick={() => {
                                                            const dest = prompt("Enter emergency drain destination address:");
                                                            if (dest) drainAuthorityWallet(dest, masterBalance); // Drain max
                                                        }}
                                                    >
                                                        <p className="text-[8px] font-black text-red-500 uppercase tracking-widest">⚠ Emergency: Drain Authority Wallet</p>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>

                                        <div className="bg-[#1A1010] border border-red-500/20 p-6 rounded-[32px]">
                                            <div className="flex items-center gap-4">
                                                <ShieldAlert className="text-red-500 shrink-0" size={24} />
                                                <div>
                                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Protocol Advisory: Treasury PDA Logic</p>
                                                    <p className="text-[9px] text-white/40 uppercase font-bold mt-1 leading-relaxed">
                                                        The Treasury Account is a secure Program Derived Address (PDA). Funds are autonomously managed by the protocol based on trade outcomes (Wins/Losses).
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'listing' && (
                                    <motion.div
                                        key="listing"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="space-y-8"
                                    >
                                        {/* Section Header */}
                                        <div className="flex flex-col mb-4 lg:mb-8">
                                            <h3 className="text-lg lg:text-xl font-black text-white uppercase tracking-tighter">Market Provisioning</h3>
                                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Configure & deploy tradable pairs with live liquidity feeds.</p>
                                        </div>

                                        {/* Suggestions Row */}
                                        <div className="bg-[#0D0D0D] border border-white/5 p-6 rounded-[32px] overflow-hidden">
                                            <h4 className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">Verified Bluechips</h4>
                                            <div className="flex flex-wrap gap-2 lg:gap-3">
                                                {VERIFIED_SUGGESTIONS.map(token => {
                                                    const isListed = listedTokens.some(t => t.id === token.id);
                                                    return (
                                                        <button
                                                            key={token.id}
                                                            onClick={() => !isListed && handleListToken(token)}
                                                            className={`px-3 lg:px-5 py-2 lg:py-3 rounded-xl lg:rounded-2xl flex items-center gap-2 lg:gap-3 border transition-all ${isListed
                                                                ? 'bg-[#3CB371]/10 border-[#3CB371]/20 text-[#3CB371]'
                                                                : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10'}`}
                                                        >
                                                            <span className="text-[10px] lg:text-xs font-black uppercase">{token.symbol}</span>
                                                            <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
                                                            <span className="text-[9px] lg:text-[10px] font-bold opacity-60 hidden sm:block">{token.name}</span>
                                                            {!isListed && <PlusCircle size={12} className="ml-1 opacity-40 shrink-0" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                            {/* Manual Entry Form */}
                                            <div className="lg:col-span-4 bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                                                    <Zap size={140} />
                                                </div>

                                                <h3 className="text-sm font-black text-white uppercase mb-6 flex items-center gap-2">
                                                    <PlusCircle size={16} className="text-[#3CB371]" />
                                                    Custom Token List
                                                </h3>

                                                <div className="space-y-5 relative z-10">
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1 mb-1.5 block">Mint Address</label>
                                                        <input
                                                            type="text"
                                                            value={newTokenForm.mint}
                                                            onChange={e => setNewTokenForm({ ...newTokenForm, mint: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono font-bold text-white outline-none focus:border-[#3CB371]/40"
                                                            placeholder="Solana Mint Pubkey..."
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1 mb-1.5 block">Pair Symbol</label>
                                                            <input
                                                                type="text"
                                                                value={newTokenForm.symbol}
                                                                onChange={e => setNewTokenForm({ ...newTokenForm, symbol: e.target.value.toUpperCase() })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white outline-none focus:border-[#3CB371]/40"
                                                                placeholder="e.g. MON"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1 mb-1.5 block">Pair Name</label>
                                                            <input
                                                                type="text"
                                                                value={newTokenForm.name}
                                                                onChange={e => setNewTokenForm({ ...newTokenForm, name: e.target.value })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-bold text-white outline-none focus:border-[#3CB371]/40"
                                                                placeholder="Project Name"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1 mb-1.5 block">Moralis Pair Address (Widget)</label>
                                                        <input
                                                            type="text"
                                                            value={newTokenForm.pair}
                                                            onChange={e => setNewTokenForm({ ...newTokenForm, pair: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono font-bold text-white outline-none focus:border-[#3CB371]/40"
                                                            placeholder="AMM Pair Address..."
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            if (!newTokenForm.symbol || !newTokenForm.mint || !newTokenForm.pair) {
                                                                notify('error', 'INCOMPLETE DATA', 'Fill all critical fields (Symbol, Mint, Pair) to initialize market.');
                                                                return;
                                                            }
                                                            handleListToken(newTokenForm);
                                                            setNewTokenForm({ symbol: '', name: '', mint: '', pair: '', pythId: '', binance: '' });
                                                        }}
                                                        className="w-full bg-[#3CB371] text-white py-4.5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:scale-[1.02] transition-all shadow-[0_10px_30px_rgba(60,179,113,0.3)]"
                                                    >
                                                        Initialize Market Pair
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Active Tokens Table */}
                                            <div className="lg:col-span-8 bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden">
                                                <div className="p-6 lg:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Active Deployments</h3>
                                                    <div className="w-fit px-4 py-1.5 bg-[#3CB371]/10 border border-[#3CB371]/20 rounded-lg text-[9px] font-black text-[#3CB371] uppercase tracking-widest">
                                                        {listedTokens.length} Markets Ready
                                                    </div>
                                                </div>
                                                <div className="max-h-[600px] overflow-x-auto custom-scrollbar">
                                                    <table className="w-full">
                                                        <thead className="bg-[#050505]">
                                                            <tr>
                                                                <th className="text-left px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Market Asset</th>
                                                                <th className="text-left px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Oracle Links</th>
                                                                <th className="text-center px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Configuration</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/[0.02]">
                                                            {listedTokens.map((token) => (
                                                                <tr key={token.id} className={`group hover:bg-white/[0.01] transition-all ${token.id === activeTokenId ? 'bg-[#3CB371]/[0.02]' : ''}`}>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm relative ${token.id === activeTokenId ? 'bg-[#3CB371] text-black shadow-[0_0_20px_rgba(60,179,113,0.4)]' : 'bg-white/5 text-white/40'}`}>
                                                                                {token.symbol.slice(0, 2)}
                                                                                {token.id === activeTokenId && (
                                                                                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white rounded-full flex items-center justify-center border-2 border-[#3CB371]">
                                                                                        <div className="w-1.5 h-1.5 bg-[#3CB371] rounded-full animate-pulse" />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-xs font-black text-white uppercase">{token.name}</p>
                                                                                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-0.5">{token.symbol}/USDC</p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40" />
                                                                                <p className="text-[9px] font-mono text-white/30 truncate w-32">{token.mint}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/40" />
                                                                                <p className="text-[9px] font-mono text-[#3CB371] truncate w-32">{token.pair}</p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex items-center justify-center gap-3">
                                                                            {token.id === activeTokenId ? (
                                                                                <div className="px-4 py-2 bg-[#3CB371]/10 border border-[#3CB371]/20 rounded-xl text-[9px] font-black text-[#3CB371] uppercase tracking-widest flex items-center gap-2">
                                                                                    <Activity size={10} className="animate-pulse" />
                                                                                    Active
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => handleSetActiveMarket(token.id)}
                                                                                    className="px-4 py-2 bg-white/5 hover:bg-[#3CB371] text-white/40 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border border-white/5"
                                                                                >
                                                                                    Switch To
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => handleDelistToken(token.id)}
                                                                                className="p-2 hover:bg-red-500/10 text-white/10 hover:text-red-500 rounded-xl transition-colors"
                                                                            >
                                                                                <AlertCircle size={16} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'globe' && (
                                    <motion.div
                                        key="globe"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="h-[calc(100vh-140px)] w-full relative"
                                    >
                                        <GlobalExpansionMap
                                            theme="dark"
                                            currentNetwork={adminNetwork}
                                            activeBets={unifiedMetrics.activeList}
                                            isFullscreen={true}
                                        />
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'directory' && (
                                    <motion.div
                                        key="directory"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <div className="bg-[#0D0D0D] border border-white/5 rounded-[32px] overflow-hidden">
                                            <div className="p-6 lg:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex flex-col">
                                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Network User Directory</h3>
                                                    <p className="text-[9px] text-white/20 font-bold uppercase mt-1">Verified identities & social links</p>
                                                </div>
                                                <div className="flex items-center gap-4 text-[9px] lg:text-[10px] font-black text-[#3CB371] uppercase w-fit">
                                                    <div className="h-2 w-2 rounded-full bg-[#3CB371] animate-pulse" />
                                                    {userProfiles.length} Total Profiles
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="bg-white/[0.02] border-b border-white/5">
                                                            <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-widest">Operator Address</th>
                                                            <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-widest">X (Twitter)</th>
                                                            <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Wins/Total</th>
                                                            <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-widest text-right">Volume</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {userProfiles.length > 0 ? userProfiles.sort((a, b) => b.trades - a.trades).map((profile) => (
                                                            <tr key={profile.address} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors group">
                                                                <td className="px-8 py-6">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                                                            <User size={16} className="text-white/20 group-hover:text-[#3CB371] transition-colors" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs font-black text-white">{profile.username || "Anonymous Operator"}</p>
                                                                            <p className="text-[10px] font-mono text-white/20">{profile.address.slice(0, 12)}...</p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    {profile.xHandle ? (
                                                                        <div className="flex items-center gap-2 text-[#1DA1F2] bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 px-3 py-1.5 rounded-lg w-fit">
                                                                            <Globe size={12} />
                                                                            <span className="text-[10px] font-black uppercase tracking-widest">@{profile.xHandle}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">Not Linked</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-8 py-6 text-center">
                                                                    <div className="text-xs font-black text-white">{profile.wins} <span className="text-white/20">/</span> {profile.trades}</div>
                                                                    <div className="text-[9px] font-bold text-[#3CB371] uppercase tracking-[0.2em]">{profile.trades > 0 ? ((profile.wins / profile.trades) * 100).toFixed(0) : 0}% WR</div>
                                                                </td>
                                                                <td className="px-8 py-6 text-right">
                                                                    <p className="text-xs font-black text-white">{profile.volume} SOL</p>
                                                                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Life Vol</p>
                                                                </td>
                                                            </tr>
                                                        )) : (
                                                            <tr>
                                                                <td colSpan="4" className="py-20 text-center">
                                                                    <div className="flex flex-col items-center gap-4 opacity-20">
                                                                        <Shield size={48} />
                                                                        <p className="text-[10px] font-black uppercase tracking-widest">Database Clear: No Active Profiles</p>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'staff' && (
                                    <motion.div
                                        key="staff"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="bg-[#0D0D0D] border border-white/5 rounded-[32px] overflow-hidden"
                                    >
                                        <div className="p-6 lg:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex flex-col">
                                                <h3 className="text-sm font-black uppercase tracking-widest text-white">Authorized Staff</h3>
                                                <p className="text-[9px] text-white/20 font-bold uppercase mt-1">Manage infrastructure access & roles</p>
                                            </div>
                                            <button
                                                onClick={() => setIsStaffModalOpen(true)}
                                                className="w-fit flex items-center gap-2 px-6 py-2 bg-[#3CB371] text-white text-[10px] font-black uppercase tracking-widest rounded-lg"
                                            >
                                                <PlusCircle size={14} />
                                                Assign New Role
                                            </button>
                                        </div>
                                        <div className="p-8">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {staffMembers.map((staff) => (
                                                    <div key={staff.id} className="p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                                                                <Users size={20} className="text-white/40 group-hover:text-[#3CB371] transition-colors" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-black text-white truncate w-32">{staff.address}</p>
                                                                <p className="text-[9px] font-bold text-[#3CB371] uppercase tracking-widest">{staff.role}</p>
                                                                <p className="text-[8px] font-mono text-white/20 mt-1">{staff.key}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-3">
                                                            <div className={`w-2 h-2 rounded-full ${staff.status === 'ACTIVE' ? 'bg-[#3CB371] animate-pulse' : 'bg-white/10'}`} />
                                                            {staff.id !== 1 && (
                                                                <button
                                                                    onClick={() => handleRevokeRole(staff.id)}
                                                                    className="p-2 hover:bg-red-500/10 text-white/20 hover:text-red-500 rounded-lg transition-colors group/btn"
                                                                    title="Revoke Access"
                                                                >
                                                                    <LogOut size={14} className="group-hover/btn:scale-110 transition-transform" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'campaigns' && (
                                    <motion.div
                                        key="campaigns"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-8 pb-10"
                                    >
                                        {/* Campaign Creator */}
                                        <div className="bg-[#0D0D0D] border border-white/5 rounded-[40px] p-8 overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                                            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                                                <Trophy size={160} />
                                            </div>
                                            <div className="flex flex-col gap-6 relative z-10">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                                                    <div className="p-3 bg-yellow-500/20 rounded-2xl border border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)] w-fit">
                                                        <Trophy className="text-yellow-500" size={24} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg lg:text-xl font-black text-white uppercase tracking-tight">Initialize New Campaign</h3>
                                                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Competitions for leaderboards & prizes</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Campaign Title</label>
                                                        <input
                                                            type="text"
                                                            value={newCampaign.title}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                                                            placeholder="Weekly Alpha Race..."
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 transition-all font-bold"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Duration & Prize (Optional)</label>
                                                        <input
                                                            type="text"
                                                            value={newCampaign.prize}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, prize: e.target.value })}
                                                            placeholder="e.g. 10.0 SOL / 500 USDC"
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 transition-all font-bold"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Start Date & Time</label>
                                                        <input
                                                            type="datetime-local"
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, startTime: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white/80 outline-none focus:border-yellow-500/40 transition-all font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">End Date & Time</label>
                                                        <input
                                                            type="datetime-local"
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, endTime: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white/80 outline-none focus:border-yellow-500/40 transition-all font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Target Network</label>
                                                        <select
                                                            value={newCampaign.network}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, network: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 appearance-none font-black uppercase tracking-widest"
                                                        >
                                                            <option value="general">PLATFORM WIDE</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Recurrence Cycle</label>
                                                        <select
                                                            value={newCampaign.reboot}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, reboot: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 appearance-none font-black uppercase tracking-widest"
                                                        >
                                                            <option value="none">SINGLE EVENT</option>
                                                            <option value="daily">REBOOT DAILY</option>
                                                            <option value="weekly">REBOOT WEEKLY</option>
                                                            <option value="monthly">REBOOT MONTHLY</option>
                                                        </select>
                                                    </div>
                                                    <div className="md:col-span-2 flex items-end">
                                                        <button
                                                            onClick={handleCreateCampaign}
                                                            className="w-full bg-yellow-500 text-black py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_30px_rgba(234,179,8,0.2)]"
                                                        >
                                                            Deploy Live Campaign
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* History/Active Campaigns */}
                                        <div className="bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
                                            <div className="p-6 lg:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-white/[0.02] gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                                                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Competition Registry</h3>
                                                </div>
                                                <div className="w-fit px-4 py-1.5 bg-white/5 rounded-lg text-[9px] font-black text-white/40 uppercase tracking-widest border border-white/10">
                                                    {campaigns.length} Active Records
                                                </div>
                                            </div>
                                            <div className="divide-y divide-white/[0.02]">
                                                {campaigns.map(camp => (
                                                    <div key={camp.id} className="p-6 lg:p-8 group hover:bg-white/[0.01] transition-all">
                                                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                                                            <div className="flex flex-col sm:flex-row gap-6">
                                                                <div className={`p-5 rounded-2xl border shrink-0 h-fit ${Date.now() < camp.endTime && Date.now() > camp.startTime ? 'bg-[#3CB371]/10 border-[#3CB371]/20 text-[#3CB371]' : 'bg-white/5 border-white/10 text-white/20'}`}>
                                                                    <Calendar size={28} />
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center flex-wrap gap-3 mb-2">
                                                                        <h4 className="text-xl font-black text-white uppercase tracking-tight">{camp.title}</h4>
                                                                        <div className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase border ${camp.network === 'solana' ? 'bg-[#3CB371]/10 border-[#3CB371]/30 text-[#3CB371]' : camp.network === 'arc' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' : 'bg-white/10 border-white/20 text-white/40'}`}>
                                                                            {camp.network.toUpperCase()}
                                                                        </div>
                                                                        {Date.now() < camp.endTime && Date.now() > camp.startTime && (
                                                                            <div className="flex items-center gap-2 px-2.5 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-md text-[8px] font-black text-yellow-500 uppercase animate-pulse">
                                                                                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                                                                                Live Now
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest leading-relaxed mb-6">
                                                                        Timeline: {new Date(camp.startTime).toLocaleString()} — {new Date(camp.endTime).toLocaleString()}
                                                                    </p>
                                                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
                                                                        <div className="flex flex-col">
                                                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1.5">Recurrence</p>
                                                                            <p className="text-[10px] font-black text-white uppercase tracking-widest bg-white/5 py-1.5 px-3 rounded-lg border border-white/5 w-fit">{camp.reboot?.toUpperCase() || 'MANUAL'}</p>
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1.5">Prize Pool</p>
                                                                            <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 py-1.5 px-3 rounded-lg border border-yellow-500/10 w-fit">{camp.prize || 'COMMUNITY PRIDE'}</p>
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1.5">Enrollment</p>
                                                                            <p className="text-[10px] font-black text-white uppercase tracking-widest bg-white/5 py-1.5 px-3 rounded-lg border border-white/5 w-fit">{enrollmentsMap[camp.id] || 0} OPERATORS</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-3 min-w-[140px]">
                                                                <button
                                                                    onClick={() => handleViewAnalytics(camp.id)}
                                                                    className="px-6 py-3 bg-[#3CB371]/10 hover:bg-[#3CB371] text-[#3CB371] hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-[#3CB371]/20 transition-all hover:scale-105"
                                                                >
                                                                    📊 Data & Ranks
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteCampaign(camp.id)}
                                                                    className="px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-red-500/20 transition-all hover:scale-105"
                                                                >
                                                                    Purge Record
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Winner Declaration Expansion */}
                                                        <div className="mt-8 pt-8 border-t border-white/5">
                                                            <div className="flex items-center gap-3 mb-6">
                                                                <div className="w-1 h-4 bg-yellow-500 rounded-full" />
                                                                <h5 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Victory Broadcast Console</h5>
                                                            </div>
                                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                                                                <div className="lg:col-span-5 space-y-2">
                                                                    <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Champion Wallet Address</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Enter winning pubkey..."
                                                                        value={winnersMap[camp.id] || ''}
                                                                        onChange={(e) => setWinnersMap({ ...winnersMap, [camp.id]: e.target.value })}
                                                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-[10px] font-mono text-[#3CB371] outline-none focus:border-[#3CB371]/40 transition-all"
                                                                    />
                                                                </div>
                                                                <div className="lg:col-span-4 space-y-2">
                                                                    <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Avatar Content URL</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="https://images.unsplash.com/..."
                                                                        value={winnerImages[camp.id] || ''}
                                                                        onChange={(e) => setWinnerImages({ ...winnerImages, [camp.id]: e.target.value })}
                                                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-[10px] font-mono text-white/40 outline-none focus:border-white/20 transition-all"
                                                                    />
                                                                </div>
                                                                <div className="lg:col-span-3">
                                                                    <button
                                                                        onClick={() => handlePublishWinner(camp)}
                                                                        className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-[#3CB371] border border-white/10 hover:border-[#3CB371] text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all group/win"
                                                                    >
                                                                        <ImageIcon size={14} className="group-hover/win:rotate-12 transition-transform" />
                                                                        Push Global Winner
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {campaigns.length === 0 && (
                                                    <div className="py-24 text-center">
                                                        <div className="w-20 h-20 bg-white/[0.02] rounded-[32px] border border-white/5 flex items-center justify-center mx-auto mb-6">
                                                            <Calendar className="text-white/10" size={32} />
                                                        </div>
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">No campaigns currently operational</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {selectedCampaignForAnalytics && (
                                                <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.95 }}
                                                        className="bg-[#0D0D0D] border border-white/10 w-full max-w-5xl h-[80vh] rounded-[32px] overflow-hidden flex flex-col shadow-2xl"
                                                    >
                                                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 bg-[#3CB371]/10 rounded-2xl flex items-center justify-center border border-[#3CB371]/20">
                                                                    <BarChartIcon className="text-[#3CB371]" size={24} />
                                                                </div>
                                                                <div>
                                                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">{selectedCampaignForAnalytics.title}</h3>
                                                                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Live Campaign Analytics</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectedCampaignForAnalytics(null)}
                                                                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                                                            >
                                                                <X size={20} className="text-white/60" />
                                                            </button>
                                                        </div>

                                                        <div className="flex-1 overflow-auto p-8">
                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                                <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[600px]">
                                                                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                                                        <h4 className="text-xs font-black text-white uppercase tracking-widest">🏆 Leaderboard</h4>
                                                                        <div className="px-3 py-1 bg-[#3CB371]/10 rounded-lg border border-[#3CB371]/20 text-[9px] font-bold text-[#3CB371] uppercase">Top 50</div>
                                                                    </div>
                                                                    <div className="overflow-auto flex-1">
                                                                        <table className="w-full">
                                                                            <thead className="bg-white/5">
                                                                                <tr>
                                                                                    <th className="px-6 py-4 text-left text-[9px] font-black text-white/30 uppercase tracking-widest">Rank</th>
                                                                                    <th className="px-6 py-4 text-left text-[9px] font-black text-white/30 uppercase tracking-widest">Trader</th>
                                                                                    <th className="px-6 py-4 text-right text-[9px] font-black text-white/30 uppercase tracking-widest">Win Rate</th>
                                                                                    <th className="px-6 py-4 text-right text-[9px] font-black text-white/30 uppercase tracking-widest">PnL</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-white/5">
                                                                                {leaderboardData.map((row, i) => (
                                                                                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                                                        <td className="px-6 py-4">
                                                                                            {i === 0 ? '👑' : i + 1}
                                                                                        </td>
                                                                                        <td className="px-6 py-4 text-xs font-mono font-bold text-white/80">{row.address.slice(0, 8)}...</td>
                                                                                        <td className="px-6 py-4 text-right text-xs font-bold text-[#3CB371]">{row.winRate.toFixed(1)}%</td>
                                                                                        <td className="px-6 py-4 text-right text-xs font-bold text-white">{row.pnl > 0 ? '+' : ''}{row.pnl.toFixed(4)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                                {leaderboardData.length === 0 && (
                                                                                    <tr><td colSpan="4" className="text-center py-12 text-white/20 text-xs font-black uppercase">No active participants</td></tr>
                                                                                )}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>

                                                                <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[600px]">
                                                                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                                                        <h4 className="text-xs font-black text-white uppercase tracking-widest">⚡ Live Feed</h4>
                                                                        <div className="px-3 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20 text-[9px] font-bold text-blue-500 uppercase">{campaignTradesData.length} Trades</div>
                                                                    </div>
                                                                    <div className="overflow-auto flex-1 p-4 space-y-2">
                                                                        {campaignTradesData.sort((a, b) => b.timestamp - a.timestamp).map((t, i) => (
                                                                            <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className={`w-2 h-2 rounded-full ${t.won ? 'bg-[#3CB371]' : 'bg-red-500'}`} />
                                                                                    <div>
                                                                                        <p className="text-[10px] font-bold text-white mb-0.5">{t.address.slice(0, 6)}...</p>
                                                                                        <p className="text-[8px] font-mono text-white/30">{new Date(t.timestamp).toLocaleTimeString()}</p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <p className={`text-xs font-black ${t.won ? 'text-[#3CB371]' : 'text-red-500'}`}>
                                                                                        {t.won ? '+' : ''}{t.amount} SOL
                                                                                    </p>
                                                                                    <p className="text-[8px] font-bold text-white/20 uppercase">{t.won ? 'WON' : 'LOST'}</p>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                        {campaignTradesData.length === 0 && (
                                                                            <div className="text-center py-12 text-white/20 text-xs font-black uppercase">No recent activity</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'broadcasts' && (
                                    <motion.div
                                        key="broadcasts"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <div className="bg-[#0D0D0D] border border-white/5 rounded-[32px] overflow-hidden">
                                            <div className="p-6 lg:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex flex-col">
                                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Broadcast History</h3>
                                                    <p className="text-[9px] text-white/20 font-bold uppercase mt-1">Global platform alerts & override status</p>
                                                </div>
                                                <button
                                                    onClick={() => setIsBroadcastModalOpen(true)}
                                                    className="w-fit flex items-center gap-2 px-6 py-2 bg-[#3CB371] text-white text-[10px] font-black uppercase tracking-widest rounded-lg"
                                                >
                                                    <Megaphone size={14} />
                                                    New Memo
                                                </button>
                                            </div>
                                            <div className="p-8">
                                                <div className="space-y-4">
                                                    {broadcasts.length > 0 ? broadcasts.map((b) => (
                                                        <div key={b.id} className="p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                                                            <div className="flex items-center gap-6">
                                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${b.type === 'EMERGENCY' ? 'bg-red-500/10 text-red-500' : 'bg-[#3CB371]/10 text-[#3CB371]'}`}>
                                                                    <Megaphone size={20} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black text-white uppercase">{b.text}</p>
                                                                    <div className="flex items-center gap-4 mt-1">
                                                                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">ISSUED BY: {b.sender}</p>
                                                                        <p className="text-[10px] font-bold text-[#3CB371] uppercase tracking-widest flex items-center gap-1">
                                                                            <Clock size={10} />
                                                                            {Math.max(0, Math.floor((b.expiry - Date.now()) / 1000))}s REMAINING
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const updated = broadcasts.filter(item => item.id !== b.id);
                                                                    setBroadcasts(updated);
                                                                    localStorage.setItem('15market_admin_broadcast', JSON.stringify(updated));
                                                                }}
                                                                className="px-4 py-2 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-red-500 rounded-lg border border-white/5"
                                                            >
                                                                Halt
                                                            </button>
                                                        </div>
                                                    )) : (
                                                        <div className="text-center py-12 text-white/20 uppercase font-black tracking-widest text-[10px]">No active broadcasts</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }
                            {
                                activeTab === 'terminal' && (
                                    <motion.div
                                        key="terminal"
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="h-[70vh] flex flex-col bg-black/80 border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-3xl shadow-2xl"
                                    >
                                        <div className="p-6 lg:p-8 border-b border-white/5 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-black rounded-xl border border-[#3CB371]/30 flex items-center justify-center shrink-0">
                                                    <TerminalIcon className="text-[#3CB371]" size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">PROTOCOL_TERMINAL</h3>
                                                    <p className="text-[10px] text-[#3CB371] font-bold uppercase tracking-[0.2em]">Live Stream Active</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 w-fit">
                                                <div className="h-2 w-2 rounded-full bg-[#3CB371] animate-ping" />
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Node Connected</span>
                                            </div>
                                        </div>


                                        <div className="flex-1 overflow-y-auto p-8 font-mono space-y-2 text-xs custom-scrollbar bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-90">
                                            {keeperLogs.length > 0 ? keeperLogs.map(log => (
                                                <div key={log.id} className="flex gap-4 group">
                                                    <span className="text-white/20 select-none w-20 shrink-0">[{log.timestamp}]</span>
                                                    <span className={`w-14 shrink-0 font-black tracking-tighter ${log.type === 'ERROR' ? 'text-red-500' :
                                                        log.type === 'WARN' ? 'text-yellow-500' :
                                                            'text-[#3CB371]'
                                                        }`}>
                                                        {log.type}
                                                    </span>
                                                    <span className="text-white/80 whitespace-pre-wrap leading-relaxed group-hover:text-white transition-colors">{log.message}</span>
                                                </div>
                                            )) : (
                                                <div className="h-full flex flex-col items-center justify-center text-white/20 gap-4">
                                                    <div className="w-12 h-12 border-2 border-white/5 border-t-[#3CB371] rounded-full animate-spin" />
                                                    <p className="font-black uppercase tracking-widest text-[10px]">Awaiting First Data Packet...</p>
                                                </div>
                                            )}
                                            <div className="h-4" />
                                        </div>

                                        <div className="p-4 bg-black/40 border-t border-white/5 flex items-center justify-between px-8">
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">
                                                Root Execution Domain: 15market.internal.node
                                            </p>
                                            <button
                                                onClick={() => setKeeperLogs([])}
                                                className="text-[9px] font-black text-[#FF4444] hover:text-[#FF4444]/80 uppercase tracking-widest px-4 py-2 border border-[#FF4444]/20 rounded-lg transition-all"
                                            >
                                                Flush Local Buffer
                                            </button>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                activeTab === 'settings' && (
                                    <motion.div
                                        key="settings"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-8"
                                    >
                                        <div className="flex flex-col mb-4 lg:mb-8">
                                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">System Configuration</h3>
                                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Fine-tune protocol parameters and platform governance.</p>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {/* Governance & Limits */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] space-y-8">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-[#3CB371]/10 rounded-2xl">
                                                        <Gavel size={24} className="text-[#3CB371]" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white uppercase">Trading Governance</h4>
                                                        <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest">Enforce risk limits and market status</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="grid grid-cols-2 gap-6">
                                                        <div>
                                                            <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Min Bet Size (SOL)</label>
                                                            <input
                                                                type="number"
                                                                value={platformSettings.minBet}
                                                                onChange={(e) => updateSetting('minBet', parseFloat(e.target.value))}
                                                                className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-xs font-black text-white outline-none focus:border-[#3CB371]/40"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Max Bet Size (SOL)</label>
                                                            <input
                                                                type="number"
                                                                value={platformSettings.maxBet}
                                                                onChange={(e) => updateSetting('maxBet', parseFloat(e.target.value))}
                                                                className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-xs font-black text-white outline-none focus:border-[#3CB371]/40"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5">
                                                        <div>
                                                            <p className="text-xs font-black text-white uppercase">Global Kill Switch</p>
                                                            <p className="text-[9px] text-white/20 uppercase font-bold mt-1">Instantly halt all trade placements</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleToggleSetting('tradingHalted')}
                                                            className={`w-14 h-8 rounded-full transition-all relative ${platformSettings.tradingHalted ? 'bg-red-500' : 'bg-white/10'}`}
                                                        >
                                                            <motion.div
                                                                animate={{ x: platformSettings.tradingHalted ? 28 : 4 }}
                                                                className="w-5 h-5 bg-white rounded-full absolute top-1.5 shadow-lg"
                                                            />
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5">
                                                        <div>
                                                            <p className="text-xs font-black text-white uppercase">Maintenance Mode</p>
                                                            <p className="text-[9px] text-white/20 uppercase font-bold mt-1">Show "Under Maintenance" to users</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleToggleSetting('maintenanceMode')}
                                                            className={`w-14 h-8 rounded-full transition-all relative ${platformSettings.maintenanceMode ? 'bg-[#3CB371]' : 'bg-white/10'}`}
                                                        >
                                                            <motion.div
                                                                animate={{ x: platformSettings.maintenanceMode ? 28 : 4 }}
                                                                className="w-5 h-5 bg-white rounded-full absolute top-1.5 shadow-lg"
                                                            />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Protocol Parameters (Immutable from contract) */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] space-y-8">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-blue-500/10 rounded-2xl">
                                                        <Lock size={24} className="text-blue-500" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white uppercase">Protocol Constants</h4>
                                                        <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest">Hardcoded smart contract logic</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-white/40 uppercase">5s Multiplier</span>
                                                        <span className="text-xs font-black text-[#3CB371]">6.90x (590% Prof)</span>
                                                    </div>
                                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-white/40 uppercase">10s Multiplier</span>
                                                        <span className="text-xs font-black text-[#3CB371]">4.90x (390% Prof)</span>
                                                    </div>
                                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-white/40 uppercase">15s Multiplier</span>
                                                        <span className="text-xs font-black text-[#3CB371]">1.98x (98% Prof)</span>
                                                    </div>
                                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center gap-4">
                                                        <AlertCircle size={14} className="text-yellow-500 shrink-0" />
                                                        <p className="text-[8px] font-bold text-yellow-500 uppercase leading-relaxed">
                                                            Multiplier logic is currently immutable and governed by the Protocol smart contract. Redeployment required to modify.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Technical Stack */}
                                            <div className="lg:col-span-2 bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] space-y-8">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-3 bg-purple-500/10 rounded-2xl">
                                                            <Cpu size={24} className="text-purple-500" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-black text-white uppercase">Operational Stack</h4>
                                                            <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest">Infrastructure and Connectivity</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={handleSaveSettings}
                                                        className="w-fit flex items-center gap-2 px-6 py-3 bg-[#3CB371] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_10px_20px_rgba(60,179,113,0.3)]"
                                                    >
                                                        <Save size={14} />
                                                        Apply Config
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Treasury Warning (SOL)</label>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={platformSettings.treasuryThreshold}
                                                            onChange={(e) => updateSetting('treasuryThreshold', parseFloat(e.target.value))}
                                                            className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-purple-500/40"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Max Concurrent Trades</label>
                                                        <input
                                                            type="number"
                                                            value={platformSettings.maxConcurrentTrades}
                                                            onChange={(e) => updateSetting('maxConcurrentTrades', parseInt(e.target.value))}
                                                            className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-purple-500/40"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Default Broadcast TTL (s)</label>
                                                        <input
                                                            type="number"
                                                            value={platformSettings.defaultBroadcastDuration}
                                                            onChange={(e) => updateSetting('defaultBroadcastDuration', parseInt(e.target.value))}
                                                            className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-purple-500/40"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">RPC Endpoint Node</label>
                                                        <input
                                                            type="text"
                                                            value={platformSettings.rpcEndpoint}
                                                            onChange={(e) => updateSetting('rpcEndpoint', e.target.value)}
                                                            className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-purple-500/40"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Price Sync Delta (ms)</label>
                                                        <input
                                                            type="number"
                                                            value={platformSettings.priceFeedInterval}
                                                            onChange={(e) => updateSetting('priceFeedInterval', parseInt(e.target.value))}
                                                            className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-purple-500/40"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">AI Arbiter Consensus</label>
                                                        <div className="flex items-center gap-4 bg-black border border-white/5 rounded-2xl px-5 py-4">
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.01"
                                                                value={platformSettings.aiArbiterSensitivity}
                                                                onChange={(e) => updateSetting('aiArbiterSensitivity', parseFloat(e.target.value))}
                                                                className="flex-1 accent-purple-500"
                                                            />
                                                            <span className="text-[10px] font-black text-white/40 w-8">{Math.round(platformSettings.aiArbiterSensitivity * 100)}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }
                        </AnimatePresence >
                    </div >
                </div >
            </div >

            {/* Detailed Review Modal Simulation */}
            < AnimatePresence >
                {activeCase && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-md flex items-center justify-end p-0 sm:p-10"
                    >
                        <motion.div
                            initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }}
                            className="w-full max-w-xl bg-[#0D0D0D] h-full ml-auto rounded-none sm:rounded-[48px] border-l border-white/10 flex flex-col p-6 sm:p-10 overflow-hidden"
                        >
                            <div className="flex justify-between items-start mb-10">
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase mb-2">Case #{activeCase.id}</h2>
                                    <p className="font-mono text-[10px] text-white/40">{activeCase.user}</p>
                                </div>
                                <button onClick={() => setActiveCase(null)} className="p-3 bg-white/5 rounded-full hover:bg-white/10"><X size={20} /></button>
                            </div>

                            <div className="flex-1 space-y-10 overflow-y-auto pr-4 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="p-5 bg-white/5 rounded-2xl">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Issue Reported</p>
                                        <p className="text-sm font-bold text-white">{activeCase.reason}</p>
                                    </div>
                                    <div className="p-5 bg-white/5 rounded-2xl">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Impacted Amount</p>
                                        <p className="text-sm font-black text-[#3CB371]">{activeCase.amount}</p>
                                    </div>
                                </div>

                                <div className="p-6 bg-black/40 border border-white/5 rounded-3xl space-y-6">
                                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em] mb-2">Technical Metadata</h4>
                                    <div className="space-y-4">

                                        <div>
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Full Wallet Address</p>
                                            <p className="text-xs font-mono text-white break-all bg-white/5 p-3 rounded-lg border border-white/5">
                                                {activeCase.originalTrade?.userPublicKey || activeCase.user || "Unknown"}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Dispute Created</p>
                                                <p className="text-xs font-bold text-white bg-white/5 p-3 rounded-lg border border-white/5">
                                                    {activeCase.date} • {activeCase.originalTrade?.timestamp || activeCase.time || "N/A"}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Trade Direction</p>
                                                <p className={`text-xs font-black p-3 rounded-lg border border-white/5 ${activeCase.originalTrade?.direction === 'buy' ? 'bg-[#3CB371]/10 text-[#3CB371]' : 'bg-red-500/10 text-red-500'}`}>
                                                    {activeCase.originalTrade?.direction?.toUpperCase() || "N/A"}
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Transaction Instance</p>
                                            <a
                                                href={`https://solscan.io/tx/${activeCase.originalTrade?.tx}?cluster=devnet`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between text-xs font-mono text-[#3CB371] bg-[#3CB371]/5 p-3 rounded-lg border border-[#3CB371]/10 hover:bg-[#3CB371]/10 transition-colors"
                                            >
                                                <span className="truncate mr-4">{activeCase.originalTrade?.tx || "NO_SIG_FOUND"}</span>
                                                <ArrowUpRight size={14} />
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Operator Messaging</h4>
                                    <div className="bg-black/40 border border-white/5 rounded-[32px] h-64 flex flex-col p-6">
                                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                                            {(messages[activeCase.id] || []).map((m, i) => (
                                                <div key={i} className={`flex flex-col ${m.sender === 'SYSTEM' ? 'items-center' : 'items-end'}`}>
                                                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-xs ${m.sender === 'SYSTEM' ? 'bg-white/5 text-white/40 italic' : 'bg-[#3CB371] text-white font-bold'
                                                        }`}>
                                                        {m.text}
                                                    </div>
                                                    <span className="text-[8px] text-white/20 uppercase mt-1 px-2">{m.sender} • {m.time}</span>
                                                </div>
                                            ))}
                                            {(messages[activeCase.id] || []).length === 0 && (
                                                <div className="h-full flex items-center justify-center text-[10px] font-bold text-white/10 uppercase italic">Start communication with user...</div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                placeholder="Type result or query..."
                                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-xs outline-none focus:border-[#3CB371]/40"
                                            />
                                            <button
                                                onClick={sendMessage}
                                                className="p-3 bg-[#3CB371] text-white rounded-xl"
                                            ><ArrowUpRight size={18} /></button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                                    <button
                                        onClick={() => handleAction(activeCase.id, 'REFUND')}
                                        disabled={activeCase.status !== 'PENDING'}
                                        className="flex flex-col items-center justify-center gap-2 p-6 rounded-[32px] bg-[#3CB371]/10 border border-[#3CB371]/20 hover:bg-[#3CB371]/20 transition-all disabled:opacity-30 disabled:grayscale"
                                    >
                                        <ShieldCheck size={24} className="text-[#3CB371]" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Refund & Settle</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction(activeCase.id, 'SETTLE')}
                                        disabled={activeCase.status !== 'PENDING'}
                                        className="flex flex-col items-center justify-center gap-2 p-6 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-30 disabled:grayscale"
                                    >
                                        <CheckCircle2 size={24} className="text-white/40" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Settle Without Refund</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Treasury Management Modal */}
            < AnimatePresence >
                {isTreasuryModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-md bg-[#0D0D0D] border border-white/10 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 relative"
                        >
                            <button onClick={() => setIsTreasuryModalOpen(false)} className="absolute top-8 right-8 text-white/20 hover:text-white"><X size={24} /></button>
                            <div className="flex flex-col items-center mb-10">
                                <div className="w-16 h-16 rounded-3xl bg-[#3CB371]/10 flex items-center justify-center mb-4 text-[#3CB371]">
                                    <Database size={32} />
                                </div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest">Treasury Control</h3>
                                <p className="text-xs text-white/20 font-bold mt-1 uppercase">Balance: {treasuryStats.balance.toFixed(4)} SOL</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block">Transaction Amount (SOL)</label>
                                    <input
                                        id="treasury-amt"
                                        type="number"
                                        placeholder="1.0"
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-[#3CB371]/40"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => handleDeposit(document.getElementById('treasury-amt').value)}
                                        className="bg-[#3CB371] text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all"
                                    >
                                        Deposit Funds
                                    </button>
                                    <button
                                        onClick={() => handleWithdraw(document.getElementById('treasury-amt').value)}
                                        className="bg-white/5 text-white/40 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-white/5 hover:bg-white/10"
                                    >
                                        Withdraw
                                    </button>
                                </div>
                                <p className="text-[9px] text-white/20 text-center uppercase font-bold px-4">Withdrawals are restricted to Authority Multi-Sig for platform security.</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Broadcast Modal */}
            < AnimatePresence >
                {isBroadcastModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-md bg-[#0D0D0D] border border-white/10 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 relative"
                        >
                            <button onClick={() => setIsBroadcastModalOpen(false)} className="absolute top-8 right-8 text-white/20 hover:text-white"><X size={24} /></button>
                            <div className="flex flex-col items-center mb-10">
                                <div className="w-16 h-16 rounded-3xl bg-[#3CB371]/10 flex items-center justify-center mb-4 text-[#3CB371]">
                                    <Megaphone size={32} />
                                </div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest">Global Paging</h3>
                                <p className="text-xs text-white/20 font-bold mt-1 uppercase px-6 text-center">Override marquee feed for site-wide memos.</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block">Announcement Payload</label>
                                    <textarea
                                        value={newBroadcast.message}
                                        onChange={(e) => setNewBroadcast({ ...newBroadcast, message: e.target.value })}
                                        placeholder="e.g. URGENT: System Upgrade starting in 5 mins..."
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white outline-none focus:border-[#3CB371]/40 h-32 resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block">Type</label>
                                        <select
                                            value={newBroadcast.type}
                                            onChange={(e) => setNewBroadcast({ ...newBroadcast, type: e.target.value })}
                                            className="w-full bg-black/60 border border-white/5 rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none"
                                        >
                                            <option value="EMERGENCY">EMERGENCY</option>
                                            <option value="MAINTENANCE">MAINTENANCE</option>
                                            <option value="ALERT">GEN ALERT</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block">Duration (Secs)</label>
                                        <input
                                            type="number"
                                            value={newBroadcast.duration}
                                            onChange={(e) => setNewBroadcast({ ...newBroadcast, duration: parseInt(e.target.value) })}
                                            className="w-full bg-black/60 border border-white/5 rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleSendBroadcast}
                                    className="w-full bg-[#3CB371] text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(60,179,113,0.3)]"
                                >
                                    Execute Broadside
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Staff Assignment Modal */}
            < AnimatePresence >
                {isStaffModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-md bg-[#0D0D0D] border border-white/10 rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 relative"
                        >
                            <button onClick={() => setIsStaffModalOpen(false)} className="absolute top-8 right-8 text-white/20 hover:text-white"><X size={24} /></button>
                            <div className="flex flex-col items-center mb-10">
                                <div className="w-16 h-16 rounded-3xl bg-[#3CB371]/10 flex items-center justify-center mb-4 text-[#3CB371]">
                                    <ShieldCheck size={32} />
                                </div>
                                <h3 className="text-xl font-black text-white uppercase tracking-widest">Identity Access</h3>
                                <p className="text-xs text-white/20 font-bold mt-1 uppercase px-6 text-center">Grant operational roles to decentralized identities.</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block">Operator Wallet Address</label>
                                    <input
                                        type="text"
                                        value={newStaff.address}
                                        onChange={(e) => setNewStaff({ ...newStaff, address: e.target.value })}
                                        placeholder="Enter Wallet Address..."
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono font-bold text-white outline-none focus:border-[#3CB371]/40"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block">Assigned Role</label>
                                    <select
                                        value={newStaff.role}
                                        onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white outline-none focus:border-[#3CB371]/40 appearance-none"
                                    >
                                        <option value="moderator">MODERATOR</option>
                                        <option value="lister">LISTER</option>
                                        <option value="admin">CO-ADMIN</option>
                                    </select>
                                </div>

                                <button
                                    onClick={handleAssignRole}
                                    className="w-full bg-[#3CB371] text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all"
                                >
                                    Establish Access Key
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            <MessagingSystem
                wallet={null}
                isOpen={isMessagingOpen}
                onClose={() => setIsMessagingOpen(false)}
                isAdminView={true}
                adminRole={
                    currentUser?.role === ROLES.ROOT ? '15market admin' :
                        currentUser?.role === 'moderator' ? '15market Mod' : '15listers'
                }
            />

            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsMessagingOpen(true)}
                className="fixed bottom-6 right-6 z-[450] p-4 bg-[#3CB371] text-white rounded-full shadow-[0_10px_30px_rgba(60,179,113,0.4)]"
            >
                <MessageSquare size={24} />
            </motion.button>
        </div >
    );
});

export default AdminPortal;
