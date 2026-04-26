// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexusAutoSignerWallet
 * @dev Personalized smart contract wallet for 15market players.
 * Supports internal balance tracking for ultra-fast trading with zero token transfers for stakes.
 * This version uses the NATIVE token (which is USDC on the Arc network).
 */
contract NexusAutoSignerWallet is ReentrancyGuard {
    address public immutable owner;
    address public immutable operator;

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

    constructor(address _owner, address _operator) {
        owner = _owner;
        operator = _operator;
    }

    /**
     * @dev Fallback to receive native USDC. 
     * Automatically updates availableBalance so the backend/UI syncs immediately.
     */
    receive() external payable {
        availableBalance += msg.value;
        emit Deposit(owner, msg.value, availableBalance);
    }

    /**
     * @dev Invariant check: availableBalance + lockedBalance + pendingLoss == address(this).balance
     */
    function checkInvariant() public view returns (bool) {
        return (availableBalance + lockedBalance + pendingLoss) == address(this).balance;
    }

    /**
     * @dev Explicit deposit function (native).
     */
    function deposit() external payable nonReentrant {
        availableBalance += msg.value;
        emit Deposit(owner, msg.value, availableBalance);
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
     * Profit is transferred from Treasury to this contract as native USDC, then this is called.
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
    function sweepLosses(address payable treasury) external onlyOperator nonReentrant {
        uint256 amount = pendingLoss;
        if (amount == 0) return;
        pendingLoss = 0;
        (bool success, ) = treasury.call{value: amount}("");
        require(success, "Transfer failed");
        emit BatchSwept(amount, treasury);
        require(checkInvariant(), "Invariant broken");
    }

    /**
     * @dev Withdraw available funds. Owner only.
     */
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(availableBalance >= amount, "Insufficient available balance");
        availableBalance -= amount;
        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Transfer failed");
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
    mapping(address => address) public playerToWallet;

    event WalletDeployed(address indexed player, address wallet);

    constructor(address _operator) {
        operator = _operator;
    }

    function getWalletAddress(address player) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(player));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(abi.encodePacked(
                type(NexusAutoSignerWallet).creationCode,
                abi.encode(player, operator)
            ))
        )))));
    }

    function createWallet(address player) external {
        require(msg.sender == operator || msg.sender == player, "Unauthorized");
        require(playerToWallet[player] == address(0), "Already exists");
        bytes32 salt = keccak256(abi.encodePacked(player));
        address wallet = address(new NexusAutoSignerWallet{salt: salt}(player, operator));
        playerToWallet[player] = wallet;
        emit WalletDeployed(player, wallet);
    }

    function deployAndDeposit() external payable {
        address wallet = playerToWallet[msg.sender];
        if (wallet == address(0)) {
            bytes32 salt = keccak256(abi.encodePacked(msg.sender));
            wallet = address(new NexusAutoSignerWallet{salt: salt}(msg.sender, operator));
            playerToWallet[msg.sender] = wallet;
            emit WalletDeployed(msg.sender, wallet);
        }
        
        if (msg.value > 0) {
            (bool success, ) = payable(wallet).call{value: msg.value}("");
            require(success, "Transfer failed");
        }
    }
}
