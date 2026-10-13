const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ActionType 열거형 값 (Voting.sol의 enum 순서와 동일해야 함)
const AddAdmin = 0, RemoveAdmin = 1, EmergencyStop = 2, Resume = 3, StartElection = 4;
const ZERO = ethers.ZeroAddress;

describe("Voting - 멀티시그 / 비상정지 / 투표 무결성", function () {
  let voting, owner, admin2, admin3, voter1, voter2, outsider;

  beforeEach(async function () {
    [owner, admin2, admin3, voter1, voter2, outsider] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy();
    await voting.waitForDeployment();
  });

  // 2번째 관리자까지 세팅 (부트스트랩 예외 경로)
  async function setupTwoAdmins() {
    await voting.connect(owner).propose(AddAdmin, admin2.address, 0);
  }

  // 후보 2명 + 유권자 2명 + 선거 시작(관리자 2명 승인)까지 세팅
  async function startRunningElection(minutes = 60) {
    await setupTwoAdmins();
    await voting.addCandidate("A", "회장", "공약A");
    await voting.addCandidate("B", "회장", "공약B");
    await voting.registerVoter(voter1.address);
    await voting.registerVoter(voter2.address);
    const id = await voting.getProposalCount(); // 이번에 만들 제안의 번호
    await voting.connect(owner).propose(StartElection, ZERO, minutes);
    await voting.connect(admin2).approve(id);
  }

  describe("1. 접근 제어 (OWASP SC01)", function () {
    it("관리자가 아닌 계정은 propose/approve/후보등록을 할 수 없다", async function () {
      await expect(voting.connect(outsider).propose(EmergencyStop, ZERO, 0)).to.be.revertedWith("Only admin");
      await expect(voting.connect(outsider).addCandidate("X", "Y", "Z")).to.be.revertedWith("Only admin");
      await expect(voting.connect(outsider).registerVoter(voter1.address)).to.be.revertedWith("Only admin");
    });

    it("관리자가 1명일 때 2번째 관리자 추가는 예외적으로 즉시 반영된다", async function () {
      await voting.connect(owner).propose(AddAdmin, admin2.address, 0);
      expect(await voting.admins(admin2.address)).to.equal(true);
      expect(await voting.adminCount()).to.equal(2);
    });

    it("관리자가 2명이면 3번째 관리자 추가는 2명 승인이 있어야 반영된다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(AddAdmin, admin3.address, 0); // proposal #1
      expect(await voting.admins(admin3.address)).to.equal(false);      // 1/2: 아직 미반영
      await voting.connect(admin2).approve(1);
      expect(await voting.admins(admin3.address)).to.equal(true);       // 2/2: 반영
    });

    it("최초 관리자(admin)는 제거할 수 없다", async function () {
      await setupTwoAdmins();
      await voting.connect(admin2).propose(RemoveAdmin, owner.address, 0);
      await expect(voting.connect(owner).approve(1)).to.be.revertedWith("Cannot remove original admin");
    });
  });

  describe("2. 멀티시그 동작 (제안 → 승인 → 실행)", function () {
    it("관리자 1명의 제안만으로는 선거가 시작되지 않는다 (승인 1/2)", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      expect(await voting.electionActive()).to.equal(false);
      const p = await voting.proposals(1);
      expect(p.approvalCount).to.equal(1);
      expect(p.executed).to.equal(false);
    });

    it("두 번째 관리자가 승인하면 실행된다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      await voting.connect(admin2).approve(1);
      expect(await voting.electionActive()).to.equal(true);
      expect((await voting.proposals(1)).executed).to.equal(true);
    });

    it("같은 관리자가 같은 제안을 두 번 승인할 수 없다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      await expect(voting.connect(owner).approve(1)).to.be.revertedWith("Already approved");
    });

    it("이미 실행된 제안은 다시 승인/실행할 수 없다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      await voting.connect(admin2).approve(1);
      await expect(voting.connect(admin2).approve(1)).to.be.revertedWith("Already executed");
    });

    it("제안 시 제안자의 승인 1표가 자동으로 들어간다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      expect(await voting.hasApproved(1, owner.address)).to.equal(true);
    });
  });

  describe("3. 비상 정지 (Emergency Stop)", function () {
    it("강제종료는 2명 승인 후에만 실행되고, 이후 투표가 차단된다", async function () {
      await startRunningElection();
      const stopId = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      expect(await voting.paused()).to.equal(false);          // 1/2: 아직 정지 아님
      await voting.connect(voter1).vote(0);                   // 이 시점엔 투표 가능
      await voting.connect(admin2).approve(stopId);
      expect(await voting.paused()).to.equal(true);
      await expect(voting.connect(voter2).vote(1)).to.be.revertedWith("Election is paused");
    });

    it("정지 상태에서 getWinner()는 조회 가능하다 (컨트랙트 로직)", async function () {
      await startRunningElection();
      await voting.connect(voter1).vote(1);
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await voting.connect(admin2).approve(id);
      expect(await voting.getWinner()).to.equal("B");
    });

    it("재개(Resume)도 2명 승인이 필요하고, 재개 후 다시 투표할 수 있다", async function () {
      await startRunningElection();
      let id = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await voting.connect(admin2).approve(id);

      id = await voting.getProposalCount();
      await voting.connect(owner).propose(Resume, ZERO, 0);
      expect(await voting.paused()).to.equal(true);           // 1/2: 아직 정지 상태
      await voting.connect(admin2).approve(id);
      expect(await voting.paused()).to.equal(false);
      await voting.connect(voter1).vote(0);
    });

    it("진행 중이 아닌 선거는 강제종료할 수 없다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await expect(voting.connect(admin2).approve(1)).to.be.revertedWith("Election not active");
    });
  });

  describe("4. 투표 무결성", function () {
    it("미등록 유권자는 투표할 수 없다", async function () {
      await startRunningElection();
      await expect(voting.connect(outsider).vote(0)).to.be.revertedWith("Not registered");
    });

    it("1인 1표: 같은 유권자의 중복 투표는 거부된다", async function () {
      await startRunningElection();
      await voting.connect(voter1).vote(0);
      await expect(voting.connect(voter1).vote(1)).to.be.revertedWith("Already voted");
    });

    it("존재하지 않는 후보에는 투표할 수 없다", async function () {
      await startRunningElection();
      await expect(voting.connect(voter1).vote(99)).to.be.revertedWith("Invalid candidate");
    });

    it("선거 시간이 지나면 투표가 거부되고 당선자를 조회할 수 있다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(0);
      await time.increase(61);
      await expect(voting.connect(voter2).vote(1)).to.be.revertedWith("Election ended");
      expect(await voting.getWinner()).to.equal("A");
    });

    it("진행 중에는 당선자를 조회할 수 없다", async function () {
      await startRunningElection();
      await expect(voting.getWinner()).to.be.revertedWith("Election still active");
    });
  });

  // ------------------------------------------------------------------
  // 아래는 "취약점 탐지" 테스트: 현재 컨트랙트가 방어하지 못하는 동작을
  // 일부러 재현해서 취약점진단보고서의 근거로 쓰기 위한 것.
  // (현재 상태에서는 '취약하다'는 사실을 통과로 기록한다)
  // ------------------------------------------------------------------
  describe("5. [취약점 탐지] 현재 컨트랙트의 알려진 약점", function () {
    it("V-A. 선거 진행 중에도 관리자 1명이 단독으로 유권자를 추가 등록할 수 있다", async function () {
      await startRunningElection();
      // 멀티시그 대상이 아닌 registerVoter → 관리자 1명이 선거 중 임의 주소를 유권자로 등록
      await voting.connect(owner).registerVoter(outsider.address);
      await voting.connect(outsider).vote(0);
      expect(await voting.hasVoted(outsider.address)).to.equal(true); // 취약: 선거 중 등록+투표 성공
    });

    it("V-B. 선거 진행 중에도 관리자 1명이 단독으로 후보를 추가할 수 있다", async function () {
      await startRunningElection();
      await voting.connect(owner).addCandidate("뒤늦은후보", "회장", "...");
      expect(await voting.getCandidateCount()).to.equal(3); // 취약: 선거 중 후보 변경 가능
    });

    it("V-C. 이미 관리자인 주소를 다시 추가하면 adminCount가 부풀려진다", async function () {
      await setupTwoAdmins();                                  // adminCount = 2
      await voting.connect(owner).propose(AddAdmin, admin3.address, 0);
      await voting.connect(admin2).approve(1);                 // adminCount = 3
      await voting.connect(owner).propose(AddAdmin, admin3.address, 0); // 이미 관리자인 주소
      await voting.connect(admin2).approve(2);
      expect(await voting.adminCount()).to.equal(4);           // 취약: 실제 관리자는 3명인데 4로 집계
    });

    it("V-D. 관리자가 아닌 주소를 제거하면 adminCount가 잘못 줄어든다", async function () {
      await setupTwoAdmins();                                  // adminCount = 2
      await voting.connect(owner).propose(RemoveAdmin, outsider.address, 0); // outsider는 관리자 아님
      await voting.connect(admin2).approve(1);
      expect(await voting.adminCount()).to.equal(1);           // 취약: 실제론 2명인데 1로 집계 → 단독 관리자 예외 재개방
    });

    it("V-E. 종료된 선거에 StartElection을 다시 실행하면 hasVoted가 유지된 채 재개된다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(0);
      await time.increase(61);
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      await voting.connect(admin2).approve(id);
      expect(await voting.electionActive()).to.equal(true);    // 취약: 종료 후 재시작 가능(득표 초기화 없음)
      expect((await voting.candidates(0)).voteCount).to.equal(1);
    });

    it("V-F. 후보가 없는 상태에서 당선자 조회는 비정상 revert 된다", async function () {
      await setupTwoAdmins();
      await voting.connect(owner).propose(StartElection, ZERO, 1);
      await voting.connect(admin2).approve(1);
      await time.increase(61);
      await expect(voting.getWinner()).to.be.reverted;         // 취약: 의미 있는 에러 메시지 없이 실패
    });

    it("V-G. 동점이면 후보 등록 순서가 앞선 후보가 자동으로 당선자가 된다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(1); // B 1표
      await voting.connect(voter2).vote(0); // A 1표
      await time.increase(61);
      expect(await voting.getWinner()).to.equal("A");          // 취약: 동점 처리 규칙이 없어 등록 순서(A)가 결과를 좌우
    });
  });
});
