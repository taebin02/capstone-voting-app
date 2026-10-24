// 8주차 감사 로그 시연. 기본 hardhat 네트워크에서 새 컨트랙트를 배포해 격리 실행한다.
// 사용: npx.cmd hardhat run scripts/demoScenario.js
// 각 실행의 체인은 메모리에만 존재한다. localhost의 기존 선거에는 연결하지 않는다.
const hre = require("hardhat");
const assert = require("node:assert/strict");
const { printAuditLog } = require("./auditLog");

async function main() {
  if (hre.network.name !== "hardhat") {
    throw new Error("이 시연은 --network hardhat에서 실행하세요. 시간 변경은 격리된 체인에서만 수행합니다.");
  }
  const [owner, admin2, admin3, voter1, voter2] = await hre.ethers.getSigners();
  const voting = await (await hre.ethers.getContractFactory("Voting")).deploy();
  await voting.waitForDeployment();
  console.log("격리 시연 배포 주소:", await voting.getAddress());
  const step = async (label, tx) => {
    await (await tx).wait();
    console.log("완료:", label);
  };
  const proposeAndApprove = async (action, target, minutes, label) => {
    const id = await voting.getProposalCount();
    await step(`${label} 제안 (1/2)`, voting.propose(action, target, minutes));
    assert.equal((await voting.proposals(id)).executed, false);
    await step(`${label} 승인 (2/2)`, voting.connect(admin2).approve(id));
    assert.equal((await voting.proposals(id)).executed, true);
  };
  const ZERO = hre.ethers.ZeroAddress;
  await step("두 번째 관리자 추가 (부트스트랩)", voting.propose(0, admin2.address, 0));
  await proposeAndApprove(0, admin3.address, 0, "세 번째 관리자 추가");
  await proposeAndApprove(1, admin3.address, 0, "세 번째 관리자 제거");
  await step("후보 A 등록", voting.addCandidate("A", "회장", "공약 A"));
  await step("후보 B 등록", voting.addCandidate("B", "회장", "공약 B"));
  await step("유권자 1 등록", voting.registerVoter(voter1.address));
  await step("유권자 2 등록", voting.registerVoter(voter2.address));
  await proposeAndApprove(4, ZERO, 2, "선거 시작");
  await step("유권자 1 투표", voting.connect(voter1).vote(1));
  await proposeAndApprove(2, ZERO, 0, "비상 정지");
  assert.equal(await voting.paused(), true);
  await proposeAndApprove(3, ZERO, 0, "재개");
  await step("유권자 2 투표", voting.connect(voter2).vote(1));
  // 로컬 시연용 가상 시각 이동. 실제 대기/실제 체인의 시각 문제 재현 증거와 구분한다.
  await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(await voting.endTime()) + 1]);
  await step("비관리자의 결과 확정", voting.connect(voter1).finalize());
  assert.equal(await voting.finalized(), true);
  assert.equal(await voting.getWinner(), "B");
  const logs = await voting.queryFilter("*", 0, "latest");
  const eventNames = new Set(logs.map(log => log.eventName));
  const expected = voting.interface.fragments.filter(f => f.type === "event").map(f => f.name);
  assert.equal(expected.length, 12);
  for (const name of expected) assert.ok(eventNames.has(name), `${name} 이벤트 누락`);
  await printAuditLog(voting);
  console.log(`시연 검증 완료: 이벤트 ${eventNames.size}종, 당선자 B. 가상 시각을 사용한 로컬 검증입니다.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
