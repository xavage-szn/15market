// Helper to get the correct RP_ID for Turnkey based on the current domain
export const getRpId = () => {
  if (typeof window === 'undefined') return import.meta.env.VITE_TURNKEY_RP_ID || '15market.online';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
  
  // Return the full hostname (e.g. www.15market.online) to ensure exact match with Turnkey dashboard
  return host;
};
