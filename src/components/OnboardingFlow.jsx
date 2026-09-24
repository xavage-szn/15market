import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ChevronRight, Zap, Shield } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

const REQUEST_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const readJson = async (response) => {
    try { return await response.json(); } catch { return {}; }
};

export const OnboardingFlow = ({ address, onComplete, theme, userProfile, evmSessionWallet }) => {
    const [step, setStep] = useState(1);
    const [username, setUsername] = useState(userProfile?.username || '');
    const [selectedAvatar, setSelectedAvatar] = useState(userProfile?.avatar || '');
    const [saveError, setSaveError] = useState('');
    const [savedProfile, setSavedProfile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const isLight = theme === 'light';
    const addressKey = String(address || '').toLowerCase();

    const finishWithProfile = (profile) => {
        const nextProfile = profile || { username: username.trim(), avatar: selectedAvatar.trim() };
        localStorage.setItem(`15market_onboarded_${addressKey}`, 'true');
        localStorage.setItem(`15market_profile_exists_${addressKey}`, 'true');
        setSavedProfile(nextProfile);
        setStep(3);
    };

    const handleSave = async () => {
        const cleanUsername = username.trim();
        if (!cleanUsername || !addressKey) {
            setSaveError('Please enter a display name first.');
            return;
        }
        if (isSaving) return;
        setIsSaving(true);
        setSaveError('');

        const body = JSON.stringify({
            address: addressKey,
            username: cleanUsername,
            avatar: selectedAvatar.trim(),
            onboardedAt: Date.now()
        });

        try {
            const response = await fetchWithTimeout(`${KEEPER_URL_ARC}/profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            const data = await readJson(response);
            if (response.ok && data.success) {
                finishWithProfile(data.profile);
                return;
            }
            setSaveError(data.error || 'Failed to save profile. Please try again.');
        } catch (error) {
            // A successful server write can still appear to fail when a returning
            // user's request is interrupted while the backend is deriving their
            // existing session wallet. Verify the profile before showing an error.
            try {
                const verify = await fetchWithTimeout(`${KEEPER_URL_ARC}/profiles/${addressKey}`, { cache: 'no-store' });
                const verifiedProfile = await readJson(verify);
                if (verify.ok && verifiedProfile?.username) {
                    finishWithProfile(verifiedProfile);
                    return;
                }
            } catch (verifyError) {
                console.error('Profile verification failed:', verifyError);
            }
            console.error('Save profile failed:', error);
            setSaveError(error?.name === 'AbortError'
                ? 'The profile request timed out. Please try again.'
                : 'Network error — please check your connection and try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" style={{ fontFamily: 'Comfortaa, cursive' }}>
            <motion.div initial={{ opacity: 0, scale: .9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className={`w-full max-w-lg ${isLight ? 'bg-white text-black' : 'bg-[#0a0a0a] text-white'} border border-white/10 rounded-[40px] overflow-hidden shadow-2xl`}>
                <div className="p-8 md:p-12">
                    <AnimatePresence mode="wait">
                        {step === 1 && <motion.div key="welcome" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 text-center">
                            <img src={isLight ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="w-16 h-auto mx-auto mb-8" />
                            <h2 className="text-3xl font-black uppercase tracking-tighter">Welcome to 15market</h2>
                            <p className="text-sm opacity-50 leading-relaxed">The decentralized real time prediction market. Let's get your identity set up before you start trading.</p>
                            <button onClick={() => setStep(2)} className="w-full py-5 bg-[#249C6C] text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2">Get Started <ChevronRight size={18} /></button>
                        </motion.div>}

                        {step === 2 && <motion.div key="identity" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                            <div className="text-center"><h3 className="text-2xl font-black uppercase tracking-tighter">Identity Setup</h3><p className="text-xs opacity-40 font-bold uppercase tracking-widest mt-1">Step 2 of 2: Create your profile</p></div>
                            <div className="space-y-4">
                                <div className="flex justify-center"><label htmlFor="avatar-upload" className="relative w-28 h-28 rounded-full border-2 border-white/10 bg-white/5 flex items-center justify-center overflow-hidden cursor-pointer">
                                    {selectedAvatar ? <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" /> : <div className="flex flex-col items-center gap-1 opacity-40"><User size={32} /><span className="text-[10px] font-black uppercase">Upload</span></div>}
                                    <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onloadend = () => setSelectedAvatar(String(reader.result || '')); reader.readAsDataURL(file); }} />
                                </label></div>
                                <div className="relative"><User size={18} className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20" /><input type="text" maxLength={20} value={username} onChange={(event) => { setUsername(event.target.value); setSaveError(''); }} placeholder="Choose a Display Name" className="w-full py-5 pl-14 pr-8 rounded-2xl bg-white/5 border border-white/10 outline-none text-lg font-black" /></div>
                            </div>
                            {saveError && <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold text-center">⚠️ {saveError}</div>}
                            <button disabled={!username.trim() || isSaving} onClick={handleSave} className="w-full py-5 bg-[#249C6C] disabled:opacity-30 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3">{isSaving ? 'Finalizing...' : 'Complete Setup'}{!isSaving && <Zap size={18} />}</button>
                        </motion.div>}

                        {step === 3 && <motion.div key="wallets" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                            <div className="text-center"><h3 className="text-2xl font-black uppercase tracking-tighter">Your Wallets</h3><p className="text-xs opacity-40 font-bold uppercase tracking-widest mt-1">Step 3 of 3: Ready to trade</p></div>
                            <div className="space-y-4"><div className="p-5 rounded-2xl border border-white/10 bg-white/5"><div className="flex items-center gap-3 mb-2"><Shield size={16} className="text-[#249C6C]" /><h4 className="text-[10px] font-black uppercase tracking-widest">Main Wallet</h4></div><p className="text-sm font-mono font-bold break-all">{savedProfile?.username || username} ({addressKey.slice(0, 6)}...{addressKey.slice(-4)})</p></div><div className="p-5 rounded-2xl border border-[#249C6C]/20 bg-[#249C6C]/10"><div className="flex items-center gap-3 mb-2"><Zap size={16} className="text-[#249C6C]" /><h4 className="text-[10px] font-black uppercase tracking-widest">Trading Wallet</h4></div><p className="text-sm font-mono font-bold break-all">{evmSessionWallet?.address || 'Syncing...'}</p></div></div>
                            <button onClick={() => onComplete(savedProfile)} className="w-full py-5 bg-[#249C6C] text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3">Enter 15market <ChevronRight size={18} /></button>
                        </motion.div>}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
