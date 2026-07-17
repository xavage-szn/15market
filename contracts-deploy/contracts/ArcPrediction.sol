// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title 15market Treasury
 * @dev Optimized prediction market contract with direct Treasury payouts.
 */
abstract contract Ownable {
    address public owner;
    constructor() { owner = msg.sender; }
    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }
}

contract ArcPrediction is Ownable {
    struct Bet {
        uint256 id;
        address user;
        uint256 amount;
        uint8 direction; // 0: UP, 1: DOWN
        uint256 entryPrice;
        uint256 duration;
        uint256 timestamp;
        uint8 marketId;
        address payoutAddress;
        uint256 settlementPrice;
        bool settled;
        bool won;
    }

    mapping(uint256 => Bet) public bets;
    uint256 public totalVolume;

    event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId);
    event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout);

    receive() external payable {}

    /**
     * @dev Place a bet. Funds stay in the contract.
     */
    function placeBet(
        uint256 _betId,
        uint8 _direction,
        uint256 _duration,
        uint256 _entryPrice,
        uint8 _marketId,
        address _payoutAddress
    ) external payable {
        require(msg.value > 0, "No stake");
        require(bets[_betId].id == 0, "ID exists");

        bets[_betId] = Bet({
            id: _betId,
            user: msg.sender,
            amount: msg.value,
            direction: _direction,
            entryPrice: _entryPrice,
            duration: _duration,
            timestamp: block.timestamp,
            marketId: _marketId,
            payoutAddress: _payoutAddress,
            settlementPrice: 0,
            settled: false,
            won: false
        });

        totalVolume += msg.value;
        emit BetPlaced(_betId, msg.sender, msg.value, _direction, _entryPrice, _duration, block.timestamp, _marketId);
    }

    /**
     * @dev Settle a bet. Authority restricted to Owner (Backend).
     * Automatically transfers winnings from Treasury to the payoutAddress based on dynamic share pricing.
     */
    function settleBet(uint256 _betId, uint256 _exitPrice, uint256 _payoutAmount) external onlyOwner {
        Bet storage bet = bets[_betId];
        require(bet.id != 0, "Bet not found");
        require(!bet.settled, "Already settled");

        bet.settlementPrice = _exitPrice;
        bet.settled = true;

        // Logic: 0 is UP, 1 is DOWN
        if (bet.direction == 0) {
            bet.won = (_exitPrice > bet.entryPrice);
        } else {
            bet.won = (_exitPrice < bet.entryPrice);
        }

        uint256 payout = 0;
        if (bet.won) {
            // Payout is calculated authoritatively off-chain based on real-time share prices
            // and passed in by the backend oracle.
            payout = _payoutAmount;
            
            require(address(this).balance >= payout, "Insufficient Treasury funds");
            
            (bool success, ) = payable(bet.payoutAddress).call{value: payout}("");
            require(success, "Payout transfer failed");
        }

        emit BetSettled(_betId, bet.user, _exitPrice, bet.won, payout);
    }

    /**
     * @dev Manual payout fallback for emergencies.
     */
    function manualPayout(address payable _to, uint256 _amount) external onlyOwner {
        require(address(this).balance >= _amount, "Insufficient funds");
        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Protocol withdrawal (Revenue).
     */
    function withdraw(uint256 _amount) external onlyOwner {
        require(address(this).balance >= _amount, "Insufficient funds");
        (bool success, ) = payable(owner).call{value: _amount}("");
        require(success, "Transfer failed");
    }
}
