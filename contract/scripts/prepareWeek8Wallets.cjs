// 기존 MetaMask 주소를 로컬 확인에 사용: 첫 2개는 관리자, 전체 주소는 유권자.
// 사용: node scripts/prepareWeek8Wallets.cjs 0x주소1 0x주소2 ...
// 8545의 개발 노드만 사용한다. 주소는 소스에 저장하지 않는다.
const { ethers } = require('ethers');
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');
async function main() {
  const addresses = process.argv.slice(2).map(value => ethers.getAddress(value.toLowerCase()));
  if (addresses.length < 2 || new Set(addresses).size !== addresses.length) throw new Error('서로 다른 주소를 2개 이상 전달하세요.');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('로컬 Hardhat 체인만 허용');
  const owner = await provider.getSigner(0), approver = await provider.getSigner(1);
  const voting = new ethers.Contract('0x5FbDB2315678afecb367f032d93F642f64180aa3', artifact.abi, owner);
  if (await voting.endTime() !== 0n) throw new Error('선거가 이미 시작되어 유권자 준비를 중단했습니다.');
  for (const address of addresses.slice(0, 2)) {
    if (!(await voting.admins(address))) {
      const id = await voting.getProposalCount();
      await (await voting.propose(0, address, 0)).wait();
      if (!(await voting.proposals(id)).executed) await (await voting.connect(approver).approve(id)).wait();
    }
  }
  for (const address of addresses) {
    if (!(await voting.registeredVoters(address))) await (await voting.registerVoter(address)).wait();
    if (await provider.getBalance(address) < ethers.parseEther('1')) {
      await (await owner.sendTransaction({ to: address, value: ethers.parseEther('5') })).wait();
    }
    console.log(address, 'admin=' + await voting.admins(address), 'voter=' + await voting.registeredVoters(address), 'localETH=' + ethers.formatEther(await provider.getBalance(address)));
  }
  console.log('기존 선거 시작 제안은 승인 대기 상태로 유지했습니다. 첫 번째 사용자 주소로 화면에서 승인하세요.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
