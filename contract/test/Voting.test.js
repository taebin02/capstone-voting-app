const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

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

    it("선거 시간이 지나면 투표가 거부되고, 결과 확정 후 당선자를 조회할 수 있다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(0);
      await time.increase(61);
      await expect(voting.connect(voter2).vote(1)).to.be.revertedWith("Election ended");
      await expect(voting.getWinner()).to.be.revertedWith("Result not finalized"); // 확정 전에는 조회 불가
      await voting.finalize();
      expect(await voting.getWinner()).to.equal("A");
    });

    it("진행 중에는 당선자를 조회할 수 없다", async function () {
      await startRunningElection();
      await expect(voting.getWinner()).to.be.revertedWith("Result not finalized");
    });
  });

  // ------------------------------------------------------------------
  // 7주차 보완 검증: 6주차에 '취약하다'고 확인했던 V-A, V-B를 고친 뒤,
  // 같은 공격이 이제 막히는지 확인한다. (6주차에는 이 두 테스트가
  // 반대로 "공격이 성공한다"를 기대값으로 했고, 그 결과가 Before 증거다.)
  // ------------------------------------------------------------------
  describe("5. [7주차 보완 검증] 선거 시작 후 등록 차단 (V-A, V-B)", function () {
    it("선거 시작 전에는 유권자·후보 등록이 정상적으로 된다", async function () {
      await voting.connect(owner).addCandidate("A", "회장", "공약A");
      await voting.connect(owner).registerVoter(voter1.address);
      expect(await voting.getCandidateCount()).to.equal(1);
      expect(await voting.registeredVoters(voter1.address)).to.equal(true);
    });

    it("V-A 방어. 선거 시작 후 관리자 1명이 유권자를 추가 등록하려 하면 거부된다", async function () {
      await startRunningElection();
      await expect(voting.connect(owner).registerVoter(outsider.address))
        .to.be.revertedWith("Election already started");
      await expect(voting.connect(outsider).vote(0)).to.be.revertedWith("Not registered");
    });

    it("V-B 방어. 선거 시작 후 관리자 1명이 후보를 추가하려 하면 거부된다", async function () {
      await startRunningElection();
      await expect(voting.connect(owner).addCandidate("뒤늦은후보", "회장", "..."))
        .to.be.revertedWith("Election already started");
      expect(await voting.getCandidateCount()).to.equal(2);
    });

    it("강제 종료(정지) 상태에서도 등록은 차단된다", async function () {
      await startRunningElection();
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await voting.connect(admin2).approve(id);
      expect(await voting.paused()).to.equal(true);
      await expect(voting.connect(owner).registerVoter(outsider.address))
        .to.be.revertedWith("Election already started");
    });

    it("선거가 끝난 뒤에도 등록은 차단된다 (선거 1회용 정책)", async function () {
      await startRunningElection(1);
      await time.increase(61);
      await expect(voting.connect(owner).registerVoter(outsider.address))
        .to.be.revertedWith("Election already started");
      await expect(voting.connect(owner).addCandidate("X", "Y", "Z"))
        .to.be.revertedWith("Election already started");
    });
  });

  // ------------------------------------------------------------------
  // 7주차 보완 검증 2: 타임스탬프 문제(2주차 발견). 컨트랙트가 보는 '지금 시각'은
  // 마지막 블록의 시각이라, 거래가 없는 동안 화면과 어긋나 getWinner()가 거부된다.
  // → 종료 후 finalize() 거래로 당선자를 체인에 저장(확정)하는 방식으로 해결.
  // ------------------------------------------------------------------
  describe("6. [7주차 보완 검증] 결과 확정 finalize() (타임스탬프 문제, V-F)", function () {
    it("선거가 진행 중이면 확정할 수 없다", async function () {
      await startRunningElection();
      await expect(voting.finalize()).to.be.revertedWith("Election still active");
    });

    it("선거를 시작한 적이 없으면 확정할 수 없다", async function () {
      await expect(voting.finalize()).to.be.revertedWith("Election not started");
    });

    it("종료 후에는 관리자가 아닌 계정도 확정할 수 있고, 당선자가 저장된다", async function () {
      await startRunningElection(1);
      await voting.connect(voter2).vote(1);
      await time.increase(61);
      await voting.connect(outsider).finalize();
      expect(await voting.finalized()).to.equal(true);
      expect(await voting.finalizedWinner()).to.equal("B");
      expect(await voting.getWinner()).to.equal("B");
    });

    it("확정은 한 번만 가능하다", async function () {
      await startRunningElection(1);
      await time.increase(61);
      await voting.finalize();
      await expect(voting.finalize()).to.be.revertedWith("Already finalized");
    });

    it("확정 후에는 시간이 더 지나도 조회 결과가 변하지 않는다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(0);
      await time.increase(61);
      await voting.finalize();
      await time.increase(100000);
      expect(await voting.getWinner()).to.equal("A");
    });

    it("확정하면 ResultFinalized 이벤트가 기록된다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(0);
      await time.increase(61);
      await expect(voting.connect(outsider).finalize())
        .to.emit(voting, "ResultFinalized")
        .withArgs(outsider.address, "A", anyValue);
    });

    it("비상 정지 중에는 확정할 수 없다", async function () {
      await startRunningElection();
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await voting.connect(admin2).approve(id);
      await expect(voting.finalize()).to.be.revertedWith("Election is paused");
    });

    it("확정된 뒤에는 선거를 다시 시작할 수 없다", async function () {
      await startRunningElection(1);
      await time.increase(61);
      await voting.finalize();
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      await expect(voting.connect(admin2).approve(id)).to.be.revertedWith("Election already finalized");
    });

    it("V-F 방어. 후보가 없으면 확정이 의미 있는 메시지로 거부된다", async function () {
      await setupTwoAdmins();
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(StartElection, ZERO, 1);
      await voting.connect(admin2).approve(id);
      await time.increase(61);
      await expect(voting.finalize()).to.be.revertedWith("No candidates");
    });
  });

  // ------------------------------------------------------------------
  // 8주차 보완 검증: 진단 No.5(관리 행위 로깅 부재). 7주차까지는 제안·승인·실행·정지·재개·확정만
  // 기록됐고, 유권자 등록·후보 추가·투표·관리자 변경·선거 시작은 기록이 없었다.
  // ------------------------------------------------------------------
  describe("7. [8주차 보완 검증] 이벤트 로깅 (진단 No.5)", function () {
    it("제안하면 ProposalCreated와 제안자의 ProposalApproved(1표)가 기록된다", async function () {
      await setupTwoAdmins();
      const id = await voting.getProposalCount();
      const tx = voting.connect(owner).propose(StartElection, ZERO, 60);
      await expect(tx).to.emit(voting, "ProposalCreated").withArgs(id, StartElection, owner.address);
      await expect(tx).to.emit(voting, "ProposalApproved").withArgs(id, owner.address, 1);
    });

    it("두 번째 승인으로 실행되면 ProposalApproved(2표), ProposalExecuted, ElectionStarted가 기록된다", async function () {
      await setupTwoAdmins();
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      const tx = voting.connect(admin2).approve(id);
      await expect(tx).to.emit(voting, "ProposalApproved").withArgs(id, admin2.address, 2);
      await expect(tx).to.emit(voting, "ProposalExecuted").withArgs(id, StartElection);
      await expect(tx).to.emit(voting, "ElectionStarted").withArgs(await voting.endTime(), id);
    });

    it("관리자 추가·제거가 AdminAdded / AdminRemoved로 기록된다", async function () {
      await expect(voting.connect(owner).propose(AddAdmin, admin2.address, 0)) // id 0 (부트스트랩 즉시 반영)
        .to.emit(voting, "AdminAdded").withArgs(admin2.address, 0);
      await voting.connect(owner).propose(AddAdmin, admin3.address, 0);        // id 1
      await expect(voting.connect(admin2).approve(1))
        .to.emit(voting, "AdminAdded").withArgs(admin3.address, 1);
      await voting.connect(owner).propose(RemoveAdmin, admin3.address, 0);     // id 2
      await expect(voting.connect(admin2).approve(2))
        .to.emit(voting, "AdminRemoved").withArgs(admin3.address, 2);
    });

    it("강제 종료·재개가 EmergencyStopped / Resumed로 기록된다 (by = 실행을 완료한 승인자)", async function () {
      await startRunningElection();
      let id = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await expect(voting.connect(admin2).approve(id))
        .to.emit(voting, "EmergencyStopped").withArgs(admin2.address, anyValue);
      id = await voting.getProposalCount();
      await voting.connect(owner).propose(Resume, ZERO, 0);
      await expect(voting.connect(admin2).approve(id))
        .to.emit(voting, "Resumed").withArgs(admin2.address, anyValue);
    });

    it("유권자 등록이 VoterRegistered로 기록되고, 이미 등록된 주소는 다시 기록되지 않는다", async function () {
      await expect(voting.connect(owner).registerVoter(voter1.address))
        .to.emit(voting, "VoterRegistered").withArgs(owner.address, voter1.address, anyValue);
      await expect(voting.connect(owner).registerVoter(voter1.address))
        .to.not.emit(voting, "VoterRegistered");
    });

    it("후보 추가가 CandidateAdded로 기록된다", async function () {
      await expect(voting.connect(owner).addCandidate("A", "회장", "공약A"))
        .to.emit(voting, "CandidateAdded").withArgs(owner.address, 0, "A");
    });

    it("투표가 Voted(투표자, 시각)로 기록된다", async function () {
      await startRunningElection();
      await expect(voting.connect(voter1).vote(1))
        .to.emit(voting, "Voted").withArgs(voter1.address, anyValue);
    });

    it("Voted 이벤트에는 후보 정보가 없다 (거래 입력 공개와 별개로 이벤트의 정보 최소화)", async function () {
      const fragment = voting.interface.getEvent("Voted");
      expect(fragment.inputs.map(i => i.name)).to.deep.equal(["voter", "timestamp"]);
    });
  });

  // ------------------------------------------------------------------
  // 8주차 증거 보강: 7주차까지 "해결/부분 해결"로 적었지만 직접 확인하는 테스트가 없던 항목
  // ------------------------------------------------------------------
  describe("8. [8주차 증거 보강] 멀티시그 (진단 No.3, No.4)", function () {
    async function setupThreeAdmins() {
      await voting.connect(owner).propose(AddAdmin, admin2.address, 0); // id 0 (부트스트랩)
      await voting.connect(owner).propose(AddAdmin, admin3.address, 0); // id 1
      await voting.connect(admin2).approve(1);
    }

    it("No.4. 관리자 제거도 2명 승인이 있어야 실행된다 (1명 제안만으로는 제거되지 않음)", async function () {
      await setupThreeAdmins();
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(RemoveAdmin, admin3.address, 0);
      expect(await voting.admins(admin3.address)).to.equal(true);   // 1/2: 아직 관리자
      await voting.connect(admin2).approve(id);
      expect(await voting.admins(admin3.address)).to.equal(false);  // 2/2: 제거됨
    });

    it("No.3. 관리자 3명이면 최초 관리자 없이 나머지 2명의 승인만으로 비상 정지를 실행할 수 있다", async function () {
      await startRunningElection();                                  // owner + admin2로 선거 시작
      const addId = await voting.getProposalCount();
      await voting.connect(owner).propose(AddAdmin, admin3.address, 0);
      await voting.connect(admin2).approve(addId);                   // 관리자 3명이 됨
      const stopId = await voting.getProposalCount();
      await voting.connect(admin2).propose(EmergencyStop, ZERO, 0);  // owner(최초 관리자)는 관여하지 않음
      await voting.connect(admin3).approve(stopId);
      expect(await voting.paused()).to.equal(true);
    });
  });

  // ------------------------------------------------------------------
  // 아래는 "취약점 탐지" 테스트: 현재 컨트랙트가 아직 방어하지 못하는 동작을
  // 일부러 재현해서 취약점진단보고서의 근거로 쓰기 위한 것.
  // (현재 상태에서는 '취약하다'는 사실을 통과로 기록한다)
  // ------------------------------------------------------------------
  describe("9. [취약점 탐지] 아직 남아 있는 약점", function () {
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

    it("V-E. (결과 확정 전) 종료된 선거에 StartElection을 다시 실행하면 hasVoted가 유지된 채 재개된다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(0);
      await time.increase(61);
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(StartElection, ZERO, 60);
      await voting.connect(admin2).approve(id);
      expect(await voting.electionActive()).to.equal(true);    // 취약: 종료 후 재시작 가능(득표 초기화 없음)
      expect((await voting.candidates(0)).voteCount).to.equal(1);
    });

    it("V-G. 동점이면 후보 등록 순서가 앞선 후보가 자동으로 당선자가 된다", async function () {
      await startRunningElection(1);
      await voting.connect(voter1).vote(1); // B 1표
      await voting.connect(voter2).vote(0); // A 1표
      await time.increase(61);
      await voting.finalize();
      expect(await voting.getWinner()).to.equal("A");          // 취약: 동점 처리 규칙이 없어 등록 순서(A)가 결과를 좌우
    });

    it("No.15. 비상 정지 중에는 확정 전인데도 아무나 현재 집계의 선두 후보를 조회할 수 있다", async function () {
      await startRunningElection();
      await voting.connect(voter1).vote(1);
      const id = await voting.getProposalCount();
      await voting.connect(owner).propose(EmergencyStop, ZERO, 0);
      await voting.connect(admin2).approve(id);
      expect(await voting.finalized()).to.equal(false);
      expect(await voting.connect(outsider).getWinner()).to.equal("B"); // 취약: 확정 전·정지 중인데 집계가 노출됨 (화면에서만 숨김)
    });
  });
});
