"""주차별 제출 문서 생성. Python 표준 라이브러리만 사용한다.
실행: python docs/reports/generate_week8_reports.py
"""
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

OUT = Path(__file__).resolve().parent
DATE = '2026-10-24'


def paragraph(text, heading=False):
    props = '<w:pPr><w:keepNext/></w:pPr>' if heading else ''
    bold = '<w:b/>' if heading else ''
    size = '28' if heading else '20'
    return (f'<w:p>{props}<w:r><w:rPr>{bold}<w:rFonts w:ascii="Malgun Gothic" '
            f'w:eastAsia="맑은 고딕"/><w:sz w:val="{size}"/></w:rPr>'
            f'<w:t xml:space="preserve">{escape(str(text))}</w:t></w:r></w:p>')


def table(rows, widths):
    grid = ''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    body = ''
    for index, row in enumerate(rows):
        cells = ''
        for text, width in zip(row, widths):
            shade = '<w:shd w:fill="E8EFF7"/>' if index == 0 else ''
            cells += (f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shade}'
                      f'</w:tcPr>{paragraph(text)}</w:tc>')
        repeat = '<w:tblHeader/>' if index == 0 else ''
        body += f'<w:tr><w:trPr>{repeat}<w:cantSplit/></w:trPr>{cells}</w:tr>'
    borders = ''.join(f'<w:{side} w:val="single" w:sz="4" w:color="B8C3D1"/>'
                      for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/>'
            f'<w:tblLayout w:type="fixed"/><w:tblBorders>{borders}</w:tblBorders>'
            f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{body}</w:tbl>')


def save(name, body, landscape=False):
    page = ('w:w="15840" w:h="12240" w:orient="landscape"' if landscape
            else 'w:w="11906" w:h="16838"')
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                f'<w:body>{body}<w:sectPr><w:pgSz {page}/><w:pgMar w:top="900" '
                f'w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body></w:document>')
    with ZipFile(OUT / name, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?>'
                         '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                         '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                         '<Default Extension="xml" ContentType="application/xml"/>'
                         '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0"?>'
                         '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                         '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr('word/document.xml', document)
    print(OUT / name)


def section(title, *texts):
    return paragraph(title, True) + ''.join(paragraph(text) for text in texts)


def main():
    report = section('8주차 추진내용 — 블록체인 기반 전자투표시스템',
                     f'기준일: {DATE} / 진단 No.5 이벤트 로깅 보완 및 No.3·4·15 증거 보강',
                     '목표: 관리 및 투표 행위를 전용 이벤트로 추적하고, 진단 → 근거 → 조치 → 검증 자료를 저장소에 남긴다.')
    report += section('1. 진단 및 Before 근거',
                      '7주차 기준 커밋 5d29146에는 이벤트가 6종이다. registerVoter, addCandidate, vote에는 전용 이벤트가 없다.',
                      '관리자 변경·선거 시작은 기존 제안/승인/실행 로그로 간접 추적할 수 있었으므로, 모든 행위가 추적 불가능했던 것은 아니다.',
                      '이번 조치는 전용 이벤트 부재와 기존 이벤트 검증 부족을 보완한다. 기존 소스는 git show 5d29146:contract/contracts/Voting.sol로 확인한다.')
    report += section('2. 구현 및 기록 정책',
                      'VoterRegistered, CandidateAdded, Voted, AdminAdded, AdminRemoved, ElectionStarted를 추가해 6종에서 12종으로 확대했다.',
                      '등록·후보 추가는 실행자와 대상, 관리자 변경·선거 시작은 제안 번호와 반영값을 기록한다. 제안 이벤트와 연결하면 제안자와 승인자를 추적할 수 있다.',
                      '중복 유권자 등록은 상태를 바꾸지 않으므로 이벤트를 다시 남기지 않는다. 실패한 거래의 이벤트는 체인에 남지 않는다.',
                      'Voted는 투표자 주소와 블록 시각만 포함한다. 후보 번호를 이벤트에서 제외해 검색 편의에 따른 노출을 줄였지만, 거래 입력·공개 득표·hasVoted로 추론할 수 있어 익명성 해결로 평가하지 않는다.')
    report += section('3. 검증',
                      'Voting 테스트 36 → 47개: 이벤트 검증 8개, 멀티시그 증거 보강 2개, No.15 탐지 1개 추가.',
                      '47 passing에는 남은 취약점 재현 5개(V-C, V-D, V-E, V-G, No.15)가 포함된다. 이 5개 통과는 취약점 존재의 근거다.',
                      'No.4: 관리자 제거가 승인 1/2에서는 대기하고 2/2에서 실행됨을 검증했다.',
                      'No.3: 관리자 3명일 때 최초 관리자 없이 다른 2명만으로 비상 정지를 실행했다. 최초 관리자 제거 불가 정책과 2인 운영 시 키 분실 위험은 남아 있어 부분 해결이다.',
                      'No.15: 미확정·정지 상태에서 외부 계정이 선두 후보 B를 조회하는 동작을 명시적으로 재현했다. 이번 주에는 탐지 근거만 보강했다.')
    report += section('4. 감사 로그 및 시연',
                      'auditLog.js는 이벤트를 블록·로그 순서로 출력하고 거래 해시와 로그 순번을 포함한다. 시각은 UTC이며, 노드의 가상 시각 이동은 실제 실행 시각과 구분한다.',
                      'demoScenario.js는 기본 Hardhat 메모리 체인에 새 컨트랙트를 배포한다. 관리자 추가/제거 → 등록 → 시작 → 투표 → 정지 → 재개 → 투표 → 확정을 거쳐 12종 이벤트와 당선자 B를 검사한다.',
                      '시연은 evm_setNextBlockTimestamp로 종료 시각을 넘긴다. 실제 2분 대기 실험이나 7주차 시계 불일치 재현 증거로 사용하지 않는다.',
                      '기존 localhost 선거와 MetaMask 상태를 건드리지 않도록 시연은 hardhat 네트워크에서만 허용한다.')
    report += section('5. 화면 검증과 증거',
                      'docs/evidence/week8/tests.txt: 현재 PC의 도구 실행으로 저장한 자동 테스트 원문.',
                      'docs/evidence/week8/demo-audit-log.txt: 가상 시각을 사용하는 격리 시연과 감사 로그 원문.',
                      'frontend/lib/Voting.json 동기화 및 TypeScript 타입 검사를 완료했다. 별도 로컬 체인(18545)과 Edge 브라우저에서 등록 → 승인 → 투표 → 정지·재개 → 확정 흐름을 검증하고 캡처를 저장했다.',
                      '자동 브라우저 검증은 EIP-1193 테스트 지갑을 사용했다. 이후 실제 MetaMask에서도 사용자가 시작 승인, 후보 B 1표, 자동 종료 후 확정 버튼, 확정 후 최종 당선자 B를 확인했다. 대화의 캡처 3장과 투표·확정 거래를 대조해 검증 완료로 갱신했다. 계정 전환은 별도 미확인이다.',
                      '앞선 0표 수동 선거는 V-G 정책에 따라 후보 A가 선택된 사례로 별도 보존했다. 최신 실제 투표 결과는 후보 B 1표·확정이며, docs/evidence/week8/metamask/result.json에 거래 원본과 검증 결과를 저장했다.',
                      '자연 종료까지 추가 거래 없이 실제로 대기했으며, 첫 확정의 가스 추정이 오래된 블록 시각으로 거부되는 문제를 발견했다. 화면 종료 판단도 컨트랙트의 엄격한 종료 조건(현재 시각 > endTime)에 맞췄다. 종료 후에도 최신 블록이 종료 이전이고 추정 실패 이유가 Election still active일 때에만 명시한 가스 예산으로 전송하도록 보완했다.',
                      '가스 예산은 최대 3,000,000이며 블록 가스 한도를 넘지 않는다. 실제 수수료는 사용량 기준이고, 거래 블록의 컨트랙트 조건이 최종 권한·시각을 검증한다. 이 예산은 소규모 학급 선거 시연 범위이며 매우 많은 후보·긴 이름에 대한 확장성 보장은 아니다.',
                      'docs/evidence/week8/browser/result.json 및 01~05 PNG: 테스트 지갑 화면 검증. browser-stale-estimate/result.json: finalize 가스 추정에 latest 블록을 명시해 실패 경로를 재현한 회귀 검증. before-finalize-estimation.json: 수정 전 첫 확정 실패 관찰.',
                      'No.5는 현재 제공하는 관리 함수의 이벤트 기록과 검증 범위에서 해결됨으로 갱신한다. 총 15건: 해결 7 / 부분 해결 2 / 예정 6.',
                      '9~10주차: V-C, V-D, V-E, V-G, No.15를 수정하고 탐지 테스트를 방어 테스트로 전환한다. No.6·7의 최종 처리 범위는 미결정이다.',
                      '보고서의 OWASP 분류와 자체 심각도는 기존 인수인계 기준을 유지했다. Word로 PDF를 내보내고 페이지별 PNG를 렌더링해 글자 잘림·표 경계·페이지 분리를 점검했다. 보고서 제출·발표 자체는 아직 수행하지 않았다.')
    from format_week8_report import TEMPLATE, generate as format_weekly_report
    if TEMPLATE.exists():
        format_weekly_report(OUT / 'week8_report.docx')
    else:
        save('week8_report.docx', report)

    rows = [
        ['No.', '진단 / 분류 / 심각도', '상태 및 조치', '근거 및 검증 / 한계'],
        ['1', '강제 종료 부재 / SC10 / High', '해결: 정지·재개 + 멀티시그', '17fbc7a Before, 테스트 3번 묶음 및 8주차 정지·재개 이벤트 검증'],
        ['2', '화면/체인 시계 격차 / SC03 / Medium', '해결: finalize + 오래된 블록의 가스 추정 실패 보완', '7주차 테스트 6번 9개. 8주차 브라우저에서 실제 대기 후 확정 검증(테스트 지갑). 별도 터미널 시연만 가상 시각 사용'],
        ['3', '최초 관리자 키 분실 / SC01 / High', '부분 해결: 3명 운영 시 다른 2명 승인', '8번 묶음: 최초 관리자 없이 비상 정지 성공. 2명 운영 위험·최초 관리자 제거 불가는 잔존'],
        ['4', '관리자 상호 강퇴 / SC01 / High', '해결: 제거에도 2명 승인', '8번 묶음: 1/2 대기, 2/2 제거. 승인자 공모까지 방어하는 것은 아님'],
        ['5', '행위 이벤트 부족 / 로깅 / Medium', '해결: 이벤트 6 → 12종', '7번 8개 + 기존 ResultFinalized 검증. 시연에서 12종 확인. 현재 관리 함수 범위'],
        ['6', 'hasVoted·거래 입력 공개 / 프라이버시 / Low', '예정: 구현/위험 수용 범위 미결정', 'Voted에서 후보 제외는 최소화일 뿐 익명성 보장 아님. 11주차 선택 과제'],
        ['7', '개인키 유출 시 도용 / SC01 인접 / Medium', '예정: 키 관리 가이드', 'msg.sender 기반 신원 판별. 문서화 범위 미결정'],
        ['8 V-A', '선거 중 유권자 추가 / SC01 / High', '해결: beforeElection', '5번 묶음: 진행·정지·종료 후 등록 차단. Before da70115'],
        ['9 V-B', '선거 중 후보 추가 / SC01 / High', '해결: beforeElection', '5번 묶음 V-B 방어. Before da70115'],
        ['10 V-C', '관리자 중복 추가 / SC03 / Medium', '예정: 9~10주차', '9번 탐지: adminCount 부풀림 재현. 통과 = 취약점 존재'],
        ['11 V-D', '비관리자 제거로 인원 감소 / SC01+SC03 / High', '예정: 9~10주차', '9번 탐지: adminCount 오류 재현. 부트스트랩 예외 악용 위험'],
        ['12 V-E', '종료 후 선거 재시작 / SC03 / Medium', '부분 해결: 확정 후 재시작 차단', '6번 방어 + 9번 확정 전 재시작 탐지. 투표 기록 유지 문제 잔존'],
        ['13 V-F', '후보 0명 결과 오류 / SC03 / Low', '해결: finalize에서 후보 필수', '6번 묶음 No candidates 거부 확인'],
        ['14 V-G', '동점 시 등록 순서로 당선 / SC03 / Medium', '예정: 9~10주차', '9번 탐지: 동점 시 A 자동 선택. 정상 시연은 B 2표로 동점 회피'],
        ['15', '정지 중 선두 조회 / 정보 공개 / Low', '예정: 9~10주차, 탐지 보강', '9번 탐지: outsider가 미확정·정지 상태에서 B 조회. 공개 득표 등은 별도 노출 경로'],
    ]
    vuln = section('8주차 취약점진단 현황', f'기준일: {DATE} / 총 15건: 해결 7 · 부분 해결 2 · 예정 6',
                   '분류는 기존 OWASP Smart Contract Top 10 + STRIDE 기준을 유지했다. 심각도는 자체 평가이며 CVSS 점수가 아니다.',
                   '47 passing = 보완·동작 검증 42개 + 남은 취약점 재현 5개. 아래 표는 최종 보고서용 요약이며 테스트 원문은 docs/evidence/week8에 보관한다.')
    vuln += table(rows, [800, 3400, 3500, 6300])
    save('vulnerability_report_week8.docx', vuln, landscape=True)

    slides = section('3차 발표 대본 — 3분 이내', f'작성일: {DATE} / 5장, 목표 2분 40초. 실제 낭독 속도에 따라 조절한다. 실시간 2분 대기 시연은 본 발표에서 제외한다.')
    slides += section('1장 · 목표 (20초)',
                      '블록체인 전자투표 시스템을 보안 관점에서 진단하고 개선하고 있습니다. 7~8주차에는 선거 중 등록 차단, 결과 확정, 그리고 감사 로그를 보완했습니다. 수정 여부뿐 아니라 진단 근거와 검증 결과를 함께 남기는 것이 목표입니다.')
    slides += section('2장 · 7주차 개선과 화면 보완 (40초)',
                      '선거가 진행 중인데 관리자 한 명이 유권자나 후보를 추가할 수 있어, 한 번 시작하면 등록을 막았습니다. 또 거래가 없으면 화면 시계와 마지막 블록 시각이 달라집니다. 종료 후 finalize 거래로 결과를 저장하고 저장된 당선자를 조회하게 했습니다. 이번 화면 검증에서는 가스 추정도 오래된 블록을 보는 경우를 발견해, 해당 조건에서만 새 거래를 전송하도록 보완했습니다.')
    slides += section('3장 · 8주차 이벤트 로깅 (35초)',
                      '기존 이벤트 6종에 등록, 후보 추가, 투표, 관리자 변경, 선거 시작 기록을 더해 총 12종으로 늘렸습니다. 제안 번호와 거래 해시를 연결해 누가 무엇을 실행했는지 추적할 수 있습니다. 투표 이벤트에는 후보 번호를 넣지 않았지만 거래 입력은 공개되므로, 익명성을 해결했다고 보지는 않습니다.')
    slides += section('4장 · 검증 결과와 캡처 (40초)',
                      '자동 테스트는 36개에서 47개로 늘었고, 5개는 남은 취약점을 재현하는 테스트입니다. 관리자 제거에 두 명의 승인이 필요한지, 최초 관리자 없이 다른 두 명으로 비상 정지가 가능한지도 검증했습니다. 자동 화면 검증에 더해 실제 MetaMask에서도 후보 B에 한 표를 보내고, 종료 후 결과를 확정해 B가 당선되는 흐름을 확인했습니다. 슬라이드의 이미지는 자동 검증 캡처이며 실제 지갑 결과도 별도로 대조했습니다.')
    slides += section('5장 · 현황과 다음 단계 (25초)',
                      '현재 15건 중 7건 해결, 2건 부분 해결, 6건이 예정 상태입니다. 다음에는 관리자 인원 계산, 확정 전 재시작, 동점 처리와 정지 중 결과 조회를 보완하겠습니다. 최종 보고서에는 각 항목의 진단, 근거, 조치, 검증을 연결해 정리하겠습니다.')
    slides += section('발표 운영',
                      'PPTX/PDF는 week8_presentation 파일을 사용한다. 본 발표는 캡처 중심으로 진행하고, 터미널 시연과 2분 실제 대기는 질문 후 추가 시연으로 돌린다.',
                      '추가 시연: contract 폴더에서 npx.cmd hardhat run scripts/demoScenario.js. 이 터미널 시연은 가상 시각을 사용한다고 밝힌다.')
    slides += section('예상 질문 (3분 본문에 포함하지 않음)',
                      '확정 버튼을 아무도 안 누르면? 누구나 호출할 수 있지만 자동 확정은 아니므로 결과 공개가 지연됩니다.',
                      '이벤트에서 후보를 빼면 익명인가? 아닙니다. 거래 입력과 공개 상태로 투표를 추론할 수 있어 No.6은 미해결입니다.',
                      '이벤트로 악성 관리자 행위를 막나? 기록과 사후 추적을 보완합니다. 권한 검증과 멀티시그가 실행을 통제합니다.',
                      '남은 취약점은? 관리자 인원 계산, 확정 전 재시작, 동점 정책, 정지 중 결과 조회 등을 9~10주차에 수정합니다.',
                      'No.5 해결 범위는? 현재 관리 함수와 투표의 이벤트 기록 및 검증 범위입니다. 취약한 동작을 기록했다고 그 동작 자체가 해결되는 것은 아닙니다.')
    save('week8_presentation_notes.docx', slides)

    manual = section('8주차 실제 MetaMask 확인 체크리스트',
                     f'작성일: {DATE} / 실제 MetaMask로 선거 시작·후보 B 투표·종료·결과 확정 완료. 캡처 3장과 체인 거래 대조 완료. 계정 전환은 별도 미확인.',
                     'URL: http://localhost:3000 / RPC: http://localhost:8545 / 체인 ID: 31337',
                     '이번 수동 검증은 후보 A·B, 승인 후 10분 선거로 진행했다. 사용자 주소는 첫 두 개를 관리자, 전체를 유권자로 등록하고 로컬 ETH 5개씩 지급했다. 자동 테스트 체인 18545와 별개다.')
    manual += section('1. 연결과 승인',
                      '□ MetaMask에서 사용자가 제공한 첫 번째 지갑 주소를 선택한다. 이 주소에 로컬 관리자·유권자 권한과 테스트 ETH를 준비했다.',
                      '□ 지갑 연결 → 관리자 탭 → 대기 중인 선거 시작 제안의 승인 버튼을 누른다.',
                      '□ 실제 MetaMask 거래 확인 창이 표시되고, 승인 후 거래가 성공하며 카운트다운이 시작되는지 확인한다.')
    manual += section('2. 계정 전환과 투표',
                      '□ 계정 전환도 확인하려면 사용자가 제공한 두 번째 주소로 바꾼 뒤 페이지를 새로고침하고 지갑을 다시 연결한다. 현재 화면은 계정 변경을 자동 반영하지 않으므로 반드시 재연결한다.',
                      '□ 투표하기 탭에서 후보 B에 투표한다. MetaMask 확인 창과 거래 성공, 투표 완료 표시를 확인한다.',
                      '□ 필요하면 선거 중 등록 거부를 확인한다. 자동 브라우저에서는 유권자·후보 모두 차단을 확인했다.')
    manual += section('3. 종료와 확정',
                      '□ 결과 탭에서 종료까지 실제로 대기한다. 확정 전에는 최종 당선자 카드가 없는지 확인한다.',
                      '□ 결과 확정 버튼 → MetaMask 확인 → 거래 성공 후 최종 당선자 후보 B 및 체인에 확정된 결과입니다 문구를 확인한다.',
                      '□ 실제 MetaMask 캡처는 자동 테스트 지갑 캡처와 구분해 보관한다. 개인키·복구 구문이 보이는 화면은 캡처하지 않는다.')
    manual += section('운영 메모',
                      '재시작: contract에서 npx.cmd hardhat node, frontend에서 npm.cmd run dev. 빈 체인에는 node scripts/prepareWeek8Manual.cjs를 실행한다(기존 데이터가 있으면 중단).',
                      '사용자 지갑 재등록: node scripts/prepareWeek8Wallets.cjs 주소1 주소2 ... (첫 두 주소 관리자, 전체 유권자). 선거 시작 전 실행한다.',
                      '노드 초기화 후 nonce 오류가 나면 MetaMask 활동 기록을 지운다. 화면의 연결 계정과 실제 서명 계정을 대조한다.')
    save('week8_manual_check.docx', manual)


if __name__ == '__main__':
    main()
