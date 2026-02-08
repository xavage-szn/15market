import React, { useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserApp from "./UserApp";
import CampaignPage from "./components/CampaignPage";

// Reown & Wagmi cleaned up - Using GetPara native provider
import { QueryClientProvider } from '@tanstack/react-query'
import { AppParaProvider, queryClient } from './providers/ParaProvider'
import { useWallet } from "@getpara/react-sdk";
import { useAccount } from "wagmi";

// Wrapper component to access hooks
function AppRoutes() {
  const { data: wallet } = useWallet();
  const { address: wagmiAddress } = useAccount();
  const address = wallet?.address || wagmiAddress;
  const network = useMemo(() => localStorage.getItem("15market_network") || "arc", []);

  return (
    <Routes>
      <Route path="/" element={<UserApp />} />
      <Route path="/campaign/:campaignId" element={<CampaignPage address={address} network={network} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppParaProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppParaProvider>
    </QueryClientProvider>
  );
}
