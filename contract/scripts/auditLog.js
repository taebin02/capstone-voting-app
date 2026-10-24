// 감사 로그 조회: 체인에 기록된 이벤트를 시간순으로 읽어 "누가 언제 무엇을 했는지"를 재구성한다.
// (진단 No.5 - 관리 행위 로깅 부재의 After 증거 / 발표 시연용)
//
// 사용: npx hardhat run scripts/auditLog.js --network localhost
// 다른 주소를 보려면: $env:CONTRACT_ADDRESS="0x..." 로 지정한 뒤 실행
const hre = require("hardhat");

const ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ACTIONS = ["관리자 추가", "관리자 제거", "강제 종료", "선거 재개", "선거 시작"];

const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const fmt = (sec) => new Date(Number(sec) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");

async function main() {
  const provider = hre.ethers.provider;
  if ((await provider.getCode(ADDRESS)) === "0x") {
    throw new Error(`이 주소(${ADDRESS})에 컨트랙트가 없습니다. 노드와 배포 주소를 확인하세요.`);
  }

  const voting = await hre.ethers.getContractAt("Voting", ADDRESS);
  await printAuditLog(voting);
}

async function printAuditLog(voting) {
  const provider = hre.ethers.provider;
  const required = Number(await voting.requiredApprovals());

  const logs = await voting.queryFilter("*", 0, "latest");
  logs.sort((x, y) => x.blockNumber - y.blockNumber || x.index - y.index);

  const describe = (e) => {
    const a = e.args;
    switch (e.eventName) {
      case "ProposalCreated":  return `제안 #${a.proposalId} [${ACTIONS[Number(a.action)]}] 제안자 ${short(a.proposer)}`;
      case "ProposalApproved": return `승인 #${a.proposalId} ${short(a.approver)} (${a.approvalCount}/${required})`;
      case "ProposalExecuted": return `실행 #${a.proposalId} [${ACTIONS[Number(a.action)]}]`;
      case "AdminAdded":       return `관리자 추가됨 ${short(a.admin)} (제안 #${a.proposalId})`;
      case "AdminRemoved":     return `관리자 제거됨 ${short(a.admin)} (제안 #${a.proposalId})`;
      case "ElectionStarted":  return `선거 시작 - 종료 예정 ${fmt(a.endTime)} (제안 #${a.proposalId})`;
      case "EmergencyStopped": return `강제 종료 실행 (실행을 완료한 승인자 ${short(a.by)})`;
      case "Resumed":          return `선거 재개 실행 (실행을 완료한 승인자 ${short(a.by)})`;
      case "VoterRegistered":  return `유권자 등록 ${short(a.voter)} (등록한 관리자 ${short(a.by)})`;
      case "CandidateAdded":   return `후보 추가 #${a.candidateIndex} ${a.name} (관리자 ${short(a.by)})`;
      case "Voted":            return `투표 ${short(a.voter)} (후보는 이벤트에 미포함; 거래 입력은 공개)`;
      case "ResultFinalized":  return `결과 확정 - 당선자 ${a.winner} (실행 ${short(a.by)})`;
      default:                 return "";
    }
  };

  const blockTime = {};
  const counts = {};

  console.log(`\n=== 감사 로그 (컨트랙트 ${await voting.getAddress()}) ===`);
  console.log("시각은 블록 timestamp의 UTC 값이며, 시연에서 시간을 조작한 경우 실제 실행 시각과 다릅니다.");
  console.log("블록  시각                 이벤트              내용");
  console.log("-".repeat(100));
  for (const e of logs) {
    if (blockTime[e.blockNumber] === undefined) {
      blockTime[e.blockNumber] = (await provider.getBlock(e.blockNumber)).timestamp;
    }
    counts[e.eventName] = (counts[e.eventName] || 0) + 1;
    console.log(
      `${String(e.blockNumber).padEnd(5)} ${fmt(blockTime[e.blockNumber])}  ${e.eventName.padEnd(18)}  ${describe(e)} | tx ${e.transactionHash} log ${e.index}`
    );
  }
  console.log("-".repeat(100));
  console.log(`총 ${logs.length}건:`, Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
  console.log();
}

module.exports = { printAuditLog };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
