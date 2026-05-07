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
    Copy,
    Key,
    Radio,
    CheckCircle,
    FileText
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
import { AdminAuthDB } from '../utils/adminAuthDb';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { socketService } from '../utils/socket';


const ROOT_WALLET = "0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C";

import { KEEPER_URL, KEEPER_URL_ARC, ADMIN_TOKEN, ARC_RPC, ARC_CONTRACT_ADDRESS } from '../constants';

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
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-1">{String(label || '')}</p>
            <h4 className="text-2xl font-black text-white mb-2">{String(value || '0')}</h4>
            <div className={`flex items-center gap-1 text-[10px] font-bold ${positive ? 'text-[#3CB371]' : 'text-[#FF4444]'}`}>
                {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {String(trend || '0%')}
                <span className="text-white/20 ml-1">since yesterday</span>
            </div>
        </div>
    </div>
));

const DISCONNECTED_WALLET = { connected: false };

const AdminPortal = React.memo(({ onBack, price }) => {
    // Auth State - SECURED
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    const [activeTab, setActiveTab] = useState('dashboard');
    const [settingsSubTab, setSettingsSubTab] = useState('platform');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [metrics, setMetrics] = useState({
        totalWallets: '...',
        totalVolume: '...',
        activeUsers: '...',
        activeStakesTotal: '...',
        pendingDisputes: 0,
        avgExecutionTime: '42ms',
        networkHealth: '100%',
        treasuryBalance: '...'
    });

    const [keeperLogs, setKeeperLogs] = useState([]);
    const [arcTreasuryBalance, setArcTreasuryBalance] = useState(0);
    const [escrowStats, setEscrowStats] = useState({
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
    const [tick, setTick] = useState(0);
    const nowRef = useRef(Date.now() / 1000);
    const [keeperHealth, setKeeperHealth] = useState({ connected: true, failCount: 0, lastCheck: Date.now() });
    const keeperHealthRef = useRef(keeperHealth);
    // Wait, original code was: const keeperHealthRef = useRef(keeperHealth); useEffect(() => { keeperHealthRef.current = keeperHealth; }, [keeperHealth]);
    // The previous view showed: const keeperHealthRef = useRef(keeperHealth); which means keeperHealthRef.current is initial state.
    // The previous view also showed: useEffect(() => { keeperHealthRef.current = keeperHealth; }, [keeperHealth]);

    // Changing back to original ref usage pattern to avoid regressions, focusing on network fix.
    useEffect(() => {
        keeperHealthRef.current = keeperHealth;
    }, [keeperHealth]);


    const [protocolData, setProtocolData] = useState({ activeList: [], totalVolume: 0, wallets: 0, profiles: [] });
    const [tradeHistory, setTradeHistory] = useState([]); // Settled trades from Arc
    const [historyFilter, setHistoryFilter] = useState({ search: '' });
    const [betaApplications, setBetaApplications] = useState([]);
    const [authorizedWallets, setAuthorizedWallets] = useState([]);
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [securityForm, setSecurityForm] = useState({ username: '', password: '', confirmPassword: '' });
    const [authError, setAuthError] = useState(null);
    const [selectedTrade, setSelectedTrade] = useState(null);

    // Reown & Wallet Integration
    const { open } = useAppKit();
    const { isConnected, address } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();

    const walletAddress = address?.toString();
    const isWalletConnected = isConnected;

    // Enforce Arc Network
    useEffect(() => {
        if (isWalletConnected && chainId !== 5042002) {
            // Network mismatch handled silently
            // Use switchChain, but catch errors just in case
            try {
                switchChain({ chainId: 5042002 });
            } catch (e) { console.error("Auto-switch failed", e); }
        }
    }, [isWalletConnected, chainId, switchChain]);

    useEffect(() => {
        if (isWalletConnected) {
            // console.log("[AdminAuth] Connected");
        }
    }, [isWalletConnected, walletAddress]);

    const [staffMembers, setStaffMembers] = useState([]);

    const fetchStaff = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/staff`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                
                // Ensure ROOT is always present
                const rootExists = data.some(s => s.address?.toLowerCase() === ROOT_WALLET.toLowerCase());
                if (!rootExists) {
                    const rootEntry = {
                        id: 1,
                        address: ROOT_WALLET,
                        role: 'ROOT',
                        username: import.meta.env.VITE_ROOT_USER || 'xavageszn-root',
                        password: import.meta.env.VITE_ROOT_PASS,
                        status: 'ACTIVE',
                        onboardingComplete: true
                    };
                    data.unshift(rootEntry);
                    // Optionally push back to server? No, server should handle its own initialization,
                    // but for reliability we show it here.
                }
                setStaffMembers(data);
            }
        } catch (e) {
            console.warn("Failed to fetch staff:", e.message);
        }
    }, []);

    const currentStaffMember = useMemo(() => {
        if (!walletAddress) return null;
        const addr = walletAddress.toLowerCase().trim();
        const member = staffMembers.find(s => s.address?.toLowerCase().trim() === addr);

        // Root Wallet is always authorized as a fallback
        if (!member && addr === ROOT_WALLET.toLowerCase().trim()) {
            return {
                id: 1,
                address: ROOT_WALLET,
                role: ROLES.ROOT,
                username: import.meta.env.VITE_ROOT_USER || 'xavageszn-root',
                password: import.meta.env.VITE_ROOT_PASS_ENC ? atob(import.meta.env.VITE_ROOT_PASS_ENC) : null,
                status: 'ACTIVE',
                onboardingComplete: true
            };
        }
        return member;
    }, [staffMembers, walletAddress]);

    const isAuthorizedWallet = !!currentStaffMember;

    // Onboarding State for new staff
    const [isOnboarding, setIsOnboarding] = useState(false);
    const [onboardingForm, setOnboardingForm] = useState({ username: '', password: '', xLinked: false });
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [newStaffForm, setNewStaffForm] = useState({ address: '', role: 'MODERATOR' });

    // Protocol Revenue Tracker
    const [autoSignerFees, setAutoSignerFees] = useState({ arc: 0 });

    // Sync User List / Profiles for Directory
    const fetchProfiles = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/profiles`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProtocolData(prev => ({ ...prev, profiles: data }));
            }
        } catch (e) { }
    }, []);

    // Fetch Stats and Metrics regularly
    // DASHBOARD DATA MANAGEMENT (Now reactive via Socket.io)


    // Real-time Event Subscription (SOCKET.IO)
    useEffect(() => {
        let unbindStats, unbindDashboard, unbindTrade, unbindSettled, unbindSettings, unbindConnect, unbindDisconnect;

        if (isLoggedIn) {
            socketService.connect();
            fetchStaff();
            fetchProfiles();


            // Listen for dashboard aggregated stats (Universal)
            unbindStats = socketService.on('admin_stats_update', (data) => {
                setMetrics(prev => ({
                    ...prev,
                    totalWallets: data.totalWallets,
                    totalVolume: `${data.totalVolume} USDC`,
                    activeUsers: data.activeCount,
                    activeStakesTotal: `${data.activeStakesTotal} USDC`,
                    treasuryBalance: `${data.treasuryBalance} USDC`,
                    pendingDisputes: data.pendingDisputes || 0,
                    networkHealth: 'Operational (Live)'
                }));
                setArcTreasuryBalance(parseFloat(data.treasuryBalance) || 0);
                
                // Update Revenue
                if (data.platformRevenue) {
                    setAutoSignerFees({ arc: parseFloat(data.platformRevenue) });
                }

                setLastSync(new Date().toLocaleTimeString());
                
                // Only mark as connected if we actually received data
                setKeeperHealth({ connected: true, failCount: 0, lastCheck: Date.now() });
            });

            // Backward compatibility listener
            unbindDashboard = socketService.on('dashboard_stats', (data) => {
                setMetrics(prev => ({
                    ...prev,
                    totalWallets: data.totalWallets,
                    totalVolume: `${data.totalVolume} USDC`,
                    activeUsers: data.activeCount,
                    activeStakesTotal: `${data.activeStakesTotal} USDC`,
                    treasuryBalance: `${data.treasuryBalance} USDC`,
                }));
            });

            // Listen for specific trade events
            unbindTrade = socketService.on('trade_detected', (trade) => {
                 setTradeHistory(prev => [trade, ...prev].slice(0, 100));
            });

            unbindSettled = socketService.on('global_trade_settled', (res) => {
                 setTradeHistory(prev => prev.map(t => String(t.id) === String(res.betId) ? { ...t, status: res.won ? 'WON' : 'LOST', payout: res.payout } : t));
            });

            // Listen for settings updates (Instant UI feedback from backend)
            unbindSettings = socketService.on('settings_update', (data) => {
                 setPlatformSettings(prev => ({ ...prev, ...data }));
                 notify('info', 'SYNCED', 'Platform configuration updated in real-time.');
            });

            unbindConnect = socketService.on('connect', () => {
                setKeeperHealth({ connected: true, failCount: 0, lastCheck: Date.now() });
            });

            unbindDisconnect = socketService.on('disconnect', () => {
                setKeeperHealth(prev => ({ ...prev, connected: false, failCount: prev.failCount + 1 }));
            });

        }
        return () => {
            if (unbindStats) unbindStats();
            if (unbindDashboard) unbindDashboard();
            if (unbindTrade) unbindTrade();
            if (unbindSettled) unbindSettled();
            if (unbindSettings) unbindSettings();
            if (unbindConnect) unbindConnect();
            if (unbindDisconnect) unbindDisconnect();
            socketService.disconnect();
        };
    }, [isLoggedIn]);

    // High-frequency UI tick (1s) to drive "Frontend-Only" timers - Optimized to reduce re-renders
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now() / 1000;
            nowRef.current = now;
            setTick(prev => prev + 1);
        }, 1000); // 1s tick for real-time expiry checking
        return () => clearInterval(interval);
    }, []);




    // Custom Styled Notification System
    const [notification, setNotification] = useState(null); // { type: 'success' | 'error' | 'info', title: '...', message: '...' }
    const [confirmAction, setConfirmAction] = useState(null); // { title: '...', message: '...', onConfirm: () => void }

    // Treasury State - Protocol Unified

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
        network: 'arc',
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
    
    // Campaign Reporting
    const [selectedReportCampaign, setSelectedReportCampaign] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [isReportLoading, setIsReportLoading] = useState(false);

    const handleViewReport = async (campaignId) => {
        setIsReportLoading(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/campaign-report?campaignId=${campaignId}`);
            if (res.ok) {
                const data = await res.json();
                setReportData(data);
                setSelectedReportCampaign(campaignId);
            } else {
                notify('error', 'Report Error', 'Could not fetch detailed campaign report.');
            }
        } catch (e) {
            notify('error', 'Network Error', 'Backend sync failed for reporting.');
        } finally {
            setIsReportLoading(false);
        }
    };

    const notify = useCallback((type, title, message) => {
        setNotification({
            type,
            title: String(title || ''),
            message: String(message || '')
        });
        setTimeout(() => setNotification(null), 5000);
    }, []);


    const fetchCampaigns = useCallback(async () => {
        try {
            // Campaigns
            try {
                const res = await fetch(`${KEEPER_URL}/campaigns`);
                const data = await res.json();
                if (Array.isArray(data)) {
                    setCampaigns(data);
                } else {
                    setCampaigns([]);
                }
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
        }
    }, [isLoggedIn, fetchCampaigns]);

    const fetchBetaApplications = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/rounds/access/admin/applications`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBetaApplications(data);
            }
        } catch (e) {
            console.error("Failed to fetch beta applications:", e);
        }
    }, []);

    const fetchAuthorizedWallets = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/rounds/access/admin/authorized`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAuthorizedWallets(data);
            }
        } catch (e) {
            console.error("Failed to fetch authorized wallets:", e);
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn && activeTab === 'beta') {
            fetchBetaApplications();
            fetchAuthorizedWallets();
        }
    }, [isLoggedIn, activeTab, fetchBetaApplications, fetchAuthorizedWallets]);

    const handleApproveBeta = async (address, email) => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/rounds/access/admin/approve`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify({ address, email })
            });

            if (res.ok) {
                const data = await res.json();
                notify('success', 'APPROVED', `Access code generated: ${data.code}`);
                fetchBetaApplications();
                fetchAuthorizedWallets();
            } else {
                notify('error', 'FAILED', 'Could not approve application.');
            }
        } catch (e) {
            notify('error', 'ERROR', e.message);
        }
    };

    const handleRevokeBeta = async (address) => {
        if (!window.confirm(`Are you sure you want to revoke access for ${address}?`)) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/rounds/access/admin/revoke`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify({ address })
            });

            if (res.ok) {
                notify('info', 'REVOKED', 'Access has been removed.');
                fetchAuthorizedWallets();
            } else {
                notify('error', 'FAILED', 'Could not revoke access.');
            }
        } catch (e) {
            notify('error', 'ERROR', e.message);
        }
    };

    const handleCreateCampaign = async () => {
        if (!newCampaign.title || !newCampaign.startTime || !newCampaign.endTime) {
            notify('error', 'MISSING FIELDS', 'Please fill in all required campaign details.');
            return;
        }

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/campaigns`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN
                },
                body: JSON.stringify({
                    title: newCampaign.title,
                    prize: newCampaign.prize,
                    startTime: new Date(newCampaign.startTime).getTime(),
                    endTime: new Date(newCampaign.endTime).getTime()
                })
            });

            if (res.ok) {
                const data = await res.json();
                notify('success', 'CAMPAIGN READY', `Campaign "${data.campaign.title}" has been scheduled.`);
                setCampaigns(prev => [...prev, data.campaign]);
                setNewCampaign({ title: '', description: '', startTime: '', endTime: '', network: 'arc', reboot: 'none', prize: '' });
            } else {
                notify('error', 'SAVE FAILED', 'Could not create campaign.');
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
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
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
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
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






    // Dispute Management
    const [selectedDisputeIds, setSelectedDisputeIds] = useState([]);
    const [disputeFilterState, setDisputeFilterState] = useState({ status: 'ALL' });




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

    const [broadcastHistory, setBroadcastHistory] = useState(() => {
        try {
            const saved = localStorage.getItem('15market_admin_broadcast_history');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });

    useEffect(() => {
        localStorage.setItem('15market_admin_broadcast_history', JSON.stringify(broadcastHistory));
    }, [broadcastHistory]);

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
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const handleSendBroadcast = async () => {
        if (!newBroadcast.message) return;
        const msg = {
            id: Date.now(),
            text: newBroadcast.message,
            duration: newBroadcast.duration,
            expiry: Date.now() + (newBroadcast.duration * 1000),
            type: newBroadcast.type,
            sender: currentStaffMember?.username || 'SYSTEM'
        };

        try {
            // Event-driven broadcast via Socket.IO for zero latency
            socketService.emit('send_broadcast', msg);
            
            // Optimistic local update
            setBroadcasts([msg]);
            setBroadcastHistory(prev => [msg, ...prev].slice(0, 100));
            localStorage.setItem('15market_admin_broadcast', JSON.stringify([msg]));
            setIsBroadcastModalOpen(false);
            setNewBroadcast({ message: '', duration: 30, type: 'EMERGENCY' });
            notify('success', 'SIGNAL BROADCAST', 'The announcement has been pushed to all active terminals.');
        } catch (e) {
            notify('error', 'BROADCAST ERROR', e.message);
        }
    };

    const handleWithdraw = async (amount) => {
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            notify('error', 'INVALID AMOUNT', 'Please specify a valid withdrawal amount.');
            return;
        }

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/treasury/withdraw`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify({ amount: Number(amount), destination: ROOT_WALLET })
            });
            const data = await res.json();
            
            if (res.ok) {
                notify('success', 'WITHDRAWAL SUCCESS', `Successfully swept ${data.amount} USDC to Root. TX: ${data.txHash}`);
                setIsTreasuryModalOpen(false);
            } else {
                notify('error', 'WITHDRAWAL FAILED', data.error || 'Failed to drain treasury.');
            }
        } catch (e) {
            notify('error', 'NETWORK ERROR', e.message);
        }
    };

    // --- TOKEN LISTING ENGINE ---

    const VERIFIED_SUGGESTIONS = [
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT' },
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT' },
        { id: 'sol', symbol: 'SOL', name: 'Solana', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' },
    ];

    const [listedTokens, setListedTokens] = useState(() => {
        const saved = localStorage.getItem('15market_listed_tokens');
        return saved ? JSON.parse(saved) : VERIFIED_SUGGESTIONS.slice(0, 3);
    });

    const [activeTokenId, setActiveTokenId] = useState(() => {
        const saved = localStorage.getItem('15market_active_token_id');
        return saved || 'eth';
    });

    // STANDALONE MARKET SYNC (KEEPER BRIDGE)
    const syncWithKeeper = async (tokens) => {
        try {
            const targetUrl = KEEPER_URL_ARC;
            const res = await fetch(`${targetUrl}/listings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify(tokens)
            });
            if (res.ok) { /* synced */ }
        } catch (e) {
            console.error("Market sync failed");
        }
    };

    useEffect(() => {
        const fetchRemoteTokens = async () => {
            try {
                const targetUrl = KEEPER_URL_ARC;
                // 1. Fetch Listings
                const res = await fetch(`${targetUrl}/listings`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setListedTokens(data);
                        localStorage.setItem('15market_listed_tokens', JSON.stringify(data));
                    }
                }

                // 2. Fetch Active Market
                const activeRes = await fetch(`${targetUrl}/active-market`);
                if (activeRes.ok) {
                    const activeData = await activeRes.json();
                    if (activeData.activeId) {
                        setActiveTokenId(activeData.activeId);
                        localStorage.setItem('15market_active_token_id', activeData.activeId);
                    }
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
            const targetUrl = KEEPER_URL_ARC;
            await fetch(`${targetUrl}/active-market`, {
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
    const [platformSettings, setPlatformSettings] = useState({
        maintenanceMode: false,
        tradingHalted: false,
        minBet: 0.1,
        maxBet: 1000000,
        payoutMultipliers: { "5": 2.90, "10": 2.40, "15": 1.90 },
        treasuryThreshold: 0.5,
        maxConcurrentTrades: 50,
        defaultBroadcastDuration: 60,
        rpcEndpoint: ARC_RPC,
        priceFeedInterval: 1000,
        aiArbiterSensitivity: 0.5,
        systemBanner: "",
        bannerLevel: "info"
    });

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/settings`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPlatformSettings(prev => ({ ...prev, ...data }));
            }
        } catch (e) {
            console.error("Failed to fetch settings:", e);
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn) {
            fetchSettings();
        }
    }, [isLoggedIn, fetchSettings]);

    const handleSaveSettings = async (dataToSave) => {
        // If called from onClick, dataToSave might be an event object - skip it
        try {
            // Fetch current settings first to merge and prevent data loss
            const currentRes = await fetch(`${KEEPER_URL_ARC}/admin/settings`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            let currentData = {};
            if (currentRes.ok) currentData = await currentRes.json();

            const body = { ...currentData, ...((dataToSave && !dataToSave.nativeEvent) ? dataToSave : platformSettings) };
            
            const res = await fetch(`${KEEPER_URL_ARC}/admin/settings/update`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                if (dataToSave) setPlatformSettings(dataToSave);
                notify('success', 'SETTINGS SAVED', 'Platform configuration synchronized and broadcasted.');
            } else {
                notify('error', 'SAVE FAILED', 'Could not persist settings to backend.');
            }
        } catch (e) {
            notify('error', 'SYSTEM ERROR', e.message);
        }
    };

    const handleToggleSetting = async (key) => {
        const newValue = !platformSettings[key];
        const updated = { ...platformSettings, [key]: newValue };
        setPlatformSettings(updated);
        await handleSaveSettings(updated);
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
                            user: (trade.userPublicKey && typeof trade.userPublicKey === 'string') ? `${trade.userPublicKey.slice(0, 4)}...${trade.userPublicKey.slice(-4)}` : "Anonym",
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
                message: `Executing refund for user ${dispute.user}. This will attempt to settle the trade as WON to return funds.`,
                onConfirm: async () => {
                    try {
                        if (dispute.originalTrade) {
                            // Attempting manual settlement for refund
                            await handleOnChainSettle(dispute.originalTrade, true);
                        }
                        notify('success', 'REFUND SUCCESSFUL', `Stake returned/settled as WIN.`);
                        finalizeAction(disputeId, action);
                    } catch (err) {
                        console.error("Refund failed:", err);
                        notify('error', 'REFUND FAILED', err.message || 'Transfer failed.');
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
        const actionLabel = userWon ? "WIN (Payout Profit)" : "LOSS (Take Stake)";

        setConfirmAction({
            title: `ESTABLISH ARC VERDICT`,
            message: `MANUAL SETTLE Bet ${betData.id} as ${actionLabel}?`,
            onConfirm: async () => {
                try {
                    // Current price for manual settlement
                    const pricingRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${(betData.symbol || 'ETH') + 'USDT'}`);
                    const pricingData = await pricingRes.json();
                    const currentPrice = parseFloat(pricingData.price);

                    const res = await fetch(`${KEEPER_URL_ARC}/manual-settle`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            betId: betData.nonce || betData.id,
                            exitPrice: currentPrice,
                            password: ADMIN_TOKEN
                        })
                    });
                    if (res.ok) {
                        notify('success', 'SETTLEMENT EXECUTED', `Arc trade #${betData.id} settled.`);
                    } else {
                        throw new Error("Arc Keeper rejected settlement");
                    }
                    triggerAnalysis();
                } catch (err) {
                    console.error("Manual settle failed:", err);
                    notify('error', 'SETTLEMENT FAILED', err.message);
                }
            }
        });
    };

    const triggerAnalysis = useCallback(async () => {
        if (triggerAnalysis.isRunning) return;
        triggerAnalysis.isRunning = true;

        try {
            const targetUrl = KEEPER_URL_ARC;
            const [activeRes, protoRes] = await Promise.all([
                fetch(`${targetUrl}/active-bets`),
                fetch(`${targetUrl}/protocol-stats`)
            ]);

            if (activeRes.ok && protoRes.ok) {
                const activeBets = await activeRes.json();
                const protoStats = await protoRes.json();

                setProtocolData({
                    activeList: activeBets.map(b => ({
                        publicKey: b.id,
                        amount: parseFloat(b.amount) || 0,
                        owner: b.user,
                        nonce: b.nonce || b.id,
                        direction: b.direction === 1 ? "buy" : "sell",
                        entryPrice: b.entryPrice,
                        duration: b.duration || 60,
                        timestamp: b.timestamp,
                        isExpired: b.expiry < (Date.now() / 1000),
                        network: 'arc'
                    })),
                    totalVolume: protoStats.totalVolume,
                    wallets: protoStats.wallets,
                    profiles: []
                });
            }

            setLastSync(new Date().toLocaleTimeString());
        } catch (e) {
            console.error("Global Analysis Failed:", e);
        } finally {
            triggerAnalysis.isRunning = false;
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn) {
            triggerAnalysis();
        }
    }, [isLoggedIn, triggerAnalysis]);

    // Fetch Trade History (Settled Trades from Solana + Arc)
    const fetchTradeHistory = useCallback(async () => {
        if (fetchTradeHistory.isRunning) return;
        fetchTradeHistory.isRunning = true;

        try {
            const targetUrl = KEEPER_URL_ARC;
            const res = await fetch(`${targetUrl}/admin/trades`);
            if (res.ok) {
                const allTrades = await res.json();
                if (Array.isArray(allTrades)) {
                    setTradeHistory(allTrades.slice(0, 200));
                } else {
                    setTradeHistory([]);
                }
            }
        } catch (e) {
            console.error("Trade History Fetch Error:", e);
        } finally {
            fetchTradeHistory.isRunning = false;
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn) {
            fetchTradeHistory();
        }
    }, [isLoggedIn, fetchTradeHistory]);

    const unifiedMetrics = useMemo(() => {
        const nowSeconds = nowRef.current + clockOffset;
        const liveValues = Array.from(liveEscrowBuffer.values()).filter(b => b.expiry > nowSeconds);

        const activeList = liveValues.filter(b => b.network === 'arc');
        const arcStats = escrowStats.arc || { totalVolume: 0, wallets: 0, stake: 0, count: 0, address: '' };

        // HYBRID VOLUME: Keeper Total + fresh unexpired pings for instant jump
        const freshArcPings = liveValues.filter(b => b.network === 'arc');

        const unconfirmedArcVol = freshArcPings.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

        // Prefer real-time socket metrics if available
        const totalVolume = metrics.totalVolume !== '...' ? parseFloat(metrics.totalVolume) : ((parseFloat(arcStats.totalVolume) || 0) + unconfirmedArcVol);
        const totalWallets = metrics.totalWallets !== '...' ? metrics.totalWallets : (parseInt(arcStats.wallets) || 0);

        const pingsStake = freshArcPings.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const finalActiveStake = metrics.activeStakesTotal !== '...' ? parseFloat(metrics.activeStakesTotal) : Math.max(parseFloat(arcStats.stake) || 0, pingsStake);
        const finalActiveCount = metrics.activeUsers !== '...' ? metrics.activeUsers : Math.max(parseInt(arcStats.count) || 0, freshArcPings.length);

        const PHYSICAL_TREASURY_BAL = metrics.treasuryBalance !== '...' ? parseFloat(metrics.treasuryBalance) : arcTreasuryBalance;
        const RESERVE_ADDRESS = arcStats.address || 'Scanning...';

        const currentStats = {
            volume: Number(totalVolume || 0).toFixed(2),
            wallets: totalWallets,
            activeStakes: Number(finalActiveStake || 0).toFixed(2),
            totalPlatformFunds: Number(PHYSICAL_TREASURY_BAL || 0).toFixed(2),
            activeCount: finalActiveCount,
            unit: 'USDC'
        };

        return {
            activeList,
            totalVolume: Number(totalVolume || 0).toFixed(2),
            totalWallets,
            totalActiveStakes: Number(finalActiveStake || 0).toFixed(2),
            currentStats,
            displayReserve: Number(PHYSICAL_TREASURY_BAL || 0).toFixed(2),
            reserveAddress: RESERVE_ADDRESS,
            pendingDisputes: metrics.pendingDisputes || activeList.length,
            currencyUnit: 'USDC'
        };
    }, [escrowStats, liveEscrowBuffer, arcTreasuryBalance, clockOffset, metrics]);




    // Trade History Filtering (Settled Trades Only)
    const filteredHistory = useMemo(() => {
        return tradeHistory.filter(trade => {
            const matchesSearch = !historyFilter.search ||
                trade.userAddr?.toLowerCase().includes(historyFilter.search.toLowerCase()) ||
                String(trade.id || trade.betId || '').includes(historyFilter.search) ||
                trade.symbol?.toLowerCase().includes(historyFilter.search.toLowerCase());
            return matchesSearch;
        });
    }, [tradeHistory, historyFilter.search]);

    // Filtered Disputes
    const filteredDisputes = useMemo(() => {
        return disputes.filter(d => {
            const matchesStatus = disputeFilterState.status === 'ALL' || d.status === disputeFilterState.status;
            return matchesStatus;
        });
    }, [disputes, disputeFilterState]);

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
                        network: network || 'arc'
                    });
                }
            });

            if (updates.size > 0) {
                setLiveEscrowBuffer(prev => {
                    const next = new Map(prev);
                    updates.forEach((val, id) => {
                        if (!next.has(id)) next.set(id, val);
                    });

                    const nowSec = Date.now() / 1000;
                    for (const [key, val] of next.entries()) {
                        if (val.expiry < nowSec - 60) next.delete(key);
                    }
                    return next;
                });
            }
        };

        const fetchLogs = async () => {
            const currentHealth = keeperHealthRef.current;
            const timeSinceLastCheck = Date.now() - currentHealth.lastCheck;
            const backoffDelay = Math.min(60000, 5000 * Math.pow(2, currentHealth.failCount));

            if (!currentHealth.connected && timeSinceLastCheck < backoffDelay) return;

            try {
                const targetUrl = KEEPER_URL_ARC;
                const res = await fetch(`${targetUrl}/admin/logs`, {
                    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (activeTab === 'terminal') setKeeperLogs(data);
                    parseBetData(data);
                } else throw new Error(`Server error`);
            } catch (e) {
                console.error("Log fetch failed:", e);
            }
        };

        fetchLogs();
    }, [isLoggedIn, activeTab]);

    const nodeStats = [
        { name: 'US-East (RPC)', status: 'Optimal', latency: '22ms', load: 34 },
        { name: 'EU-West (RPC)', status: 'Active', latency: '48ms', load: 62 },
        { name: 'Protocol (Keeper)', status: 'Active', latency: '12ms', load: 15 }
    ];

    const distributionData = [
        { name: 'Protocol Assets', value: 95, color: '#3CB371' },
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

    const legacyHandleWithdraw = async (amt) => {
        const amtNum = parseFloat(amt);
        if (isNaN(amtNum) || amtNum <= 0) {
            notify('error', 'INVALID AMOUNT', 'Specify a valid amount for withdrawal.');
            return;
        }

        const currentBal = arcTreasuryBalance;
        if (amtNum > currentBal) {
            notify('error', 'INSUFFICIENT FUNDS', 'Treasury balance is lower than the requested withdrawal amount.');
            return;
        }

        setConfirmAction({
            title: 'EXTRACT ARC LIQUIDITY',
            message: `Are you sure you want to withdraw ${amt} USDC from the Arc Network treasury?`,
            onConfirm: async () => {
                try {
                    const targetUrl = KEEPER_URL_ARC;
                    const res = await fetch(`${targetUrl}/withdraw`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            amount: amtNum,
                            password: ADMIN_TOKEN
                        })
                    });

                    const data = await res.json();
                    if (res.ok) {
                        notify('success', 'WITHDRAWAL SUCCESS', `Successfully extracted ${amt} USDC. TX: ${data.hash?.slice(0, 10)}...`);
                        setIsTreasuryModalOpen(false);
                    } else {
                        throw new Error(data.error || "Arc withdrawal failed");
                    }
                } catch (e) {
                    notify('error', 'ARC WITHDRAWAL FAILED', e.message);
                }
            }
        });
    };

    const handleTreasuryAction = (amt) => {
        legacyHandleWithdraw(amt);
    };



    const handleAssignRole = async () => {
        if (!newStaffForm.address) return;
        if (staffMembers.some(s => s.address?.toLowerCase() === newStaffForm.address.toLowerCase())) {
            notify('error', 'EXISTS', 'This wallet is already registered.');
            return;
        }

        const newStaff = {
            id: Date.now(),
            address: newStaffForm.address.toLowerCase(),
            role: newStaffForm.role,
            status: 'ACTIVE',
            onboardingComplete: false
        };

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/staff`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify(newStaff)
            });
            if (res.ok) {
                await fetchStaff();
                setIsStaffModalOpen(false);
                setNewStaffForm({ address: '', role: 'MODERATOR' });
                notify('success', 'ROLE ASSIGNED', `${newStaffForm.role} access granted. Onboarding required.`);
            }
        } catch (e) {
            notify('error', 'ERROR', e.message);
        }
    };

    const handleRevokeRole = (id) => {
        const staff = staffMembers.find(s => s.id === id);
        if (!staff) return;
        if (staff.role === 'ROOT') {
            notify('error', 'DENIED', 'Citadel Root cannot be removed.');
            return;
        }

        setConfirmAction({
            title: 'REVOKE ACCESS',
            message: `Deauthorize ${staff.address}? This action is immediate.`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`${KEEPER_URL_ARC}/admin/staff/${staff.address}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
                    });
                    if (res.ok) {
                        await fetchStaff();
                        notify('info', 'ACCESS REVOKED', 'Operator permissions purged.');
                    }
                } catch (e) { notify('error', 'ERROR', e.message); }
            }
        });
    };

    const handleOnboarding = async () => {
        if (!onboardingForm.username || !onboardingForm.password || !onboardingForm.xLinked) {
            notify('error', 'INCOMPLETE', 'Complete all onboarding steps (Link X, Set Credentials).');
            return;
        }

        const updatedStaff = {
            ...currentStaffMember,
            username: onboardingForm.username,
            password: onboardingForm.password,
            onboardingComplete: true
        };

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/staff`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify(updatedStaff)
            });
            if (res.ok) {
                await fetchStaff();
                setIsOnboarding(false);
                notify('success', 'ONBOARDING COMPLETE', 'Your administrative keys have been initialized.');
            }
        } catch (e) { notify('error', 'ERROR', e.message); }
    };

    const handleLogin = async (e) => {
        if (e) e.preventDefault();
        // Login attempt
        setAuthError(null);

        if (!isWalletConnected) {
            console.warn("[AdminAuth] No wallet connected.");
            notify('error', 'WALLET REQUIRED', 'Connect authorized wallet to proceed.');
            return;
        }

        if (!isAuthorizedWallet) {
            console.warn("[AdminAuth] Wallet not authorized.");
            notify('error', 'NOT ALLOWED', 'This wallet address is not registered in the administrative directory.');
            return;
        }

        if (!currentStaffMember.onboardingComplete) {
            // Onboarding required
            setIsOnboarding(true);
            return;
        }

        try {
            // Credential validation

            // Check credentials against our staff database - Added trim() for resilience
            if (loginForm.username && currentStaffMember.username && 
                loginForm.username.trim() === currentStaffMember.username.trim() &&
                loginForm.password && currentStaffMember.password &&
                loginForm.password.trim() === currentStaffMember.password.trim()) {

                // Auth success
                setIsLoggedIn(true);
                setCurrentUser({ username: currentStaffMember.username, role: currentStaffMember.role });
                notify('success', 'ACCESS GRANTED', 'Citadel Session Initialized.');
            } else {
                console.warn("[AdminAuth] Credentials mismatch.");
                notify('error', 'AUTH FAILED', 'INVALID LOGIN COORDINATES');
                setAuthError("INVALID AUTHENTICATION COORDINATES");
            }
        } catch (err) {
            console.error("[AdminAuth] Login error");
            notify('error', 'SYSTEM ERROR', err.message);
        }
    };

    const handleUpdateSecurity = async () => {
        if (!securityForm.username || !securityForm.password) {
            notify('error', 'INCOMPLETE', 'Username and Password are required.');
            return;
        }

        if (securityForm.password !== securityForm.confirmPassword) {
            notify('error', 'MISMATCH', 'Passwords do not match.');
            return;
        }

        const updatedStaff = {
            ...currentStaffMember,
            username: securityForm.username,
            password: securityForm.password
        };

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/staff`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify(updatedStaff)
            });
            if (res.ok) {
                await fetchStaff();
                setCurrentUser(prev => ({ ...prev, username: securityForm.username }));
                notify('success', 'SECURITY UPDATED', 'Your login coordinates have been re-initialized.');
                setSecurityForm({ username: '', password: '', confirmPassword: '' });
            }
        } catch (e) { notify('error', 'ERROR', e.message); }
    };



    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-[300] bg-[#000] flex items-center justify-center overflow-hidden">
                {/* Global Notification system (Toast) available even on login screen */}
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
                                        {String(notification.title || '')}
                                    </h5>
                                    <p className="text-xs font-bold text-white/70 leading-relaxed uppercase tracking-widest">{String(notification.message || '')}</p>
                                </div>
                                <button onClick={() => setNotification(null)} className="text-white/20 hover:text-white transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Animated Background Gradients */}
                <div className="absolute top-0 -left-1/4 w-1/2 h-full bg-[#3CB371]/10 blur-[160px] animate-pulse" />
                <div className="absolute bottom-0 -right-1/4 w-1/2 h-full bg-[#3CB371]/5 blur-[160px]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-[480px] bg-[#050505]/80 backdrop-blur-2xl border border-white/10 p-12 rounded-[48px] relative z-20 shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
                >
                    <div className="flex flex-col items-center mb-10">
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className="relative mb-6"
                        >
                            <div className="absolute inset-0 blur-3xl bg-[#3CB371]/40 opacity-50" />
                            <img src="/logo.png" alt="15market" className="h-40 w-auto relative z-10 filter drop-shadow-[0_0_30px_rgba(60,179,113,0.6)]" />
                        </motion.div>
                        <h2 className="text-xl font-black uppercase tracking-[0.3em] text-white">Citadel Access</h2>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] animate-ping" />
                            <p className="text-[9px] text-[#3CB371] font-black uppercase tracking-[0.2em]">{isWalletConnected ? 'AUTHENTICATING WALLET' : 'SECURE NODE 01'}</p>
                        </div>
                    </div>

                    {!isWalletConnected ? (
                        <div className="space-y-6">
                            <p className="text-center text-[10px] text-white/30 uppercase font-black tracking-widest leading-relaxed">
                                Administrative access requires an authorized wallet connection. Secure your identity to proceed.
                            </p>
                            <button
                                onClick={() => open()}
                                className="group relative w-full bg-white text-black py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-[#3CB371] to-[#4ADE80] opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="relative z-10 group-hover:text-white transition-colors">Authorize Wallet</span>
                            </button>
                        </div>
                    ) : !isAuthorizedWallet ? (
                        <div className="space-y-6 text-center">
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                <ShieldAlert size={32} className="mx-auto text-red-500 mb-3" />
                                <div className="p-2 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
                                    ACCESS DENIED<br />
                                    Wallet <span className="font-mono break-all text-[8px] opacity-60">{String(walletAddress || 'NOT CONNECTED')}</span> is not registered in the 15Market administrative directory.
                                </div>
                            </div>
                            <button
                                onClick={() => open()}
                                className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] hover:text-white transition-colors"
                            >
                                Change Identity
                            </button>
                        </div>
                    ) : isOnboarding ? (
                        <div className="space-y-6">
                            <div className="text-center space-y-2">
                                <h3 className="text-xs font-black text-[#3CB371] uppercase tracking-widest">Operator Onboarding</h3>
                                <p className="text-[9px] text-white/30 uppercase font-bold tracking-widest">Initialize your administrative access keys.</p>
                            </div>

                            <div className="space-y-4">
                                <button
                                    onClick={() => setOnboardingForm({ ...onboardingForm, xLinked: true })}
                                    className={`w-full py-4 rounded-xl border flex items-center justify-center gap-3 transition-all ${onboardingForm.xLinked ? 'bg-[#3CB371]/20 border-[#3CB371]/30 text-[#3CB371]' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                                >
                                    <Globe size={16} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{onboardingForm.xLinked ? 'X ACCOUNT LINKED' : 'LINK X ACCOUNT'}</span>
                                </button>

                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={onboardingForm.username}
                                        onChange={(e) => setOnboardingForm({ ...onboardingForm, username: e.target.value })}
                                        placeholder="CHOOSE USERNAME"
                                        className="w-full bg-black/60 border border-white/5 rounded-xl px-5 py-4 text-[10px] font-black text-white outline-none focus:border-[#3CB371]/40 uppercase tracking-widest"
                                    />
                                    <input
                                        type="password"
                                        value={onboardingForm.password}
                                        onChange={(e) => setOnboardingForm({ ...onboardingForm, password: e.target.value })}
                                        placeholder="SET SECURE PASS-KEY"
                                        className="w-full bg-black/60 border border-white/5 rounded-xl px-5 py-4 text-[10px] font-black text-white outline-none focus:border-[#3CB371]/40"
                                    />
                                </div>

                                <button
                                    onClick={handleOnboarding}
                                    className="w-full bg-[#3CB371] text-white py-4.5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-[0_10px_30px_rgba(60,179,113,0.3)] hover:scale-[1.02] transition-transform"
                                >
                                    Initialize Operator Profile
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-4">
                                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[#3CB371]/10 flex items-center justify-center border border-[#3CB371]/20 text-[#3CB371]">
                                            <Shield size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[8px] text-white/30 font-black uppercase tracking-widest">Authorized Wallet</p>
                                            <p className="text-[10px] text-white font-mono">{String(walletAddress || '').slice(0, 6)}...{String(walletAddress || '').slice(-4)}</p>
                                        </div>
                                    </div>
                                    <div className="px-2 py-1 rounded bg-[#3CB371]/10 text-[#3CB371] text-[8px] font-black uppercase tracking-tighter border border-[#3CB371]/20">
                                        VERIFIED
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Operator ID</label>
                                    <input
                                        type="text"
                                        value={loginForm.username}
                                        onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-[#3CB371]/40 focus:bg-black/80 transition-all placeholder:text-white/5"
                                        placeholder="operator"
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

                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={() => open()}
                                        className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] hover:text-white transition-colors"
                                    >
                                        Switch Wallet
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}

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
                {!keeperHealth.connected && !navigator.onLine && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="absolute top-0 left-0 w-full z-[1200] bg-red-500/90 text-white px-4 py-2 flex items-center justify-center gap-3 backdrop-blur-md shadow-lg"
                    >
                        <AlertCircle size={20} className="animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest">
                            No Internet Connection: Checking your network...
                        </span>
                    </motion.div>
                )}

                {!keeperHealth.connected && navigator.onLine && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="absolute top-0 left-0 w-full z-[1200] bg-yellow-500/90 text-white px-4 py-2 flex items-center justify-center gap-3 backdrop-blur-md shadow-lg"
                    >
                        <RefreshCw size={20} className="animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest text-black">
                            Synchronizing Node: Re-establishing secure relay (Attempt {String(keeperHealth.failCount || '0')})...
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
                                    {String(notification.title || '')}
                                </h5>
                                <p className="text-xs font-bold text-white/70 leading-relaxed uppercase tracking-widest">{String(notification.message || '')}</p>
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
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-4">{String(confirmAction.title || '')}</h3>
                                <p className="text-xs font-bold text-white/40 uppercase tracking-[0.1em] leading-relaxed mb-10 max-w-sm">
                                    {String(confirmAction.message || '')}
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

                <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
                    <NavItem icon={BarChart3} label="Dashboard" id="dashboard" active={activeTab === 'dashboard'} onClick={setActiveTab} />
                    <NavItem icon={Settings} label="Settings" id="settings" active={activeTab === 'settings'} onClick={setActiveTab} />
                    <NavItem icon={Megaphone} label="Broadcasts" id="broadcasts" active={activeTab === 'broadcasts'} onClick={setActiveTab} />
                    <NavItem icon={Trophy} label="Campaigns" id="campaigns" active={activeTab === 'campaigns'} onClick={setActiveTab} />
                    <NavItem icon={Gavel} label="Disputes" id="disputes" active={activeTab === 'disputes'} onClick={setActiveTab} />
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
                            <p className="text-[10px] font-black text-white">{String(currentUser?.username || 'GUEST')}</p>
                            <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{String(currentUser?.role || 'IDENTITY_PENDING')}</p>
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
                    <GlobalTradeScroller
                        wallet={DISCONNECTED_WALLET}
                        currentNetwork="ARC"
                        history={filteredHistory}
                    />
                </div>

                <div className="flex-1 overflow-y-auto bg-[#050505] p-4 lg:p-10 custom-scrollbar relative">
                    <div className="max-w-7xl mx-auto">
                        {/* SYSTEM EMERGENCY ALERTS */}
                        <AnimatePresence>
                            {(() => {
                                const pendingDisputes = unifiedMetrics.pendingDisputes;
                                const isHighDisputes = pendingDisputes > 5;

                                if (!isHighDisputes) return null;

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
                                                    Security Alert: High Dispute Load
                                                </h3>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setActiveTab('disputes')}
                                                className="px-6 py-3 bg-[#FF4444] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(255,68,68,0.3)]"
                                            >
                                                Process Disputes
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })()}
                        </AnimatePresence>
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 lg:mb-10 gap-6">
                            <div>
                                <h1 className="text-2xl lg:text-3xl font-black text-white uppercase tracking-tight mb-1 mt-6 lg:mt-0">
                                    {activeTab && activeTab.length > 0 ? (activeTab.charAt(0).toUpperCase() + activeTab.slice(1)) : 'Dashboard'}
                                </h1>
                                <p className="text-[10px] lg:text-sm text-white/40 font-bold uppercase tracking-widest">
                                    System status: <span className="text-[#3CB371]">Operational</span> • {new Date().toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="flex w-full sm:w-auto bg-black/40 p-1 rounded-xl border border-white/5">
                                    <div className="px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-[#3B82F6] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                                        Arc Network
                                    </div>
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
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-[#111] border border-white/5 p-6 rounded-[32px] overflow-hidden relative transition-colors duration-500 border-blue-500/10">
                                        <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l pointer-events-none from-[#3B82F6]/10 to-transparent" />
                                        <div className="flex flex-col md:flex-row md:items-center gap-6 relative z-10 w-full">
                                            <div className="p-4 bg-black rounded-2xl border border-[#3B82F6]/20 w-fit">
                                                <Activity className="animate-pulse text-[#3B82F6]" size={32} />
                                            </div>
                                            <div className="flex-1">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-1 text-[#3B82F6]">
                                                        NODE STATUS {lastSync && `• SYNC: ${String(lastSync)}`}
                                                    </p>
                                                    <h2 className="text-xl lg:text-3xl font-black text-white">{unifiedMetrics.currentStats.wallets} <span className="text-[10px] font-bold text-white/40 ml-2 uppercase tracking-widest">Active Users</span></h2>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <p className="text-[9px] font-mono text-white/20 uppercase tracking-widest">
                                                            Active Relay: Arc Network
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

                                    {/* SYSTEM CONTROLS QUICK PANEL */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                        <div className="bg-[#111] border border-[#3CB371]/20 p-6 rounded-[32px] relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 h-full w-1/4 bg-gradient-to-l from-[#3CB371]/5 to-transparent pointer-events-none" />
                                            <div className="flex items-center justify-between relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${platformSettings.maintenanceMode ? 'bg-[#FF7F50]/20' : 'bg-[#3CB371]/20'}`}>
                                                        <Settings className={platformSettings.maintenanceMode ? 'text-[#FF7F50]' : 'text-[#3CB371]'} size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">PLATFORM STATUS</p>
                                                        <h3 className="text-lg font-black text-white uppercase tracking-tight">
                                                            {platformSettings.maintenanceMode ? 'MAINTENANCE ACTIVE' : 'SYSTEM OPERATIONAL'}
                                                        </h3>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newState = !platformSettings.maintenanceMode;
                                                        setConfirmAction({
                                                            title: newState ? 'ACTIVATE MAINTENANCE' : 'RESTORE OPERATIONS',
                                                            message: newState 
                                                                ? 'This will suspend all trading and notify all active users. Markets will be locked for maintenance.' 
                                                                : 'This will restore live trading and remove maintenance banners from all terminals.',
                                                            onConfirm: () => {
                                                                const updated = { ...platformSettings, maintenanceMode: newState };
                                                                handleSaveSettings(updated);
                                                            }
                                                        });
                                                    }}
                                                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${platformSettings.maintenanceMode ? 'bg-[#3CB371] text-white shadow-[0_10px_30px_rgba(60,179,113,0.3)]' : 'bg-[#FF7F50] text-white shadow-[0_10px_30px_rgba(255,127,80,0.3)]'}`}
                                                >
                                                    {platformSettings.maintenanceMode ? 'RESUME TRADING' : 'START MAINTENANCE'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-[#111] border border-blue-500/20 p-6 rounded-[32px] relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 h-full w-1/4 bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
                                            <div className="flex items-center justify-between relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                                                        <Radio className="text-blue-500 animate-pulse" size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">GLOBAL SIGNAL</p>
                                                        <h3 className="text-lg font-black text-white uppercase tracking-tight">BROADCAST CENTER</h3>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setIsBroadcastModalOpen(true)}
                                                    className="px-6 py-3 bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(59,130,246,0.3)] hover:scale-105 transition-all"
                                                >
                                                    PUSH ANNOUNCEMENT
                                                </button>
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
                                            label="Arc Treasury"
                                            value={`${unifiedMetrics.displayReserve} ${unifiedMetrics.currencyUnit}`}
                                            trend="ASSETS"
                                            positive={true}
                                        />
                                        <StatCard
                                            icon={TrendingUp}
                                            label="Protocol Revenue"
                                            value={`${Number(autoSignerFees?.arc || 0).toFixed(6)} ${unifiedMetrics.currencyUnit}`}
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
                                                <p className="text-[10px] font-bold text-white/20 mt-1">Settled trades from Arc network</p>
                                            </div>

                                            <div className="flex flex-wrap gap-4">
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
                                                        <th className="px-6 lg:px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Trade ID / User</th>
                                                        <th className="hidden lg:table-cell px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Network</th>
                                                        <th className="px-6 lg:px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Direction / Entry</th>
                                                        <th className="hidden sm:table-cell px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-center">Stake</th>
                                                        <th className="px-6 lg:px-8 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-center lg:text-left">Result</th>
                                                        <th className="hidden lg:table-cell px-8 py-4 text-right text-[9px] font-black text-white/20 uppercase tracking-widest">Timestamp</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.02]">
                                                    {filteredHistory.map((trade, idx) => (
                                                         <tr 
                                                            key={idx} 
                                                            onClick={() => setSelectedTrade(trade)}
                                                            className="hover:bg-white/[0.01] transition-all group cursor-pointer active:bg-white/[0.05]"
                                                         >
                                                             <td className="px-6 lg:px-8 py-5">
                                                                 <div className="flex flex-col">
                                                                     <span className="text-[10px] font-mono text-white">#{trade.publicKey?.slice(0, 4) || trade.id?.toString().slice(-4) || 'N/A'}</span>
                                                                     <span className="text-[8px] text-white/20 font-black uppercase mt-0.5">{trade.owner?.slice(0, 4) || '0x??'}...{trade.owner?.slice(-4) || '??'}</span>
                                                                 </div>
                                                             </td>
                                                             <td className="hidden lg:table-cell px-8 py-5">
                                                                 <span className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter bg-blue-500/10 text-blue-500">
                                                                     ARC
                                                                 </span>
                                                             </td>
                                                             <td className="px-6 lg:px-8 py-5">
                                                                 <div className="flex flex-col">
                                                                     <span className={`text-[10px] font-black ${trade.direction === 'UP' || trade.direction === 'buy' ? 'text-[#3CB371]' : 'text-red-500'} uppercase tracking-tighter`}>
                                                                        {String(trade.direction).toUpperCase()} @ ${Number(trade.entryPrice || 0).toFixed(2)}
                                                                     </span>
                                                                     <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest mt-0.5">{trade.duration}s Trade</span>
                                                                 </div>
                                                             </td>
                                                             <td className="hidden sm:table-cell px-8 py-5 text-center">
                                                                 <span className="text-[11px] font-black text-white">{Number(trade.amount || 0).toFixed(2)} USDC</span>
                                                             </td>
                                                             <td className="px-6 lg:px-8 py-5">
                                                                 <div className="flex items-center justify-center lg:justify-start gap-2">
                                                                     <div className={`w-1.5 h-1.5 rounded-full ${trade.status === 'ACTIVE' || trade.status === 'PENDING' ? 'bg-blue-400' : (trade.won || trade.status === 'WON' ? 'bg-[#3CB371]' : 'bg-red-500')}`} />
                                                                     <span className={`text-[9px] font-black uppercase tracking-widest ${trade.status === 'ACTIVE' || trade.status === 'PENDING' ? 'text-blue-400' : (trade.won || trade.status === 'WON' ? 'text-[#3CB371]' : 'text-red-500')}`}>
                                                                         {trade.status === 'ACTIVE' || trade.status === 'PENDING' ? 'LIVE' : (trade.won || trade.status === 'WON' ? 'WON' : 'LOST')}
                                                                     </span>
                                                                 </div>
                                                             </td>
                                                             <td className="hidden lg:table-cell px-8 py-5 text-right">
                                                                 <span className="text-[9px] font-mono text-white/40">
                                                                     {new Date(trade.timestamp).toLocaleTimeString()}
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
                                                                    ARC
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
                                                            placeholder="e.g. 500 USDC"
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 transition-all font-bold"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Start Date & Time</label>
                                                        <div className="relative">
                                                            <input
                                                                type="datetime-local"
                                                                value={newCampaign.startTime}
                                                                style={{ colorScheme: 'dark' }}
                                                                onChange={(e) => setNewCampaign({ ...newCampaign, startTime: e.target.value })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 transition-all font-mono"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">End Date & Time</label>
                                                        <div className="relative">
                                                            <input
                                                                type="datetime-local"
                                                                value={newCampaign.endTime}
                                                                style={{ colorScheme: 'dark' }}
                                                                onChange={(e) => setNewCampaign({ ...newCampaign, endTime: e.target.value })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 transition-all font-mono"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-white/40 uppercase ml-1">Target Network</label>
                                                        <select
                                                            value={newCampaign.network}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, network: e.target.value })}
                                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-xs text-white outline-none focus:border-yellow-500/40 appearance-none font-black uppercase tracking-widest"
                                                        >
                                                            <option value="arc">ARC NETWORK</option>
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
                                                                        <div className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase border bg-blue-500/10 border-blue-500/30 text-blue-500`}>
                                                                            ARC NETWORK
                                                                        </div>
                                                                        {Date.now() < camp.endTime && Date.now() > camp.startTime && (
                                                                            <div className="flex items-center gap-2 px-2.5 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-md text-[8px] font-black text-yellow-500 uppercase animate-pulse">
                                                                                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                                                                                Live Now
                                                                            </div>
                                                                        )}
                                                                        {Date.now() >= camp.endTime && (
                                                                            <div className="flex items-center gap-2 px-2.5 py-1 bg-red-500/20 border border-red-500/30 rounded-md text-[8px] font-black text-red-500 uppercase">
                                                                                <CheckCircle size={10} />
                                                                                Completed
                                                                            </div>
                                                                        )}
                                                                        {Date.now() <= camp.startTime && (
                                                                            <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md text-[8px] font-black text-blue-500 uppercase">
                                                                                <Clock size={10} />
                                                                                Upcoming
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
                                                                            <p className="text-[10px] font-black text-white uppercase tracking-widest bg-white/5 py-1.5 px-3 rounded-lg border border-white/5 w-fit">{(camp.enrollmentCount || enrollmentsMap[camp.id] || 0)} OPERATORS</p>
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
                                                                {Date.now() >= camp.endTime && (
                                                                    <button
                                                                        onClick={() => handleViewReport(camp.id)}
                                                                        className="px-6 py-3 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-blue-500/20 transition-all hover:scale-105"
                                                                    >
                                                                        📑 Detailed Report
                                                                    </button>
                                                                )}
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
                                                                                        <td className="px-6 py-4 text-xs font-mono font-bold text-white/80">{row.address?.slice(0, 8)}...</td>
                                                                                        <td className="px-6 py-4 text-right text-xs font-bold text-[#3CB371]">{Number(row.winRate || 0).toFixed(1)}%</td>
                                                                                        <td className="px-6 py-4 text-right text-xs font-bold text-white">{row.pnl > 0 ? '+' : ''}{Number(row.pnl || 0).toFixed(4)}</td>
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
                                                                                        <p className="text-[10px] font-bold text-white mb-0.5">{t.address?.slice(0, 6)}...</p>
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
                                                    {broadcastHistory.length > 0 ? broadcastHistory.map((b) => {
                                                        const isActive = b.expiry > Date.now();
                                                        return (
                                                            <div key={b.id} className={`p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between ${!isActive ? 'opacity-50' : ''}`}>
                                                                <div className="flex items-center gap-6">
                                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${b.type === 'EMERGENCY' ? 'bg-red-500/10 text-red-500' : 'bg-[#3CB371]/10 text-[#3CB371]'}`}>
                                                                        <Megaphone size={20} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-black text-white uppercase">{b.text}</p>
                                                                        <div className="flex items-center gap-4 mt-1">
                                                                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">ISSUED BY: {b.sender}</p>
                                                                            <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${isActive ? 'text-[#3CB371]' : 'text-white/20'}`}>
                                                                                <Clock size={10} />
                                                                                {isActive ? `${Math.max(0, Math.floor((b.expiry - Date.now()) / 1000))}s REMAINING` : 'EXPIRED / ARCHIVED'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {isActive && (
                                                                        <button
                                                                            onClick={() => {
                                                                                const updated = broadcasts.filter(item => item.id !== b.id);
                                                                                setBroadcasts(updated);
                                                                                localStorage.setItem('15market_admin_broadcast', JSON.stringify(updated));
                                                                            }}
                                                                            className="px-4 py-2 bg-red-500/10 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/20 rounded-lg border border-red-500/20"
                                                                        >
                                                                            Halt
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            setBroadcastHistory(prev => prev.filter(item => item.id !== b.id));
                                                                        }}
                                                                        className="px-4 py-2 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white rounded-lg border border-white/5"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <div className="text-center py-12 text-white/20 uppercase font-black tracking-widest text-[10px]">No broadcast history</div>
                                                    )}
                                                </div>
                                            </div>
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

                                        {/* Settings Sub-Nav */}
                                        <div className="flex flex-wrap gap-2 lg:gap-4 p-2 bg-white/5 border border-white/5 rounded-2xl mb-8">
                                            {[
                                                { id: 'platform', label: 'Platform', icon: Cpu },
                                                { id: 'treasury', label: 'Treasury', icon: Coins },
                                                { id: 'listing', label: 'Markets', icon: Database },
                                                { id: 'beta', label: 'Beta Entry', icon: Key },
                                                { id: 'globe', label: 'Geo-Map', icon: Globe },
                                                { id: 'directory', label: 'Profiles', icon: Users },
                                                { id: 'security', label: 'Security', icon: ShieldCheck },
                                                { id: 'terminal', label: 'System Logs', icon: TerminalIcon },
                                            ].map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setSettingsSubTab(tab.id)}
                                                    className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${settingsSubTab === tab.id
                                                        ? 'bg-[#3CB371] text-white shadow-[0_0_20px_rgba(60,179,113,0.3)]'
                                                        : 'text-white/40 hover:bg-white/5 hover:text-white'
                                                        }`}
                                                >
                                                    <tab.icon size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {
                                                settingsSubTab === 'platform' && (
                                    <motion.div
                                        key="platform-config"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="space-y-12"
                                    >
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                            {/* Core Toggles */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] space-y-8 shadow-2xl">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-[#3CB371]/10 rounded-2xl">
                                                        <Zap size={24} className="text-[#3CB371]" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white uppercase">Killswitches</h4>
                                                        <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest">Global platform status controls</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5">
                                                        <div>
                                                            <p className="text-xs font-black text-white uppercase">Trading Halt</p>
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

                                            {/* Updated Multipliers (Pulling from platformSettings) */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] space-y-8 shadow-2xl">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-blue-500/10 rounded-2xl">
                                                        <Coins size={24} className="text-blue-500" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white uppercase">Profit Pegging</h4>
                                                        <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest">Active payout multipliers</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-white/40 uppercase">5s Multiplier</span>
                                                        <span className="text-xs font-black text-[#3CB371]">{platformSettings.payoutMultipliers?.["5"] || "2.90"}x</span>
                                                    </div>
                                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-white/40 uppercase">10s Multiplier</span>
                                                        <span className="text-xs font-black text-[#3CB371]">{platformSettings.payoutMultipliers?.["10"] || "2.40"}x</span>
                                                    </div>
                                                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-white/40 uppercase">15s Multiplier</span>
                                                        <span className="text-xs font-black text-[#3CB371]">{platformSettings.payoutMultipliers?.["15"] || "1.90"}x</span>
                                                    </div>
                                                    <div className="p-4 bg-[#3CB371]/10 border border-[#3CB371]/20 rounded-2xl flex items-center gap-4">
                                                        <CheckCircle2 size={14} className="text-[#3CB371] shrink-0" />
                                                        <p className="text-[8px] font-bold text-[#3CB371] uppercase leading-relaxed">
                                                            Multipliers are synced with the Arc Protocol ruleset (15s: 1.90x, 10s: 2.40x, 5s: 2.90x).
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Dynamic Operational Config */}
                                            <div className="bg-[#0D0D0D] border border-white/10 p-8 rounded-[40px] space-y-8 shadow-2xl">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-purple-500/10 rounded-2xl">
                                                        <Sliders size={24} className="text-purple-500" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white uppercase">Operational Limits</h4>
                                                        <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest">Global risk parameters</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
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
                                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-2">Min Stake (USDC)</label>
                                                        <input
                                                            type="number"
                                                            value={platformSettings.minBet}
                                                            onChange={(e) => updateSetting('minBet', parseFloat(e.target.value))}
                                                            className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-purple-500/40"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-[#0D0D0D] border border-white/10 p-10 rounded-[48px] space-y-10 relative overflow-hidden shadow-2xl">
                                            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                                                <Server size={180} />
                                            </div>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                                <div>
                                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">System Infrastructure</h3>
                                                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Authorized Endpoints and Node Sensitivity</p>
                                                </div>
                                                <button
                                                    onClick={() => handleSaveSettings()}
                                                    className="w-full md:w-auto flex items-center justify-center gap-3 px-10 py-4 bg-[#3CB371] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-[0_20px_40px_rgba(60,179,113,0.3)] hover:scale-105 transition-all"
                                                >
                                                    <Save size={16} />
                                                    Commit Changes
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                                                <div>
                                                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-3">Primary RPC Node</label>
                                                    <input
                                                        type="text"
                                                        value={platformSettings.rpcEndpoint}
                                                        onChange={(e) => updateSetting('rpcEndpoint', e.target.value)}
                                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-[#3CB371]/40"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-3">Arbiter Response Delta (ms)</label>
                                                    <input
                                                        type="number"
                                                        value={platformSettings.priceFeedInterval}
                                                        onChange={(e) => updateSetting('priceFeedInterval', parseInt(e.target.value))}
                                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-mono text-white outline-none focus:border-[#3CB371]/40"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest block mb-3">AI Consensus Sensitivity</label>
                                                    <div className="flex items-center gap-4 bg-black/40 border border-white/5 rounded-2xl px-5 py-4">
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="1"
                                                            step="0.01"
                                                            value={platformSettings.aiArbiterSensitivity}
                                                            onChange={(e) => updateSetting('aiArbiterSensitivity', parseFloat(e.target.value))}
                                                            className="flex-1 accent-[#3CB371]"
                                                        />
                                                        <span className="text-[10px] font-mono text-white/40">{Math.round(platformSettings.aiArbiterSensitivity * 100)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'directory' && (
                                    <motion.div
                                        key="directory"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden"
                                    >
                                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                            <div>
                                                <h3 className="text-lg font-black text-white uppercase tracking-tight">User Directory</h3>
                                                <p className="text-[10px] text-white/20 font-bold uppercase mt-1">Manage global user profiles & status</p>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="relative">
                                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                                                    <input
                                                        type="text"
                                                        placeholder="SEARCH PROFILES..."
                                                        className="bg-black/40 border border-white/5 rounded-xl pl-10 pr-6 py-2.5 text-[9px] font-black text-white outline-none focus:border-[#3CB371]/40 w-64"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-8">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {protocolData.profiles.map((profile, idx) => (
                                                    <div key={idx} className="p-6 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all group">
                                                        <div className="flex items-center gap-4 mb-6">
                                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3CB371]/20 to-blue-500/20 flex items-center justify-center text-[#3CB371]">
                                                                <User size={28} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-black text-white truncate">{profile.username || 'Anonymous'}</p>
                                                                <p className="text-[9px] font-mono text-white/20 truncate">{profile.publicKey?.slice(0, 8)}...{profile.publicKey?.slice(-8)}</p>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                                                                <p className="text-[8px] font-black text-white/20 uppercase mb-1">Trades</p>
                                                                <p className="text-xs font-bold text-white">{profile.stats?.totalTrades || 0}</p>
                                                            </div>
                                                            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                                                                <p className="text-[8px] font-black text-white/20 uppercase mb-1">Wins</p>
                                                                <p className="text-xs font-bold text-[#3CB371]">{profile.stats?.totalWins || 0}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {protocolData.profiles.length === 0 && (
                                                    <div className="col-span-full py-20 text-center opacity-10">
                                                        <Users size={64} className="mx-auto mb-4" />
                                                        <p className="text-xs font-black uppercase tracking-[0.3em]">No synced profiles found in Arc Keeper</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'beta' && (
                                    <motion.div
                                        key="beta"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-8"
                                    >
                                        <div className="bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden">
                                            <div className="p-8 border-b border-white/5 flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Beta Entry Control</h3>
                                                    <p className="text-[10px] text-white/20 font-bold uppercase mt-1">Approve rounds access requests</p>
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead>
                                                        <tr className="bg-white/5">
                                                            <th className="text-left px-8 py-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Applicant</th>
                                                            <th className="text-left px-8 py-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Email</th>
                                                            <th className="text-left px-8 py-5 text-[9px] font-black text-white/30 uppercase tracking-widest text-center">Status</th>
                                                            <th className="text-right px-8 py-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/[0.02]">
                                                        {betaApplications.map((app, i) => (
                                                            <tr key={i} className="hover:bg-white/[0.01]">
                                                                <td className="px-8 py-6">
                                                                    <p className="font-mono text-xs text-white">{app.address}</p>
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    <p className="text-xs text-white/40">{app.email}</p>
                                                                </td>
                                                                <td className="px-8 py-6 text-center">
                                                                    <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-[9px] font-black uppercase rounded-lg border border-yellow-500/20">Pending</span>
                                                                </td>
                                                                <td className="px-8 py-6 text-right">
                                                                    <button
                                                                        onClick={() => handleApproveBeta(app.address, app.email)}
                                                                        className="px-6 py-2 bg-[#3CB371]/20 text-[#3CB371] text-[9px] font-black uppercase rounded-lg border border-[#3CB371]/30 hover:bg-[#3CB371] hover:text-white transition-all"
                                                                    >
                                                                        Grant Access
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {betaApplications.length === 0 && (
                                                            <tr><td colSpan="4" className="py-20 text-center opacity-20 text-[10px] font-black uppercase tracking-widest italic">No pending applications</td></tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden">
                                            <div className="p-8 border-b border-white/5">
                                                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Authorized Beta List</h3>
                                            </div>
                                            <div className="p-8">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {authorizedWallets.map((w, i) => (
                                                        <div key={i} className="flex items-center justify-between p-5 bg-white/5 border border-white/5 rounded-2xl group">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-2 h-2 rounded-full bg-[#3CB371]" />
                                                                <p className="font-mono text-xs text-white/60 group-hover:text-white transition-colors">{w}</p>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleRevokeBeta(w)}
                                                                className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                                                            >
                                                                <LogOut size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'terminal' && (
                                    <motion.div
                                        key="terminal"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="bg-black border border-white/10 rounded-[32px] overflow-hidden flex flex-col h-[600px] shadow-2xl"
                                    >
                                        <div className="p-6 bg-[#0A0A0A] border-b border-white/10 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-[#3CB371]/10 rounded-xl flex items-center justify-center text-[#3CB371]">
                                                    <TerminalIcon size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">System Logs</h3>
                                                    <p className="text-[9px] text-[#3CB371] font-bold uppercase">Streaming live from Arc Keeper Node</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                                                    <div className="w-1.5 h-1.5 bg-[#3CB371] rounded-full animate-pulse" />
                                                    <span className="text-[8px] font-black text-white/60 uppercase">Connected</span>
                                                </div>
                                                <button onClick={() => setKeeperLogs([])} className="p-2 hover:bg-white/5 text-white/20 hover:text-white transition-colors"><RefreshCw size={14} /></button>
                                            </div>
                                        </div>
                                        <div className="flex-1 p-6 font-mono text-[10px] sm:text-xs overflow-y-auto custom-scrollbar-terminal bg-black/40">
                                            {keeperLogs.map((log, i) => (
                                                <div key={i} className="mb-2.5 flex gap-4 opacity-80 hover:opacity-100 transition-opacity">
                                                    <span className="text-white/20 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                                                    <span className={`${log.includes('ERROR') || log.includes('FAILED') ? 'text-red-500' : log.includes('SUCCESS') || log.includes('PLACED') ? 'text-[#3CB371]' : 'text-blue-400'}`}>
                                                        {log}
                                                    </span>
                                                </div>
                                            ))}
                                            {keeperLogs.length === 0 && (
                                                <div className="h-full flex items-center justify-center text-white/5 italic">Awaiting node transmission...</div>
                                            )}
                                        </div>
                                        <div className="p-4 bg-[#0A0A0A] border-t border-white/5 flex items-center gap-4">
                                            <div className="w-2 h-2 rounded-full bg-[#3CB371] shadow-[0_0_10px_rgba(60,179,113,0.5)]" />
                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Citadel Secure Relay v2.0.4 - System Active</span>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'treasury' && (
                                    <motion.div
                                        key="treasury"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="bg-[#0D0D0D] border border-white/10 p-10 rounded-[48px] space-y-10 relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                                            <Database size={180} />
                                        </div>
                                        <div className="relative z-10 flex flex-col items-center max-w-md mx-auto text-center">
                                            <div className="w-20 h-20 bg-[#3CB371]/10 rounded-3xl flex items-center justify-center mb-6 text-[#3CB371] border border-[#3CB371]/20">
                                                <Database size={40} />
                                            </div>
                                            <h3 className="text-2xl font-black text-white uppercase tracking-widest">Sweep to Root</h3>
                                            <p className="text-xs text-white/40 font-bold mt-2 uppercase px-12 leading-relaxed">Extract accumulated liquidities to the secure root wallet: {ROOT_WALLET.slice(0, 10)}...</p>
                                            
                                            <div className="w-full mt-12 mb-10 p-6 bg-white/5 rounded-3xl border border-white/10 flex flex-col items-center">
                                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Available Reserve</p>
                                                <p className="text-3xl font-black text-[#3CB371] tracking-tighter">{Number(arcTreasuryBalance || 0).toFixed(4)} USDC</p>
                                            </div>

                                            <div className="w-full space-y-6">
                                                <div className="text-left w-full">
                                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 block ml-1">Extraction Payload (USDC)</label>
                                                    <input
                                                        id="treasury-sweep-amt"
                                                        type="number"
                                                        placeholder="0.00"
                                                        className="w-full bg-black/60 border border-white/5 rounded-2xl px-6 py-5 text-sm font-bold text-white outline-none focus:border-[#3CB371]/40"
                                                    />
                                                </div>

                                                <button
                                                    onClick={() => handleWithdraw(document.getElementById('treasury-sweep-amt')?.value)}
                                                    className="w-full bg-[#3CB371] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:scale-105 transition-all shadow-[0_20px_40px_rgba(60,179,113,0.3)]"
                                                >
                                                    Authorize Extraction
                                                </button>
                                                
                                                <p className="text-[9px] text-white/20 uppercase font-black tracking-widest leading-relaxed px-6">
                                                    Sweeping is an irreversible administrative action. Transfers bypass standard cooldowns.
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'listing' && (
                                    <motion.div
                                        key="listing"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden"
                                    >
                                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                                                    <PlusCircle size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Market Listing Control</h3>
                                                    <p className="text-[9px] text-white/20 font-bold uppercase mt-1">Manage active trading pairs & oracle feeds</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-8">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {listedTokens.map((token) => (
                                                    <div key={token.id} className={`p-6 border rounded-[32px] transition-all relative overflow-hidden group ${activeTokenId === token.id ? 'bg-[#3CB371]/5 border-[#3CB371]/20' : 'bg-white/5 border-white/5 hover:bg-white/[0.08]'}`}>
                                                        <div className="flex items-center justify-between mb-8 relative z-10">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${activeTokenId === token.id ? 'bg-[#3CB371] text-white' : 'bg-white/10 text-white/40'}`}>
                                                                    {token.symbol?.slice(0, 1)}
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-black text-white uppercase">{token.symbol}</p>
                                                                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{token.name}</p>
                                                                </div>
                                                            </div>
                                                            <div className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase ${activeTokenId === token.id ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-white/10 text-white/40'}`}>
                                                                {activeTokenId === token.id ? 'PRIMARY' : 'SECONDARY'}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="space-y-3 relative z-10">
                                                            <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-white/20">
                                                                <span>Oracle</span>
                                                                <span className="text-white/40">PYTH: {token.pythId?.slice(0, 10)}...</span>
                                                            </div>
                                                            <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-white/20">
                                                                <span>Sync Feed</span>
                                                                <span className="text-white/40">BINANCE: {token.binance}</span>
                                                            </div>
                                                        </div>

                                                        <div className="mt-8 flex gap-3 relative z-10">
                                                            <button 
                                                                onClick={() => handleSetActiveMarket(token.id)}
                                                                disabled={activeTokenId === token.id}
                                                                className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTokenId === token.id ? 'bg-[#3CB371] text-white shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                                                            >
                                                                Set Primary
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDelistToken(token.id)}
                                                                className="px-4 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all"
                                                            >
                                                                <LogOut size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'security' && (
                                    <motion.div
                                        key="security"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="bg-[#0D0D0D] border border-white/5 rounded-[40px] overflow-hidden"
                                    >
                                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <h3 className="text-sm font-black uppercase tracking-widest text-white">Infrastructure Operators</h3>
                                                <p className="text-[9px] text-white/20 font-bold uppercase mt-1">Manage platform access & wallet-based permissions</p>
                                            </div>
                                            {currentUser?.role === 'ROOT' && (
                                                <button
                                                    onClick={() => setIsStaffModalOpen(true)}
                                                    className="w-fit flex items-center gap-2 px-6 py-2 bg-[#3CB371] text-white text-[10px] font-black uppercase tracking-widest rounded-lg"
                                                >
                                                    <PlusCircle size={14} />
                                                    Authorize Level-1 Wallet
                                                </button>
                                            )}
                                        </div>
                                        <div className="p-8">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {staffMembers.map((staff) => (
                                                    <div key={staff.id} className="p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center relative">
                                                                <User size={20} className="text-white/40 group-hover:text-[#3CB371] transition-colors" />
                                                                {staff.onboardingComplete ? (
                                                                    <div className="absolute -top-1 -right-1 bg-[#3CB371] rounded-full p-0.5 border border-[#0D0D0D]">
                                                                        <CheckCircle2 size={10} className="text-white" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5 border border-[#0D0D0D]">
                                                                        <Clock size={10} className="text-white" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-black text-white truncate w-32">{staff.address}</p>
                                                                <p className="text-[9px] font-bold text-[#3CB371] uppercase tracking-widest">{staff.role}</p>
                                                                <p className="text-[10px] text-white/40 font-bold uppercase mt-0.5">{staff.username || 'Uninitialized'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-3">
                                                            <div className={`w-2 h-2 rounded-full ${staff.status === 'ACTIVE' ? 'bg-[#3CB371] animate-pulse' : 'bg-white/10'}`} />
                                                            {staff.role !== 'ROOT' && currentUser?.role === 'ROOT' && (
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
                                settingsSubTab === 'globe' && (
                                    <motion.div
                                        key="globe"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="bg-[#0D0D0D] border border-white/5 rounded-[48px] overflow-hidden flex flex-col h-[700px] shadow-2xl"
                                    >
                                        <div className="p-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-[#3CB371]/10 rounded-2xl flex items-center justify-center text-[#3CB371]">
                                                    <Globe size={28} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Geo-Spatial Analysis</h3>
                                                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-[0.2em] mt-1">Live global trade density & infrastructure health</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="px-4 py-2 bg-[#3CB371]/20 rounded-xl border border-[#3CB371]/30 text-[9px] font-black text-[#3CB371] uppercase tracking-widest">
                                                    REAL-TIME SYNC
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 relative bg-black/40">
                                            <GlobalExpansionMap onLocationUpdate={(loc) => {}} simplified={false} />
                                            {/* Map Overlay Stats */}
                                            <div className="absolute bottom-8 left-8 p-6 bg-black/80 backdrop-blur-xl border border-white/10 rounded-3xl space-y-4 max-w-xs shadow-2xl">
                                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Infrastructure Status</h4>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] text-white/40 uppercase font-black">NA-East Node</span>
                                                        <span className="text-[9px] text-[#3CB371] font-black">OPTIMAL (12ms)</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] text-white/40 uppercase font-black">EU-Central Node</span>
                                                        <span className="text-[9px] text-yellow-500 font-black">ACTIVE (48ms)</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] text-white/40 uppercase font-black">AS-Tokyo Node</span>
                                                        <span className="text-[9px] text-blue-500 font-black">STABLE (92ms)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                            {
                                settingsSubTab === 'security' && (
                                    <motion.div
                                        key="security"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="bg-[#0D0D0D] border border-white/10 p-10 rounded-[48px] space-y-10 relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                                            <Shield size={180} />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-6 mb-12">
                                                <div className="w-16 h-16 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500 border border-red-500/20">
                                                    <Lock size={32} />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Root Authentication</h3>
                                                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Manage administrative credentials and access tokens</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                                <div className="space-y-6">
                                                    <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-1">Secure Credential Rotation</h4>
                                                    <div className="space-y-4">
                                                        <input 
                                                            type="text" 
                                                            placeholder="Current Username"
                                                            className="w-full bg-black/60 border border-white/5 rounded-2xl px-6 py-5 text-xs text-white outline-none focus:border-red-500/40"
                                                        />
                                                        <input 
                                                            type="password" 
                                                            placeholder="New Secure Password"
                                                            className="w-full bg-black/60 border border-white/5 rounded-2xl px-6 py-5 text-xs text-white outline-none focus:border-red-500/40"
                                                        />
                                                        <button 
                                                            onClick={() => notify('info', 'UNAUTHORIZED', 'Root credential rotation requires CLI access.')}
                                                            className="w-full py-5 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 hover:border-red-500/40 transition-all"
                                                        >
                                                            Rotate Credentials
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-8 bg-red-500/5 border border-red-500/10 rounded-[32px] space-y-6 shadow-2xl">
                                                    <div className="flex items-center gap-4">
                                                        <ShieldAlert className="text-red-500" size={24} />
                                                        <h5 className="text-[11px] font-black text-white uppercase tracking-widest">Security Advisory</h5>
                                                    </div>
                                                    <p className="text-[10px] text-white/40 font-bold uppercase leading-relaxed">
                                                        Administrative actions are logged and audited across the Arc Network. Ensure your session token ($ADMIN_TOKEN) is rotated regularily in the Citadel core configuration files.
                                                    </p>
                                                    <div className="pt-4 border-t border-white/10">
                                                        <p className="text-[8px] font-mono text-white/20 uppercase tracking-[0.2em]">Session Hash: {btoa(ADMIN_TOKEN || "").slice(0, 32)}...</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            }

                        </AnimatePresence >
                                </motion.div>
                            )}

                        </AnimatePresence >
                    </div >
                </div >
            </div >

            {/* Detailed Review Modal Simulation */}
            <AnimatePresence>
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
            </AnimatePresence>


            {/* Broadcast Modal */}
            <AnimatePresence>
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
            </AnimatePresence>

            {/* Staff Assignment Modal */}
            <AnimatePresence>
                {isStaffModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-md bg-[#0D0D0D] border border-white/10 rounded-[40px] p-10 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                                <Shield size={160} />
                            </div>

                            <div className="relative z-10 space-y-6">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-xl font-black text-white uppercase italic">Authorize Operator</h4>
                                    <button onClick={() => setIsStaffModalOpen(false)} className="text-white/20 hover:text-white transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>
                                <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest leading-relaxed">
                                    Assign administrative rights to a specific wallet address. The user will be required to complete onboarding.
                                </p>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Wallet Address</label>
                                        <input
                                            type="text"
                                            value={newStaffForm.address}
                                            onChange={(e) => setNewStaffForm({ ...newStaffForm, address: e.target.value })}
                                            placeholder="0x..."
                                            className="w-full bg-black/60 border border-white/5 rounded-2xl px-5 py-4 text-xs font-mono text-white outline-none focus:border-[#3CB371]/40"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Access Level</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['MODERATOR', 'LISTER'].map(role => (
                                                <button
                                                    key={role}
                                                    onClick={() => setNewStaffForm({ ...newStaffForm, role })}
                                                    className={`py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${newStaffForm.role === role ? 'bg-[#3CB371]/20 border-[#3CB371]/30 text-[#3CB371]' : 'bg-white/5 border-white/10 text-white/20 hover:text-white'}`}
                                                >
                                                    {role}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleAssignRole}
                                        className="w-full bg-white text-black py-4.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(255,255,255,0.1)] mt-4"
                                    >
                                        Grant Access
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Trade Detail Modal */}
            <AnimatePresence>
                {selectedTrade && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-10"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-2xl bg-[#0D0D0D] border border-white/10 rounded-[48px] overflow-hidden flex flex-col shadow-[0_40px_100px_rgba(0,0,0,1)]"
                        >
                            <div className="p-8 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Trade Inspection</h3>
                                    <p className="text-[10px] font-mono text-white/20 mt-1">REF: {selectedTrade.id || selectedTrade.publicKey}</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedTrade(null)}
                                    className="p-4 bg-white/5 rounded-2xl hover:bg-white/10 text-white/40 hover:text-white transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-6 bg-white/5 rounded-3xl space-y-1">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Trader Identity</p>
                                        <p className="text-xs font-mono text-white break-all">{selectedTrade.owner}</p>
                                    </div>
                                    <div className="p-6 bg-white/5 rounded-3xl space-y-1">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Settlement Network</p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                            <p className="text-sm font-black text-white uppercase">Arc Mainnet</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-5 bg-black/40 border border-white/5 rounded-2xl">
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Direction</p>
                                        <p className={`text-xs font-black uppercase ${selectedTrade.direction === 'UP' || selectedTrade.direction === 'buy' ? 'text-[#3CB371]' : 'text-red-500'}`}>{String(selectedTrade.direction).toUpperCase()}</p>
                                    </div>
                                    <div className="p-5 bg-black/40 border border-white/5 rounded-2xl">
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Stake</p>
                                        <p className="text-xs font-black text-white">{selectedTrade.amount} USDC</p>
                                    </div>
                                    <div className="p-5 bg-black/40 border border-white/5 rounded-2xl">
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Entry Price</p>
                                        <p className="text-xs font-mono text-white">${Number(selectedTrade.entryPrice || 0).toFixed(4)}</p>
                                    </div>
                                    <div className="p-5 bg-black/40 border border-white/5 rounded-2xl">
                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Exit Price</p>
                                        <p className="text-xs font-mono text-[#3CB371]">${Number(selectedTrade.exitPrice || 0).toFixed(4)}</p>
                                    </div>
                                </div>

                                <div className="p-8 bg-black border border-white/5 rounded-[40px] relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 p-8 opacity-10 pointer-events-none`}>
                                        {selectedTrade.won || selectedTrade.status === 'WON' ? <Trophy size={80} className="text-[#3CB371]" /> : <TrendingDown size={80} className="text-red-500" />}
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4">Payout Resolution</p>
                                        <div className="flex items-end gap-3">
                                            <h4 className={`text-4xl font-black ${selectedTrade.won || selectedTrade.status === 'WON' ? 'text-[#3CB371]' : 'text-white/20'}`}>
                                                {selectedTrade.won || selectedTrade.status === 'WON' ? `+${Number(selectedTrade.payout || 0).toFixed(2)}` : '0.00'}
                                            </h4>
                                            <span className="text-sm font-bold text-white/20 mb-2 uppercase">USDC</span>
                                        </div>
                                        <div className="mt-6 flex gap-4">
                                            <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                                                Status: {selectedTrade.status}
                                            </div>
                                            <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                                                {new Date(selectedTrade.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Transaction Artifacts</p>
                                    <div className="p-4 bg-white/5 rounded-2xl font-mono text-[9px] text-white/40 break-all leading-relaxed">
                                        TX_HASH: {selectedTrade.txHash || "0x" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)}<br/>
                                        RELAY_SIG: {Math.random().toString(36).substring(2, 15)}...<br/>
                                        SETTLEMENT_PROVIDER: ARC_KEEPER_V2
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-white/5 border-t border-white/5 flex gap-4">
                                <button 
                                    onClick={() => {
                                        notify('info', 'SYNC', 'Triggering manual reconciliation...');
                                        setSelectedTrade(null);
                                    }}
                                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    Reconcile Trade
                                </button>
                                <button 
                                    onClick={() => setSelectedTrade(null)}
                                    className="flex-1 py-4 bg-[#3CB371] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(60,179,113,0.3)]"
                                >
                                    Close Inspector
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


            <AnimatePresence>
                {selectedReportCampaign && reportData && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1100] flex items-center justify-center p-4 lg:p-12 bg-black/90 backdrop-blur-2xl"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="w-full max-w-7xl h-full max-h-[90vh] bg-[#0a0a0a] border border-white/5 rounded-[40px] shadow-2xl flex flex-col overflow-hidden relative"
                        >
                            {/* Decorative Background */}
                            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none" />

                            <div className="p-8 lg:p-12 border-b border-white/5 flex items-center justify-between shrink-0 relative z-10">
                                <div>
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 text-blue-500">
                                            <FileText size={28} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">Campaign Audit Report</h2>
                                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em]">{reportData.campaign.title} • ID: {selectedReportCampaign}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-white/40">
                                        <span>Start: {new Date(reportData.campaign.startTime).toLocaleString()}</span>
                                        <span className="text-white/10">|</span>
                                        <span>End: {new Date(reportData.campaign.endTime).toLocaleString()}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        setSelectedReportCampaign(null);
                                        setReportData(null);
                                    }}
                                    className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all border border-white/10"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 lg:p-12 relative z-10 custom-scrollbar">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                                    <div className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">Total Participants</p>
                                        <h4 className="text-4xl font-black text-white">{reportData.summary.totalParticipants}</h4>
                                    </div>
                                    <div className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">Aggregate Trades</p>
                                        <h4 className="text-4xl font-black text-[#3CB371]">{reportData.summary.totalTrades}</h4>
                                    </div>
                                    <div className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">Cumulative Volume</p>
                                        <h4 className="text-4xl font-black text-blue-500 font-mono">{reportData.summary.totalVolume} <span className="text-sm">USDC</span></h4>
                                    </div>
                                </div>

                                {/* Participants Table */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] mb-6">Operator Breakdown</h3>
                                    
                                    <div className="w-full overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/5">
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Trader / Address</th>
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest">First Trade</th>
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-center">Total</th>
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-center">Won / Lost</th>
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-center">Win Rate</th>
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-right">Volume</th>
                                                    <th className="pb-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-right">Trend</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.02]">
                                                {reportData.participants.map((p, i) => (
                                                    <tr key={p.address} className="group hover:bg-white/[0.01] transition-all">
                                                        <td className="py-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-white/40">
                                                                    {i + 1}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black text-white uppercase">{p.username || 'Trader'}</p>
                                                                    <p className="text-[9px] font-mono text-white/20">{p.address?.slice(0, 6) || '0x????'}...{p.address?.slice(-4) || '????'}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-6">
                                                            <p className="text-[10px] font-bold text-white/40 uppercase">
                                                                {p.firstTradeTime ? new Date(p.firstTradeTime).toLocaleString() : 'No Trades'}
                                                            </p>
                                                        </td>
                                                        <td className="py-6 text-center">
                                                            <p className="text-xs font-black text-white">{p.totalTrades}</p>
                                                        </td>
                                                        <td className="py-6 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <span className="text-[10px] font-black text-[#3CB371]">{p.wonTrades}W</span>
                                                                <span className="text-[10px] font-black text-red-500">{p.lostTrades}L</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-6 text-center">
                                                            <div className={`inline-block px-3 py-1 rounded-lg text-[10px] font-black ${parseFloat(p.winRate) >= 50 ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-red-500/20 text-red-500'}`}>
                                                                {p.winRate}%
                                                            </div>
                                                        </td>
                                                        <td className="py-6 text-right">
                                                            <p className="text-xs font-black text-blue-500 font-mono">${p.volume}</p>
                                                        </td>
                                                        <td className="py-6 text-right">
                                                            {/* Mini Sparkline Visualization */}
                                                            <div className="flex items-end justify-end gap-0.5 h-6">
                                                                {p.history.map((h, hi) => (
                                                                    <div 
                                                                        key={hi} 
                                                                        className={`w-1 rounded-full ${h === 1 ? 'bg-[#3CB371]' : 'bg-red-500/30'}`}
                                                                        style={{ height: h === 1 ? '100%' : '30%' }}
                                                                    />
                                                                ))}
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
                    </motion.div>
                )}
            </AnimatePresence>

            <MessagingSystem
                wallet={null}
                isOpen={isMessagingOpen}
                onClose={() => setIsMessagingOpen(false)}
                isAdminView={true}
                adminRole={
                    currentUser?.role === 'ROOT' ? '15market admin' :
                        currentUser?.role === 'MODERATOR' ? '15market Mod' : '15listers'
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
        </div>
    );
});

export default AdminPortal;
