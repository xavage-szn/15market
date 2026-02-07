// Mock implementation for unused modules to fix build errors
export default {};

// graz / Cosmos / @cosmjs/stargate exports
export const useAccount = () => ({});
export const useActiveWalletType = () => ({});
export const useConnect = () => ({});
export const useDisconnect = () => ({});
export const useSuggestChainAndConnect = () => ({});
export const getChainInfo = () => ({});
export const getWallet = () => ({});
export const checkWallet = () => false;
export const mainnetChains = {};
export const testnetChains = {};
export const WalletType = { KEPLR: 'keplr', LEAP: 'leap', COSMOSTATION: 'cosmostation' };
export const WALLET_TYPES = ['keplr', 'leap', 'cosmostation'];
export const useBalances = () => ({});
export const useChain = () => ({});
export const useChainId = () => ({});
export const coin = () => ({});
export const StargateClient = { connect: () => ({}) };
export const GrazProvider = ({ children }) => children;

// Solana adapters exports
export const useConnection = () => ({});
export const useWallet = () => ({});
export const useAnchorWallet = () => ({});
export const WalletProvider = ({ children }) => children;
export const ConnectionProvider = ({ children }) => children;
export const PublicKey = function () { return { toBase58: () => "" }; };
export const Transaction = function () { return {}; };
export const VersionedTransaction = function () { return {}; };
export const isVersionedTransaction = () => false;
export const WalletAdapterNetwork = { Mainnet: 'mainnet-beta', Testnet: 'testnet', Devnet: 'devnet' };
export const WalletReadyState = { Installed: 'Installed', NotDetected: 'NotDetected', Loadable: 'Loadable' };

// Mobile adapter
export const createSolanaMobileWalletAdapter = () => ({});
