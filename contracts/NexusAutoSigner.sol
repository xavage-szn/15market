// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexusAutoSignerWallet
 * @dev Personalized smart contract wallet for 15market players.
 * Supports internal balance tracking for ultra-fast trading with zero token transfers for stakes.
 */
contract NexusAutoSignerWallet is ReentrancyGuard {
    address public immutable owner;
    address public immutable operator;
    IERC20 public immutable usdc;

    uint256 public availableBalance;
    uint256 public lockedBalance;
    uint256 public pendingLoss;

    event Deposit(address indexed player, uint256 amount, uint256 newAvailableBalance);
    event StakeLocked(bytes32 indexed tradeId, address indexed player, uint256 amount, uint256 remainingAvailable);
    event TradeSettledWin(bytes32 indexed tradeId, address indexed player, uint256 stake, uint256 profit, uint256 totalPayout);
    event TradeSettledLoss(bytes32 indexed tradeId, address indexed player, uint256 amount, uint256 pendingLossTotal);
    event Withdrawal(address indexed player, uint256 amount, uint256 remainingBalance);
    event BatchSwept(uint256 amount, address treasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Caller is not the operator");
        _;
    }

    constructor(address _owner, address _operator, address _usdc) {
        owner = _owner;
        operator = _operator;
        usdc = IERC20(_usdc);
    }

    /**
     * @dev Invariant check: availableBalance + lockedBalance + pendingLoss == USDC.balanceOf(this)
     */
    function checkInvariant() public view returns (bool) {
        return (availableBalance + lockedBalance + pendingLoss) == usdc.balanceOf(address(this));
    }

    /**
     * @dev Deposit USDC into the wallet.
     * Anyone can call, but funds come from msg.sender.
     */
    function deposit(uint256 amount) external nonReentrant {
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        availableBalance += amount;
        emit Deposit(owner, amount, availableBalance);
        require(checkInvariant(), "Invariant broken");
    }

    /**
     * @dev Lock stake for a trade. Internal state update only.
     */
    function lockStake(bytes32 tradeId, uint256 amount) external onlyOperator nonReentrant {
        require(availableBalance >= amount, "Insufficient available balance");
        availableBalance -= amount;
        lockedBalance += amount;
        emit StakeLocked(tradeId, owner, amount, availableBalance);
    }

    /**
     * @dev Settle a winning trade.
     * Profit is transferred from Treasury to this contract externally, then this is called.
     */
    function settleWin(bytes32 tradeId, uint256 stake, uint256 profit) external onlyOperator nonReentrant {
        require(lockedBalance >= stake, "Insufficient locked balance");
        lockedBalance -= stake;
        availableBalance += (stake + profit);
        emit TradeSettledWin(tradeId, owner, stake, profit, stake + profit);
        require(checkInvariant(), "Invariant broken");
    }

    /**
     * @dev Settle a losing trade. Internal state update only.
     */
    function settleLoss(bytes32 tradeId, uint256 amount) external onlyOperator nonReentrant {
        require(lockedBalance >= amount, "Insufficient locked balance");
        lockedBalance -= amount;
        pendingLoss += amount;
        emit TradeSettledLoss(tradeId, owner, amount, pendingLoss);
    }

    /**
     * @dev Sweep pending losses to the treasury.
     */
    function sweepLosses(address treasury) external onlyOperator nonReentrant {
        uint256 amount = pendingLoss;
        if (amount == 0) return;
        pendingLoss = 0;
        require(usdc.transfer(treasury, amount), "Transfer failed");
        emit BatchSwept(amount, treasury);
        require(checkInvariant(), "Invariant broken");
    }

    /**
     * @dev Withdraw available funds. Owner only.
     */
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(availableBalance >= amount, "Insufficient available balance");
        availableBalance -= amount;
        require(usdc.transfer(owner, amount), "Transfer failed");
        emit Withdrawal(owner, amount, availableBalance);
        require(checkInvariant(), "Invariant broken");
    }
}

/**
 * @title NexusAutoSignerFactory
 * @dev Factory to deploy NexusAutoSignerWallet contracts using CREATE2.
 */
contract NexusAutoSignerFactory {
    address public immutable operator;
    address public immutable usdc;
    mapping(address => address) public playerToWallet;

    event WalletDeployed(address indexed player, address wallet);

    constructor(address _operator, address _usdc) {
        operator = _operator;
        usdc = _usdc;
    }

    function getWalletAddress(address player) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(player));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(abi.encodePacked(
                type(NexusAutoSignerWallet).creationCode,
                abi.encode(player, operator, usdc)
            ))
        )))));
    }

    function createWallet(address player) external {
        require(msg.sender == operator || msg.sender == player, "Unauthorized");
        require(playerToWallet[player] == address(0), "Already exists");
        bytes32 salt = keccak256(abi.encodePacked(player));
        address wallet = address(new NexusAutoSignerWallet{salt: salt}(player, operator, usdc));
        playerToWallet[player] = wallet;
        emit WalletDeployed(player, wallet);
    }

    function deployAndDeposit(uint256 amount) external {
        address wallet = playerToWallet[msg.sender];
        if (wallet == address(0)) {
            bytes32 salt = keccak256(abi.encodePacked(msg.sender));
            wallet = address(new NexusAutoSignerWallet{salt: salt}(msg.sender, operator, usdc));
            playerToWallet[msg.sender] = wallet;
            emit WalletDeployed(msg.sender, wallet);
        }
        
        if (amount > 0) {
            IERC20(usdc).transferFrom(msg.sender, address(this), amount);
            IERC20(usdc).approve(wallet, amount);
            NexusAutoSignerWallet(wallet).deposit(amount);
        }
    }
}
