// app.js - JavaScript for interacting with the ConsensusParadox smart contract

// Configuration
const CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE"; // Replace with actual deployed address
const CONTRACT_ABI = [
    // Core functions
    "function startCoordinationRound(uint256 _commitPhaseDuration, uint256 _revealPhaseDuration, uint256 _consensusThreshold) external",
    "function joinCoordinationRound(uint256 _roundId, bytes32 _commitmentHash) external payable",
    "function revealChoiceAndCoordinate(uint256 _roundId, uint256 _choice, uint256 _nonce) external",
    
    // View functions
    "function currentRoundId() external view returns (uint256)",
    "function totalRounds() external view returns (uint256)",
    "function minStake() external view returns (uint256)",
    "function coordinationReward() external view returns (uint256)",
    "function owner() external view returns (address)",
    "function getRoundInfo(uint256 _roundId) external view returns (uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256,bool,uint256)",
    "function getParticipantInfo(uint256 _roundId, address _participant) external view returns (bool,bool,uint256,uint256)",
    "function getParticipantReward(address _participant) external view returns (uint256)",
    "function participantHistory(address) external view returns (uint256)",
    
    // Other functions
    "function claimRewards() external",
    "function updateMinStake(uint256 _newMinStake) external",
    "function updateCoordinationReward(uint256 _newReward) external",
    
    // Events
    "event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 threshold)",
    "event ParticipantJoined(uint256 indexed roundId, address indexed participant, uint256 stake)",
    "event CommitmentMade(uint256 indexed roundId, address indexed participant, bytes32 commitment)",
    "event ChoiceRevealed(uint256 indexed roundId, address indexed participant, uint256 choice)",
    "event RoundFinalized(uint256 indexed roundId, uint256 result, uint256 totalReward)",
    "event RewardClaimed(address indexed participant, uint256 amount)"
];

// Global variables
let provider;
let signer;
let contract;
let userAddress;
let isOwner = false;
let currentUserChoice;
let currentUserNonce;
let currentRoundTimer;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing The Consensus Paradox dApp...');
    setupEventListeners();
    await checkWalletConnection();
});

// Setup event listeners
function setupEventListeners() {
    // Wallet connection
    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    
    // Admin functions
    document.getElementById('startRound').addEventListener('click', startCoordinationRound);
    
    // User functions
    document.getElementById('refreshStatus').addEventListener('click', refreshContractStatus);
    document.getElementById('generateNonce').addEventListener('click', generateRandomNonce);
    document.getElementById('commitChoice').addEventListener('click', commitChoice);
    document.getElementById('revealChoice').addEventListener('click', revealChoice);
    document.getElementById('claimRewards').addEventListener('click', claimRewards);
}

// Check if wallet is already connected
async function checkWalletConnection() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await connectWallet();
            }
        } catch (error) {
            console.error('Error checking wallet connection:', error);
        }
    }
}

// Connect wallet
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask to use this dApp!');
        return;
    }

    try {
        showLoading('Connecting wallet...');
        
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // Initialize contract
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Update UI
        document.getElementById('connectWallet').style.display = 'none';
        document.getElementById('walletAddress').textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        document.getElementById('walletAddress').classList.remove('hidden');
        
        // Get network info
        const network = await provider.getNetwork();
        document.getElementById('networkInfo').textContent = `${network.name} (${network.chainId})`;
        document.getElementById('networkInfo').classList.remove('hidden');
        
        // Check if user is owner
        const owner = await contract.owner();
        isOwner = owner.toLowerCase() === userAddress.toLowerCase();
        
        if (isOwner) {
            document.getElementById('adminPanel').classList.remove('hidden');
        }
        
        // Load contract status
        await refreshContractStatus();
        
        // Setup event listeners for contract events
        setupContractEventListeners();
        
        hideLoading();
        console.log('Wallet connected successfully');
        
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet: ' + error.message);
        hideLoading();
    }
}

// Setup contract event listeners
function setupContractEventListeners() {
    // Listen for new rounds
    contract.on('RoundStarted', (roundId, startTime, threshold) => {
        console.log(`New round started: ${roundId}`);
        refreshContractStatus();
        showNotification('New coordination round started!', 'success');
    });
    
    // Listen for participants joining
    contract.on('ParticipantJoined', (roundId, participant, stake) => {
        if (participant.toLowerCase() === userAddress.toLowerCase()) {
            showNotification('Successfully joined the round!', 'success');
        }
        refreshContractStatus();
    });
    
    // Listen for round finalization
    contract.on('RoundFinalized', (roundId, result, totalReward) => {
        console.log(`Round ${roundId} finalized with ${result}% coordination`);
        refreshContractStatus();
        showNotification(`Round completed! Coordination: ${result}%`, 'info');
    });
    
    // Listen for rewards claimed
    contract.on('RewardClaimed', (participant, amount) => {
        if (participant.toLowerCase() === userAddress.toLowerCase()) {
            showNotification(`Claimed ${ethers.utils.formatEther(amount)} ETH rewards!`, 'success');
            refreshContractStatus();
        }
    });
}

// Refresh contract status
async function refreshContractStatus() {
    if (!contract) return;
    
    try {
        // Get basic contract info
        const currentRound = await contract.currentRoundId();
        const totalRounds = await contract.totalRounds();
        const minStake = await contract.minStake();
        const userRewards = await contract.getParticipantReward(userAddress);
        const userHistory = await contract.participantHistory(userAddress);
        
        // Update status display
        document.getElementById('currentRound').textContent = currentRound.toString();
        document.getElementById('totalRounds').textContent = totalRounds.toString();
        document.getElementById('minStake').textContent = `${ethers.utils.formatEther(minStake)} ETH`;
        document.getElementById('userRewards').textContent = `${ethers.utils.formatEther(userRewards)} ETH`;
        document.getElementById('userHistory').textContent = userHistory.toString();
        document.getElementById('pendingRewards').textContent = `${ethers.utils.formatEther(userRewards)} ETH`;
        
        // Enable/disable claim button
        document.getElementById('claimRewards').disabled = userRewards.eq(0);
        
        // Get current round info if exists
        if (currentRound.gt(0)) {
            await updateRoundInfo(currentRound);
        } else {
            resetRoundInfo();
        }
        
    } catch (error) {
        console.error('Error refreshing contract status:', error);
    }
}

// Update round information
async function updateRoundInfo(roundId) {
    try {
        const roundInfo = await contract.getRoundInfo(roundId);
        const [roundIdValue, startTime, commitPhaseEnd, revealPhaseEnd, totalStake, participantCount, isActive, consensusThreshold, roundFinalized, coordinationResult] = roundInfo;
        
        // Update round display
        document.getElementById('roundId').textContent = roundIdValue.toString();
        document.getElementById('participantCount').textContent = participantCount.toString();
        document.getElementById('totalStake').textContent = `${ethers.utils.formatEther(totalStake)} ETH`;
        document.getElementById('thresholdDisplay').textContent = `${consensusThreshold}%`;
        
        // Determine current phase
        const now = Math.floor(Date.now() / 1000);
        const commitEnd = commitPhaseEnd.toNumber();
        const revealEnd = revealPhaseEnd.toNumber();
        
        if (roundFinalized) {
            updatePhaseUI('finalized', coordinationResult.toNumber());
            document.getElementById('roundStatus').textContent = 'Finalized';
            document.getElementById('roundStatus').className = 'value status-badge status-finalized';
            stopTimer();
        } else if (isActive) {
            document.getElementById('roundStatus').textContent = 'Active';
            document.getElementById('roundStatus').className = 'value status-badge status-active';
            
            if (now <= commitEnd) {
                updatePhaseUI('commit', null, commitEnd);
                startTimer(commitEnd, 'Commit Phase Ends');
            } else if (now <= revealEnd) {
                updatePhaseUI('reveal', null, revealEnd);
                startTimer(revealEnd, 'Reveal Phase Ends');
            } else {
                updatePhaseUI('ended');
                stopTimer();
            }
        } else {
            document.getElementById('roundStatus').textContent = 'Inactive';
            document.getElementById('roundStatus').className = 'value status-badge status-inactive';
            resetRoundInfo();
        }
        
        // Get user participation info
        const participantInfo = await contract.getParticipantInfo(roundId, userAddress);
        const [hasCommitted, hasRevealed, revealedChoice, stake] = participantInfo;
        
        updateParticipationUI(hasCommitted, hasRevealed, stake, isActive, now <= commitEnd, now <= revealEnd && now > commitEnd);
        
    } catch (error) {
        console.error('Error updating round info:', error);
        resetRoundInfo();
    }
}

// Update phase UI
function updatePhaseUI(phase, result = null, endTime = null) {
    const phaseElement = document.getElementById('currentPhase');
    const timerElement = document.getElementById('phaseTimer');
    const resultElement = document.getElementById('roundResult');
    
    switch (phase) {
        case 'commit':
            phaseElement.textContent = 'Commit Phase';
            phaseElement.className = 'value phase-badge phase-commit';
            timerElement.classList.remove('hidden');
            resultElement.classList.add('hidden');
            break;
        case 'reveal':
            phaseElement.textContent = 'Reveal Phase';
            phaseElement.className = 'value phase-badge phase-reveal';
            timerElement.classList.remove('hidden');
            resultElement.classList.add('hidden');
            break;
        case 'ended':
            phaseElement.textContent = 'Phase Ended';
            phaseElement.className = 'value phase-badge phase-ended';
            timerElement.classList.add('hidden');
            resultElement.classList.add('hidden');
            break;
        case 'finalized':
            phaseElement.textContent = 'Finalized';
            phaseElement.className = 'value phase-badge phase-ended';
            timerElement.classList.add('hidden');
            resultElement.classList.remove('hidden');
            
            const resultText = result >= 67 ? 'Successful Coordination!' : 
                              result >= 51 ? 'Partial Coordination' : 'Coordination Failed';
            document.getElementById('resultText').textContent = `${resultText} (${result}% agreement)`;
            break;
    }
}

// Update participation UI based on user status
function updateParticipationUI(hasCommitted, hasRevealed, stake, roundActive, inCommitPhase, inRevealPhase) {
    const commitSection = document.getElementById('commitSection');
    const revealSection = document.getElementById('revealSection');
    const waitingSection = document.getElementById('waitingSection');
    
    // Hide all sections first
    commitSection.classList.add('hidden');
    revealSection.classList.add('hidden');
    waitingSection.classList.add('hidden');
    
    if (!roundActive) {
        // No active round
        waitingSection.classList.remove('hidden');
        document.getElementById('statusTitle').textContent = '⏳ Waiting for Active Round';
        document.getElementById('statusMessage').textContent = 'No active coordination round. Wait for an admin to start a new round.';
    } else if (inCommitPhase && !hasCommitted) {
        // Show commit section
        commitSection.classList.remove('hidden');
        // Set minimum stake
        document.getElementById('stakeAmount').placeholder = document.getElementById('minStake').textContent;
    } else if (hasCommitted && !hasRevealed) {
        if (inRevealPhase) {
            // Show reveal section
            revealSection.classList.remove('hidden');
            document.getElementById('userStake').textContent = `${ethers.utils.formatEther(stake)} ETH`;
        } else {
            // Waiting for reveal phase
            waitingSection.classList.remove('hidden');
            document.getElementById('statusTitle').textContent = '⏳ Waiting for Reveal Phase';
            document.getElementById('statusMessage').textContent = 'You have committed your choice. Wait for the reveal phase to begin.';
        }
    } else if (hasRevealed) {
        // Already participated
        waitingSection.classList.remove('hidden');
        document.getElementById('statusTitle').textContent = '✅ Participation Complete';
        document.getElementById('statusMessage').textContent = 'You have revealed your choice. Wait for the round to finalize.';
    } else {
        // Phase ended, too late to join
        waitingSection.classList.remove('hidden');
        document.getElementById('statusTitle').textContent = '⏰ Phase Ended';
        document.getElementById('statusMessage').textContent = 'The current phase has ended. You cannot participate in this round.';
    }
}

// Timer functions
function startTimer(endTime, label) {
    document.getElementById('timerLabel').textContent = label;
    
    // Clear existing timer
    if (currentRoundTimer) {
        clearInterval(currentRoundTimer);
    }
    
    currentRoundTimer = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = endTime - now;
        
        if (timeLeft <= 0) {
            document.getElementById('countdown').textContent = '00:00:00';
            clearInterval(currentRoundTimer);
            setTimeout(refreshContractStatus, 1000); // Refresh after phase ends
        } else {
            const hours = Math.floor(timeLeft / 3600);
            const minutes = Math.floor((timeLeft % 3600) / 60);
            const seconds = timeLeft % 60;
            
            document.getElementById('countdown').textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function stopTimer() {
    if (currentRoundTimer) {
        clearInterval(currentRoundTimer);
        currentRoundTimer = null;
    }
    document.getElementById('phaseTimer').classList.add('hidden');
}

// Reset round info display
function resetRoundInfo() {
    document.getElementById('roundId').textContent = '-';
    document.getElementById('roundStatus').textContent = 'No Active Round';
    document.getElementById('roundStatus').className = 'value status-badge';
    document.getElementById('currentPhase').textContent = '-';
    document.getElementById('currentPhase').className = 'value phase-badge';
    document.getElementById('participantCount').textContent = '0';
    document.getElementById('totalStake').textContent = '0 ETH';
    document.getElementById('thresholdDisplay').textContent = '-';
    
    stopTimer();
    
    // Show waiting section
    document.getElementById('commitSection').classList.add('hidden');
    document.getElementById('revealSection').classList.add('hidden');
    document.getElementById('waitingSection').classList.remove('hidden');
    document.getElementById('roundResult').classList.add('hidden');
}

// Admin function: Start coordination round
async function startCoordinationRound() {
    if (!isOwner) {
        alert('Only the contract owner can start rounds');
        return;
    }
    
    try {
        const commitDuration = parseInt(document.getElementById('commitDuration').value) * 60; // Convert to seconds
        const revealDuration = parseInt(document.getElementById('revealDuration').value) * 60;
        const consensusThreshold = parseInt(document.getElementById('consensusThreshold').value);
        
        if (commitDuration <= 0 || revealDuration <= 0) {
            alert('Please enter valid durations');
            return;
        }
        
        if (consensusThreshold < 51 || consensusThreshold > 100) {
            alert('Consensus threshold must be between 51-100%');
            return;
        }
        
        showLoading('Starting new coordination round...');
        
        const tx = await contract.startCoordinationRound(commitDuration, revealDuration, consensusThreshold);
        await tx.wait();
        
        hideLoading();
        showNotification('New coordination round started successfully!', 'success');
        
    } catch (error) {
        console.error('Error starting round:', error);
        hideLoading();
        alert('Failed to start round: ' + error.message);
    }
}

// Generate random nonce
function generateRandomNonce() {
    const randomNonce = Math.floor(Math.random() * 1000000000);
    document.getElementById('nonce').value = randomNonce;
}

// Commit choice
async function commitChoice() {
    try {
        const choice = document.querySelector('input[name="choice"]:checked')?.value;
        const stakeAmount = document.getElementById('stakeAmount').value;
        const nonce = document.getElementById('nonce').value;
        
        if (!choice) {
            alert('Please select a choice (0 or 1)');
            return;
        }
        
        if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
            alert('Please enter a valid stake amount');
            return;
        }
        
        if (!nonce) {
            alert('Please enter a nonce for your commitment');
            return;
        }
        
        // Store choice and nonce for reveal phase
        currentUserChoice = parseInt(choice);
        currentUserNonce = parseInt(nonce);
        
        // Create commitment hash
        const commitmentHash = ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [currentUserChoice, currentUserNonce])
        );
        
        showLoading('Committing your choice...');
        
        const currentRound = await contract.currentRoundId();
        const stakeWei = ethers.utils.parseEther(stakeAmount);
        
        const tx = await contract.joinCoordinationRound(currentRound, commitmentHash, {
            value: stakeWei
        });
        
        await tx.wait();
        
        hideLoading();
        showNotification('Choice committed successfully!', 'success');
        
        // Store commitment for reveal section
        document.getElementById('userCommitment').textContent = commitmentHash;
        
        // Clear form
        document.querySelectorAll('input[name="choice"]').forEach(radio => radio.checked = false);
        document.getElementById('stakeAmount').value = '';
        document.getElementById('nonce').value = '';
        
    } catch (error) {
        console.error('Error committing choice:', error);
        hideLoading();
        alert('Failed to commit choice: ' + error.message);
    }
}

// Reveal choice
async function revealChoice() {
    try {
        const revealChoiceValue = document.getElementById('revealChoice').value;
        const revealNonceValue = document.getElementById('revealNonce').value;
        
        if (!revealChoiceValue || !revealNonceValue) {
            alert('Please enter both your original choice and nonce');
            return;
        }
        
        const choice = parseInt(revealChoiceValue);
        const nonce = parseInt(revealNonceValue);
        
        showLoading('Revealing your choice...');
        
        const currentRound = await contract.currentRoundId();
        const tx = await contract.revealChoiceAndCoordinate(currentRound, choice, nonce);
        
        await tx.wait();
        
        hideLoading();
        showNotification('Choice revealed successfully!', 'success');
        
        // Clear reveal form
        document.getElementById('revealChoice').value = '';
        document.getElementById('revealNonce').value = '';
        
    } catch (error) {
        console.error('Error revealing choice:', error);
        hideLoading();
        alert('Failed to reveal choice: ' + error.message);
    }
}

// Claim rewards
async function claimRewards() {
    try {
        showLoading('Claiming rewards...');
        
        const tx = await contract.claimRewards();
        await tx.wait();
        
        hideLoading();
        showNotification('Rewards claimed successfully!', 'success');
        
    } catch (error) {
        console.error('Error claiming rewards:', error);
        hideLoading();
        alert('Failed to claim rewards: ' + error.message);
    }
}

// Utility functions
function showLoading(message = 'Processing...') {
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Handle account changes
if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // User disconnected wallet
            location.reload();
        } else {
            // User switched accounts
            location.reload();
        }
    });
    
    window.ethereum.on('chainChanged', (chainId) => {
        // User switched networks
        location.reload();
    });
}

// Add notification styles
const notificationStyles = `
<style>
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    z-index: 1000;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    min-width: 300px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

.notification-success {
    background: linear-gradient(135deg, #2ecc71, #27ae60);
}

.notification-error {
    background: linear-gradient(135deg, #e74c3c, #c0392b);
}

.notification-info {
    background: linear-gradient(135deg, #3498db, #2980b9);
}

.notification button {
    background: none;
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', notificationStyles);

