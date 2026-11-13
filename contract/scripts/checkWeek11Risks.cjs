// Diagnostic evidence, not a defense test. Never run against the user's localhost chain.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ethers, network } = require('hardhat');

async function main() {
  assert.equal(network.name, 'hardhat', 'Use the isolated in-memory hardhat network only');
  const [owner, admin3, voter2, outsider, replacement] = await ethers.getSigners();
  // A new disposable key is created in memory. Never print or save it.
  const victim = ethers.Wallet.createRandom().connect(ethers.provider);
  const clone = new ethers.Wallet(victim.privateKey, ethers.provider);
  await (await owner.sendTransaction({ to: victim.address, value: ethers.parseEther('1') })).wait();
  const voting = await (await ethers.getContractFactory('Voting')).deploy();
  await voting.waitForDeployment();
  const checks = [];
  const check = (name, evidence) => checks.push({ name, status: 'confirmed', ...evidence });
  async function execute(proposer, approver, action, target = ethers.ZeroAddress, minutes = 0) {
    const id = await voting.getProposalCount();
    await (await voting.connect(proposer).propose(action, target, minutes)).wait();
    await (await voting.connect(approver).approve(id)).wait();
    return id;
  }
  await (await voting.propose(0, victim.address, 0)).wait();
  await execute(owner, victim, 0, admin3.address);
  await (await voting.addCandidate('A', 'Chair', 'A')).wait();
  await (await voting.addCandidate('B', 'Chair', 'B')).wait();
  await (await voting.registerVoter(victim.address)).wait();
  await (await voting.registerVoter(voter2.address)).wait();
  await execute(owner, admin3, 4, ethers.ZeroAddress, 60);
  assert.equal(await clone.getAddress(), victim.address);
  const tx = await voting.connect(clone).vote(1);
  const receipt = await tx.wait();
  const observed = await ethers.provider.getTransaction(tx.hash);
  const decoded = voting.interface.parseTransaction({ data: observed.data });
  assert.equal(observed.from, victim.address);
  assert.equal(decoded.name, 'vote');
  assert.equal(decoded.args[0], 1n);
  check('No.6: transaction sender and vote input reveal address-choice link', {
    transaction: tx.hash, from: observed.from, input: observed.data, candidateIndex: '1', candidateName: 'B'
  });
  assert.equal(await voting.connect(outsider).hasVoted(victim.address), true);
  assert.equal(await voting.connect(outsider).registeredVoters(victim.address), true);
  assert.equal((await voting.connect(outsider).candidates(1)).voteCount, 1n);
  check('No.6: outsider can read participation, registration and live tally', {
    hasVoted: true, registered: true, candidateBVotes: '1'
  });
  const event = receipt.logs.map(log => { try { return voting.interface.parseLog(log); } catch { return null; } })
    .find(log => log?.name === 'Voted');
  assert(event);
  assert.equal(event.args.voter, victim.address);
  assert.equal(event.args.length, 2);
  check('No.6: Voted omits choice but still exposes participation', { eventArguments: ['voter', 'timestamp'] });
  await assert.rejects(voting.connect(victim).vote.staticCall(0), /Already voted/);
  check('No.7: holder of copied key can consume the legitimate voter vote', {
    copiedKeyVoteAccepted: true, legitimateSecondVote: 'Already voted', keySaved: false
  });
  const stopId = await voting.getProposalCount();
  await (await voting.connect(clone).propose(2, ethers.ZeroAddress, 0)).wait();
  assert.equal((await voting.proposals(stopId)).approvalCount, 1n);
  assert.equal(await voting.paused(), false);
  check('No.7: one compromised administrator cannot immediately execute emergency stop', {
    approvals: '1/2', executed: false
  });
  await (await voting.connect(admin3).approve(stopId)).wait();
  await assert.rejects(voting.connect(outsider).getWinner(), /Result not finalized/);
  assert.equal((await voting.connect(outsider).candidates(1)).voteCount, 1n);
  check('No.15 boundary: paused winner query denied while public tally remains readable', {
    winnerQuery: 'Result not finalized', candidateBVotes: '1'
  });
  await execute(owner, admin3, 1, victim.address);
  assert.equal(await voting.admins(victim.address), false);
  await assert.rejects(voting.connect(clone).propose.staticCall(3, ethers.ZeroAddress, 0), /Only admin/);
  await execute(owner, admin3, 0, replacement.address);
  check('No.7 response: two healthy administrators remove non-original compromised admin and add replacement', {
    compromisedAdmin: false, newProposalDenied: 'Only admin', replacementAdmin: await voting.admins(replacement.address),
    scope: 'New proposals only; this does not invalidate prior approvals or reverse the vote'
  });
  await execute(admin3, replacement, 3);
  assert.equal(await voting.paused(), false);
  const removeOriginalId = await voting.getProposalCount();
  await (await voting.connect(admin3).propose(1, owner.address, 0)).wait();
  await assert.rejects(voting.connect(replacement).approve.staticCall(removeOriginalId), /Cannot remove original admin/);
  check('No.3 boundary: other two admins can operate but cannot revoke original admin', {
    resumeWithoutOriginal: true, originalRemoval: 'Cannot remove original admin'
  });
  const result = {
    date: '2026-11-13', network: 'isolated hardhat memory network',
    fixture: 'Fresh disposable key; copied only in memory. No real user keys or wallet used.',
    classification: 'Diagnostic observations plus existing-control checks; success is NOT a vulnerability fix',
    checks, total: checks.length
  };
  const directory = path.resolve(__dirname, '../../docs/evidence/week11');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'risk-observations.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
