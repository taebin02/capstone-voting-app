"""13주차 선행 작업: 최종 진단보고서 본문 초안과 근거 연결 검사.
현재 앱을 바꾸거나 과거 증거를 덮어쓰지 않는다.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
from report_document import ReportDocument

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'docs/evidence/week13'
OWASP = 'https://scs.owasp.org/sctop10/'
STRIDE = 'https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats'
LABELS = {'resolved': '해결', 'partial': '부분 해결', 'residual': '잔여 위험'}


def read_reference(ref):
    if ref.startswith('git:'):
        _, commit, filename = ref.split(':', 2)
        return subprocess.check_output(['git', 'show', f'{commit}:{filename}'], cwd=ROOT)
    return (ROOT / ref).read_bytes()


def excerpt(item, lines):
    if 'codeFunction' in item:
        start = next(i for i, line in enumerate(lines) if item['codeFunction'] in line)
        depth = 0
        for end in range(start, len(lines)):
            depth += lines[end].count('{') - lines[end].count('}')
            if depth == 0: break
        return '\n'.join(f'{i+1:3} {lines[i][4:] if lines[i].startswith("    ") else lines[i]}' for i in range(start, end + 1))
    selected = []
    for fragment in item['codeContains']:
        index = next(i for i, line in enumerate(lines) if fragment in line)
        if index not in selected: selected.append(index)
    return '\n'.join(f'{i+1:3} {lines[i].strip()}' for i in selected)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    findings = json.loads((HERE / 'final_findings.json').read_text(encoding='utf-8'))['items']
    old = json.loads((ROOT / 'docs/evidence/week12/final-evidence-index.json').read_text(encoding='utf-8'))
    old_items = {int(item['id'].split()[0]): item for item in old['items']}
    source = ROOT / 'contract/contracts/Voting.sol'
    source_lines = source.read_text(encoding='utf-8').splitlines()
    tests = (ROOT / 'contract/test/Voting.test.js').read_text(encoding='utf-8')
    names = re.findall(r'\bit\("([^"\n]+)"', tests)
    assert len(names) == 65
    assert '65 passing' in (OUT / 'regression-tests.txt').read_text(encoding='utf-8-sig')
    counts = {status: sum(f['status'] == status for f in findings) for status in LABELS}
    assert counts == {'resolved': 12, 'partial': 1, 'residual': 2}
    for item in findings:
        item['testNames'] = []
        for fragment in item['tests']:
            matches = [name for name in names if fragment in name]
            assert matches, f"No.{item['id']}: missing test {fragment}"
            item['testNames'].extend(matches)
        item['codeExcerpt'] = excerpt(item, source_lines)
    references = {ref for item in old_items.values() for ref in item['before'] + item['after']}
    references.update(['docs/evidence/week13/regression-tests.txt', 'contract/test/Voting.test.js',
                       'docs/evidence/week12/browser/result.json', 'docs/evidence/week12/verification.json',
                       'docs/evidence/week8/metamask/03-finalized-candidate-b.png',
                       'docs/evidence/week9/metamask/01-duplicate-admin-blocked.png',
                       'docs/evidence/week9/metamask/02-non-admin-removal-blocked.png',
                       'docs/evidence/week10/metamask/02-zero-votes-finalized.png',
                       'docs/evidence/week10/metamask/04-tie-finalized.png',
                       'docs/evidence/week12/browser/normal.png'])
    refs = []
    for index, ref in enumerate(sorted(references), 1):
        data = read_reference(ref)
        refs.append({'id': f'E{index:02}', 'reference': ref, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
    ids = {ref['reference']: ref['id'] for ref in refs}
    crosswalk = []
    for item in findings:
        legacy = old_items[item['id']]['finding'].split('/')[-2].strip()
        crosswalk.append({'id': item['id'], 'legacyLabel': legacy, 'owasp2026': item['owasp2026'], 'stride': item['stride'],
                          'mappingIsProjectAssessment': True})
    standards = {
        'reviewedAt': '2026-11-24', 'sources': [OWASP, STRIDE],
        'correction': 'Earlier weekly tables mixed the 2026 year with 2025-like identifiers. Logic is SC02 in 2026, while SC03 is oracle manipulation and SC10 is proxy/upgradeability. DoS is not a standalone 2026 Top 10 item.',
        'scope': 'Version/category correction, not a claim of retrospective full coverage or an official certification. Prior reports preserved.',
        'crosswalk': crosswalk,
    }
    (OUT / 'standards-review.json').write_text(json.dumps(standards, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    doc = ReportDocument(HERE / 'weekly_report_template.docx')
    doc.paragraph('블록체인 기반 전자투표시스템', size=34, bold=True, center=True, after=320)
    doc.paragraph('취약점 진단 및 보안 개선 보고서', size=40, bold=True, center=True, after=320)
    doc.paragraph('최종 제출본을 위한 본문 초안 v0.1', size=26, center=True, after=500)
    doc.table([['구분', '내용'], ['작성자', '이태빈 · 정보보호학 개인 캡스톤'], ['작성일', '2026-11-24 (13주차 작업 선행)'],
               ['진단 기준 코드', 'fc6236e · main / Voting.sol 및 현재 화면'], ['진단 현황', '15개 항목: 해결 12 · 부분 해결 1 · 잔여 위험 2'],
               ['일정', '12/2 영상 포함 전체 완성 목표, 12/4 최종 제출 마감'], ['문서 상태', '초안. 통합 최종 점검·사용자 검토·영상 촬영·제출은 남아 있음']], [2200, 7700])
    doc.paragraph('기존 팀 프로젝트의 투표 시스템을 개인 캡스톤에서 보안 관점으로 진단·개선했다. AI 도구를 활용한 코드·자동 검증 작업과 사용자의 실제 MetaMask 확인을 구분한다.')
    doc.paragraph('공개 Sepolia 배포와 실제 테스트넷 검증은 미실시다. 로컬 개발 시제품에 대한 결과이며 실제 비밀선거 적합성이나 전면적인 보안 감사를 인증하는 문서가 아니다.', bold=True)
    doc.heading('읽는 순서', 2)
    doc.paragraph('1 요약 → 2 진단 대상·흐름 → 3 방법·증거 → 4 분류 정정 → 5 항목별 진단(15건) → 6 화면 증거 → 7 잔여 위험·최종화 → 부록 증거 목록')

    doc.page('1. 진단 결과 요약')
    doc.paragraph('이 보고서는 기능의 정상 실행뿐 아니라 허용하지 않아야 할 동작을 찾아 재현하고, 조건과 상태 변경을 보완한 뒤 검증한 과정을 정리한다. 15건은 기능·설계·운영 위험을 포함한 자체 진단 항목이며 서로 독립적인 공격 15건이라는 뜻은 아니다.')
    doc.table([['분류', '건수', '판단'], ['해결', 12, '명시한 경로와 정책 범위에서 방어·동작 검증'], ['부분 해결', 1, '최초 관리자 없이 정상 2명 운영 가능, 최초 권한 회수 한계'], ['잔여 위험', 2, '투표 정보 공개·개인키 도용은 문서화했으나 기술적 위험 잔존']], [1600, 800, 7500])
    doc.heading('주요 개선', 2)
    for text in ['중요 관리 행위에 서로 다른 관리자 2명의 승인, 비상 정지·재개 적용.',
                 '선거가 한 번 시작되면 유권자·후보 등록과 재시작 차단.',
                 '관리자 중복 추가·무효 제거·최소 인원 검증을 실행 시점에 적용.',
                 '종료 후 결과를 거래로 확정·저장하고 동점·0표는 당선자 없음으로 처리.',
                 '현재 13종 이벤트와 감사 로그, 테스트·화면 증거를 연결.']:
        doc.paragraph('• ' + text)
    doc.heading('검증 숫자의 해석', 2)
    doc.paragraph('6주차 25개 → 7주차 36개 → 8주차 47개 → 9주차 57개 → 10~13주차 65개. 초기에는 취약한 동작을 기대하는 탐지 테스트가 포함됐다. 고친 뒤 거부·정책 검증으로 전환했으며, 오늘 전체 65개 통과를 다시 확인했다.')
    doc.paragraph('11주차 진단 8항목, 12주차 배포 점검 8항목·화면 설정 6경우·브라우저 3경우는 목적이 다른 별도 검증이다. 이를 합쳐 모든 위험을 해결한 테스트 수로 표시하지 않는다.')
    doc.paragraph('심각도 High/Medium/Low는 기존 프로젝트의 자체 평가이며 CVSS 계산값이 아니다. 실제 운영 전에는 선거 규모·비밀성 요구·키 운영 환경에 맞춰 다시 평가해야 한다.')

    doc.page('2. 진단 대상과 정상 동작')
    doc.table([['대상', '역할'], ['Voting.sol', '권한·선거 상태·주소당 중복 투표 방지·득표·확정'], ['Next.js 화면 / ethers v6', '지갑 연결·후보·결과·관리 제안 UI'], ['MetaMask', '선택한 계정으로 거래 서명'], ['Hardhat / Solidity 0.8.24', '로컬 체인·컴파일·격리 자동 테스트'], ['ABI / 배포 설정', '화면 호출 인터페이스, 로컬·Sepolia 설정 및 점검']], [2700, 7200])
    doc.heading('호출 흐름과 신뢰 경계', 2)
    doc.paragraph('화면 버튼 → ethers로 호출 구성 → MetaMask 서명 → RPC/노드 → 컨트랙트 조건 검사 → 상태 변경·이벤트 → 화면 재조회. 화면 비노출은 직접 RPC 호출의 권한 제한이 아니므로 최종 검사 조건은 컨트랙트에 둔다.')
    doc.paragraph('관리자: 제안·승인과 시작 전 등록. 유권자: 등록 주소로 시간 안에 1표. 외부 계정: 공개 상태 조회 및 조건 충족 후 결과 확정. 악의적 관리자·탈취된 키도 위협 모델에 포함한다.')
    doc.heading('정상 시나리오', 2)
    doc.paragraph('배포 → 두 번째 관리자 추가(초기 예외) → 후보·유권자 등록 → 시작 제안·다른 관리자 승인 → 투표 → 시간 종료 → 누구나 finalize → 저장 결과 조회. 필요하면 진행 중 정지·재개한다. 재개는 종료 시각을 늘리지 않는다.')
    doc.table([['변수', '정확한 의미'], ['endTime', '0이면 미시작, 시작 후 종료 시각 저장. 다시 0으로 만들지 않음.'], ['electionActive / paused', '진행 플래그·비상 정지. 시간만 지나도 active가 자동 변경되지는 않음.'], ['finalized / finalizedOutcome', '확정 여부와 Pending·Winner·Tie·NoVotes 유형'], ['hasVoted', '등록 주소당 참여 기록. 실제 사람당 1표를 자체 증명하지 않음.']], [2800, 7100])
    doc.paragraph('범위 밖: 실제 선거 신원 확인, 암호학적 비밀투표, 외부 RPC·MetaMask 자체 취약점 감사, 의존성 전면 감사, 대규모 가스·부하 시험, 메인넷 운영·테스트넷 실배포.')

    doc.page('3. 진단·검증 방법과 증거 해석')
    doc.heading('진단 절차', 2)
    doc.paragraph('STRIDE로 위협을 분류하고 OWASP 분류를 참고한다. 코드에서 권한·상태 경계를 검토 → 취약한 입력·상태를 자동/수동 재현 → 정책 결정 → 조건·상태 변경 보완 → 방어 기대값으로 전환 → 기존 기능 회귀 검증 → 증거 연결 순서로 진행했다.')
    doc.table([['증거 유형', '무엇을 보여주나', '한계'], ['과거 커밋 소스·테스트', '당시 조건·탐지 기대값', '기록 존재만으로 사용자 수동 실행을 증명하지 않음'], ['자동 테스트 로그', '해당 코드·시나리오의 기대값 통과/실패', '실제 지갑이나 모든 공격 경로의 안전성 아님'], ['자동 브라우저', 'UI→EIP-1193 테스트 지갑→로컬 RPC→체인', 'MetaMask 확장·실제 시간 대기와 구분'], ['실제 MetaMask 캡처+체인 기록', '사용자 브라우저 결과와 특정 거래 대조', '사진만으로 직접 RPC 호출·계정 전환까지 증명하지 않음'], ['가상 시각 실험', '종료 조건·결과 로직 재현', '실제 대기나 로컬 시계 오차 실험과 구분']], [1900, 4100, 3900])
    doc.paragraph('실행 명령: contract에서 npx.cmd hardhat test test/Voting.test.js. Hardhat 내장 체인이므로 기존 사용자 localhost 선거를 초기화하지 않는다. 13주차 선행 작업은 문서·근거 정리와 동일 코드 회귀 확인이며 새로운 실제 지갑 시험은 수행하지 않았다.')
    doc.paragraph('참고 STRIDE [S2]: 신원 위장(S), 변조(T), 행위 부인(R), 정보 공개(I), 서비스 거부(D), 권한 상승(E). 이것은 위협을 생각하는 틀이며 모든 항목의 공격을 자동으로 검사하는 제품이 아니다.')
    doc.paragraph('통과한 탐지 테스트를 그대로 안전성 근거로 쓰지 않는다. 보완 전 새 테스트의 실패에는 새 API 부재 같은 실패도 있어 이를 모두 독립 취약점으로 세지 않는다. 원문을 수정하지 않고 맥락을 설명한다.')

    doc.page('4. OWASP 버전·번호 정정과 적용 범위')
    doc.paragraph('공식 2026 목록 [S1]을 대조한 결과 기존 주간 표에 연도·번호 혼용이 있었다. 기존 SC03 로직·SC10 DoS는 2025 항목명과 일치하며 이를 2026 번호로 계속 사용하지 않는다. 과거 보고서·로그는 그대로 보존하고 이번 초안부터 아래처럼 정정한다.')
    doc.table([['기존 표기', '2026 기준 처리'], ['SC01 접근 제어', 'SC01 유지. 일부 운영·회수 위험은 인접 항목임을 명시.'], ['SC03 로직', 'SC02로 정정. 2026 SC03은 가격 오라클 조작.'], ['SC10 DoS', '2026 직접 대응 없음. 가용성은 STRIDE D로 설명.'], ['로깅·프라이버시·정보 공개', '억지로 Top 10 번호에 넣지 않고 R·I 등으로 별도 관리.']], [2800, 7100])
    doc.paragraph('개별 항목의 대응은 본 프로젝트의 분석 판단이다. OWASP가 본 시스템을 평가·승인했다거나 공식 전 항목 준수 진단을 완료했다는 의미가 아니다. 항목 수·상태·심각도는 분류 정정 때문에 바꾸지 않는다.')
    doc.table([['2026 항목', '이번 프로젝트 적용 범위'], ['SC01·SC02', '권한·업무 로직을 실제 소스·테스트로 검토'], ['SC05', '주소·후보·기간·상태 입력 검증 관점에 참고'], ['SC03·SC04', '가격 오라클·대출 연동 기능 없음. 별도 공격 실험 미실시.'], ['SC06·SC08', 'Voting.sol에 외부 상태 변경 호출 경로 없음. 전체 의존성·지갑 감사는 아님.'], ['SC07·SC09', '정수 집계 사용, 컴파일러 0.8.24. 포괄적 산술·퍼징 검증 미실시.'], ['SC10', '프록시·업그레이드 패턴 미사용. 해당 설계 감사 미실시.']], [2200, 7700])
    doc.paragraph('심각도는 공격 조건·영향을 설명하기 위한 자체 평가다. 특히 프라이버시의 기존 Low를 실제 비밀선거의 낮은 위험으로 해석하지 않는다.')

    for item in findings:
        legacy = old_items[item['id']]
        doc.page(f"5-{item['id']:02}. No.{item['id']} · {item['title']}")
        doc.table([['상태', '자체 심각도', '2026 대응 / STRIDE'], [LABELS[item['status']], item['severity'], item['owasp2026'] + ' / ' + item['stride']]], [1500, 1700, 6700])
        for title, key in [('영향과 진단 범위', 'impact'), ('원인', 'cause'), ('재현·성립 조건', 'reproduce'), ('조치', 'fix')]:
            doc.paragraph(title + ': ' + item[key], after=90)
        doc.paragraph('현재 소스의 관련 부분 (행 번호 포함)', size=18, bold=True, keep=True)
        doc.code(item['codeExcerpt'])
        doc.paragraph('검증: ' + item['verification'], after=90)
        evidence_before = ', '.join(ids[ref] for ref in legacy['before'])
        evidence_after = ', '.join(ids[ref] for ref in legacy['after'])
        doc.paragraph(f"근거: Before {evidence_before} / After {evidence_after} / 최신 회귀 {ids['docs/evidence/week13/regression-tests.txt']}", size=18)
        doc.paragraph('남은 한계: ' + item['remaining'], size=20, color='6F3518')

    doc.page('6-1. 실제 지갑 증거: 관리자 무결성')
    doc.paragraph('아래는 9주차 사용자의 실제 MetaMask 브라우저 확인 원본이다. 왼쪽은 중복 관리자 추가 승인 시 Already admin, 오른쪽은 비관리자 제거 승인 시 Not an admin이다. 실제 화면 오류와 관리자 수 4 유지·제안 미실행 기록을 대조했다.')
    doc.image_row([ROOT/'docs/evidence/week9/metamask/01-duplicate-admin-blocked.png', ROOT/'docs/evidence/week9/metamask/02-non-admin-removal-blocked.png'])
    doc.paragraph('그림 1·2. 실제 지갑 확인 화면. 원본은 수정하지 않고 DOCX 안에서 비율을 유지해 배치했다. 자료 번호와 해시는 부록·evidence-review.json 참조.', size=18)
    doc.paragraph('재시작 차단도 별도 실제 캡처·체인 기록이 있다. 위 두 장만으로 모든 관리자 경계 상황을 확인했다고 주장하지 않으며 겹친 제안·최소 인원 등은 자동 테스트로 보강한다.')

    doc.page('6-2. 실제 지갑 증거: 0표·동점 최종 결과')
    doc.paragraph('10주차 왼쪽은 0표 확정(NoVotes=3), 오른쪽은 A·B 각 1표 동점 확정(Tie=2)이다. 두 경우 모두 최종 당선자 없음으로 저장됐다. 사용자는 실제 MetaMask로 finalize를 서명했고 준비·동점 투표는 개발 계정으로 수행했다.')
    doc.image_row([ROOT/'docs/evidence/week10/metamask/02-zero-votes-finalized.png', ROOT/'docs/evidence/week10/metamask/04-tie-finalized.png'])
    doc.paragraph('그림 3·4. 실제 지갑 결과 확인 원본. 체인 초기화를 사용한 시나리오이므로 실제 대기·시각 오차 검증 증거로 사용하지 않는다. 초기 nonce 오류 복구는 환경 대응이며 별도 취약점 해결 건수로 세지 않았다.', size=18)
    doc.paragraph('0표 확정 거래: 0x2d6cbe40…67d5c20b / 동점 확정 거래: 0x862f4e3c…5a89f509. 전체 해시는 E 계열 자료의 week10/metamask/result.json에 있다. 로컬 거래이므로 공개 탐색기에 존재한다고 주장하지 않는다.')

    doc.page('6-3. 자동 검증과 기존 정상 결과의 구분')
    doc.paragraph('왼쪽은 8주차 실제 MetaMask로 후보 B 1표 후 확정한 화면, 오른쪽은 12주차 주입한 EIP-1193 테스트 지갑으로 별도 로컬 노드에서 승인→투표→확정을 검증한 화면이다. 결과가 비슷해도 검증 방법이 다르다.')
    doc.image_row([ROOT/'docs/evidence/week8/metamask/03-finalized-candidate-b.png', ROOT/'docs/evidence/week12/browser/normal.png'], max_height_mm=145)
    doc.paragraph('그림 5. 실제 지갑 확인 / 그림 6. 자동 테스트 지갑·가상 시간(그림 하단 표시). 자동 검증을 실제 MetaMask나 Sepolia의 네트워크 안정성 확인으로 대체하지 않는다.', size=18)
    doc.paragraph('12주차는 설정·배포 전 점검과 격리 로컬 검증을 완료했다. 공개 Sepolia 배포, 탐색기 영수증, 실제 테스트넷 지갑 거래는 미실시이며 그 상태를 유지한다.')

    doc.page('7. 잔여 위험과 최종화 계획')
    doc.heading('명시적으로 남겨 둔 범위', 2)
    for text in ['No.3: 최초 관리자 권한을 폐기할 수 없다. 정상 2명 운영 가능성과 회수 불가를 구분한다.',
                 'No.6: 주소·거래 입력·집계가 공개된다. 실제 비밀선거 용도로 안전하다고 판단하지 않는다.',
                 'No.7: 탈취 키를 정상 키와 구별하지 못한다. 지침 작성이 기술적 위험 소멸은 아니다.',
                 '추가 소견: 제안 만료·취소 부재, 제거된 관리자의 이전 승인 잔존. 기존 15건과 별도 관리하며 이번에 고치지 않았다.',
                 '운영 한계: 시작 전 등록은 관리자 한 명, 초기 두 번째 관리자 추가는 단독 예외. 관리자 2명 공모와 실제 신원 검증은 별도다.',
                 '확장성·배포: 후보 수가 늘면 반복 계산 비용이 커진다. 부하·퍼징·외부 의존성 전면 감사와 실제 공개 테스트넷 검증은 미실시다.']:
        doc.paragraph('• ' + text)
    doc.heading('12월 2일까지 남은 완료 조건', 2)
    doc.paragraph('본문 초안 사용자 검토 → 최종 통합 흐름과 증거 대조 → 필요한 오류 수정·재검증 → 보고서·발표 자료 확정 → 사용자 발표·시연 촬영 → 편집·내보내기·전체 재생 확인 → 제출 파일 백업. 12/4는 제출 마감이며 영상 길이·형식과 정확한 마감 시각은 학교 안내 확인이 필요하다.')
    doc.paragraph('13주차 선행 작성일은 11/24로 기록한다. 문서 초안·최신 회귀 확인 완료를 최종 통합·영상 촬영·제출 완료로 표시하지 않는다. 이후 코드가 바뀌면 본 보고서의 소스 해시·행 번호·검증 증거도 갱신한다.')
    doc.heading('결론', 2)
    doc.paragraph('권한과 시점, 결과 상태를 함께 검사해 명시한 경로를 보완하고 재현·방어·회귀 근거를 연결했다. 진단 항목 12건은 범위 내 해결, 1건은 부분 해결이며 2건은 위험을 남겨 두었다. 잔여 위험을 숨기지 않는 것이 이 시제품 진단의 결과다.')

    doc.page('부록 A. 증거 자료 식별자')
    doc.paragraph('모든 경로는 저장소 루트 기준이다. git:커밋:경로는 과거 버전을 뜻한다. 경로·과거 버전의 존재와 SHA-256을 확인했으며 파일 전체 해시는 evidence-review.json에 저장한다.')
    doc.table([['ID', '참조 경로']] + [[ref['id'], ref['reference']] for ref in refs], [900, 9000])
    doc.heading('부록 B. 공식 참고 자료', 2)
    doc.paragraph('[S1] OWASP Smart Contract Top 10:2026 — ' + OWASP)
    doc.paragraph('[S2] Microsoft Threat Modeling Tool: STRIDE — ' + STRIDE)
    doc.paragraph('열람일: 2026-11-24. 기준의 일반 분류를 참고했으며 진단 내용·심각도·대응표는 본 프로젝트의 코드·실험에 근거한 자체 판단이다. 과거 문서의 번호 혼용은 4장과 standards-review.json에 정정 기록을 남겼다.')
    doc.save(HERE / 'final_diagnosis_report_draft.docx')
    review = {'date': '2026-11-24', 'phase': 'Week13 work performed early', 'baselineCommit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
              'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'testNamesFound': len(names), 'counts': counts,
              'items': [{k: item[k] for k in ['id','title','owasp2026','stride','status','testNames']} for item in findings],
              'references': refs, 'imageCount': doc.image_count,
              'notPerformed': ['Fresh actual MetaMask verification this week','Public Sepolia deployment','Final integrated rehearsal','User review of final report','Presentation recording','Final submission']}
    (OUT/'evidence-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Draft built:', len(findings), 'findings,', len(refs), 'verified references,', doc.image_count, 'screenshots')


if __name__ == '__main__':
    main()
