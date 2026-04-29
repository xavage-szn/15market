import React, { useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserApp from "./UserApp";
import CampaignPage from "./components/CampaignPage";
import { DocsPage } from "./components/DocsPage";
import { useAccount } from "wagmi";

// Wrapper component to access hooks
function AppContent() {
  const { address } = useAccount();
  // Use local storage for network preference, default to arc
  const network = useMemo(() => localStorage.getItem("15market_network") || "arc", []);

  return (
    <Routes>
      <Route path="/" element={<UserApp />} />
      <Route path="/docs" element={<DocsPage theme={localStorage.getItem("15market_theme") || "dark"} />} />
      <Route path="/campaign/:campaignId" element={<CampaignPage address={address} network={network} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
