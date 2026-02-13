// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcPrediction is Ownable, ReentrancyGuard {
    struct Bet {
        uint256 id;
        address user;
        uint256 amount;
        uint8 direction; // 0 = DOWN, 1 = UP
        uint256 entryPrice;
        uint256 timestamp;
        uint256 duration;
        uint8 marketId; // Added for multi-asset support
        uint256 settlementPrice;
        bool settled;
        bool won;
    }

    struct UserProfile {
        string username;
        string xHandle;
        string discordHandle;
        uint256 totalWins;
        uint256 totalTrades;
        uint256 totalVolume;
    }

    mapping(uint256 => Bet) public bets;
    mapping(address => UserProfile) public profiles;
    address[] public userAddresses;
    mapping(address => bool) public hasProfile;

    // Events
    event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId);
    event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout);
    event ProfileUpdated(address indexed user, string username, string xHandle);

    constructor() Ownable(msg.sender) {}

    function syncProfile(string calldata _username, string calldata _xHandle, string calldata _discordHandle) external {
        if (!hasProfile[msg.sender]) {
            userAddresses.push(msg.sender);
            hasProfile[msg.sender] = true;
        }
        UserProfile storage profile = profiles[msg.sender];
        profile.username = _username;
        profile.xHandle = _xHandle;
        profile.discordHandle = _discordHandle;
        emit ProfileUpdated(msg.sender, _username, _xHandle);
    }

    function getUserCount() external view returns (uint256) {
        return userAddresses.length;
    }

    function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable nonReentrant {
        require(msg.value > 0, "Bet amount must be greater than 0");
        require(_direction == 0 || _direction == 1, "Invalid direction");
        require(!bets[_betId].settled && bets[_betId].user == address(0), "Bet ID already exists");

        bets[_betId] = Bet({
            id: _betId,
            user: _payoutAddress == address(0) ? msg.sender : _payoutAddress,
            amount: msg.value,
            direction: _direction,
            entryPrice: _entryPrice,
            timestamp: block.timestamp,
            duration: _duration,
            marketId: _marketId,
            settlementPrice: 0,
            settled: false,
            won: false
        });

        emit BetPlaced(_betId, bets[_betId].user, msg.value, _direction, _entryPrice, _duration, block.timestamp, _marketId);
    }

    function settleBet(uint256 _betId, uint256 _exitPrice) external onlyOwner nonReentrant {
        Bet storage bet = bets[_betId];
        require(!bet.settled, "Bet already settled");

        bet.settled = true;
        bet.settlementPrice = _exitPrice;

        bool won = false;
        if (bet.direction == 1) { // UP
            if (_exitPrice > bet.entryPrice) won = true;
        } else { // DOWN
            if (_exitPrice < bet.entryPrice) won = true;
        }

        uint256 payout = 0;
        UserProfile storage profile = profiles[bet.user];
        profile.totalTrades += 1;
        profile.totalVolume += bet.amount;

        if (won) {
            bet.won = true;
            profile.totalWins += 1;
            uint256 multiplier = 198; 
            if (bet.duration <= 5) multiplier = 698;
            else if (bet.duration <= 10) multiplier = 498;

            payout = (bet.amount * multiplier) / 100;
            
            require(address(this).balance >= payout, "Insufficient contract balance for payout");
            (bool success, ) = bet.user.call{value: payout}("");
            require(success, "Payout transfer failed");
        }

        emit BetSettled(_betId, bet.user, _exitPrice, won, payout);
    }

    receive() external payable {}

    function withdraw(uint256 _amount) external onlyOwner {
        require(address(this).balance >= _amount, "Insufficient balance");
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Withdraw failed");
    }
}
