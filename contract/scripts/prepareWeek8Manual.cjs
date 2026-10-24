// 실제 MetaMask 수동 확인용 준비. 기본 로컬 노드의 빈 컨트랙트에만 데이터를 넣는다.
// 사용: node scripts/prepareWeek8Manual.cjs (먼저 8545 노드를 실행)
const { ethers } = require('ethers');
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');
const ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
async function main() {
  const minutes = Number(process.env.WEEK8_DEMO_MINUTES || 10);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error('시연 시간은 1~60분 정수로 지정하세요.');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('로컬 Hardhat 체인만 허용');
  const owner = await provider.getSigner(0), second = await provider.getSigner(1);
  let voting;
  if (await provider.getCode(ADDRESS) === '0x') {
    voting = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy();
    await voting.waitForDeployment();
    if (await voting.getAddress() !== ADDRESS) throw new Error('첫 배포 주소가 예상과 다릅니다. 프론트 주소를 확인하세요.');
  } else voting = new ethers.Contract(ADDRESS, artifact.abi, owner);
  if (await voting.getProposalCount() !== 0n || await voting.getCandidateCount() !== 0n || await voting.voterCount() !== 0n || await voting.endTime() !== 0n) {
    throw new Error('이미 사용 중인 컨트랙트이므로 변경하지 않았습니다.');
  }
  for (const tx of [
    () => voting.addCandidate('후보 A', '회장', '공약 A'),
    () => voting.addCandidate('후보 B', '회장', '공약 B'),
    () => voting.registerVoter(owner.getAddress()),
    () => voting.registerVoter(second.getAddress()),
    () => voting.propose(0, second.getAddress(), 0),
    () => voting.propose(4, ethers.ZeroAddress, minutes),
  ]) await (await tx()).wait();
  console.log('수동 확인 준비 완료: 후보 2명, 유권자 2명, 관리자 2명, 선거 시작 제안 승인 1/2 대기');
  console.log(`선거 시간: 승인 후 ${minutes}분`);
  console.log('주소:', ADDRESS);
  console.log('최초 관리자/유권자:', await owner.getAddress());
  console.log('두 번째 관리자/유권자:', await second.getAddress());
  console.log('http://localhost:3000 에서 실제 MetaMask 두 번째 관리자 계정으로 연결 후 관리자 탭의 승인 버튼을 누르세요.');
  console.log('연결망: http://localhost:8545 / chain ID 31337');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
