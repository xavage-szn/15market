import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Shield, 
    Radio, 
    Settings, 
    Power, 
    AlertTriangle, 
    Check, 
    X, 
    Clock, 
    MessageSquare,
    Zap,
    Lock,
    Unlock,
    Wifi,
    WifiOff,
    RefreshCw,
    Activity,
    ArrowLeft
} from "lucide-react";
import { KEEPER_URL_ARC, ADMIN_TOKEN } from "../constants";

export function AdminDashboard({ onBack, theme, notify, platformSettings: initialSettings }) {
    const isLight = theme === 'light';
    
    const [platformSettings, setPlatformSettings] = useState(initialSettings || {
        maintenanceMode: false,
        tradingHalted: false,
        systemBanner: "",
        bannerLevel: "info",
        minBet: 1.0
    });
    
    const [broadcastText, setBroadcastText] = useState("");
    const [broadcastDuration, setBroadcastDuration] = useState(60); // seconds
    const [isSaving, setIsSaving] = useState(false);
    const [isConnected, setIsConnected] = useState(true);
    const [syncProgress, setSyncProgress] = useState(0);

    // Heartbeat to stabilize connection perception
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/health`);
                setIsConnected(res.ok);
            } catch (e) {
                setIsConnected(false);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const updateSettings = async (updates) => {
        setIsSaving(true);
        setSyncProgress(10);
        
        const newSettings = { ...platformSettings, ...updates };
        
        const performUpdate = async (retries = 2) => {
            try {
                setSyncProgress(40);
                const res = await fetch(`${KEEPER_URL_ARC}/settings`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': ADMIN_TOKEN 
                    },
                    body: JSON.stringify(newSettings)
                });
                
                if (!res.ok) {
                    if (retries > 0) {
                        setSyncProgress(prev => prev + 10);
                        await new Promise(r => setTimeout(r, 1000));
                        return performUpdate(retries - 1);
                    }
                    throw new Error("Node connection timed out — settings may not be applied");
                }
                
                setSyncProgress(90);
                setPlatformSettings(newSettings);
                notify("Protocol Settings Synchronized", "success");
                
                // Propagate to local storage for instant feedback across components
                localStorage.setItem("15market_citadel_settings", JSON.stringify(newSettings));
                window.dispatchEvent(new Event('storage'));
                
            } catch (e) {
                console.error("Admin Sync Error:", e);
                notify(e.message, "error");
                setIsConnected(false);
            }
        };

        await performUpdate();
        setSyncProgress(100);
        setTimeout(() => {
            setIsSaving(false);
            setSyncProgress(0);
        }, 800);
    };

    const handleUpdateBroadcast = async () => {
        if (!broadcastText.trim()) return notify("Enter broadcast message", "error");
        
        setIsSaving(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/broadcast`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': ADMIN_TOKEN 
                },
                body: JSON.stringify({
                    text: broadcastText,
                    duration: broadcastDuration,
                    type: 'MANUAL_ADMIN'
                })
            });
            
            if (!res.ok) throw new Error("Broadcast failed");
            
            notify("Global Broadcast Initiated", "success");
            setBroadcastText("");
        } catch (e) {
            notify("Broadcast Error: " + e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const AdminCard = ({ title, icon: Icon, children, accent = "#3CB371" }) => (
        <div className={`p-6 border rounded-[32px] ${isLight ? 'bg-white/70 border-[#3CB371]/20 shadow-sm' : 'bg-[#0D0D0D]/80 border-white/5 shadow-2xl'} backdrop-blur-xl relative overflow-hidden group`}>
            <div className="absolute top-0 left-0 w-1 h-full opacity-40 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: accent }} />
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl" style={{ backgroundColor: `${accent}15`, color: accent }}>
                        <Icon size={18} />
                    </div>
                    <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>{title}</h3>
                </div>
                {syncProgress > 0 && syncProgress < 100 && (
                    <div className="flex items-center gap-2">
                         <RefreshCw size={12} className="animate-spin text-[#3CB371]" />
                         <span className="text-[8px] font-black uppercase text-[#3CB371]">{syncProgress}%</span>
                    </div>
                )}
            </div>
            {children}
        </div>
    );

    return (
        <div className={`h-screen w-full flex flex-col overflow-hidden ${isLight ? 'bg-[#b4d9c7]' : 'bg-[#050505]'} relative`}>
            {/* Background Flair */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#3CB371]/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#3CB371]/3 rounded-full blur-[120px]" />
            </div>

            {/* Header */}
            <header className={`flex-none ${isLight ? 'bg-white/50 border-[#3CB371]/20' : 'bg-[#0D0D0D]/50 border-white/5'} border-b backdrop-blur-3xl z-50`}>
                <div className="max-w-[1600px] mx-auto px-8 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={onBack}
                            className={`p-3 rounded-full border transition-all ${isLight ? 'bg-white border-[#3CB371]/20 hover:bg-[#3CB371]/10 text-black' : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'} active:scale-95`}
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex flex-col">
                            <h1 className={`text-xl font-black uppercase tracking-tighter flex items-center gap-3 ${isLight ? 'text-black' : 'text-white'}`}>
                                Admin Citadel
                                <span className={`text-[9px] px-2 py-0.5 rounded-full border ${isConnected ? 'bg-[#3CB371]/10 text-[#3CB371] border-[#3CB371]/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                                    {isConnected ? 'NODE CONNECTED' : 'NODE DISCONNECTED'}
                                </span>
                            </h1>
                            <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-0.5">Platform Security & Broadcast Center</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${isLight ? 'bg-[#3CB371]/5 border-[#3CB371]/10' : 'bg-white/5 border-white/5'}`}>
                            {isConnected ? <Wifi size={14} className="text-[#3CB371]" /> : <WifiOff size={14} className="text-red-500" />}
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isConnected ? 'text-[#3CB371]' : 'text-red-500'}`}>
                                Latency: 42ms
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto no-scrollbar p-10 z-10">
                <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Security & Maintenance Controls (COL 1-7) */}
                    <div className="lg:col-span-7 flex flex-col gap-8">
                        <AdminCard title="Security Protocols" icon={Shield} accent="#3CB371">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Maintenance Toggle */}
                                <div className={`p-6 rounded-[24px] border ${platformSettings.maintenanceMode ? 'bg-[#3CB371]/10 border-[#3CB371]/40' : 'bg-white/5 border-white/5'} transition-all`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl ${platformSettings.maintenanceMode ? 'bg-[#3CB371] text-white' : 'bg-white/5 text-white/40'}`}>
                                                <Settings size={20} className={platformSettings.maintenanceMode ? 'animate-spin-slow' : ''} />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-black uppercase">Maintenance Mode</h4>
                                                <p className="text-[9px] opacity-40 font-bold uppercase mt-1">Full System Lock</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => updateSettings({ maintenanceMode: !platformSettings.maintenanceMode })}
                                            className={`w-14 h-8 rounded-full relative p-1 transition-all ${platformSettings.maintenanceMode ? 'bg-[#3CB371]' : 'bg-white/10'}`}
                                        >
                                            <motion.div 
                                                animate={{ x: platformSettings.maintenanceMode ? 24 : 0 }}
                                                className="w-6 h-6 rounded-full bg-white shadow-lg"
                                            />
                                        </button>
                                    </div>
                                    <p className="text-[10px] opacity-50 leading-relaxed font-medium">
                                        Redirects all users to a maintenance screen. Prevents any interactions with the protocol.
                                    </p>
                                </div>

                                {/* Trading Halted Toggle */}
                                <div className={`p-6 rounded-[24px] border ${platformSettings.tradingHalted ? 'bg-red-500/10 border-red-500/40' : 'bg-white/5 border-white/5'} transition-all`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl ${platformSettings.tradingHalted ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40'}`}>
                                                <Lock size={20} />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-black uppercase">Trading Halted</h4>
                                                <p className="text-[9px] opacity-40 font-bold uppercase mt-1">Kill Switch</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => updateSettings({ tradingHalted: !platformSettings.tradingHalted })}
                                            className={`w-14 h-8 rounded-full relative p-1 transition-all ${platformSettings.tradingHalted ? 'bg-red-500' : 'bg-white/10'}`}
                                        >
                                            <motion.div 
                                                animate={{ x: platformSettings.tradingHalted ? 24 : 0 }}
                                                className="w-6 h-6 rounded-full bg-white shadow-lg"
                                            />
                                        </button>
                                    </div>
                                    <p className="text-[10px] opacity-50 leading-relaxed font-medium">
                                        Freezes all trading execution. Users can browse but cannot place bets.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 p-6 bg-amber-500/5 border border-amber-500/20 rounded-[28px] flex items-center gap-6">
                                <AlertTriangle size={32} className="text-amber-500 flex-none" />
                                <div>
                                    <h4 className="text-[10px] font-black uppercase text-amber-500 mb-1">Warning: Admin Authority</h4>
                                    <p className="text-[9px] font-medium opacity-60">Changes to security protocols propagate globally in real-time. Ensure node synchronization before proceeding with major maintenance windows.</p>
                                </div>
                            </div>
                        </AdminCard>

                        <AdminCard title="Platform Metrics" icon={Activity} accent="#3CB371">
                             <div className="grid grid-cols-3 gap-6">
                                {[
                                    { label: 'Active Users', value: '428', icon: Zap },
                                    { label: 'Sync Status', value: 'Healthy', icon: Check },
                                    { label: 'Node Uptime', value: '99.98%', icon: Clock }
                                ].map((stat, i) => (
                                    <div key={i} className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'}`}>
                                        <div className="flex items-center gap-2 mb-2 opacity-40">
                                            <stat.icon size={12} />
                                            <span className="text-[8px] font-black uppercase tracking-widest">{stat.label}</span>
                                        </div>
                                        <div className={`text-lg font-black ${isLight ? 'text-black' : 'text-white'}`}>{stat.value}</div>
                                    </div>
                                ))}
                             </div>
                        </AdminCard>
                    </div>

                    {/* Broadcast Center (COL 8-12) */}
                    <div className="lg:col-span-5">
                        <AdminCard title="Broadcast Center" icon={Radio} accent="#48c97f">
                            <div className="flex flex-col gap-6">
                                <div>
                                    <label className="text-[9px] font-black uppercase opacity-30 tracking-[0.2em] block mb-3 ml-1">Live Message</label>
                                    <textarea 
                                        value={broadcastText}
                                        onChange={(e) => setBroadcastText(e.target.value)}
                                        placeholder="Enter system broadcast message..."
                                        className={`w-full min-h-[140px] p-6 rounded-3xl border text-sm font-bold resize-none transition-all outline-none ${isLight ? 'bg-white border-[#3CB371]/10 focus:border-[#3CB371]/40' : 'bg-black/40 border-white/10 focus:border-[#3CB371]/30'}`}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[9px] font-black uppercase opacity-30 tracking-[0.2em] block mb-3 ml-1">Persistence (Min)</label>
                                        <div className="flex items-center gap-3">
                                            {[1, 10, 60].map(m => (
                                                <button 
                                                    key={m}
                                                    onClick={() => setBroadcastDuration(m * 60)}
                                                    className={`flex-1 py-3 rounded-xl border text-[10px] font-black transition-all ${broadcastDuration === m * 60 ? 'bg-[#3CB371] text-white border-[#3CB371]' : 'bg-white/5 border-white/5 opacity-50 hover:opacity-100'}`}
                                                >
                                                    {m}m
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase opacity-30 tracking-[0.2em] block mb-3 ml-1">Alert Level</label>
                                        <div className="flex items-center gap-3">
                                            {['info', 'success', 'warning', 'error'].map(level => (
                                                <button 
                                                    key={level}
                                                    onClick={() => updateSettings({ bannerLevel: level })}
                                                    className={`w-8 h-8 rounded-full border transition-all flex items-center justify-center ${platformSettings.bannerLevel === level ? 'ring-2 ring-[#3CB371] border-transparent' : 'border-white/10 opacity-30 shadow-sm'}`}
                                                    style={{ backgroundColor: level === 'info' ? '#3b82f6' : level === 'success' ? '#3CB371' : level === 'warning' ? '#f59e0b' : '#ef4444' }}
                                                >
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleUpdateBroadcast}
                                    disabled={isSaving || !broadcastText}
                                    className="w-full py-5 bg-[#3CB371] text-white rounded-3xl font-black uppercase tracking-[0.3em] text-[10px] shadow-[0_20px_40px_-10px_rgba(60,179,113,0.3)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
                                >
                                    <div className="flex items-center justify-center gap-3">
                                        <Radio size={16} />
                                        <span>Transmit Broadcast</span>
                                    </div>
                                </button>

                                <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white/50 border-[#3CB371]/10' : 'bg-white/[0.03] border-white/5'}`}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <Activity size={14} className="text-[#3CB371]" />
                                        <h4 className="text-[10px] font-black uppercase">Current Transmission</h4>
                                    </div>
                                    <p className="text-[11px] font-bold opacity-60 leading-relaxed italic">
                                        {platformSettings.systemBanner || "No active manual broadcast. Platform running standard tickers."}
                                    </p>
                                </div>
                            </div>
                        </AdminCard>
                    </div>
                </div>
            </main>

            {/* Persistence Layer Status */}
            <footer className={`flex-none p-5 border-t backdrop-blur-3xl px-10 flex items-center justify-between ${isLight ? 'bg-white/50 border-[#3CB371]/10' : 'bg-[#050505]/50 border-white/5'}`}>
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#3CB371]' : 'bg-red-500'} animate-pulse`} />
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Persistence Layer Stable</span>
                    </div>
                    <div className="h-4 w-px bg-white/5" />
                    <div className="flex items-center gap-3">
                        <Shield size={14} className="text-[#3CB371] opacity-50" />
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Admin Token Authorized</span>
                    </div>
                </div>
                <div className={`text-[9px] font-mono opacity-20 uppercase tracking-[0.5em]`}>
                    15Market_Citadel_v2.4.0
                </div>
            </footer>
        </div>
    );
}
