const hre = require('hardhat');
const { preflight } = require('../lib/deployment.cjs');

preflight(hre).then(({ report }) => console.log(JSON.stringify(report, null, 2))).catch(() => {
  console.error('사전 점검 실패: 네트워크·전용 테스트 계정·잔액·가스 설정을 확인하세요. 거래는 전송하지 않았습니다.');
  process.exitCode = 1;
});
