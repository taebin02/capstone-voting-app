// 실제 MetaMask 검증 준비. zero(0표·정지), resume(정지 해제), tie(동점) 모드.
// 사용: node scripts/prepareWeek10Manual.cjs zero 주소1 주소2 ...
// zero/tie는 이전 시나리오가 확정된 경우에만 로컬 체인을 초기화한다.
// 시작·투표 fixture는 Hardhat 개발 계정으로 준비하며 결과 확정은 사용자가 수행한다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');
const ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const OUT = path.resolve(__dirname, '../../docs/evidence/week10/metamask');
const short = value => value.slice(0, 6) + '...' + value.slice(-4);

async function main() {
  const [mode, ...input] = process.argv.slice(2);
  if (!['zero', 'resume', 'tie'].includes(mode)) throw new Error('zero, resume 또는 tie를 지정하세요.');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  assert.ok((await provider.send('web3_clientVersion', [])).includes('Hardhat'));
  fs.mkdirSync(OUT, { recursive: true });
  const wait = async promise => (await promise).wait();
  if (mode === 'resume') {
    const voting = new ethers.Contract(ADDRESS, artifact.abi, await provider.getSigner(0));
    assert.equal(await provider.getCode(ADDRESS), artifact.deployedBytecode);
    assert.equal(await voting.paused(), true);
    assert.equal(await voting.finalized(), false);
    const id = await voting.getProposalCount();
    await wait(voting.propose(3, ethers.ZeroAddress, 0));
    await wait(voting.connect(await provider.getSigner(1)).approve(id));
    const result = { checkedAt: new Date().toISOString(), paused: await voting.paused(), endTime: Number(await voting.endTime()), now: Math.floor(Date.now() / 1000), finalized: await voting.finalized() };
    fs.writeFileSync(path.join(OUT, 'zero-resumed.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const accounts = input.map(value => ethers.getAddress(value.toLowerCase()));
  if (accounts.length < 2 || new Set(accounts).size !== accounts.length) throw new Error('서로 다른 사용자 주소를 두 개 이상 전달하세요.');
  const nonces = await Promise.all(accounts.map(address => provider.getTransactionCount(address, 'pending')));
  const priorBlockHeight = await provider.getBlockNumber();
  if (await provider.getCode(ADDRESS) !== '0x') {
    const old = new ethers.Contract(ADDRESS, artifact.abi, provider);
    assert.equal(await old.finalized(), true, '기존 시나리오를 확정한 다음 새로 준비하세요.');
    const previous = { archivedAt: new Date().toISOString(), finalized: true, outcome: Number(await old.finalizedOutcome()), winner: await old.getWinner(), votes: [String((await old.candidates(0)).voteCount), String((await old.candidates(1)).voteCount)] };
    fs.writeFileSync(path.join(OUT, `archived-outcome-${previous.outcome}.json`), JSON.stringify(previous, null, 2) + '\n');
    await provider.send('hardhat_reset', []);
    // 실제 사용자 지갑의 다음 nonce를 유지해 로컬 초기화에 따른 거래 대기 문제를 줄인다.
    for (let i = 0; i < accounts.length; i++) {
      if (nonces[i] > 0) await provider.send('hardhat_setNonce', [accounts[i], ethers.toQuantity(nonces[i])]);
    }
  }
  const owner = await provider.getSigner(0), admin2 = await provider.getSigner(1);
  const voting = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy();
  await voting.waitForDeployment();
  assert.equal(await voting.getAddress(), ADDRESS);
  assert.equal(await provider.getCode(ADDRESS), artifact.deployedBytecode);
  await wait(voting.propose(0, admin2.getAddress(), 0));
  for (const address of accounts.slice(0, 2)) {
    const id = await voting.getProposalCount();
    await wait(voting.propose(0, address, 0));
    await wait(voting.connect(admin2).approve(id));
  }
  await wait(voting.addCandidate('후보 A', '회장', '공약 A'));
  await wait(voting.addCandidate('후보 B', '회장', '공약 B'));
  for (const address of [await owner.getAddress(), await admin2.getAddress(), ...accounts]) {
    await wait(voting.registerVoter(address));
  }
  for (const address of accounts) await wait(owner.sendTransaction({ to: address, value: ethers.parseEther('5') }));
  const startId = await voting.getProposalCount();
  await wait(voting.propose(4, ethers.ZeroAddress, 1));
  await wait(voting.connect(admin2).approve(startId));
  if (mode === 'tie') {
    await wait(voting.vote(0));
    await wait(voting.connect(admin2).vote(1));
  } else {
    const id = await voting.getProposalCount();
    await wait(voting.propose(2, ethers.ZeroAddress, 0));
    await wait(voting.connect(admin2).approve(id));
  }
  // 이전 로컬 체인의 블록 높이 때문에 지갑에 옛 조회가 캐시되는 상황을 줄인다.
  while (await provider.getBlockNumber() < Math.max(40, priorBlockHeight + 2)) await provider.send('evm_mine', []);
  let denied;
  try { await voting.connect(new ethers.VoidSigner(accounts[0], provider)).getWinner(); }
  catch (error) { denied = error.reason || error.message; }
  assert.ok(denied?.includes('Result not finalized'));
  const result = { preparedAt: new Date().toISOString(), mode, contract: ADDRESS, bytecodeMatchesArtifact: true,
    setupSignedBy: 'Hardhat development accounts; user MetaMask will sign finalize()',
    userAccounts: accounts.map(short), userNonceContinuity: true, artificialEndTimeAdvance: false,
    paused: await voting.paused(), finalized: await voting.finalized(), durationMinutes: 1,
    endTime: Number(await voting.endTime()), votes: [String((await voting.candidates(0)).voteCount), String((await voting.candidates(1)).voteCount)],
    unfinalizedLookup: denied, expectedOutcome: mode === 'zero' ? 3 : 2, manualStatus: 'awaiting user screenshot and finalize' };
  fs.writeFileSync(path.join(OUT, `${mode}-setup.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
