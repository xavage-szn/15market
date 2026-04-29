import React from 'react';
import { ExternalLink, BookOpen, Wallet, Droplets, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function DocsPage({ theme }) {
  const isLight = theme === 'light';
  
  return (
    <div className={`w-full min-h-screen ${isLight ? 'bg-[#f0f9f4] text-black' : 'bg-[#050505] text-white'} overflow-y-auto pb-24`}>
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="flex items-center gap-3 mb-8">
          <BookOpen className="text-[#3CB371] w-8 h-8" />
          <h1 className="text-3xl font-black uppercase tracking-tighter">Documentation & Guides</h1>
        </div>

        <div className="space-y-8">
          {/* Getting Started Section */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-[24px] border ${isLight ? 'bg-white border-[#3CB371]/20' : 'bg-[#0D0D0D] border-[#3CB371]/20'}`}
          >
            <h2 className="text-xl font-black uppercase tracking-widest text-[#3CB371] mb-4">Getting Started with 15Market</h2>
            <p className={`mb-4 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
              Welcome to 15Market, the fastest decentralized binary options trading platform. 
              Here you can trade price movements of top assets with ultra-low latency.
            </p>
            <ul className={`list-disc list-inside space-y-2 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              <li>Connect your Web3 wallet (Metamask, Rabby, etc.)</li>
              <li>Ensure you are on the Arc Testnet</li>
              <li>Fund your trading session to get started</li>
              <li>Predict if the price will go UP or DOWN within the chosen timeframe</li>
            </ul>
          </motion.section>

          {/* Onboarding Section */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`p-6 rounded-[24px] border ${isLight ? 'bg-white border-[#3CB371]/20' : 'bg-[#0D0D0D] border-[#3CB371]/20'}`}
          >
            <h2 className="text-xl font-black uppercase tracking-widest text-[#3CB371] mb-4">How to Onboard</h2>
            <p className={`mb-4 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
              When you first connect, a secure Smart Contract Wallet (Session Wallet) is automatically generated for you. 
              This wallet allows for 1-click trading without needing to sign every transaction with your main wallet.
            </p>
            <div className={`p-4 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-transparent`}>
              <h3 className="font-bold mb-2">Steps:</h3>
              <ol className={`list-decimal list-inside space-y-2 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                <li>Click "Connect Wallet" at the top right.</li>
                <li>Approve the connection and the automatic network switch to Arc Testnet.</li>
                <li>Your Session Wallet is generated seamlessly in the background.</li>
                <li>You can link your X (Twitter) profile in the Profile settings to customize your avatar.</li>
              </ol>
            </div>
          </motion.section>

          {/* Funding Section */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`p-6 rounded-[24px] border ${isLight ? 'bg-white border-[#3CB371]/20' : 'bg-[#0D0D0D] border-[#3CB371]/20'}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="text-[#3CB371]" />
              <h2 className="text-xl font-black uppercase tracking-widest text-[#3CB371]">How to Fund Your Wallet</h2>
            </div>
            <p className={`mb-4 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
              To trade, your Session Wallet needs USDC on the Arc Testnet. There are two main ways to fund it:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl ${isLight ? 'bg-[#3CB371]/10' : 'bg-[#3CB371]/5'} border border-[#3CB371]/30`}>
                <h3 className="font-black uppercase mb-2">Option 1: Direct Refill</h3>
                <p className={`text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                  Use the "Refill" button in the Dashboard or Wallet drawer. This will prompt your main wallet to send USDC directly to your Session Wallet.
                </p>
              </div>
              
              <div className={`p-4 rounded-xl ${isLight ? 'bg-[#3CB371]/10' : 'bg-[#3CB371]/5'} border border-[#3CB371]/30`}>
                <h3 className="font-black uppercase mb-2">Option 2: Manual Transfer</h3>
                <p className={`text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                  Copy your EOA Session Wallet address from the Dashboard and manually send USDC to it from your main wallet or any exchange.
                </p>
              </div>
            </div>
          </motion.section>

          {/* Faucet Section */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`p-6 rounded-[24px] border ${isLight ? 'bg-gradient-to-r from-[#3CB371]/20 to-transparent border-[#3CB371]/40' : 'bg-gradient-to-r from-[#3CB371]/10 to-[#0D0D0D] border-[#3CB371]/40'}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="text-[#3CB371]" />
              <h2 className="text-xl font-black uppercase tracking-widest text-[#3CB371]">Getting USDC from Circle Faucet</h2>
            </div>
            <p className={`mb-4 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
              Since we operate on a testnet, you can get free test USDC to trade with directly from the official Circle Faucet.
            </p>
            
            <ol className={`list-decimal list-inside space-y-3 mb-6 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              <li>Visit the Circle Faucet using the link below.</li>
              <li>Select your network (ensure it corresponds to Arc or its base layer if applicable).</li>
              <li>Enter your Main Wallet address (or Session Wallet address).</li>
              <li>Click "Send USDC" and wait for the confirmation.</li>
              <li>Once received, you can use the Refill feature to move it to your Session Wallet.</li>
            </ol>

            <a 
              href="https://faucet.circle.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-black uppercase tracking-widest transition-all ${isLight ? 'bg-[#3CB371] text-white hover:brightness-110' : 'bg-[#3CB371] text-black hover:bg-white hover:text-black'}`}
            >
              Access Circle Faucet <ExternalLink size={16} />
            </a>
          </motion.section>

        </div>
      </div>
    </div>
  );
}
