// 실행 전: 별도 Hardhat 노드를 18545, frontend를 3000 포트에서 실행.
// Playwright는 프로젝트 의존성을 바꾸지 않고 TEMP/capstone-week8-tools에 설치한다.
// npm.cmd install --prefix "$env:TEMP/capstone-week8-tools" playwright
// node scripts/checkWeek8Browser.cjs
// 회귀 변형: $env:WEEK8_FORCE_STALE_ESTIMATE='1' 설정 후 같은 명령 실행.
// 실제 MetaMask 확장이 아닌 EIP-1193 테스트 지갑을 사용한다. 개발 계정만 사용한다.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { chromium } = require(path.join(process.env.WEEK8_TOOLS_DIR || path.join(os.tmpdir(), 'capstone-week8-tools'), 'node_modules/playwright'));

const ROOT = path.resolve(__dirname, '../..');
const FORCE_STALE_ESTIMATE = process.env.WEEK8_FORCE_STALE_ESTIMATE === '1';
const OUT = path.join(ROOT, 'docs/evidence/week8', FORCE_STALE_ESTIMATE ? 'browser-stale-estimate' : 'browser');
const RPC = 'http://127.0.0.1:18545';
const BASE = 'http://127.0.0.1:3000';
const artifact = require('../artifacts/contracts/Voting.sol/Voting.json');
const results = { wallet: 'Injected EIP-1193 test wallet; NOT MetaMask extension', network: RPC, realTimeWait: true, checks: [], dialogs: [], errors: [] };
results.estimateBlockTag = FORCE_STALE_ESTIMATE ? 'finalize estimates explicitly use latest block to reproduce stale estimation' : 'node default';
fs.mkdirSync(OUT, { recursive: true });

async function eventually(fn, label, timeout = 20000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeout) throw new Error(`시간 초과: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  console.log('PASS:', label);
  results.checks.push(label);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const owner = await provider.getSigner(0), admin2 = await provider.getSigner(1);
  const ownerAddress = await owner.getAddress(), admin2Address = await admin2.getAddress();
  // 18545의 전용 검증 체인만 초기화한다. 사용자의 기본 8545 체인에는 접근하지 않는다.
  await provider.send('hardhat_reset', []);
  // reset은 노드 기동 당시의 genesis 시각을 복구하므로 준비 시점의 실제 시각에 맞춘다.
  // 이 준비 이후 종료까지 시간을 앞당기는 RPC는 사용하지 않는다.
  await provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000)]);
  const voting = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy();
  await voting.waitForDeployment();
  assert.equal(await voting.getAddress(), '0x5FbDB2315678afecb367f032d93F642f64180aa3');
  results.contract = await voting.getAddress();
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    async function makePage(account) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      await page.route('**/__week8_rpc', async route => {
        const request = JSON.parse(route.request().postData());
        if (FORCE_STALE_ESTIMATE && request.method === 'eth_estimateGas' && request.params[0].data === voting.interface.getFunction('finalize').selector) {
          request.params[1] = 'latest';
        }
        const response = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        const body = await response.text();
        if (request.method === 'eth_estimateGas' || request.method === 'eth_sendTransaction') {
          results.rpc = results.rpc || [];
          const reply = JSON.parse(body);
          results.rpc.push({ method: request.method, gas: request.params?.[0]?.gas, result: reply.result, error: reply.error?.message });
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body });
      });
      await page.addInitScript(({ account }) => {
        window.ethereum = {
          on() {}, removeListener() {},
          async request({ method, params = [] }) {
            if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
            if (method === 'wallet_switchEthereumChain') {
              if (params[0].chainId.toLowerCase() !== '0x7a69') throw new Error('검증 체인만 허용');
              return null;
            }
            const response = await fetch('/__week8_rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
            const data = await response.json();
            if (data.error) throw Object.assign(new Error(data.error.message), data.error);
            return data.result;
          }
        };
      }, { account });
      page.on('pageerror', error => results.errors.push(error.message));
      page.on('dialog', async dialog => {
        results.dialogs.push({ type: dialog.type(), message: dialog.message() });
        await dialog.accept();
      });
      await page.goto(BASE);
      await page.getByRole('button', { name: '지갑 연결', exact: true }).click();
      await page.getByText(`${account.slice(0, 6)}...${account.slice(-4)}`, { exact: true }).waitFor();
      return page;
    }
    async function screenshot(page, filename) {
      await page.evaluate(() => {
        if (!document.getElementById('week8-evidence-label')) {
          const label = document.createElement('div');
          label.id = 'week8-evidence-label';
          label.textContent = '자동 브라우저 검증 | EIP-1193 테스트 지갑 | 실제 MetaMask 서명 창은 별도 확인';
          label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:8px;background:#172554;color:white;text-align:center;font:13px sans-serif;z-index:99999';
          document.body.appendChild(label);
        }
      });
      await page.screenshot({ path: path.join(OUT, filename), fullPage: true });
    }
    const page = await makePage(ownerAddress);
    await page.getByRole('button', { name: '관리자', exact: true }).click();
    for (const name of ['후보 A', '후보 B']) {
      await page.getByPlaceholder('이름', { exact: true }).fill(name);
      await page.getByPlaceholder('직책 (예: 회장)').fill('회장');
      await page.getByPlaceholder('공약 입력').fill(`${name} 공약`);
      await page.getByRole('button', { name: '후보 추가', exact: true }).click();
      await eventually(async () => Number(await voting.getCandidateCount()) === (name === '후보 A' ? 1 : 2), `${name} 화면 등록`);
    }
    await page.getByPlaceholder('지갑 주소 (0x...)', { exact: true }).fill(ownerAddress);
    await page.getByRole('button', { name: '등록하기', exact: true }).click();
    await eventually(() => voting.registeredVoters(ownerAddress), '유권자 화면 등록');
    await page.getByPlaceholder('새 관리자 지갑 주소 (0x...)').fill(admin2Address);
    await page.getByRole('button', { name: '추가 제안', exact: true }).click();
    await eventually(async () => Number(await voting.adminCount()) === 2, '두 번째 관리자 화면 추가');
    await page.getByPlaceholder('투표 시간 (분)').fill('2');
    await page.getByRole('button', { name: '선거 시작 제안', exact: true }).click();
    await page.getByText('승인 1 / 2', { exact: true }).waitFor();
    assert.equal(await voting.electionActive(), false);
    await screenshot(page, '01-proposal-pending.png');
    const secondPage = await makePage(admin2Address);
    await secondPage.getByRole('button', { name: '관리자', exact: true }).click();
    await secondPage.getByRole('button', { name: '승인', exact: true }).click();
    await eventually(() => voting.electionActive(), '다른 관리자의 화면 승인 후 선거 시작');
    await page.getByRole('button', { name: '투표하기', exact: true }).click();
    await page.getByRole('button', { name: '투표하기', exact: true }).nth(2).click();
    await eventually(() => voting.hasVoted(ownerAddress), '화면에서 후보 B 투표');
    await screenshot(page, '02-voted.png');
    await page.getByRole('button', { name: '관리자', exact: true }).click();
    await page.getByPlaceholder('지갑 주소 (0x...)', { exact: true }).fill(admin2Address);
    await page.getByRole('button', { name: '등록하기', exact: true }).click();
    await eventually(async () => results.dialogs.some(d => d.message.includes('선거가 시작된 후에는 유권자를 등록할 수 없습니다')), '선거 시작 후 유권자 등록 차단 알림');
    assert.equal(await voting.registeredVoters(admin2Address), false);
    await page.getByPlaceholder('이름', { exact: true }).fill('차단 후보');
    await page.getByPlaceholder('직책 (예: 회장)').fill('회장');
    await page.getByPlaceholder('공약 입력').fill('등록 차단 검증');
    await page.getByRole('button', { name: '후보 추가', exact: true }).click();
    await eventually(async () => results.dialogs.some(d => d.message.includes('선거가 시작된 후에는 후보를 추가할 수 없습니다')), '선거 시작 후 후보 등록 차단 알림');
    await page.getByRole('button', { name: '강제 종료 제안', exact: true }).click();
    await eventually(async () => Number(await voting.getProposalCount()) === 3, '비상 정지 화면 제안');
    await secondPage.getByRole('button', { name: '투표하기', exact: true }).first().click();
    await secondPage.getByRole('button', { name: '관리자', exact: true }).click();
    await secondPage.getByRole('button', { name: '승인', exact: true }).click();
    await eventually(() => voting.paused(), '비상 정지 화면 승인');
    await page.getByRole('button', { name: '실시간 결과', exact: true }).click();
    await page.getByText('최종 결과는 관리자 검토 후 공개됩니다', { exact: true }).waitFor();
    assert.equal(await page.getByText('🏆 최종 당선자', { exact: true }).count(), 0);
    await screenshot(page, '03-paused-result-hidden.png');
    await page.getByRole('button', { name: '관리자', exact: true }).click();
    await page.getByRole('button', { name: '선거 재개 제안', exact: true }).click();
    await eventually(async () => Number(await voting.getProposalCount()) === 4, '재개 화면 제안');
    await secondPage.getByRole('button', { name: '투표하기', exact: true }).first().click();
    await secondPage.getByRole('button', { name: '관리자', exact: true }).click();
    await secondPage.getByRole('button', { name: '승인', exact: true }).click();
    await eventually(async () => !(await voting.paused()), '재개 화면 승인');
    await page.getByRole('button', { name: '실시간 결과', exact: true }).click();
    results.lastBlockBeforeWait = await provider.getBlockNumber();
    results.endTime = Number(await voting.endTime());
    results.waitStartedAt = new Date().toISOString();
    console.log('자연 종료 대기: 거래 없이 실제 시각으로 종료 버튼 확인 중');
    await page.getByRole('button', { name: '결과 확정', exact: true }).waitFor({ timeout: 150000 });
    assert.equal(await provider.getBlockNumber(), results.lastBlockBeforeWait);
    assert.equal(await voting.finalized(), false);
    results.checks.push('추가 블록 없이 실제 시간 경과로 결과 확정 버튼 표시');
    await screenshot(page, '04-ended-before-finalize.png');
    await page.getByRole('button', { name: '결과 확정', exact: true }).click();
    await page.getByText('체인에 확정된 결과입니다', { exact: true }).waitFor();
    assert.equal(await voting.getWinner(), '후보 B');
    if (FORCE_STALE_ESTIMATE) {
      assert.ok(results.rpc.some(item => item.method === 'eth_estimateGas' && item.error?.includes('Election still active')));
      assert.ok(results.rpc.some(item => item.method === 'eth_sendTransaction' && item.gas === '0x2dc6c0'));
      results.checks.push('latest 블록 가스 추정 실패 후 명시한 가스 예산으로 확정 성공');
    }
    await screenshot(page, '05-finalized-winner.png');
    results.checks.push('화면 finalize 거래 후 후보 B 당선자 표시');
    const logs = await voting.queryFilter('*', 0, 'latest');
    results.eventTypes = [...new Set(logs.map(l => l.eventName))];
    results.transactionHashes = [...new Set(logs.map(l => l.transactionHash))];
    results.completedAt = new Date().toISOString();
    assert.deepEqual(results.errors, []);
    results.status = 'passed';
  } catch (error) {
    results.status = 'failed';
    results.failure = error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
