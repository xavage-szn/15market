import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trophy, Calendar, Gift, Users, TrendingUp, Award, Clock, Target } from 'lucide-react';
import { KEEPER_URL } from '../constants';
import Toast from './Toast';
import { AnimatePresence } from 'framer-motion';

function CampaignPage({ address, network, theme }) {
    const isLight = theme === 'light';
    const { campaignId } = useParams();
    const navigate = useNavigate();
    const [campaign, setCampaign] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [isEnrolled, setIsEnrolled] = useState(false);
    const [enrolling, setEnrolling] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState('');
    const [toast, setToast] = useState(null);
    const notify = (message, type = 'success') => setToast({ message, type });

    useEffect(() => {
        const fetchCampaignData = async () => {
            try {
                // Fetch campaign details
                const campaignsRes = await fetch(`${KEEPER_URL}/campaigns`);
                const campaigns = await campaignsRes.json();
                const foundCampaign = campaigns.find(c => c.id === campaignId);

                if (foundCampaign) {
                    setCampaign(foundCampaign);

                    // Check enrollment status
                    if (address) {
                        const enrollRes = await fetch(`${KEEPER_URL}/enroll?campaignId=${campaignId}&address=${address}`);
                        const enrollData = await enrollRes.json();
                        setIsEnrolled(enrollData.enrolled);
                    }

                    // Fetch leaderboard
                    const leaderboardRes = await fetch(`${KEEPER_URL}/leaderboard?campaignId=${campaignId}`);
                    const leaderboardData = await leaderboardRes.json();
                    setLeaderboard(leaderboardData);
                }
            } catch (error) {
                console.error('Failed to fetch campaign data:', error);
            }
        };

        fetchCampaignData();
        const interval = setInterval(fetchCampaignData, 5000); // Update every 5 seconds
        return () => clearInterval(interval);
    }, [campaignId, address]);

    useEffect(() => {
        if (!campaign) return;

        const updateTimer = () => {
            const now = Date.now();
            const timeLeft = campaign.endTime - now;

            if (timeLeft <= 0) {
                setTimeRemaining('Campaign Ended');
                return;
            }

            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

            if (days > 0) {
                setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
            } else if (hours > 0) {
                setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
            } else {
                setTimeRemaining(`${minutes}m ${seconds}s`);
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [campaign]);

    const handleEnroll = async () => {
        if (!address) {
            notify('Please connect your wallet first', 'error');
            return;
        }

        setEnrolling(true);
        notify('Enrolling in campaign...', 'pending');
        try {
            const res = await fetch(`${KEEPER_URL}/enroll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, address })
            });

            if (res.ok) {
                setIsEnrolled(true);
                notify('Successfully enrolled in the campaign!', 'success');
            } else {
                const data = await res.json();
                notify(data.error || 'Failed to enroll', 'error');
            }
        } catch (error) {
            notify('Network error during enrollment', 'error');
        } finally {
            setEnrolling(false);
        }
    };

    if (!campaign) {
        return (
            <div className={`min-h-screen flex items-center justify-center font-black uppercase tracking-widest ${isLight ? 'bg-[#f0f9f4] text-[#0a261a]' : 'bg-[#0d0d0d] text-white'}`} style={{
                fontSize: '1.5rem'
            }}>
                Loading campaign...
            </div>
        );
    }

    const isActive = Date.now() >= campaign.startTime && Date.now() < campaign.endTime;
    const hasEnded = Date.now() >= campaign.endTime;

    return (
        <div className={`min-h-screen p-6 font-sans ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#0d0d0d]'} relative overflow-hidden transition-colors duration-500`}>
            {/* Background elements for premium look */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#3CB371] opacity-[0.03] blur-[100px] rounded-full" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#3CB371] opacity-[0.03] blur-[100px] rounded-full" />
            </div>

            {/* Header */}
            <div className="max-w-7xl mx-auto mb-8 relative z-10">
                <button
                    onClick={() => navigate(-1)}
                    className={`${isLight ? 'bg-white/50 border-[#3CB371]/20 text-[#0a261a]' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'} border px-6 py-2 rounded-xl transition-all text-xs font-black uppercase tracking-widest`}
                >
                    ← Back to Trading
                </button>
            </div>

            {/* Campaign Hero */}
            <div className={`max-w-7xl mx-auto mb-12 relative z-10 ${isLight ? 'bg-white border-[#3CB371]/10' : 'bg-[#0d0d0d] border-white/5'} border !rounded-[40px] p-8 md:p-14 overflow-hidden shadow-2xl`}>
                <div className={`absolute top-0 right-0 p-12 ${isLight ? 'opacity-[0.05]' : 'opacity-[0.03]'} pointer-events-none`}>
                    <Trophy size={200} className={isLight ? 'text-[#3CB371]' : 'text-white'} />
                </div>

                <div className="flex flex-col md:flex-row items-center gap-8 mb-10 relative z-20">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/30 flex items-center justify-center shrink-0">
                        <Trophy size={48} className="text-yellow-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]" />
                    </div>
                    <div>
                        <h1 className={`text-4xl md:text-6xl font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} tracking-tighter mb-3 uppercase`}>
                            {campaign.title}
                        </h1>
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${isActive ? 'bg-[#3CB371]/20 border-[#3CB371]/30 text-[#3CB371]' : hasEnded ? 'bg-red-500/20 border-red-500/30 text-red-500' : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#3CB371] animate-pulse' : 'bg-current'}`} />
                            {isActive ? 'Live Now' : hasEnded ? 'Ended' : 'Upcoming'}
                        </div>
                    </div>
                </div>

                <p className={`text-lg md:text-xl ${isLight ? 'text-[#0a261a]/60' : 'text-white/50'} max-w-3xl mb-12 leading-relaxed font-medium`}>
                    {campaign.description}
                </p>

                {/* Campaign Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12 relative z-20">
                    <StatBox icon={<Gift />} label="Prize Pool" value={campaign.prize || 'TBA'} color="text-yellow-500" theme={theme} />
                    <StatBox icon={<Clock />} label="Time Left" value={timeRemaining} color="text-blue-400" theme={theme} />
                    <StatBox icon={<Users />} label="Participants" value={leaderboard.length} color="text-purple-400" theme={theme} />
                    <StatBox icon={<Target />} label="Network" value={campaign.network === 'general' ? 'ALL' : campaign.network} color="text-[#3CB371]" isNetwork theme={theme} />
                </div>

                {/* Enrollment Button */}
                {!hasEnded && (
                    <button
                        onClick={handleEnroll}
                        disabled={isEnrolled || enrolling || !address}
                        className={`w-full py-6 rounded-[24px] text-xl font-black tracking-widest uppercase transition-all relative z-20 overflow-hidden group ${isEnrolled
                            ? 'bg-[#3CB371]/10 text-[#3CB371] border border-[#3CB371]/20'
                            : (isLight ? 'bg-[#3CB371] text-white shadow-[0_20px_50px_rgba(60,179,113,0.3)]' : 'bg-white text-black shadow-[0_20px_50px_rgba(255,255,255,0.1)]') + ' hover:scale-[1.01] active:scale-[0.99]'}`}
                    >
                        {!address ? 'Connect Wallet to Enroll' :
                            isEnrolled ? 'Enrolled & Active' :
                                enrolling ? 'Enrolling...' :
                                    'Identify & Join Campaign'}
                    </button>
                )}
            </div>

            {/* Campaign Details - Grid */}
            <div className="max-w-7xl mx-auto mb-12 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                <div className={`${isLight ? 'bg-white border-[#3CB371]/10' : 'bg-[#0d0d0d] border-white/5'} !rounded-3xl p-8 border shadow-xl`}>
                    <h2 className={`text-xl font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} flex items-center gap-3 mb-6 uppercase tracking-tight`}>
                        <Award className="text-yellow-500" />
                        Campaign Rules
                    </h2>
                    <ul className={`space-y-4 ${isLight ? 'text-[#0a261a]/60' : 'text-white/50'} text-sm font-medium`}>
                        <li className="flex items-center gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                            Enroll before the campaign starts
                        </li>
                        <li className="flex items-center gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                            Only trades made during period count
                        </li>
                        <li className="flex items-center gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                            Rankings based on total winning trades
                        </li>
                        <li className="flex items-center gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                            Leaderboard updates in real-time
                        </li>
                    </ul>
                </div>

                <div className={`${isLight ? 'bg-white border-[#3CB371]/10' : 'bg-[#0d0d0d] border-white/5'} !rounded-3xl p-8 border shadow-xl`}>
                    <h2 className={`text-xl font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} flex items-center gap-3 mb-6 uppercase tracking-tight`}>
                        <Calendar className="text-blue-400" />
                        Timeline
                    </h2>
                    <div className="space-y-6">
                        <div>
                            <p className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase tracking-[0.2em] mb-1`}>Commencement</p>
                            <p className={`text-lg font-bold ${isLight ? 'text-[#0a261a]/80' : 'text-white/80'}`}>{new Date(campaign.startTime).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase tracking-[0.2em] mb-1`}>Termination</p>
                            <p className={`text-lg font-bold ${isLight ? 'text-[#0a261a]/80' : 'text-white/80'}`}>{new Date(campaign.endTime).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Leaderboard Table */}
            <div className={`max-w-7xl mx-auto mb-20 ${isLight ? 'bg-white border-[#3CB371]/10' : 'bg-[#0d0d0d] border-white/5'} border !rounded-[32px] p-8 md:p-12 relative z-10 shadow-2xl`}>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
                    <h2 className={`text-3xl font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} flex items-center gap-4 uppercase tracking-tighter`}>
                        <TrendingUp className="text-yellow-500" />
                        Live Standings
                    </h2>
                    <div className={`flex items-center gap-2 px-4 py-1.5 ${isLight ? 'bg-[#3CB371]/5 border-[#3CB371]/10' : 'bg-white/5 border-white/10'} rounded-full border`}>
                        <span className="w-2 h-2 rounded-full bg-[#3CB371] animate-pulse" />
                        <span className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} uppercase tracking-widest`}>Live Sync Enabled</span>
                    </div>
                </div>

                {leaderboard.length === 0 ? (
                    <div className={`text-center py-20 ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase font-black tracking-widest text-sm`}>
                        Waiting for initial participants...
                    </div>
                ) : (
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full border-separate border-spacing-y-2">
                            <thead>
                                <tr className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase tracking-[0.3em]`}>
                                    <th className="text-left py-4 px-6">Rank</th>
                                    <th className="text-left py-4 px-6">Trader</th>
                                    <th className="text-center py-4 px-6">Wins</th>
                                    <th className="text-center py-4 px-6">Efficiency</th>
                                    <th className="text-right py-4 px-6">PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((entry, index) => {
                                    const isCurrentUser = address && entry.address.toLowerCase() === address.toLowerCase();
                                    const rankColor = index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : (isLight ? 'text-[#0a261a]/40' : 'text-white/40');

                                    return (
                                        <tr key={entry.address} className={`group ${isCurrentUser ? (isLight ? 'bg-[#3CB371]/10' : 'bg-white/10') : (isLight ? 'hover:bg-[#3CB371]/5' : 'hover:bg-white/[0.03]')} transition-colors duration-300`}>
                                            <td className={`py-6 px-6 font-black text-2xl ${rankColor} rounded-l-[20px]`}>
                                                {index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`}
                                            </td>
                                            <td className="py-6 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl ${isLight ? 'bg-[#3CB371]/5 border-[#3CB371]/10 text-[#0a261a]/40' : 'bg-white/5 border-white/10 text-white/40'} border flex items-center justify-center font-black text-xs`}>
                                                        {entry.address?.slice(0, 2)}
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-bold ${isLight ? 'text-[#0a261a]' : 'text-white'} font-mono`}>{entry.address?.slice(0, 6)}...{entry.address?.slice(-4)}</p>
                                                        {isCurrentUser && <p className="text-[8px] font-black text-yellow-500 uppercase tracking-widest mt-0.5">Your Position</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-6 px-6 text-center font-black text-[#3CB371] text-lg">
                                                {entry.wins}
                                            </td>
                                            <td className="py-6 px-6 text-center">
                                                <div className="inline-flex flex-col items-center">
                                                    <span className={`text-sm font-black ${entry.winRate >= 50 ? 'text-[#3CB371]' : 'text-red-500'}`}>{entry.winRate.toFixed(1)}%</span>
                                                    <span className={`text-[8px] font-black ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase`}>{entry.trades} TRADES</span>
                                                </div>
                                            </td>
                                            <td className={`py-6 px-6 text-right font-black text-lg rounded-r-[20px] ${entry.pnl >= 0 ? 'text-[#3CB371]' : 'text-red-500'}`}>
                                                {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} theme={theme} />}
            </AnimatePresence>
        </div>
    );
};

function StatBox({ icon, label, value, color, isNetwork, theme }) {
    const isLight = theme === 'light';
    return (
        <div className={`${isLight ? 'bg-white border-[#3CB371]/10 shadow-lg' : 'bg-[#0d0d0d] border-white/5'} border p-6 rounded-[24px] relative overflow-hidden group`}>
            <div className="absolute top-0 right-0 p-4 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">
                {React.cloneElement(icon, { size: 40 })}
            </div>
            <p className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]/20' : 'text-white/20'} uppercase tracking-[0.2em] mb-2`}>{label}</p>
            <p className={`text-2xl font-black ${color} ${isNetwork ? 'uppercase' : ''}`}>{value}</p>
        </div>
    );
}

export default CampaignPage;
