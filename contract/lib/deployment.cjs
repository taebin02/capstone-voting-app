const fs = require('node:fs');
const path = require('node:path');
const { assertDeploymentNetwork } = require('./deploymentConfig.cjs');

async function preflight(hre) {
  const { ethers, network } = hre;
  const chain = await ethers.provider.getNetwork();
  assertDeploymentNetwork(network.name, chain.chainId);
  // Never use remotely unlocked accounts for Sepolia: require an explicit local test key.
  if (network.name === 'sepolia' && !process.env.SEPOLIA_PRIVATE_KEY) {
    throw new Error('A dedicated Sepolia signing key must be configured locally');
  }
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error('No deployment signer configured');
  const address = await signer.getAddress();
  if (network.name === 'sepolia') assertDedicatedSepoliaAddress(ethers, address);
  const factory = await ethers.getContractFactory('Voting', signer);
  const request = await factory.getDeployTransaction();
  const gasEstimate = await ethers.provider.estimateGas({ ...request, from: address });
  const gasLimit = (gasEstimate * 120n + 99n) / 100n;
  const fees = await ethers.provider.getFeeData();
  const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice;
  if (!maxFeePerGas || maxFeePerGas <= 0n) throw new Error('Fee estimate unavailable');
  const balance = await ethers.provider.getBalance(address);
  const requiredBalance = gasLimit * maxFeePerGas;
  if (balance < requiredBalance) throw new Error('Insufficient test ETH for the estimated deployment budget');
  const report = {
    network: network.name, chainId: chain.chainId.toString(), deployer: address,
    gasEstimate: gasEstimate.toString(), gasLimit: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas.toString(), balanceWei: balance.toString(),
    deploymentBudgetWei: requiredBalance.toString(),
    estimateOnly: true, transactionSent: false,
  };
  return { report, factory, gasLimit, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
}

async function deployVoting(hre) {
  const prepared = await preflight(hre);
  const overrides = { gasLimit: prepared.gasLimit };
  if (prepared.maxPriorityFeePerGas !== null) {
    overrides.maxFeePerGas = prepared.maxFeePerGas;
    overrides.maxPriorityFeePerGas = prepared.maxPriorityFeePerGas;
  } else { overrides.gasPrice = prepared.maxFeePerGas; }
  const voting = await prepared.factory.deploy(overrides);
  const receipt = await voting.deploymentTransaction().wait();
  if (!receipt || receipt.status !== 1) throw new Error('Deployment transaction did not succeed');
  const address = await voting.getAddress();
  const code = await hre.ethers.provider.getCode(address);
  const artifact = await hre.artifacts.readArtifact('Voting');
  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new Error('Deployed bytecode mismatch');
  const report = { ...prepared.report, estimateOnly: false, transactionSent: true,
    contractAddress: address, transactionHash: receipt.hash, blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(), bytecodeMatched: true,
    bytecodeHash: hre.ethers.keccak256(code), admin: await voting.admin(),
    verifiedAt: new Date().toISOString(),
    compiler: hre.config.solidity.compilers[0].version,
  };
  if (networkIsPersistent(hre.network.name)) {
    const output = path.resolve(__dirname, '../deployments', report.chainId);
    fs.mkdirSync(output, { recursive: true });
    // Each deployment has a distinct receipt; never overwrite an earlier deployment record.
    fs.writeFileSync(path.join(output, `${receipt.hash}.json`), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  return { voting, report };
}

function networkIsPersistent(name) { return name !== 'hardhat'; }
function assertDedicatedSepoliaAddress(ethers, address) {
  // This is Hardhat's deliberately public DEVELOPMENT mnemonic, never a user recovery phrase.
  for (let i = 0; i < 20; i++) {
    const dev = ethers.HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, `m/44'/60'/0'/0/${i}`);
    if (dev.address.toLowerCase() === address.toLowerCase()) {
      throw new Error('Public Hardhat development accounts are not allowed on Sepolia');
    }
  }
}
module.exports = { preflight, deployVoting, assertDedicatedSepoliaAddress };
