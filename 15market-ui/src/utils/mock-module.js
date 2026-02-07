// Mock implementation for unused modules to fix build errors
// Used for: graz (Cosmos), @solana/wallet-adapter-react (Solana) which are imported by Para SDK but not used by us.
export default {};
export const useConnection = () => ({});
export const useWallet = () => ({});
export const useAnchorWallet = () => ({});
export const WalletProvider = ({ children }) => children;
export const ConnectionProvider = ({ children }) => children;
