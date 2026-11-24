const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hre = require('hardhat');
const { sepoliaNetwork, assertDeploymentNetwork } = require('../lib/deploymentConfig.cjs');
const { preflight, deployVoting, assertDedicatedSepoliaAddress } = require('../lib/deployment.cjs');

async function main() {
  assert.equal(hre.network.name, 'hardhat', 'Isolated in-memory chain only');
  const checks = [];
  const check = name => { checks.push({ name, status: 'passed' }); console.log('PASS:', name); };
  assert.equal(sepoliaNetwork({}), null);
  check('Sepolia disabled when credentials are not configured');
  const noKey = sepoliaNetwork({ SEPOLIA_RPC_URL: 'https://example.invalid/rpc' });
  assert.equal(noKey.chainId, 11155111);
  assert.deepEqual(noKey.accounts, []);
  check('No implicit remote unlocked accounts when key is absent');
  for (const url of ['not a URL', 'http://example.invalid/rpc']) {
    assert.throws(() => sepoliaNetwork({ SEPOLIA_RPC_URL: url }), /SEPOLIA_RPC_URL/);
  }
  assert.throws(() => sepoliaNetwork({ SEPOLIA_RPC_URL: 'https://example.invalid', SEPOLIA_PRIVATE_KEY: 'invalid' }), /format/);
  check('Malformed endpoint, insecure HTTP and malformed signing key rejected');
  assertDeploymentNetwork('hardhat', 31337n);
  assertDeploymentNetwork('localhost', 31337n);
  assertDeploymentNetwork('sepolia', 11155111n);
  assert.throws(() => assertDeploymentNetwork('sepolia', 1n), /mismatch/);
  assert.throws(() => assertDeploymentNetwork('sepolia', 31337n), /mismatch/);
  assert.throws(() => assertDeploymentNetwork('mainnet', 1n), /unsupported/);
  check('Mainnet and mismatched name/chain combinations rejected');
  const [owner] = await hre.ethers.getSigners();
  assert.throws(() => assertDedicatedSepoliaAddress(hre.ethers, owner.address), /Public Hardhat/);
  const lastDev = hre.ethers.HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, "m/44'/60'/0'/0/19");
  assert.throws(() => assertDedicatedSepoliaAddress(hre.ethers, lastDev.address), /Public Hardhat/);
  assertDedicatedSepoliaAddress(hre.ethers, hre.ethers.Wallet.createRandom().address);
  check('First and last default Hardhat accounts rejected for Sepolia; separate test address accepted');
  const nonce = await hre.ethers.provider.getTransactionCount(owner.address);
  const beforeBlock = await hre.ethers.provider.getBlockNumber();
  const prepared = await preflight(hre);
  assert.equal(await hre.ethers.provider.getTransactionCount(owner.address), nonce);
  assert.equal(await hre.ethers.provider.getBlockNumber(), beforeBlock);
  assert.equal(prepared.report.transactionSent, false);
  assert(BigInt(prepared.report.deploymentBudgetWei) > 0n);
  check('Preflight estimates deployment without sending any transaction or mining a block');
  const snapshot = await hre.network.provider.send('evm_snapshot');
  try {
    await hre.network.provider.send('hardhat_setBalance', [owner.address, '0x0']);
    await assert.rejects(preflight(hre));
    check('Zero-balance signer cannot pass deployment preflight');
  } finally { await hre.network.provider.send('evm_revert', [snapshot]); }
  const { voting, report } = await deployVoting(hre);
  assert.equal(report.bytecodeMatched, true);
  assert.equal(report.admin, owner.address);
  assert.equal(await voting.adminCount(), 1n);
  assert.equal(await voting.finalized(), false);
  assert.equal(await voting.endTime(), 0n);
  assert.equal(await voting.requiredApprovals(), 2n);
  check('Deployment receipt, exact runtime bytecode and initial election state verified locally');
  const output = path.resolve(__dirname, '../../docs/evidence/week12');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'deployment-check.json'), JSON.stringify({
    date: '2026-11-24', actualPublicTestnetDeployment: false,
    environment: 'Isolated in-memory Hardhat chain; no external RPC requests',
    checks, preflight: prepared.report, localDeployment: report
  }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
