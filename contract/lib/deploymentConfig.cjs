// No RPC URL, key or provider error is printed by this module.
function sepoliaNetwork(env = process.env) {
  if (!env.SEPOLIA_RPC_URL) return null;
  let endpoint;
  try { endpoint = new URL(env.SEPOLIA_RPC_URL); } catch { throw new Error('Invalid SEPOLIA_RPC_URL'); }
  if (endpoint.protocol !== 'https:') throw new Error('SEPOLIA_RPC_URL must use HTTPS');
  const key = env.SEPOLIA_PRIVATE_KEY;
  if (key && !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Invalid SEPOLIA_PRIVATE_KEY format');
  return { url: env.SEPOLIA_RPC_URL, chainId: 11155111, accounts: key ? [key] : [], timeout: 60000 };
}

function assertDeploymentNetwork(name, chainId) {
  const expected = { hardhat: 31337n, localhost: 31337n, sepolia: 11155111n };
  if (!(name in expected) || BigInt(chainId) !== expected[name]) {
    throw new Error('Deployment network name/chain ID mismatch or unsupported network');
  }
}

module.exports = { sepoliaNetwork, assertDeploymentNetwork };
