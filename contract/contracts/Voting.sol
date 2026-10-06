// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    struct Candidate {
        string name;
        string role;
        string pledge;
        uint voteCount;
    }

    address public admin;
    mapping(address => bool) public admins;
    bool public electionActive;
    uint public endTime;
    uint public voterCount;
    bool public paused;

    Candidate[] public candidates;
    mapping(address => bool) public hasVoted;
    mapping(address => bool) public registeredVoters;

    event EmergencyStopped(address indexed by, uint timestamp);
    event Resumed(address indexed by, uint timestamp);

    enum ActionType { AddAdmin, RemoveAdmin, EmergencyStop, Resume, StartElection }

    struct Proposal {
        ActionType action;
        address target;
        uint durationMinutes;
        uint approvalCount;
        bool executed;
    }

    Proposal[] public proposals;
    mapping(uint => mapping(address => bool)) public hasApproved;
    uint public requiredApprovals = 2;

    // ============================================
    // [부트스트랩 예외 처리] 현재 관리자 수를 세는 변수.
    // 관리자가 아직 2명이 안 됐을 때는, 2번째 관리자를 넣는 것만큼은
    // "닭이 먼저냐 달걀이 먼저냐" 문제를 피하기 위해 혼자서도 가능하게 함.
    // 관리자가 2명 이상이 되면 그 이후부터는 정상적으로 멀티시그 규칙 적용.
    // ============================================
    uint public adminCount;

    event ProposalCreated(uint indexed proposalId, ActionType action, address indexed proposer);
    event ProposalApproved(uint indexed proposalId, address indexed approver, uint approvalCount);
    event ProposalExecuted(uint indexed proposalId, ActionType action);

    constructor() {
        admin = msg.sender;
        admins[msg.sender] = true;
        adminCount = 1;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender], "Only admin");
        _;
    }

    modifier notPaused() {
        require(!paused, "Election is paused");
        _;
    }

    function propose(ActionType action, address target, uint durationMinutes) public onlyAdmin returns (uint) {
        proposals.push(Proposal({
            action: action,
            target: target,
            durationMinutes: durationMinutes,
            approvalCount: 0,
            executed: false
        }));
        uint proposalId = proposals.length - 1;
        emit ProposalCreated(proposalId, action, msg.sender);

        // [부트스트랩 예외] 관리자가 아직 requiredApprovals(2명)보다 적을 때,
        // 2번째 관리자를 추가하는 제안이라면 승인을 기다릴 필요 없이 바로 실행.
        // (2명이 될 때까지는 애초에 2명 동의를 만들 방법이 없으므로)
        if (action == ActionType.AddAdmin && adminCount < requiredApprovals) {
            _execute(proposalId);
            return proposalId;
        }

        _approve(proposalId);
        return proposalId;
    }

    function approve(uint proposalId) public onlyAdmin {
        require(!proposals[proposalId].executed, "Already executed");
        require(!hasApproved[proposalId][msg.sender], "Already approved");
        _approve(proposalId);
    }

    function _approve(uint proposalId) internal {
        hasApproved[proposalId][msg.sender] = true;
        proposals[proposalId].approvalCount++;
        emit ProposalApproved(proposalId, msg.sender, proposals[proposalId].approvalCount);

        if (proposals[proposalId].approvalCount >= requiredApprovals) {
            _execute(proposalId);
        }
    }

    function _execute(uint proposalId) internal {
        Proposal storage p = proposals[proposalId];
        require(!p.executed, "Already executed");
        p.executed = true;

        if (p.action == ActionType.AddAdmin) {
            admins[p.target] = true;
            adminCount++;
        } else if (p.action == ActionType.RemoveAdmin) {
            require(p.target != admin, "Cannot remove original admin");
            admins[p.target] = false;
            adminCount--;
        } else if (p.action == ActionType.EmergencyStop) {
            require(electionActive, "Election not active");
            paused = true;
            electionActive = false;
            emit EmergencyStopped(msg.sender, block.timestamp);
        } else if (p.action == ActionType.Resume) {
            require(paused, "Not paused");
            paused = false;
            electionActive = true;
            emit Resumed(msg.sender, block.timestamp);
        } else if (p.action == ActionType.StartElection) {
            electionActive = true;
            endTime = block.timestamp + (p.durationMinutes * 1 minutes);
        }

        emit ProposalExecuted(proposalId, p.action);
    }

    function getProposalCount() public view returns (uint) {
        return proposals.length;
    }

    function registerVoter(address voter) public onlyAdmin {
        if (!registeredVoters[voter]) {
            registeredVoters[voter] = true;
            voterCount++;
        }
    }

    function addCandidate(string memory name, string memory role, string memory pledge) public onlyAdmin {
        candidates.push(Candidate(name, role, pledge, 0));
    }

    function vote(uint candidateIndex) public notPaused {
        require(electionActive, "Election not active");
        require(block.timestamp <= endTime, "Election ended");
        require(registeredVoters[msg.sender], "Not registered");
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateIndex < candidates.length, "Invalid candidate");
        hasVoted[msg.sender] = true;
        candidates[candidateIndex].voteCount++;
    }

    function getCandidateCount() public view returns (uint) {
        return candidates.length;
    }

    function getWinner() public view returns (string memory) {
        require(block.timestamp > endTime || paused, "Election still active");
        uint maxVotes = 0;
        uint winnerIndex = 0;
        for (uint i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > maxVotes) {
                maxVotes = candidates[i].voteCount;
                winnerIndex = i;
            }
        }
        return candidates[winnerIndex].name;
    }
}