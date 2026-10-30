// 9주차 수동 검증: 기본 준비가 끝난 체인에 중복 추가·비관리자 제거 제안을 만든다.
// 사용: node scripts/prepareWeek9Manual.cjs 기존관리자주소 비관리자주소
// 제안의 최종 승인과 선거 시작은 사용자가 실제 MetaMask에서 수행한다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');

async function main() {
  const [existing, nonAdmin] = process.argv.slice(2).map(value => ethers.getAddress(value.toLowerCase()));
  if (!existing || !nonAdmin) throw new Error('기존 관리자와 비관리자 주소를 각각 전달하세요.');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const owner = await provider.getSigner(0);
  const address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  assert.equal(await provider.getCode(address), artifact.deployedBytecode, '배포 코드가 현재 컴파일 산출물과 다릅니다.');
  const voting = new ethers.Contract(address, artifact.abi, owner);
  assert.equal(await voting.endTime(), 0n, '아직 시작하지 않은 선거만 준비합니다.');
  assert.equal(await voting.admins(existing), true);
  assert.equal(await voting.admins(nonAdmin), false);
  assert.equal(await voting.getProposalCount(), 4n, '기본 준비 직후 한 번만 실행하세요.');
  const duplicateId = await voting.getProposalCount();
  await (await voting.propose(0, existing, 0)).wait();
  const removeId = await voting.getProposalCount();
  await (await voting.propose(1, nonAdmin, 0)).wait();
  // 새 체인이 이전 로컬 체인보다 낮은 높이여서 지갑이 옛 결과를 캐시하는 상황을 줄인다.
  // 선거는 아직 시작하지 않았고, 시간을 종료 시각으로 이동시키지 않는다.
  while (await provider.getBlockNumber() < 32) await provider.send('evm_mine', []);
  const short = value => value.slice(0, 6) + '...' + value.slice(-4);
  const observer = voting.connect(new ethers.VoidSigner(existing, provider));
  const probes = [];
  for (const [id, expected] of [[duplicateId, 'Already admin'], [removeId, 'Not an admin']]) {
    let reason;
    try { await observer.approve.estimateGas(id); }
    catch (error) { reason = error.reason || error.shortMessage || error.message; }
    assert.ok(reason?.includes(expected), `제안 ${id} 예상 거부: ${expected}`);
    probes.push({ proposalId: Number(id), expected, observed: reason, method: 'RPC gas estimation; not actual MetaMask confirmation' });
  }
  const setup = {
    preparedAt: new Date().toISOString(), contract: address, bytecodeMatchesArtifact: true,
    adminAccount: short(existing), nonAdminAccount: short(nonAdmin),
    adminCount: Number(await voting.adminCount()), voterCount: Number(await voting.voterCount()),
    electionStarted: false, initialStartProposalId: 1,
    durationMinutes: Number((await voting.proposals(1)).durationMinutes),
    duplicateAdminProposalId: Number(duplicateId), nonAdminRemovalProposalId: Number(removeId),
    preflight: probes, actualMetaMaskStatus: 'awaiting user verification',
  };
  const output = path.resolve(__dirname, '../../docs/evidence/week9/metamask');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'setup.json'), JSON.stringify(setup, null, 2) + '\n');
  console.log(JSON.stringify(setup, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
