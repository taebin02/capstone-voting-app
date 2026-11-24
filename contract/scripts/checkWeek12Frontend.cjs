// Frontend config boundaries + browser -> test wallet -> isolated RPC -> contract.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { ethers } = require('ethers');
const ts = require('../../frontend/node_modules/typescript');
const { chromium } = require(path.join(os.tmpdir(), 'capstone-week8-tools/node_modules/playwright'));
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');
const OUT = path.resolve(__dirname, '../../docs/evidence/week12/browser');
const RPC = 'http://127.0.0.1:28545';
const BASE = 'http://127.0.0.1:3002';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sourcePath = path.resolve(__dirname, '../../frontend/lib/networkConfig.ts');
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = new Module(sourcePath, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  loaded._compile(compiled, sourcePath);
  const { resolveVotingNetwork } = loaded.exports;
  assert.equal(resolveVotingNetwork().chainId, 31337);
  const localAddress = resolveVotingNetwork().address;
  assert.equal(resolveVotingNetwork('11155111', localAddress).chainHex, '0xaa36a7');
  assert.throws(() => resolveVotingNetwork('1', localAddress), /지원하지/);
  assert.throws(() => resolveVotingNetwork('11155111'), /배포 주소/);
  assert.throws(() => resolveVotingNetwork('31337', 'invalid'), /주소 형식/);
  assert.throws(() => resolveVotingNetwork('31337', ethers.ZeroAddress), /0주소/);
  const result = {
    date: '2026-11-24', actualSepolia: false,
    wallet: 'Injected EIP-1193 test wallet, not actual MetaMask',
    configCases: ['default local', 'Sepolia explicit address', 'unsupported chain', 'missing Sepolia address', 'invalid address', 'zero address'],
    browserCases: [], virtualTime: true,
  };
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  // This is the new week12-only node; never call hardhat_reset on the user's 8545 node.
  const owner = await provider.getSigner(0), admin2 = await provider.getSigner(1);
  const account = await admin2.getAddress();
  const voting = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy();
  await voting.waitForDeployment();
  assert.equal(await voting.getAddress(), localAddress, 'Start a fresh isolated week12 node');
  const wait = async tx => (await tx).wait();
  await wait(voting.propose(0, account, 0));
  await wait(voting.addCandidate('후보 A', '회장', '공약 A'));
  await wait(voting.addCandidate('후보 B', '회장', '공약 B'));
  await wait(voting.registerVoter(account));
  await wait(voting.propose(4, ethers.ZeroAddress, 60));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    for (const mode of ['wrong-chain', 'no-code', 'normal']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'ko-KR' });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const dialogs = [], errors = [], methods = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route('**/__week12_rpc', async route => {
          const input = route.request().postDataJSON();
          methods.push(input.method);
          const response = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
          await route.fulfill({ status: 200, contentType: 'application/json', body: await response.text() });
        });
        await page.addInitScript(({ account, mode }) => {
          window.ethereum = {
            on() {}, removeListener() {},
            async request({ method, params = [] }) {
              if (method === 'wallet_switchEthereumChain') {
                if (params[0].chainId !== '0x7a69') throw new Error('Local test config expected');
                return null;
              }
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
              if (mode === 'wrong-chain' && method === 'eth_chainId') return '0x1';
              if (mode === 'no-code' && method === 'eth_getCode') return '0x';
              const response = await fetch('/__week12_rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
              const data = await response.json();
              if (data.error) throw Object.assign(new Error(data.error.message), data.error);
              return data.result;
            },
          };
        }, { account, mode });
        const response = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
        assert.equal(response.status(), 200);
        await page.getByRole('button', { name: '지갑 연결', exact: true }).click();
        if (mode !== 'normal') {
          await page.waitForFunction(() => document.querySelector('nav button')?.textContent?.includes('지갑 연결'));
          await new Promise(resolve => { const timer = setInterval(() => { if (dialogs.length) { clearInterval(timer); resolve(); } }, 50); setTimeout(() => { clearInterval(timer); resolve(); }, 10000); });
          assert.equal(dialogs.length, 1);
          assert.match(dialogs[0], mode === 'wrong-chain' ? /체인이 설정과 일치/ : /컨트랙트가 없습니다/);
          assert.equal(methods.includes('eth_sendTransaction'), false);
        } else {
          await page.getByText(account.slice(0, 6) + '...' + account.slice(-4), { exact: true }).waitFor();
          await page.getByRole('button', { name: '관리자', exact: true }).click();
          await page.getByRole('button', { name: '승인', exact: true }).click();
          await page.getByText('승인했습니다', { exact: true }).waitFor();
          assert.equal(await voting.electionActive(), true);
          await page.getByRole('button', { name: '투표하기', exact: true }).first().click();
          await page.getByRole('button', { name: '투표하기', exact: true }).nth(2).click();
          await page.getByText('투표가 완료되었습니다 ✓', { exact: true }).waitFor();
          assert.equal((await voting.candidates(1)).voteCount, 1n);
          await page.getByRole('button', { name: '실시간 결과', exact: true }).click();
          await page.screenshot({ path: path.join(OUT, 'normal-voted.png'), fullPage: true });
          const end = Number(await voting.endTime());
          await provider.send('evm_setNextBlockTimestamp', [end + 1]);
          await provider.send('evm_mine', []);
          const offset = (end + 2) * 1000 - Date.now();
          await page.evaluate(offset => { const now = Date.now.bind(Date); Date.now = () => now() + offset; }, offset);
          await page.getByRole('button', { name: '결과 확정', exact: true }).click();
          await page.getByText('🏆 최종 당선자', { exact: true }).waitFor();
          assert.equal(await voting.getWinner(), '후보 B');
          assert.equal(await voting.finalizedOutcome(), 1n);
          assert.deepEqual(dialogs, []);
        }
        await page.evaluate(() => {
          const label = document.createElement('div');
          label.textContent = '12주차 자동 검증 | 로컬 28545 · EIP-1193 테스트 지갑 · 가상 시간 | 실제 Sepolia/MetaMask 아님';
          label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#172554;color:white;padding:8px;font:13px sans-serif;text-align:center;z-index:99999';
          document.body.appendChild(label);
        });
        await page.screenshot({ path: path.join(OUT, `${mode}.png`), fullPage: true });
        assert.deepEqual(errors, []);
        result.browserCases.push({ mode, status: 'passed', dialogs, pageErrors: errors, transactionSent: methods.includes('eth_sendTransaction') });
        console.log('PASS:', mode);
      } finally { await context.close(); }
    }
    result.status = 'passed';
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
