// 별도 Hardhat 노드 18545 및 frontend 3000에서 실행한다.
// TEMP/capstone-week8-tools에 설치한 playwright와 Edge를 사용한다.
// EIP-1193 테스트 지갑 + 가상 시각이며 실제 MetaMask 또는 실제 대기 실험이 아니다.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { chromium } = require(path.join(process.env.WEEK8_TOOLS_DIR || path.join(os.tmpdir(), 'capstone-week8-tools'), 'node_modules/playwright'));
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');
const OUT = path.resolve(__dirname, '../../docs/evidence/week10/browser');
const RPC = 'http://127.0.0.1:18545';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const results = { wallet: 'Injected EIP-1193 test wallet, not MetaMask extension', virtualTime: true, network: RPC, scenarios: [] };
  try {
    for (const kind of ['winner', 'tie', 'zero', 'paused']) {
      const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
      assert.equal((await provider.getNetwork()).chainId, 31337n);
      await provider.send('hardhat_reset', []);
      await provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000) - 20]);
      const owner = await provider.getSigner(0), admin2 = await provider.getSigner(1), voter = await provider.getSigner(2);
      const account = await owner.getAddress();
      const voting = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy();
      await voting.waitForDeployment();
      assert.equal(await voting.getAddress(), '0x5FbDB2315678afecb367f032d93F642f64180aa3');
      const tx = async promise => (await promise).wait();
      await tx(voting.propose(0, admin2.getAddress(), 0));
      await tx(voting.addCandidate('후보 A', '회장', '공약 A'));
      await tx(voting.addCandidate('후보 B', '회장', '공약 B'));
      await tx(voting.registerVoter(account));
      await tx(voting.registerVoter(voter.getAddress()));
      await tx(voting.propose(4, ethers.ZeroAddress, 1));
      await tx(voting.connect(admin2).approve(1));
      if (kind === 'tie') {
        await tx(voting.vote(0));
        await tx(voting.connect(voter).vote(1));
      } else if (kind !== 'zero') await tx(voting.vote(1));
      if (kind === 'paused') {
        await tx(voting.propose(2, ethers.ZeroAddress, 0));
        await tx(voting.connect(admin2).approve(2));
      }
      const end = Number(await voting.endTime());
      if (kind !== 'paused') {
        await provider.send('evm_setNextBlockTimestamp', [end + 1]);
        await provider.send('evm_mine', []);
      }
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        const errors = [], rpcErrors = [], dialogs = [];
        results.current = { kind, pageErrors: errors, rpcErrors, dialogs };
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route('**/__week10_rpc', async route => {
          const response = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() });
          const body = await response.text();
          const parsed = JSON.parse(body);
          if (parsed.error) rpcErrors.push(parsed.error.message);
          await route.fulfill({ status: 200, contentType: 'application/json', body });
        });
        await page.addInitScript(({ account, offset }) => {
          const NativeDate = Date;
          window.Date = class extends NativeDate {
            constructor(...args) { if (args.length === 0) super(NativeDate.now() + offset); else super(...args); }
            static now() { return NativeDate.now() + offset; }
          };
          window.ethereum = {
            on() {}, removeListener() {},
            async request({ method, params = [] }) {
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
              if (method === 'wallet_switchEthereumChain') {
                if (params[0].chainId.toLowerCase() !== '0x7a69') throw new Error('Local chain only');
                return null;
              }
              const response = await fetch('/__week10_rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
              const data = await response.json();
              if (data.error) throw Object.assign(new Error(data.error.message), data.error);
              return data.result;
            }
          };
        }, { account, offset: kind === 'paused' ? 0 : (end + 2) * 1000 - Date.now() });
        // 첫 컴파일 직후 SSR 버튼이 보이더라도 지갑 연결 핸들러가 준비될 때까지 기다린다.
        const response = await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 90000 });
        assert.equal(response.status(), 200);
        await page.getByRole('button', { name: '지갑 연결', exact: true }).click();
        await page.getByText(account.slice(0, 6) + '...' + account.slice(-4), { exact: true }).waitFor();
        await page.getByRole('button', { name: '실시간 결과', exact: true }).click();
        await page.evaluate(() => {
          const label = document.createElement('div');
          label.textContent = '10주차 자동 브라우저 검증 | EIP-1193 테스트 지갑 · 가상 시각 | 실제 MetaMask와 구분';
          label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:8px;background:#172554;color:white;text-align:center;font:13px sans-serif;z-index:99999';
          document.body.appendChild(label);
        });
        const record = { kind, pageErrors: errors, rpcErrors, dialogs };
        if (kind === 'paused') {
          await page.getByText('최종 결과는 관리자 검토 후 공개됩니다', { exact: true }).waitFor();
          await assert.rejects(voting.getWinner(), error => (error.reason || error.message).includes('Result not finalized'));
          assert.equal(await page.getByRole('button', { name: '결과 확정', exact: true }).count(), 0);
          record.unfinalizedWinnerLookup = 'rejected';
        } else {
          await page.getByRole('button', { name: '결과 확정', exact: true }).waitFor();
          await page.screenshot({ path: path.join(OUT, `${kind}-before-finalize.png`), fullPage: true });
          await page.getByRole('button', { name: '결과 확정', exact: true }).click();
          const text = kind === 'winner' ? '🏆 최종 당선자' : kind === 'tie' ? '최다 득표가 동점입니다.' : '투표가 한 표도 없습니다.';
          await page.getByText(text, { exact: true }).waitFor();
          record.outcome = Number(await voting.finalizedOutcome());
          record.winner = await voting.getWinner();
          assert.equal(record.outcome, { winner: 1, tie: 2, zero: 3 }[kind]);
          assert.equal(record.winner, kind === 'winner' ? '후보 B' : '');
          if (kind !== 'winner') assert.equal(await page.getByText('🏆 최종 당선자', { exact: true }).count(), 0);
        }
        await page.screenshot({ path: path.join(OUT, `${kind}-result.png`), fullPage: true });
        assert.deepEqual(errors, []);
        assert.deepEqual(rpcErrors, []);
        assert.deepEqual(dialogs, []);
        record.status = 'passed';
        results.scenarios.push(record);
        console.log('PASS:', kind);
      } catch (error) {
        await context.pages()[0]?.screenshot({ path: path.join(OUT, `${kind}-failure.png`), fullPage: true });
        throw error;
      } finally { await context.close(); }
    }
    results.status = 'passed';
  } catch (error) {
    results.status = 'failed'; results.failure = error.message; throw error;
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 2) + '\n');
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
