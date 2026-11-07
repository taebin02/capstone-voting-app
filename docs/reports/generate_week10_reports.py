"""10주차 보고서 생성. 기존 주간 보고서 양식과 8주차 진단 항목을 계승한다.
실행: python -B docs/reports/generate_week10_reports.py
"""
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import ast
import xml.etree.ElementTree as E
from generate_week8_reports import section, table as plain_table, save

HERE = Path(__file__).resolve().parent
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
N = {'w': W}
E.register_namespace('w', W)


def main():
    with ZipFile(HERE / 'weekly_report_template.docx') as source:
        parts = {name: source.read(name) for name in source.namelist()}
    root = E.fromstring(parts['word/document.xml'])
    old = root.find('w:body', N)
    samples = old.findall('w:p', N)
    sect = deepcopy(old.find('w:sectPr', N))
    root.remove(old)
    body = E.SubElement(root, f'{{{W}}}body')
    def tag(parent, name, attrs=None):
        return E.SubElement(parent, f'{{{W}}}{name}', {f'{{{W}}}{k}': str(v) for k, v in (attrs or {}).items()})
    def run(parent, text, bold=False, white=False):
        r = tag(parent, 'r')
        if bold or white:
            pr = tag(r, 'rPr')
            if bold: tag(pr, 'b')
            if white: tag(pr, 'color', {'val': 'FFFFFF'})
        t = tag(r, 't')
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        t.text = text
    def p(text, kind='body'):
        index = {'title': 0, 'subtitle': 1, 'metadata': 2, 'heading': 3,
                 'summary': 4, 'bullet': 6, 'subheading': 7, 'body': 8}[kind]
        node = deepcopy(samples[index])
        body.append(node)
        run(node, text, bold=kind == 'subheading')
        return node
    def summary(label, text):
        node = p('', 'summary')
        node.remove(node.find('w:r', N))
        run(node, label + '  ', bold=True)
        run(node, text)
    def table(rows, widths):
        tbl = tag(body, 'tbl')
        pr = tag(tbl, 'tblPr')
        tag(pr, 'tblW', {'w': sum(widths), 'type': 'dxa'})
        tag(pr, 'tblLayout', {'type': 'fixed'})
        borders = tag(pr, 'tblBorders')
        for side in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
            tag(borders, side, {'val': 'single', 'sz': 4, 'color': 'auto'})
        grid = tag(tbl, 'tblGrid')
        for width in widths: tag(grid, 'gridCol', {'w': width})
        for index, row in enumerate(rows):
            tr = tag(tbl, 'tr')
            trpr = tag(tr, 'trPr')
            tag(trpr, 'cantSplit')
            if index == 0: tag(trpr, 'tblHeader')
            for text, width in zip(row, widths):
                cell = tag(tr, 'tc')
                cp = tag(cell, 'tcPr')
                tag(cp, 'tcW', {'w': width, 'type': 'dxa'})
                if index == 0: tag(cp, 'shd', {'val': 'clear', 'fill': '7C3AED'})
                run(tag(cell, 'p'), text, bold=index == 0, white=index == 0)
        p('')

    p('10주차 추진 내용', 'title')
    p('(동점·0표 결과 정책 및 미확정 결과 조회 보완)', 'subtitle')
    p('프로젝트명: 블록체인 기반 전자투표시스템   |   작성자: 이태빈   |   기간: 10주차', 'metadata')
    p('한눈에 보기', 'heading')
    summary('계획', '등록 순서로 동점 당선자를 선택하는 문제(V-G)와 정지 중 미확정 선두 조회(No.15)를 보완한다.')
    summary('결과', '동점·0표 모두 당선자 없음으로 확정하는 정책을 정하고 체인과 화면에 반영했다. getWinner()는 확정 후에만 결과를 반환하도록 변경했다.')
    summary('검증', '자동 테스트 65개와 테스트 지갑 화면 4종을 통과했다. 실제 MetaMask로 0표·동점 결과를 확정하고, 정지 화면과 미확정 조회의 RPC 거부도 대조했다.')

    p('1. 이번 주 추진 내용', 'heading')
    for text in ['동점·0표는 당선자 없음으로 확정, 재선거는 새 배포라는 정책 결정',
                 'V-G: 결과를 정상 당선·동점·투표 없음으로 구분해 저장',
                 'No.15: 진행·정지·종료 상태와 관계없이 미확정 getWinner() 조회 차단',
                 '새 결과 사유 이벤트와 화면 안내, 감사 로그 반영 및 ABI 동기화',
                 '보완 전후 자동 테스트·화면 증거 및 추진보고서 작성']:
        p(text, 'bullet')

    p('2. 세부 내용', 'heading')
    p('2-1. 진단과 보완 전 근거', 'subheading')
    p('9주차 커밋 c45b5e1을 출발점으로 기존 테스트 57개를 실행했다. 이 중 V-G와 No.15는 취약한 동작을 기대하는 탐지 테스트였고, 별도로 정지 중 조회를 허용하는 기존 기능 테스트도 있었다. 이번에는 해당 기대값을 방어·정책 검증으로 전환했다.')
    table([
        ['항목', '보완 전', '10주차 조치'],
        ['V-G', '동점·0표라도 앞서 등록한 후보가 당선', '등록 순서 대신 최다 득표·동점·0표를 구분'],
        ['No.15', '정지 상태에서는 확정 전 선두 후보 조회 가능', 'getWinner()의 미확정 조회를 모든 계정에 거부'],
    ], [1000, 4000, 4360])

    p('2-2. 동점·0표 처리 정책과 구현 (V-G)', 'subheading')
    p('사용자가 동점·0표 모두 당선자 없음으로 확정하는 방식을 선택했다. 확정 자체를 계속 거부하는 방식이 아니므로 결과는 완료 상태로 남고, 재확정·재시작은 불가능하다. 재선거는 기존의 선거 1회 정책에 따라 새 컨트랙트를 배포한다.')
    table([
        ['finalizedOutcome', '의미', '당선자·화면 처리'],
        ['0 Pending', '미확정', '최종 결과 비공개, getWinner 조회 거부'],
        ['1 Winner', '양수 득표의 단독 최다', '당선자 이름 저장·표시'],
        ['2 Tie', '최다 득표가 동점', '당선자 없음, 동점 사유 표시'],
        ['3 NoVotes', '전체 득표 0', '당선자 없음, 투표 없음 사유 표시'],
    ], [2300, 2900, 4160])
    p('최다 득표를 갱신하면 이전의 동점 표시도 초기화해 A·B 동점 이후 더 많이 득표한 C가 정상 당선되도록 했다. 후보 한 명의 0표도 당선자로 처리하지 않는다. 동점·0표일 때 getWinner()는 빈 문자열을 반환하며 finalizedOutcome으로 사유를 구분한다.')
    p('기존 ResultFinalized 이벤트는 유지하고, 결과 유형과 최다 득표를 담는 ResultOutcomeFinalized를 추가했다. 이벤트는 총 13종이다. finalize() 이후 electionActive도 false로 바꿔 결과 확정 뒤의 비상 정지 제안을 실행하지 못하도록 했다.')

    p('2-3. 미확정 결과 조회 보완과 범위 (No.15)', 'subheading')
    p('이전의 정지 중 getWinner() 예외를 없앴다. 관리자·유권자·외부 계정 모두 확정 전에는 Result not finalized로 거부된다. 정지를 해제하더라도 종료 후 finalize()를 실행하기 전까지 동일하게 거부되고, 확정 후에는 저장된 결과를 조회한다.')
    p('이 조치는 getWinner()의 최종 결과 공개 정책을 일치시키는 것이다. 후보별 득표, hasVoted, 거래 입력은 여전히 공개되어 선두나 투표 선택을 추론할 수 있다. 따라서 완전한 정보 비공개나 투표 익명성을 구현했다고 평가하지 않으며, 프라이버시 항목 No.6은 남겨 둔다.')

    p('2-4. 보완 전후 자동 검증', 'subheading')
    table([
        ['검증', '결과', '증거 (docs/evidence/week10)'],
        ['9주차 코드·기존 테스트', '57 passing (취약점 탐지 2개 포함)', 'before-tests.txt'],
        ['기존 코드·조회 방어 3개', '0 passing / 3 failing (예상한 실패)', 'before-disclosure-defense.txt'],
        ['조회만 보완 후·결과 정책 8개', '0 passing / 8 failing (예상한 실패)', 'before-outcome-defense.txt'],
        ['최종 전체 테스트', '65 passing', 'after-tests.txt'],
        ['프론트 타입 검사', '오류 없이 통과', 'verification.json'],
    ], [3000, 3000, 3360])
    p('새 결과 정책 테스트의 보완 전 실패에는 기존에 상태 getter·이벤트가 없어서 발생한 실패도 포함된다. 이를 전부 독립적인 취약점 발견으로 세지 않았다. 기존 3개 테스트의 기대값을 전환하고 8개를 추가해, 관련 검증은 총 11개이며 전체는 65개다. 이전처럼 취약한 동작의 성공을 기대하는 탐지 테스트는 남기지 않았다.')
    p('후보 1명·0표, 단독 당선, 늦게 나타난 최다 득표자, 최다 득표 동점, 당선자 없음의 재확정·재시작·사후 정지 차단 및 조회 권한을 확인했다. 감사 로그 시연에서도 새 이벤트를 포함한 13종·36건과 당선자 B를 확인했다.')

    p('2-5. 화면 검증', 'subheading')
    p('실제 MetaMask와 구분되는 EIP-1193 테스트 지갑으로 브라우저 → RPC → 컨트랙트 → 화면 흐름을 검증했다. 별도 로컬 체인(18545)과 가상 시각을 사용했으며 실제 대기 실험으로 표시하지 않았다.')
    table([
        ['시나리오', '화면·체인 결과'],
        ['단독 당선', '후보 B 및 정상 당선 상태 표시'],
        ['동점', '최종 결과: 당선자 없음 / 최다 득표가 동점입니다'],
        ['0표', '최종 결과: 당선자 없음 / 투표가 한 표도 없습니다'],
        ['비상 정지', '확정 버튼 비노출, 미확정 getWinner 거부. 공개 득표는 유지'],
    ], [2300, 7060])
    p('네 경우 모두 통과했고 페이지·RPC 오류가 없었다. 화면 증거는 browser 폴더에 자동 검증임을 표시해 보관했다. 새 getter와 이벤트로 ABI가 바뀌어 frontend/lib/Voting.json을 동기화했으며, 수동 검증용 배포 코드도 컴파일 결과와 일치함을 확인했다.')
    p('2-6. 실제 MetaMask 수동 확인', 'subheading')
    table([
        ['검증 항목', '실제 화면·체인 대조 결과'],
        ['정지 중 미확정 조회', '정지 안내와 최종 당선자 비노출 확인. 같은 사용자 주소의 RPC getWinner 조회는 Result not finalized로 거부'],
        ['0표 결과 확정', '실제 MetaMask가 finalize 거래를 승인. NoVotes(3), 빈 당선자, 0표·당선자 없음 문구 확인'],
        ['동점 결과 확정', 'A·B 각 1표 상태에서 실제 MetaMask로 확정. Tie(2), 빈 당선자, 동점·당선자 없음 문구 확인'],
    ], [2600, 6760])
    p('후보·관리자·정지·동점 상태는 Hardhat 개발 계정으로 준비했고, 사용자는 별도 브라우저의 실제 MetaMask로 두 결과 확정 거래를 서명했다. 따라서 사용자가 직접 두 표를 투표했다고 설명하지 않는다. 시나리오 전환에는 로컬 체인 초기화를 사용했으며 실제 시간 대기나 시계 오차 재현의 증거로 사용하지 않는다.')
    p('첫 확정 시 로컬 체인은 nonce 0을 기다렸지만 지갑이 과거 기록의 nonce 3을 보내 거부됐다. 로컬 테스트 계정의 순번을 3으로 맞춘 뒤 0표 확정이 성공했고, 다음 동점 시나리오에서는 nonce를 이어 유지해 확정에 성공했다. 이는 로컬 환경 복구이며 컨트랙트 취약점 해결 건수에 추가하지 않았다.')
    p('실제 원본은 docs/evidence/week10/metamask의 01~04 PNG와 troubleshooting 하위의 nonce 오류 화면으로 보관했다. screenshots.json에 원래 파일명·SHA-256 해시를, zero-result.json과 tie-result.json에 확정 거래와 결과를, paused-check.json에 정지·조회 대조를 기록했다. 개인키·복구 구문은 증거에 포함하지 않았다.')

    p('3. 발견된 문제점 및 개선 사항', 'heading')
    table([
        ['ID', '10주차 조치', '최신 상태'],
        ['No.14 V-G', '동점·0표는 당선자 없음으로 확정', '예정 → 해결'],
        ['No.15', '미확정 getWinner 조회 예외 제거', '예정 → 해결 (조회 정책 범위)'],
        ['No.6', '공개 득표·거래 입력의 프라이버시 한계 명시', '후속 범위 결정 필요'],
    ], [1500, 5000, 2860])
    p('총 15건 중 해결 12건, 부분 해결 1건(No.3), 예정 2건(No.6·7)이다. 테스트가 모두 통과해도 프로젝트 전체의 취약점 부재를 보장하지 않는다. 제안 만료·취소 및 제거된 관리자의 이전 승인 처리 등 기존 추가 검토 소견도 이번 범위에는 포함하지 않았다.')

    p('4. 차주 계획', 'heading')
    for text in ['No.6 프라이버시의 구조적 한계와 구현·위험 수용 범위 결정',
                 'No.7 개인키 관리 가이드 및 최종 보고서의 진단·근거·조치·검증 자료 정리',
                 '남은 검토 항목과 누적 증거를 최종 진단보고서 구조에 맞춰 정리']:
        p(text, 'bullet')
    body.append(sect)
    parts['word/document.xml'] = E.tostring(root, encoding='utf-8', xml_declaration=True)
    with ZipFile(HERE / 'week10_report.docx', 'w', ZIP_DEFLATED) as out:
        for name, data in parts.items(): out.writestr(name, data)
    print(HERE / 'week10_report.docx')

    tree = ast.parse((HERE / 'generate_week8_reports.py').read_text(encoding='utf-8'))
    assignment = next(node for node in ast.walk(tree) if isinstance(node, ast.Assign)
                      and any(isinstance(t, ast.Name) and t.id == 'rows' for t in node.targets))
    rows = ast.literal_eval(assignment.value)
    updates = {
        '5': ['해결: 현재 이벤트 13종 기록', '8주차 로깅 12종에 10주차 결과 사유 이벤트 추가. 기존 이벤트 검증과 13종 감사 로그 시연 통과'],
        '10 V-C': ['해결: 실행 시 0주소·중복 확인', '9주차 방어 4개 + 실제 화면 Already admin. 10주차 회귀 통과'],
        '11 V-D': ['해결: 실제 관리자 확인·최소 2명 유지', '9주차 방어 4개 + 실제 화면 Not an admin. 10주차 회귀 통과'],
        '12 V-E': ['해결: 선거 1회 제한', '진행·정지·종료·겹친 시작 방어 및 9주차 실제 화면 종료 시각 불변'],
        '14 V-G': ['해결: 동점·0표는 당선자 없음으로 확정', '결과 검증 8개, 자동 화면 3종, 실제 MetaMask 0표·동점 확정 및 원본 증거'],
        '15': ['해결: 미확정 getWinner 조회 차단', '조회 검증 3개, 실제 정지 화면+RPC 거부 대조. 공개 득표·거래 입력의 프라이버시는 미해결'],
    }
    for row in rows[1:]:
        if row[0] in updates: row[2:] = updates[row[0]]
    intro = section('10주차 취약점진단 현황', '기준일: 2026-11-07 / 총 15건: 해결 12 · 부분 해결 1 · 예정 2',
                    '기존 진단 분류와 자체 심각도 유지. 전체 65 passing, 기존 탐지 기대값은 방어 검증으로 전환했다.',
                    '주간 제출물은 추진보고서다. 이 표는 최종 취약점진단보고서용 누적 자료이며 No.15의 해결 범위는 getWinner 조회 정책이다.')
    save('vulnerability_report_week10.docx', intro + plain_table(rows, [800, 3400, 3500, 6300]), landscape=True)


if __name__ == '__main__':
    main()
