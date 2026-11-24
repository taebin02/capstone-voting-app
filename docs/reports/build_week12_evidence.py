"""최종 진단보고서용 항목별 증거 연결 목록. 최종 보고서 자체는 아니다."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import subprocess
import xml.etree.ElementTree as E
from generate_week11_reports import N
from generate_week8_reports import section, table, save

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/evidence/week12'


def main():
    with ZipFile(ROOT / 'docs/reports/vulnerability_report_week11.docx') as archive:
        tree = E.fromstring(archive.read('word/document.xml'))
    rows = [[''.join(t.text or '' for t in cell.findall('.//w:t', N)) for cell in row.findall('w:tc', N)]
            for row in tree.findall('.//w:tbl/w:tr', N)][1:]
    # diagnosis, before evidence, action, after evidence, remaining limitation
    specs = [
        ('STRIDE DoS·소스 검토', ['git:17fbc7a:contract/contracts/Voting.sol'], '비상 정지·재개 후 멀티시그 적용', ['docs/evidence/week8/tests.txt'], '과거 화면이 없어 Before 소스로 확인. 공모·키 탈취 위험 별도.'),
        ('수동 관찰·시간 조건 분석', ['docs/evidence/week8/browser/before-finalize-estimation.json'], 'finalize 저장 및 오래된 블록의 가스 추정 경로 보완', ['docs/evidence/week8/metamask/result.json', 'docs/evidence/week12/regression-tests.txt'], '7주차 시간 재현 수치는 이전 작업 환경 측정. 8주차 실제 확인과 구분.'),
        ('STRIDE DoS·권한 검토', ['git:17fbc7a:contract/contracts/Voting.sol'], '관리자 3명 중 다른 2명으로 운영 가능', ['docs/evidence/week11/risk-observations.json'], '최초 관리자 제거 불가. 정상 키 2개 미만이면 복구 보장 불가.'),
        ('STRIDE 권한 상승·코드 검토', ['git:17fbc7a:contract/contracts/Voting.sol'], '관리자 제거도 2명 승인', ['docs/evidence/week8/tests.txt'], '2명 공모나 과거 승인 처리까지 해결하지 않음.'),
        ('STRIDE 행위 추적·ABI 분석', ['git:17fbc7a:contract/contracts/Voting.sol'], '현재 이벤트 13종 및 기록 검증', ['docs/evidence/week10/demo-audit-log.txt'], '현재 제공 함수 범위. 로그는 행위 자체의 정당성을 보장하지 않음.'),
        ('정보 공개·거래 입력 분석', ['contract/contracts/Voting.sol'], '공개 경로 재현, 익명 투표는 후속 과제로 문서화', ['docs/evidence/week11/risk-observations.json', 'docs/reports/security_guide_week11.pdf'], '기술적 미해결. 주소와 선택 연결 가능.'),
        ('신원 위장·임시 키 복사 실험', ['contract/contracts/Voting.sol'], '예방·사고 대응 지침 및 기존 통제 범위 확인', ['docs/evidence/week11/risk-observations.json', 'docs/reports/security_guide_week11.pdf'], '탈취 키의 서명 구별 불가. 실제 사용자 키 보관·복구 훈련은 미검증.'),
        ('6주차 자동 재현', ['git:da70115:contract/test/Voting.test.js'], 'beforeElection으로 시작 후 유권자 등록 차단', ['docs/evidence/week12/regression-tests.txt'], '주소와 사람의 일치, 시작 전 명부 정확성은 운영 절차 필요.'),
        ('6주차 자동 재현', ['git:da70115:contract/test/Voting.test.js'], 'beforeElection으로 시작 후 후보 추가 차단', ['docs/evidence/week12/regression-tests.txt'], '최초 후보 내용의 사실성은 별도 확인.'),
        ('6주차 재현·9주차 방어 전후 비교', ['docs/evidence/week9/before-defense-tests.txt'], '실행 시 중복·0주소 추가 거부', ['docs/evidence/week9/after-tests.txt', 'docs/evidence/week9/metamask/result.json'], '실행 때 거부되는 무효 제안이 대기 목록에 남을 수 있음.'),
        ('6주차 재현·9주차 방어 전후 비교', ['docs/evidence/week9/before-defense-tests.txt'], '실제 관리자 여부와 최소 인원 검사', ['docs/evidence/week9/after-tests.txt', 'docs/evidence/week9/metamask/result.json'], '최초 관리자 제거 불가 정책은 유지.'),
        ('6주차 재현·9주차 방어 전후 비교', ['docs/evidence/week9/before-defense-tests.txt'], 'endTime == 0으로 모든 재시작 차단', ['docs/evidence/week9/after-tests.txt', 'docs/evidence/week9/metamask/result.json'], '한 컨트랙트당 선거 1회. 재선거는 새 배포.'),
        ('6주차 후보 0명 재현', ['git:da70115:contract/test/Voting.test.js'], 'finalize에서 후보 존재 조건 검사', ['docs/evidence/week12/regression-tests.txt'], '후보 0명 선거 시작 자체를 차단한 것은 아님.'),
        ('자동 재현·정책 검토', ['docs/evidence/week10/before-outcome-defense.txt'], '동점·0표 당선자 없음, 결과 사유 저장', ['docs/evidence/week10/after-tests.txt', 'docs/evidence/week10/metamask/result.json'], 'Before 실패에는 새 getter·이벤트 부재도 포함. 독립 취약점 수로 세지 않음.'),
        ('정지 중 조회 재현', ['docs/evidence/week10/before-disclosure-defense.txt'], 'getWinner의 미확정 예외 제거', ['docs/evidence/week10/after-tests.txt', 'docs/evidence/week10/metamask/paused-check.json'], '공개 득표·거래 입력까지 숨기는 조치 아님.'),
    ]
    assert len(rows) == len(specs) == 15
    items = []
    for row, spec in zip(rows, specs):
        number = int(row[0].split()[0])
        diagnosis, before, action, after, limit = spec
        status = 'partial' if number == 3 else 'residual' if number in (6, 7) else 'resolved'
        items.append({'id': row[0], 'finding': row[1], 'status': status, 'diagnosis': diagnosis,
                      'before': before, 'action': action, 'after': after, 'remaining': limit})
    references = sorted({ref for item in items for ref in item['before'] + item['after']})
    verified = []
    for ref in references:
        if ref.startswith('git:'):
            _, commit, filename = ref.split(':', 2)
            data = subprocess.check_output(['git', 'show', f'{commit}:{filename}'], cwd=ROOT)
            kind = 'historical source/test'
        else:
            data = (ROOT / ref).read_bytes()
            kind = 'working tree artifact'
        verified.append({'reference': ref, 'kind': kind, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'final-evidence-index.json').write_text(json.dumps({
        'date': '2026-11-24', 'purpose': 'Evidence navigation for final report; reference presence/hashes verified, not a new independent security audit',
        'counts': {'resolved': 12, 'partial': 1, 'residual': 2}, 'items': items, 'references': verified,
        'additionalReview': ['Proposal expiration/cancellation absent', 'Removed administrators previous approvals retained'],
        'actualSepoliaDeployment': False,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    reference_ids = {ref: f'R{index:02}' for index, ref in enumerate(references, 1)}
    matrix = [['No.', '진단·Before 자료 번호', '조치·After 자료 번호', '현재 상태·남은 한계']]
    for item in items:
        matrix.append([item['id'], item['finding'] + ' / 진단: ' + item['diagnosis'] + ' / Before: ' + ', '.join(reference_ids[ref] for ref in item['before']),
                       item['action'] + ' / After: ' + ', '.join(reference_ids[ref] for ref in item['after']), item['status'] + ' / ' + item['remaining']])
    intro = section('최종 진단보고서용 증거 연결 목록', '이태빈 | 2026-11-24 | 해결 12 · 부분 해결 1 · 잔여 위험 2',
                    f'최종 보고서 작성 자료다. 총 {len(verified)}개 참조의 존재와 SHA-256 해시를 final-evidence-index.json에 기록했다. 과거 실험 전체를 새로 독립 재진단했다는 뜻은 아니다.',
                    '실제 사용자 지갑·자동 테스트 지갑·가상 시각은 각 원문에 따라 구분한다. 제안 만료·취소 부재와 제거된 관리자의 과거 승인 잔존은 별도 검토 소견이며 기존 15건에 추가 합산하지 않는다.')
    appendix = section('자료 번호와 실제 경로', 'git:커밋:경로는 과거 버전 소스·테스트를 뜻한다. 나머지는 저장소 루트 기준 파일 경로다.')
    appendix += table([['번호', '참조 경로']] + [[reference_ids[ref], ref] for ref in references], [900, 13100])
    save('final_evidence_index_week12.docx', intro + table(matrix, [800, 4100, 5100, 4000]) + appendix, landscape=True)
    print('Verified references:', len(verified))


if __name__ == '__main__':
    main()
