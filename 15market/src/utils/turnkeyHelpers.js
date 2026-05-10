// Helper to get the correct RP_ID for Turnkey based on the current domain
export const getRpId = () => {
  if (typeof window === 'undefined') return import.meta.env.VITE_TURNKEY_RP_ID;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
  
  const envRpId = import.meta.env.VITE_TURNKEY_RP_ID;
  // If the current host ends with the configured RP_ID (e.g. www.15market.online ends with 15market.online), 
  // we use the configured RP_ID to match the Turnkey registration.
  if (envRpId && host.endsWith(envRpId)) return envRpId;
  
  // Otherwise fallback to the actual hostname to avoid WebAuthn SecurityErrors
  return host;
};
