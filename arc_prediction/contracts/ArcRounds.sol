// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcRounds
 * @dev P2P Rounds prediction contract with locked escrow and odds-based payouts.
 */
contract ArcRounds is Ownable, ReentrancyGuard {
    struct Round {
        uint256 id;
        uint256 lockPrice;
        uint256 lockTimestamp;
        uint256 settlePrice;
        uint256 settleTimestamp;
        uint256 totalLong;
        uint256 totalShort;
        bool settled;
        bool exists;
    }

    struct Entry {
        address user;
        uint256 amount;
        uint8 direction; // 0 = DOWN (Short), 1 = UP (Long)
        bool claimed;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => Entry)) public entries;
    mapping(uint256 => address[]) public participants;

    uint256 public feeBps = 500; // 5% fee to the house

    event RoundLocked(uint256 indexed roundId, uint256 lockPrice, uint256 timestamp);
    event RoundSettled(uint256 indexed roundId, uint256 settlePrice, uint256 timestamp, uint8 result);
    event EntryPlaced(uint256 indexed roundId, address indexed user, uint256 amount, uint8 direction);
    event PayoutClaimed(uint256 indexed roundId, address indexed user, uint256 payout);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Users enter a round by sending ETH (native USDC on ARC is gas).
     * For USDC as ERC-20, we would use transferFrom. Assuming native USDC/Gas context here.
     */
    function enterRound(uint256 _roundId, uint8 _direction) external payable nonReentrant {
        require(msg.value > 0, "Amount must be > 0");
        require(_direction == 0 || _direction == 1, "Invalid direction");
        require(!rounds[_roundId].exists || rounds[_roundId].lockTimestamp == 0, "Round already locked");

        if (!rounds[_roundId].exists) {
            rounds[_roundId].id = _roundId;
            rounds[_roundId].exists = true;
        }

        if (entries[_roundId][msg.sender].amount == 0) {
            participants[_roundId].push(msg.sender);
        }

        entries[_roundId][msg.sender].user = msg.sender;
        entries[_roundId][msg.sender].amount += msg.value;
        entries[_roundId][msg.sender].direction = _direction;

        if (_direction == 1) {
            rounds[_roundId].totalLong += msg.value;
        } else {
            rounds[_roundId].totalShort += msg.value;
        }

        emit EntryPlaced(_roundId, msg.sender, msg.value, _direction);
    }

    /**
     * @dev Backend locks the round with current price.
     */
    function lockRound(uint256 _roundId, uint256 _price) external onlyOwner {
        require(rounds[_roundId].exists, "Round not found");
        require(rounds[_roundId].lockTimestamp == 0, "Already locked");

        rounds[_roundId].lockPrice = _price;
        rounds[_roundId].lockTimestamp = block.timestamp;

        emit RoundLocked(_roundId, _price, block.timestamp);
    }

    /**
     * @dev Backend settles the round with exit price.
     */
    function settleRound(uint256 _roundId, uint256 _price) external onlyOwner {
        Round storage round = rounds[_roundId];
        require(round.lockTimestamp > 0, "Not locked");
        require(!round.settled, "Already settled");

        round.settlePrice = _price;
        round.settleTimestamp = block.timestamp;
        round.settled = true;

        uint8 result = (_price > round.lockPrice) ? 1 : 0; // 0 = DOWN (Short), 1 = UP (Long)

        emit RoundSettled(_roundId, _price, block.timestamp, result);
        
        // Auto-payout can be implemented or users can claim
        _distributePayouts(_roundId, result);
    }

    function _distributePayouts(uint256 _roundId, uint8 _result) internal {
        Round storage round = rounds[_roundId];
        uint256 totalPool = round.totalLong + round.totalShort;
        if (totalPool == 0) return;

        uint256 fee = (totalPool * feeBps) / 10000;
        uint256 distributable = totalPool - fee;

        uint256 winningPool = (_result == 1) ? round.totalLong : round.totalShort;

        if (winningPool == 0) {
            // Refund everyone (minus fee or full refund?) 
            // In case of draw or no winners, refund stakes minus small fee for gas or full.
            for (uint256 i = 0; i < participants[_roundId].length; i++) {
                address user = participants[_roundId][i];
                Entry storage entry = entries[_roundId][user];
                if (entry.amount > 0 && !entry.claimed) {
                    entry.claimed = true;
                    payable(user).transfer(entry.amount);
                }
            }
            return;
        }

        // Payout winners
        for (uint256 i = 0; i < participants[_roundId].length; i++) {
            address user = participants[_roundId][i];
            Entry storage entry = entries[_roundId][user];
            if (entry.direction == _result && entry.amount > 0 && !entry.claimed) {
                // Payout = (UserStake / TotalWinningPool) * DistributablePool
                uint256 payout = (entry.amount * distributable) / winningPool;
                
                // CRITICAL FIX: Mark as claimed BEFORE the call to prevent reentrancy (though not possible with nonReentrant on parent)
                // Also use .call instead of .transfer to prevent one failed transfer from blocking the whole round.
                entry.claimed = true;
                (bool success, ) = payable(user).call{value: payout}("");
                if (success) {
                    emit PayoutClaimed(_roundId, user, payout);
                } else {
                    // If transfer fails (e.g., recipient is a contract that reverts), 
                    // we UNMARK it as claimed so they can still try to manual-claim via claimPayout later.
                    entry.claimed = false;
                }
            }
        }
    }

    /**
     * @dev Allows owner to retry payouts for specific users if the initial bulk payout failed.
     */
    function distributePayoutsBatch(uint256 _roundId, address[] calldata _users) external onlyOwner nonReentrant {
        Round storage round = rounds[_roundId];
        require(round.settled, "Round not settled");

        uint8 result = (round.settlePrice > round.lockPrice) ? 1 : 0;
        uint256 totalPool = round.totalLong + round.totalShort;
        uint256 fee = (totalPool * feeBps) / 10000;
        uint256 distributable = totalPool - fee;
        uint256 winningPool = (result == 1) ? round.totalLong : round.totalShort;

        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            Entry storage entry = entries[_roundId][user];
            if (entry.direction == result && entry.amount > 0 && !entry.claimed) {
                entry.claimed = true;
                uint256 payout = (entry.amount * distributable) / winningPool;
                (bool success, ) = payable(user).call{value: payout}("");
                if (success) {
                    emit PayoutClaimed(_roundId, user, payout);
                } else {
                    entry.claimed = false; // Reset for next retry
                }
            }
        }
    }

    /**
     * @dev Allows a user to manually claim their payout if automatic distribution fails.
     */
    function claimPayout(uint256 _roundId) external nonReentrant {
        Round storage round = rounds[_roundId];
        require(round.settled, "Round not settled");
        
        Entry storage entry = entries[_roundId][msg.sender];
        require(entry.amount > 0, "No stake in this round");
        require(!entry.claimed, "Already claimed");

        uint8 result = (round.settlePrice > round.lockPrice) ? 1 : 0;
        require(entry.direction == result, "Not a winner");

        uint256 totalPool = round.totalLong + round.totalShort;
        uint256 fee = (totalPool * feeBps) / 10000;
        uint256 distributable = totalPool - fee;
        uint256 winningPool = (result == 1) ? round.totalLong : round.totalShort;

        entry.claimed = true;
        uint256 payout = (entry.amount * distributable) / winningPool;
        
        payable(msg.sender).transfer(payout);
        emit PayoutClaimed(_roundId, msg.sender, payout);
    }

    function setFee(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "Fee too high");
        feeBps = _bps;
    }

    function withdrawFees() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
