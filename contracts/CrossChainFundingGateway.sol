// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ITokenMessenger
 * @notice Circle CCTP Interface for burning USDC on the source chain
 */
interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 _nonce);
}

/**
 * @title IAggregatorRouter
 * @notice Generic router interface supporting Unitflow / Xylonet aggregator standards
 */
interface IAggregatorRouter {
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
}

/**
 * @title CrossChainFundingGateway
 * @notice Receives native tokens, swaps to USDC via Unitflow/Xylonet, takes a spread fee, and bridges via Circle CCTP.
 */
contract CrossChainFundingGateway is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Core Constants
    IERC20 public immutable usdc;
    ITokenMessenger public immutable tokenMessenger;
    IAggregatorRouter public aggregatorRouter;

    // Configuration
    uint32 public arcDestinationDomain; // The CCTP domain ID for Arc Testnet
    uint256 public spreadBasisPoints; // 100 = 1%
    address public weth; // Wrapped native token address used in routing

    // Events
    event FundingInitiated(
        address indexed sender,
        bytes32 indexed tradingWallet,
        uint256 nativeAmountIn,
        uint256 usdcBridged,
        uint256 feeTaken,
        uint64 cctpNonce
    );

    event AggregatorUpdated(address newAggregator);
    event SpreadUpdated(uint256 newSpread);

    constructor(
        address _usdc,
        address _tokenMessenger,
        address _aggregatorRouter,
        address _weth,
        uint32 _arcDestinationDomain,
        uint256 _spreadBasisPoints
    ) {
        require(_usdc != address(0), "Invalid USDC");
        require(_tokenMessenger != address(0), "Invalid CCTP Messenger");
        require(_aggregatorRouter != address(0), "Invalid Router");

        usdc = IERC20(_usdc);
        tokenMessenger = ITokenMessenger(_tokenMessenger);
        aggregatorRouter = IAggregatorRouter(_aggregatorRouter);
        weth = _weth;
        arcDestinationDomain = _arcDestinationDomain;
        spreadBasisPoints = _spreadBasisPoints;

        // Infinite approve TokenMessenger to burn USDC
        usdc.safeApprove(_tokenMessenger, type(uint256).max);
    }

    /**
     * @notice Swaps native token to USDC, deducts spread, and bridges to the Trading Wallet
     * @param tradingWallet The bytes32 padded address of the user's Arc Trading Wallet
     * @param minUsdcOut Minimum acceptable USDC from the DEX swap (slippage protection)
     */
    function fundWithNative(bytes32 tradingWallet, uint256 minUsdcOut) external payable nonReentrant {
        require(msg.value > 0, "Amount must be > 0");

        // 1. Swap Native to USDC via Unitflow/Xylonet Aggregator
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = address(usdc);

        uint256 initialUsdc = usdc.balanceOf(address(this));
        
        // Execute Swap
        aggregatorRouter.swapExactETHForTokens{value: msg.value}(
            minUsdcOut,
            path,
            address(this),
            block.timestamp + 300 // 5 minute deadline
        );

        uint256 receivedUsdc = usdc.balanceOf(address(this)) - initialUsdc;
        require(receivedUsdc >= minUsdcOut, "Slippage tolerance exceeded");

        // 2. Calculate and deduct the spread
        uint256 spreadFee = (receivedUsdc * spreadBasisPoints) / 10000;
        uint256 bridgeAmount = receivedUsdc - spreadFee;

        // 3. Bridge via CCTP
        uint64 nonce = tokenMessenger.depositForBurn(
            bridgeAmount,
            arcDestinationDomain,
            tradingWallet,
            address(usdc)
        );

        emit FundingInitiated(
            msg.sender,
            tradingWallet,
            msg.value,
            bridgeAmount,
            spreadFee,
            nonce
        );
    }

    /**
     * @notice Fallback pure USDC bridging (bypasses swap, just takes spread and bridges)
     */
    function fundWithUSDC(uint256 amount, bytes32 tradingWallet) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Take spread
        uint256 spreadFee = (amount * spreadBasisPoints) / 10000;
        uint256 bridgeAmount = amount - spreadFee;

        // Bridge via CCTP
        uint64 nonce = tokenMessenger.depositForBurn(
            bridgeAmount,
            arcDestinationDomain,
            tradingWallet,
            address(usdc)
        );

        emit FundingInitiated(
            msg.sender,
            tradingWallet,
            0,
            bridgeAmount,
            spreadFee,
            nonce
        );
    }

    // --- Admin Functions ---

    function updateAggregator(address _newAggregator) external onlyOwner {
        require(_newAggregator != address(0), "Invalid address");
        aggregatorRouter = IAggregatorRouter(_newAggregator);
        emit AggregatorUpdated(_newAggregator);
    }

    function updateSpread(uint256 _newSpreadBP) external onlyOwner {
        require(_newSpreadBP <= 1000, "Spread cannot exceed 10%");
        spreadBasisPoints = _newSpreadBP;
        emit SpreadUpdated(_newSpreadBP);
    }

    function collectFees() external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        usdc.safeTransfer(owner(), balance);
    }

    // Accept fallback ETH for potential routing refunds
    receive() external payable {}
}
