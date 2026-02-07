import React, { useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserApp from "./UserApp";
import CampaignPage from "./components/CampaignPage";

// Reown & Wagmi Imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiAdapter } from './reownConfig'
import { useWallet } from "@getpara/react-sdk";

// Create Query Client
const queryClient = new QueryClient()

// Wrapper component to access hooks
function AppRoutes() {
  const { data: wallet } = useWallet();
  const address = wallet?.address;
  const network = useMemo(() => localStorage.getItem("15market_network") || "solana", []);

  return (
    <Routes>
      <Route path="/" element={<UserApp />} />
      <Route path="/campaign/:campaignId" element={<CampaignPage address={address} network={network} />} />
    </Routes>
  );
}

export default function App() {
  // Render Main User Application wrapped in Web3 Providers
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
