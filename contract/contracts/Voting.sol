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
    mapping(address => bool) public admins;  // 멀티 어드민
    bool public electionActive;
    uint public endTime;
    uint public voterCount;

    Candidate[] public candidates;
    mapping(address => bool) public hasVoted;
    mapping(address => bool) public registeredVoters;

    constructor() {
        admin = msg.sender;
        admins[msg.sender] = true;  // 배포자 자동 등록
    }

    modifier onlyAdmin() {
        require(admins[msg.sender], "Only admin");
        _;
    }

    // 어드민 추가 (기존 어드민만 가능)
    function addAdmin(address newAdmin) public onlyAdmin {
        admins[newAdmin] = true;
    }

    // 어드민 제거 (기존 어드민만 가능)
    function removeAdmin(address target) public onlyAdmin {
        require(target != admin, "Cannot remove original admin");
        admins[target] = false;
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

    function startElection(uint durationMinutes) public onlyAdmin {
        electionActive = true;
        endTime = block.timestamp + (durationMinutes * 1 minutes);
    }

    function vote(uint candidateIndex) public {
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
        require(block.timestamp > endTime, "Election still active");
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