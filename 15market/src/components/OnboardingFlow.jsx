import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Check, ChevronRight, Zap, Shield, Sparkles, Twitter, Camera } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

export const OnboardingFlow = ({ address, onComplete, theme, userProfile }) => {
    const [step, setStep] = useState(1);
    const [username, setUsername] = useState(userProfile?.username || '');
    const [selectedAvatar, setSelectedAvatar] = useState(userProfile?.avatar || '');
    const [saveError, setSaveError] = useState('');
    const isLight = theme === 'light';

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!username.trim()) {
            setSaveError('Please enter a display name first.');
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address.toLowerCase(),
                    username: username.trim(),
                    avatar: selectedAvatar.trim(),
                    onboardedAt: Date.now()
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem(`15market_onboarded_${address.toLowerCase()}`, 'true');
                onComplete(data.profile || { 
                    username: username.trim(), 
                    avatar: selectedAvatar.trim() 
                });
            } else {
                setSaveError(data.error || 'Failed to save profile. Please try again.');
            }
        } catch (e) {
            console.error("Save profile failed:", e);
            setSaveError('Network error — is the backend running? Check localhost:3010.');
        } finally {
            setIsSaving(false);
        }
    };



    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`w-full max-w-lg ${isLight ? 'bg-white' : 'bg-[#0a0a0a]'} border ${isLight ? 'border-[#3CB371]/20' : 'border-white/10'} rounded-[40px] overflow-hidden shadow-2xl`}
            >
                <div className="p-8 md:p-12">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div 
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 text-center"
                            >
                                <div className="w-20 h-20 bg-[#3CB371]/5 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-[#3CB371]/10">
                                    <img src="/logo.png" alt="15market" className="w-12 h-auto" />
                                </div>
                                <h2 className={`text-3xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                    Welcome to 15market
                                </h2>
                                <p className={`text-sm ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'} font-medium leading-relaxed`}>
                                    The decentralized momentum driven prediction market. 
                                    Let's get your identity set up before you start trading.
                                </p>
                                <button 
                                    onClick={() => setStep(2)}
                                    className="w-full py-5 bg-[#3CB371] text-white rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2 group"
                                >
                                    Get Started
                                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
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
                                <div className="text-center">
                                    <h3 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                        Identity Setup
                                    </h3>
                                    <p className={`text-xs ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} font-bold uppercase tracking-widest mt-1`}>
                                        Step 2 of 2: Create your on-chain profile
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-center mb-6">
                                        <div 
                                            onClick={() => document.getElementById('avatar-upload').click()}
                                            className={`relative w-28 h-28 rounded-full border-2 ${isLight ? 'border-[#3CB371]/30 bg-black/5 hover:border-[#3CB371]' : 'border-white/10 bg-white/5 hover:border-[#3CB371]'} flex items-center justify-center overflow-hidden cursor-pointer transition-all group shadow-xl`}
                                        >
                                            {selectedAvatar ? (
                                                <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <User size={32} className="opacity-20" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Upload</span>
                                                </div>
                                            )}
                                            <div className={`absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity ${selectedAvatar ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                                                <div className="w-8 h-8 rounded-full bg-[#3CB371] flex items-center justify-center text-white shadow-lg">
                                                    <span className="text-xl font-black">+</span>
                                                </div>
                                            </div>
                                            <input 
                                                id="avatar-upload"
                                                type="file" 
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => {
                                                            setSelectedAvatar(reader.result);
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20">
                                            <User size={18} />
                                        </div>
                                        <input 
                                            type="text" 
                                            maxLength={20}
                                            value={username}
                                            onChange={(e) => {
                                                setUsername(e.target.value);
                                                setSaveError('');
                                            }}
                                            placeholder="Choose a Display Name"
                                            className={`w-full py-5 pl-14 pr-8 rounded-2xl ${isLight ? 'bg-gray-50 border-gray-200 text-black' : 'bg-white/5 border-white/10 text-white'} border focus:border-[#3CB371] outline-none text-lg font-black transition-all placeholder:opacity-30 shadow-inner`}
                                        />
                                    </div>
                                </div>


                                {saveError && (
                                    <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold text-center">
                                        ⚠️ {saveError}
                                    </div>
                                )}

                                <button 
                                    disabled={!username.trim() || isSaving}
                                    onClick={handleSave}
                                    className={`w-full py-5 ${!username.trim() ? 'bg-white/5 text-white/20' : 'bg-[#3CB371] text-white shadow-[0_0_20px_rgba(60,179,113,0.3)]'} rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-3`}
                                >
                                    {isSaving ? "Finalizing..." : "Complete Setup"}
                                    {!isSaving && <Zap size={18} />}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className={`p-6 border-t ${isLight ? 'bg-gray-50 border-gray-100' : 'bg-white/[0.02] border-white/5'} flex items-center justify-center gap-8`}>
                    <div className="flex items-center gap-2">
                        <Shield size={14} className="text-[#3CB371]" />
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'}`}>Secured by Arc</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
