const hre = require("hardhat");
const { deployVoting } = require("../lib/deployment.cjs");

async function main() {
  const { report } = await deployVoting(hre);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(() => {
  // Provider errors may contain credential-bearing RPC URLs. Do not log raw errors.
  console.error("배포 실패: 네트워크·전용 테스트 계정·잔액·가스 설정을 확인하세요. RPC 오류 원문은 출력하지 않습니다.");
  process.exitCode = 1;
});
