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

    // ============================================
    // [7주차 보완 - 타임스탬프 문제] 결과 확정 상태
    // 컨트랙트가 보는 '지금 시각'은 마지막 블록의 시각이라, 거래가 없는 동안
    // 화면(현실 시계)과 어긋난다. 그래서 종료 후 당선자를 '조회할 때마다 계산'하지 않고,
    // finalize() 거래로 한 번 계산해 체인에 저장(확정)한다.
    // 거래는 자기 블록의 시각으로 검증되므로 시계 불일치가 생기지 않는다.
    // ============================================
    bool public finalized;
    string public finalizedWinner;

    Candidate[] public candidates;
    mapping(address => bool) public hasVoted;
    mapping(address => bool) public registeredVoters;

    event EmergencyStopped(address indexed by, uint timestamp);
    event Resumed(address indexed by, uint timestamp);
    event ResultFinalized(address indexed by, string winner, uint timestamp);

    // ============================================
    // [8주차 보완 - 이벤트 로깅 확대, 진단 No.5]
    // 7주차까지는 제안·승인·실행·정지·재개·확정만 기록되고, 유권자 등록·후보 추가·투표에는
    // 전용 이벤트가 없었다. 관리자 변경·선거 시작은 제안 로그에 더해 실제 반영값도 기록한다.
    // 아래 이벤트로 현재 제공하는 관리 함수와 투표 사실을 체인 로그에서 추적한다.
    // ※ Voted에는 후보 번호를 일부러 넣지 않는다 (투표 선택이 로그로 한 번에 조회되는 것을 방지).
    // 거래 입력과 공개 상태로 선택을 추론할 수 있으므로 익명성을 보장하는 조치는 아니다.
    // ============================================
    event VoterRegistered(address indexed by, address indexed voter, uint timestamp);
    event CandidateAdded(address indexed by, uint indexed candidateIndex, string name);
    event Voted(address indexed voter, uint timestamp);
    event AdminAdded(address indexed admin, uint indexed proposalId);
    event AdminRemoved(address indexed admin, uint indexed proposalId);
    event ElectionStarted(uint endTime, uint indexed proposalId);

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

    // ============================================
    // [7주차 보완 - V-A, V-B] 선거 시작 후 등록 차단
    // 6주차 테스트에서, 선거 진행 중에도 관리자 1명이 단독으로
    // 유권자를 추가 등록해 투표하거나 후보를 추가할 수 있음을 확인했다.
    // endTime은 선거가 시작될 때만 0이 아닌 값으로 바뀌므로,
    // endTime != 0 이면 "선거가 한 번이라도 시작됨"으로 보고 영구 차단한다.
    // (정지 상태, 종료 후에도 차단 — 이 컨트랙트는 선거 1회용으로 운영)
    // ============================================
    modifier beforeElection() {
        require(endTime == 0, "Election already started");
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
            emit AdminAdded(p.target, proposalId);
        } else if (p.action == ActionType.RemoveAdmin) {
            require(p.target != admin, "Cannot remove original admin");
            admins[p.target] = false;
            adminCount--;
            emit AdminRemoved(p.target, proposalId);
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
            require(!finalized, "Election already finalized");
            electionActive = true;
            endTime = block.timestamp + (p.durationMinutes * 1 minutes);
            emit ElectionStarted(endTime, proposalId);
        }

        emit ProposalExecuted(proposalId, p.action);
    }

    function getProposalCount() public view returns (uint) {
        return proposals.length;
    }

    function registerVoter(address voter) public onlyAdmin beforeElection {
        if (!registeredVoters[voter]) {
            registeredVoters[voter] = true;
            voterCount++;
            emit VoterRegistered(msg.sender, voter, block.timestamp);
        }
    }

    function addCandidate(string memory name, string memory role, string memory pledge) public onlyAdmin beforeElection {
        candidates.push(Candidate(name, role, pledge, 0));
        emit CandidateAdded(msg.sender, candidates.length - 1, name);
    }

    function vote(uint candidateIndex) public notPaused {
        require(electionActive, "Election not active");
        require(block.timestamp <= endTime, "Election ended");
        require(registeredVoters[msg.sender], "Not registered");
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateIndex < candidates.length, "Invalid candidate");
        hasVoted[msg.sender] = true;
        candidates[candidateIndex].voteCount++;
        emit Voted(msg.sender, block.timestamp);
    }

    function getCandidateCount() public view returns (uint) {
        return candidates.length;
    }

    // ============================================
    // [7주차 보완 - 타임스탬프 문제] 결과 확정
    // 선거가 자연 종료된 뒤 누구나 호출할 수 있고, 한 번만 실행된다.
    // - notPaused: 비상 정지 중에는 확정 불가 (정지 해제 후 확정)
    // - endTime != 0: 선거가 시작된 적 있어야 함
    // - block.timestamp > endTime: 이 거래가 담긴 블록 기준으로 종료 여부 판단
    // - candidates.length > 0: 후보가 없으면 의미 있는 메시지로 거부 (V-F 방어)
    // ============================================
    function finalize() public notPaused {
        require(!finalized, "Already finalized");
        require(endTime != 0, "Election not started");
        require(block.timestamp > endTime, "Election still active");
        require(candidates.length > 0, "No candidates");
        finalizedWinner = _computeWinner();
        finalized = true;
        emit ResultFinalized(msg.sender, finalizedWinner, block.timestamp);
    }

    // 당선자 조회
    // - 확정된 뒤: 저장된 값을 그대로 반환 (시간·블록과 무관)
    // - 확정 전: 비상 정지 상태일 때만 현재까지의 집계를 반환 (화면은 이를 공개하지 않음),
    //            그 외에는 거부
    function getWinner() public view returns (string memory) {
        if (finalized) return finalizedWinner;
        require(paused, "Result not finalized");
        require(candidates.length > 0, "No candidates");
        return _computeWinner();
    }

    function _computeWinner() internal view returns (string memory) {
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
