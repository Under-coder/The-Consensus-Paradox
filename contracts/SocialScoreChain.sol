// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ConsensusParadox
 * @dev A smart contract that solves coordination problems through cryptographic proof
 * This contract implements a coordination game where participants must coordinate
 * to achieve optimal outcomes, solving the classic coordination paradox
 */
contract Project {

    // Structs
    struct Participant {
        address participantAddress;
        bool hasCommitted;
        bytes32 commitmentHash;
        uint256 revealedChoice;
        bool hasRevealed;
        uint256 stake;
        bool isActive;
    }

    struct CoordinationRound {
        uint256 roundId;
        uint256 startTime;
        uint256 commitPhaseEnd;
        uint256 revealPhaseEnd;
        uint256 totalStake;
        uint256 participantCount;
        bool isActive;
        uint256 consensusThreshold;
        mapping(address => Participant) participants;
        address[] participantList;
        uint256 coordinationResult;
        bool roundFinalized;
    }

    // State variables
    address public owner;
    uint256 public currentRoundId;
    uint256 public minStake;
    uint256 public coordinationReward;
    uint256 public totalRounds;

    mapping(uint256 => CoordinationRound) public rounds;
    mapping(address => uint256) public participantRewards;
    mapping(address => uint256) public participantHistory;

    // Events
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 threshold);
    event ParticipantJoined(uint256 indexed roundId, address indexed participant, uint256 stake);
    event CommitmentMade(uint256 indexed roundId, address indexed participant, bytes32 commitment);
    event ChoiceRevealed(uint256 indexed roundId, address indexed participant, uint256 choice);
    event RoundFinalized(uint256 indexed roundId, uint256 result, uint256 totalReward);
    event RewardClaimed(address indexed participant, uint256 amount);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier roundExists(uint256 _roundId) {
        require(_roundId <= currentRoundId && rounds[_roundId].isActive, "Round does not exist or inactive");
        _;
    }

    modifier inCommitPhase(uint256 _roundId) {
        require(block.timestamp <= rounds[_roundId].commitPhaseEnd, "Commit phase has ended");
        _;
    }

    modifier inRevealPhase(uint256 _roundId) {
        require(block.timestamp > rounds[_roundId].commitPhaseEnd && 
                block.timestamp <= rounds[_roundId].revealPhaseEnd, "Not in reveal phase");
        _;
    }

    constructor() {
        owner = msg.sender;
        minStake = 0.01 ether;
        coordinationReward = 1 ether;
        currentRoundId = 0;
        totalRounds = 0;
    }

    /**
     * @dev Core Function 1: Start a new coordination round
     * @param _commitPhaseDuration Duration of commit phase in seconds
     * @param _revealPhaseDuration Duration of reveal phase in seconds
     * @param _consensusThreshold Minimum percentage needed for coordination (0-100)
     */
    function startCoordinationRound(
        uint256 _commitPhaseDuration,
        uint256 _revealPhaseDuration,
        uint256 _consensusThreshold
    ) external onlyOwner {
        require(_consensusThreshold > 50 && _consensusThreshold <= 100, "Invalid threshold");
        require(_commitPhaseDuration > 0 && _revealPhaseDuration > 0, "Invalid durations");

        currentRoundId++;
        totalRounds++;

        CoordinationRound storage newRound = rounds[currentRoundId];
        newRound.roundId = currentRoundId;
        newRound.startTime = block.timestamp;
        newRound.commitPhaseEnd = block.timestamp + _commitPhaseDuration;
        newRound.revealPhaseEnd = newRound.commitPhaseEnd + _revealPhaseDuration;
        newRound.isActive = true;
        newRound.consensusThreshold = _consensusThreshold;
        newRound.totalStake = 0;
        newRound.participantCount = 0;
        newRound.roundFinalized = false;

        emit RoundStarted(currentRoundId, block.timestamp, _consensusThreshold);
    }

    /**
     * @dev Core Function 2: Join coordination round with cryptographic commitment
     * @param _roundId The round to join
     * @param _commitmentHash Cryptographic hash of choice + nonce (keccak256(choice, nonce))
     */
    function joinCoordinationRound(
        uint256 _roundId,
        bytes32 _commitmentHash
    ) external payable roundExists(_roundId) inCommitPhase(_roundId) {
        require(msg.value >= minStake, "Insufficient stake");
        require(_commitmentHash != bytes32(0), "Invalid commitment hash");
        require(!rounds[_roundId].participants[msg.sender].hasCommitted, "Already committed");

        CoordinationRound storage round = rounds[_roundId];

        // Add participant
        Participant storage participant = round.participants[msg.sender];
        participant.participantAddress = msg.sender;
        participant.hasCommitted = true;
        participant.commitmentHash = _commitmentHash;
        participant.stake = msg.value;
        participant.isActive = true;
        participant.hasRevealed = false;

        round.participantList.push(msg.sender);
        round.totalStake += msg.value;
        round.participantCount++;

        emit ParticipantJoined(_roundId, msg.sender, msg.value);
        emit CommitmentMade(_roundId, msg.sender, _commitmentHash);
    }

    /**
     * @dev Core Function 3: Reveal choice and finalize coordination outcome
     * @param _roundId The round to reveal choice for
     * @param _choice The original choice (0 or 1 for binary coordination)
     * @param _nonce The nonce used in commitment
     */
    function revealChoiceAndCoordinate(
        uint256 _roundId,
        uint256 _choice,
        uint256 _nonce
    ) external roundExists(_roundId) inRevealPhase(_roundId) {
        require(_choice == 0 || _choice == 1, "Choice must be 0 or 1");

        CoordinationRound storage round = rounds[_roundId];
        Participant storage participant = round.participants[msg.sender];

        require(participant.hasCommitted, "Must commit first");
        require(!participant.hasRevealed, "Already revealed");

        // Verify cryptographic proof
        bytes32 computedHash = keccak256(abi.encodePacked(_choice, _nonce));
        require(computedHash == participant.commitmentHash, "Invalid proof - commitment mismatch");

        participant.revealedChoice = _choice;
        participant.hasRevealed = true;

        emit ChoiceRevealed(_roundId, msg.sender, _choice);

        // Check if all participants have revealed
        _checkAndFinalizeRound(_roundId);
    }

    /**
     * @dev Internal function to finalize round when all participants reveal
     */
    function _checkAndFinalizeRound(uint256 _roundId) internal {
        CoordinationRound storage round = rounds[_roundId];

        // Count revealed participants
        uint256 revealedCount = 0;
        uint256 choiceOneCount = 0;

        for (uint256 i = 0; i < round.participantList.length; i++) {
            address participantAddr = round.participantList[i];
            if (round.participants[participantAddr].hasRevealed) {
                revealedCount++;
                if (round.participants[participantAddr].revealedChoice == 1) {
                    choiceOneCount++;
                }
            }
        }

        // Only finalize if all participants have revealed or reveal phase ended
        if (revealedCount == round.participantCount || block.timestamp > round.revealPhaseEnd) {
            _finalizeCoordinationResult(_roundId, revealedCount, choiceOneCount);
        }
    }

    /**
     * @dev Internal function to calculate coordination results and distribute rewards
     */
    function _finalizeCoordinationResult(
        uint256 _roundId,
        uint256 _revealedCount,
        uint256 _choiceOneCount
    ) internal {
        CoordinationRound storage round = rounds[_roundId];
        require(!round.roundFinalized, "Round already finalized");

        uint256 choiceZeroCount = _revealedCount - _choiceOneCount;
        uint256 coordinationPercentage = 0;
        uint256 majorityChoice = 0;

        // Determine coordination success
        if (_choiceOneCount > choiceZeroCount) {
            majorityChoice = 1;
            coordinationPercentage = (_choiceOneCount * 100) / _revealedCount;
        } else if (choiceZeroCount > _choiceOneCount) {
            majorityChoice = 0;
            coordinationPercentage = (choiceZeroCount * 100) / _revealedCount;
        } else {
            // Tie case - no coordination achieved
            coordinationPercentage = 50;
        }

        round.coordinationResult = coordinationPercentage;
        round.roundFinalized = true;
        round.isActive = false;

        // Distribute rewards if coordination threshold met
        uint256 totalReward = 0;
        if (coordinationPercentage >= round.consensusThreshold) {
            totalReward = round.totalStake + coordinationReward;
            uint256 successfulParticipants = (majorityChoice == 1) ? _choiceOneCount : choiceZeroCount;
            uint256 rewardPerParticipant = totalReward / successfulParticipants;

            // Distribute rewards to coordinated participants
            for (uint256 i = 0; i < round.participantList.length; i++) {
                address participantAddr = round.participantList[i];
                Participant storage participant = round.participants[participantAddr];

                if (participant.hasRevealed && participant.revealedChoice == majorityChoice) {
                    participantRewards[participantAddr] += rewardPerParticipant;
                    participantHistory[participantAddr]++;
                }
            }
        } else {
            // Return stakes if coordination failed
            for (uint256 i = 0; i < round.participantList.length; i++) {
                address participantAddr = round.participantList[i];
                Participant storage participant = round.participants[participantAddr];

                if (participant.hasRevealed) {
                    participantRewards[participantAddr] += participant.stake;
                }
            }
        }

        emit RoundFinalized(_roundId, coordinationPercentage, totalReward);
    }

    /**
     * @dev Allow participants to claim their rewards
     */
    function claimRewards() external {
        uint256 reward = participantRewards[msg.sender];
        require(reward > 0, "No rewards to claim");

        participantRewards[msg.sender] = 0;
        payable(msg.sender).transfer(reward);

        emit RewardClaimed(msg.sender, reward);
    }

    // View functions
    function getRoundInfo(uint256 _roundId) external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 commitPhaseEnd,
        uint256 revealPhaseEnd,
        uint256 totalStake,
        uint256 participantCount,
        bool isActive,
        uint256 consensusThreshold,
        bool roundFinalized,
        uint256 coordinationResult
    ) {
        CoordinationRound storage round = rounds[_roundId];
        return (
            round.roundId,
            round.startTime,
            round.commitPhaseEnd,
            round.revealPhaseEnd,
            round.totalStake,
            round.participantCount,
            round.isActive,
            round.consensusThreshold,
            round.roundFinalized,
            round.coordinationResult
        );
    }

    function getParticipantInfo(uint256 _roundId, address _participant) external view returns (
        bool hasCommitted,
        bool hasRevealed,
        uint256 revealedChoice,
        uint256 stake
    ) {
        Participant storage participant = rounds[_roundId].participants[_participant];
        return (
            participant.hasCommitted,
            participant.hasRevealed,
            participant.revealedChoice,
            participant.stake
        );
    }

    function getParticipantReward(address _participant) external view returns (uint256) {
        return participantRewards[_participant];
    }

    // Owner functions
    function updateMinStake(uint256 _newMinStake) external onlyOwner {
        minStake = _newMinStake;
    }

    function updateCoordinationReward(uint256 _newReward) external onlyOwner {
        coordinationReward = _newReward;
    }

    function withdrawContractBalance() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
