import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, User, AlertTriangle, CheckCircle, ChevronRight, Scale, MessageSquare } from 'lucide-react';
import { KEEPER_URL } from '../constants';

// X Logo Component
const XLogo = ({ size = 24, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

export const OnboardingModal = ({ isOpen, onComplete, address, network, existingProfile, theme }) => {
    const isLight = theme === 'light';

    const [step, setStep] = useState(() => {
        if (!address) return 1;
        // Priority 1: User just redirected from Twitter
        const params = new URLSearchParams(window.location.search);
        if (params.get('x_handle')) return 2;

        // Priority 2: Profile already exists but missing X
        if (existingProfile && !existingProfile.xHandle) return 2;

        // Priority 3: Local storage (for multi-step sessions)
        const savedStep = localStorage.getItem(`15market_onboarding_step_${address}`);
        return savedStep ? parseInt(savedStep) : 1;
    });

    const [username, setUsername] = useState(() => {
        if (existingProfile?.username) return existingProfile.username;
        if (!address) return "";
        return localStorage.getItem(`15market_onboarding_username_${address}`) || "";
    });

    const [twitterHandle, setTwitterHandle] = useState(existingProfile?.xHandle || "");
    const [twitterImage, setTwitterImage] = useState(existingProfile?.xProfileImage || "");
    const [tosAccepted, setTosAccepted] = useState(false);
    const [riskAcknowledged, setRiskAcknowledged] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);


    // Detect Twitter Redirect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const xHandle = params.get('x_handle');
        const xImage = params.get('x_image');
        if (xHandle && isOpen) {
            console.log("🎯 Onboarding: Detected X Handle:", xHandle, "Image:", xImage);
            setTwitterHandle(xHandle);
            if (xImage) setTwitterImage(xImage);
            setStep(3); // Jump to TOS
            localStorage.setItem(`15market_onboarding_step_${address}`, '3');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [isOpen]);

    const handleNext = () => {
        let nextStep = step + 1;
        if (step === 1) {
            if (username.length < 3) return;
            localStorage.setItem(`15market_onboarding_username_${address}`, username);
        }
        if (step === 2 && !twitterHandle) return;
        if (step === 3 && !tosAccepted) return;

        setStep(nextStep);
        localStorage.setItem(`15market_onboarding_step_${address}`, nextStep.toString());
    };

    const handleBack = () => {
        const prevStep = Math.max(1, step - 1);
        setStep(prevStep);
        localStorage.setItem(`15market_onboarding_step_${address}`, prevStep.toString());
    };

    const handleLinkTwitter = async () => {
        try {
            const CLIENT_ID = 'cDdEeHQwYnp4Y2lJRVMzdk5CRlg6MTpjaQ';
            const REDIRECT_URI = encodeURIComponent(`${KEEPER_URL}/auth/twitter/callback`);
            const SCOPE = encodeURIComponent('users.read tweet.read offline.access');

            // Securely prepare state on backend
            const prepareRes = await fetch(`${KEEPER_URL}/auth/twitter/prepare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address,
                    network: network,
                    onboarding: true
                })
            });
            const { state: stateId } = await prepareRes.json();

            if (!stateId) throw new Error("Failed to prepare secure state");

            const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&state=${stateId}&code_challenge=challenge&code_challenge_method=plain`;

            // Save current progress before redirect
            localStorage.setItem(`15market_onboarding_username_${address}`, username);
            localStorage.setItem(`15market_onboarding_step_${address}`, '2');

            console.log('🔗 [X_AUTH] Initiating OAuth flow...');
            window.location.href = url;
        } catch (e) {
            console.error("X Auth Preparation Failed:", e);
            // Optionally show alert here if modal feedback is available
        }
    };

    const handleSubmit = async () => {
        if (!riskAcknowledged) return;
        setIsSubmitting(true);
        try {
            await onComplete({ username, twitterHandle, twitterImage, tosAccepted, riskAcknowledged });
            // Clean up
            localStorage.removeItem(`15market_onboarding_step_${address}`);
            localStorage.removeItem(`15market_onboarding_username_${address}`);
        } catch (err) {
            console.error("Onboarding submission failed:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const accentColor = '#3CB371';
    const totalSteps = 4;

    return (
        <AnimatePresence>
            <div className={`fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-xl ${isLight ? 'bg-white/70' : 'bg-black/90'}`}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 40 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 40 }}
                    className={`w-full max-w-xl ${isLight ? 'bg-white border-black/5 shadow-2xl shadow-black/10' : 'bg-[#0A0A0A] border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)]'} border rounded-[48px] p-10 relative overflow-hidden`}
                >
                    {/* Background Glow */}
                    <div
                        className="absolute -top-24 -right-24 w-64 h-64 blur-[120px] rounded-full opacity-20 pointer-events-none"
                        style={{ backgroundColor: accentColor }}
                    />

                    {/* Progress Bar */}
                    <div className={`absolute top-0 left-0 w-full h-1 ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                        <motion.div
                            className="h-full transition-all duration-500"
                            style={{ backgroundColor: accentColor, width: `${(step / totalSteps) * 100}%` }}
                        />
                    </div>

                    <div className="relative z-10">
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8"
                                >
                                    <div className="flex flex-col items-center text-center">
                                        <div
                                            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl"
                                            style={{ backgroundColor: `${accentColor}10`, color: accentColor }}
                                        >
                                            <User size={36} />
                                        </div>
                                        <h2 className={`text-3xl font-black ${isLight ? 'text-black' : 'text-white'} uppercase tracking-tighter`}>Choose your Alias</h2>
                                        <p className={`${isLight ? 'text-black/40' : 'text-white/40'} text-sm mt-3 max-w-xs`}>Your public identity on 15market. Make it count.</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="relative">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                placeholder="Enter username..."
                                                className={`w-full ${isLight ? 'bg-black/[0.03] border-black/5' : 'bg-white/[0.03] border-white/10'} border rounded-2xl px-6 py-5 text-lg font-bold placeholder:text-black/10 focus:border-black/10 outline-none transition-all ${isLight ? 'text-black' : 'text-white'}`}
                                            />
                                            {username.length >= 3 && (
                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[#3CB371]">
                                                    <CheckCircle size={20} />
                                                </div>
                                            )}
                                        </div>
                                        <p className={`text-[10px] ${isLight ? 'text-black/20' : 'text-white/20'} uppercase tracking-widest text-center`}>Minimum 3 characters required</p>
                                    </div>

                                    <button
                                        onClick={handleNext}
                                        disabled={username.length < 3}
                                        className="w-full py-6 rounded-2xl font-black text-white transition-all flex items-center justify-center gap-2 group disabled:opacity-30"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        CONTINUE <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </motion.div>
                            )}

                            {step === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8"
                                >
                                    <div className="flex flex-col items-center text-center">
                                        <div
                                            className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl ${isLight ? 'bg-black/5 text-black border-black/5' : 'bg-black/40 text-white border-white/10'} border overflow-hidden`}
                                        >
                                            {twitterImage ? (
                                                <img src={twitterImage} alt="X Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <XLogo size={36} />
                                            )}
                                        </div>
                                        <h2 className={`text-3xl font-black ${isLight ? 'text-black' : 'text-white'} uppercase tracking-tighter`}>Link X Account</h2>
                                        <p className={`${isLight ? 'text-black/40' : 'text-white/40'} text-sm mt-3`}>Connect your X (formerly Twitter) account to your wallet.</p>
                                    </div>

                                    {twitterHandle ? (
                                        <div className={`p-6 rounded-3xl ${accentColor}10 border border-[#3CB371]/20 flex items-center justify-between`}>
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-[#3CB371]/20 flex items-center justify-center text-[#3CB371]">
                                                    <CheckCircle size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-[#3CB371] uppercase tracking-widest">Verified Identity</p>
                                                    <p className={`font-bold ${isLight ? 'text-black' : 'text-white'}`}>@{twitterHandle}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleLinkTwitter}
                                            className={`w-full py-6 rounded-2xl ${isLight ? 'bg-black text-white shadow-xl' : 'bg-black text-white shadow-[0_20px_40px_rgba(255,255,255,0.1)]'} font-black transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] border border-white/20 hover:border-white/40`}
                                        >
                                            <XLogo size={20} />
                                            LINK X ACCOUNT
                                        </button>
                                    )}

                                    <div className="flex gap-4">
                                        <button onClick={handleBack} className={`flex-1 py-6 rounded-2xl ${isLight ? 'bg-black/5 text-black/40 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:bg-white/10'} font-black transition-all uppercase tracking-widest text-xs`}>BACK</button>
                                        <button
                                            onClick={handleNext}
                                            disabled={!twitterHandle}
                                            className="flex-[2] py-6 rounded-2xl font-black text-white transition-all flex items-center justify-center gap-2 group disabled:opacity-30 disabled:grayscale"
                                            style={{ backgroundColor: accentColor }}
                                        >
                                            CONTINUE <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                    {!twitterHandle && <p className={`text-[9px] ${isLight ? 'text-black/20' : 'text-white/20'} uppercase tracking-[0.2em] text-center font-bold`}>Social verification is required to prevent sybil attacks</p>}
                                </motion.div>
                            )}

                            {step === 3 && (
                                <motion.div
                                    key="step3"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8"
                                >
                                    <div className="flex flex-col items-center text-center">
                                        <div
                                            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl"
                                            style={{ backgroundColor: `${accentColor}10`, color: accentColor }}
                                        >
                                            <Scale size={36} />
                                        </div>
                                        <h2 className={`text-3xl font-black ${isLight ? 'text-black' : 'text-white'} uppercase tracking-tighter`}>Terms of Service</h2>
                                        <p className={`${isLight ? 'text-black/40' : 'text-white/40'} text-sm mt-3`}>Please review our rules of engagement.</p>
                                    </div>

                                    <div className={`h-64 ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/40 border-white/5'} border rounded-3xl p-6 overflow-y-auto custom-scrollbar ${isLight ? 'text-black/40' : 'text-white/30'} text-xs leading-relaxed space-y-4 font-medium`}>
                                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} font-bold uppercase tracking-widest text-[10px]`}>1. Platform Overview</p>
                                        <p>15market provides a precision trading environment. By using this platform, you interact directly with smart contracts on the {network.toUpperCase()} network.</p>

                                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} font-bold uppercase tracking-widest text-[10px]`}>2. Risks and Responsibility</p>
                                        <p>Trading digital assets involves significant risk. You are solely responsible for your private keys and the funds in your wallet.</p>

                                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} font-bold uppercase tracking-widest text-[10px]`}>3. Technical Integrity</p>
                                        <p>15market is not liable for network congestion, RPC failures, or blockchain-level issues that may affect trade execution.</p>

                                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} font-bold uppercase tracking-widest text-[10px]`}>4. Prohibited Jurisdictions</p>
                                        <p>Users must comply with their local laws. Access from restricted regions is strictly prohibited.</p>
                                    </div>

                                    <label className="flex items-center gap-4 cursor-pointer group">
                                        <div
                                            onClick={() => setTosAccepted(!tosAccepted)}
                                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${tosAccepted ? 'bg-[#3CB371] border-[#3CB371]' : `${isLight ? 'border-black/10 group-hover:border-black/20' : 'border-white/10 group-hover:border-white/20'}`}`}
                                        >
                                            {tosAccepted && <CheckCircle size={14} className="text-white" />}
                                        </div>
                                        <span className={`text-sm font-bold ${isLight ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} transition-colors`}>I accept the Terms of Service</span>
                                    </label>

                                    <div className="flex gap-4">
                                        <button onClick={handleBack} className={`flex-1 py-6 rounded-2xl ${isLight ? 'bg-black/5 text-black/40 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:bg-white/10'} font-black transition-all uppercase tracking-widest text-xs`}>BACK</button>
                                        <button
                                            onClick={handleNext}
                                            disabled={!tosAccepted}
                                            className="flex-[2] py-6 rounded-2xl font-black text-white transition-all flex items-center justify-center gap-2 group disabled:opacity-30 disabled:grayscale"
                                            style={{ backgroundColor: accentColor }}
                                        >
                                            CONTINUE <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {step === 4 && (
                                <motion.div
                                    key="step4"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8"
                                >
                                    <div className="flex flex-col items-center text-center">
                                        <div
                                            className="w-20 h-20 rounded-3xl bg-red-500/10 text-red-500 flex items-center justify-center mb-6 shadow-2xl"
                                        >
                                            <AlertTriangle size={36} />
                                        </div>
                                        <h2 className={`text-3xl font-black ${isLight ? 'text-black' : 'text-white'} uppercase tracking-tighter`}>Critical Risk Warning</h2>
                                        <p className={`${isLight ? 'text-black/40' : 'text-white/40'} text-sm mt-3`}>This is not a simulation. Real assets are at stake.</p>
                                    </div>

                                    <div className={`p-8 rounded-[32px] bg-red-500/5 ${isLight ? 'border-red-500/10' : 'border-red-500/20'} border text-center space-y-4`}>
                                        <p className="text-red-500 font-bold uppercase tracking-widest text-xs">High Variance Activity</p>
                                        <p className={`${isLight ? 'text-black/60' : 'text-white/60'} text-sm font-medium leading-relaxed`}>
                                            By proceeding, you acknowledge that precision trading is high-risk. You can lose <span className={`${isLight ? 'text-black' : 'text-white'} font-black`}>100% of your staked funds</span> in any given trade.
                                        </p>
                                    </div>

                                    <label className={`flex items-center gap-4 cursor-pointer group p-4 rounded-2xl border ${isLight ? 'border-black/5 bg-black/[0.02] hover:bg-black/[0.04]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'} transition-all`}>
                                        <div
                                            onClick={() => setRiskAcknowledged(!riskAcknowledged)}
                                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${riskAcknowledged ? 'bg-red-500 border-red-500' : `${isLight ? 'border-black/10 group-hover:border-black/20' : 'border-white/10 group-hover:border-white/20'}`}`}
                                        >
                                            {riskAcknowledged && <CheckCircle size={14} className="text-white" />}
                                        </div>
                                        <span className={`text-sm font-bold ${isLight ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} transition-colors`}>I accept that I can lose money using this platform</span>
                                    </label>

                                    <div className="flex gap-4">
                                        <button onClick={handleBack} className={`flex-1 py-6 rounded-2xl ${isLight ? 'bg-black/5 text-black/40 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:bg-white/10'} font-black transition-all uppercase tracking-widest text-xs`}>BACK</button>
                                        <button
                                            onClick={handleSubmit}
                                            disabled={!riskAcknowledged || isSubmitting}
                                            className="flex-[2] py-6 rounded-2xl font-black text-white transition-all flex items-center justify-center gap-2 group disabled:opacity-30 disabled:grayscale"
                                            style={{ backgroundColor: accentColor }}
                                        >
                                            {isSubmitting ? "FINALIZING..." : "ENTER 15MARKET"}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="mt-8 flex justify-center gap-2">
                        {[1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-4' : 'opacity-20'}`}
                                style={{ backgroundColor: accentColor }}
                            />
                        ))}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
