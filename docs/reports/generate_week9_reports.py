"""9주차 보고서 생성. 기존 주간 보고서 양식과 8주차 진단 항목을 계승한다.
실행: python -B docs/reports/generate_week9_reports.py
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

    p('9주차 추진 내용', 'title')
    p('(관리자 인원 무결성 및 선거 재시작 차단)', 'subtitle')
    p('프로젝트명: 블록체인 기반 전자투표시스템   |   작성자: 이태빈   |   기간: 9주차', 'metadata')
    p('한눈에 보기', 'heading')
    summary('계획', '남은 보안 취약점 중 관리자 인원 계산(V-C·V-D)과 확정 전 선거 재시작(V-E)을 보완한다.')
    summary('결과', '실제 관리자 여부를 확인한 뒤 인원 수를 변경하고, 한 번 시작한 선거의 재시작을 차단했다. 테스트는 47개에서 57개로 늘었고 모두 통과했다.')
    summary('검증', '새 방어 테스트 13개를 보완 전 코드에 실행하면 12개 실패·1개 통과, 보완 후에는 13개 모두 통과했다. 전체 57개 중 2개는 남은 취약점을 재현하는 탐지 테스트다.')

    p('1. 이번 주 추진 내용', 'heading')
    for text in ['V-C: 관리자 중복 추가 및 0주소 추가 차단',
                 'V-D: 비관리자·이미 제거된 관리자 제거 차단, 관리자 최소 2명 유지',
                 'V-E: 진행·정지·종료 후에도 재시작 차단, 유효한 선거 시간 확인',
                 '기존 취약점 재현 3개를 방어 테스트로 전환하고 경계·중복 제안 검증 추가',
                 '보완 전후 테스트 증거와 최신 취약점진단 현황표 작성']:
        p(text, 'bullet')

    p('2. 세부 내용', 'heading')
    p('2-1. 진단과 보완 전 근거', 'subheading')
    p('8주차 커밋 30d8e82를 출발점으로 삼았다. 기존 테스트 47개가 통과하는지 먼저 확인했으며, 이 중 5개는 취약한 동작을 기대하는 탐지 테스트였다. 소스와 테스트를 함께 검토해 아래 세 경로를 확인했다.')
    table([
        ['ID', '보완 전 동작', '영향'],
        ['V-C', '이미 관리자인 주소를 다시 추가하면 adminCount 증가', '실제 구성원 수와 집계 불일치. 1명일 때 자기 재추가도 가능'],
        ['V-D', '비관리자 주소를 제거해도 adminCount 감소', '실제로 2명인데 1명으로 집계되면 단독 추가 예외가 다시 열림'],
        ['V-E', '종료 후 확정 전에도 StartElection 재실행 가능', '기존 득표·hasVoted를 유지한 채 종료 시각을 변경'],
    ], [900, 4200, 4260])
    p('세 취약점은 8주차 탐지 테스트와 이번 주 보완 전 로그로 재현했다. 별도로 작성한 방어 테스트 13개 중 12개가 이전 코드에서 실패했다. 정상 제거·재추가 1개는 이전에도 정상 동작해 통과했으며, 모든 새 테스트가 보완 전 실패했다고 적지 않았다.')

    p('2-2. 관리자 인원 무결성 보완 (V-C·V-D)', 'subheading')
    p('AddAdmin 실행 직전에 대상이 0주소가 아니며 아직 관리자가 아닌지 확인한다. RemoveAdmin은 실제 관리자인지 확인한 뒤 인원을 줄인다. 최초 관리자 제거 금지 규칙은 유지했다.')
    p('유효한 관리자를 제거하더라도 2명 미만으로 줄일 수 없게 했다. 그렇지 않으면 인원 계산이 정확해도 2인 승인 체계에서 1인 추가 예외로 되돌아갈 수 있기 때문이다. 처음 배포한 1명 상태에서 두 번째 관리자를 즉시 추가하는 부트스트랩은 정상 동작한다.')
    p('검사는 제안을 만든 시점이 아니라 실제 실행 시점에 한다. 같은 대상의 제안이 여러 개 만들어져도, 첫 제안이 반영된 뒤 두 번째 실행에서 재검사해 중복 변경을 거부한다. 거부된 승인 거래의 승인 수·hasApproved·실행 여부와 인원 변경은 모두 되돌아감을 검증했다.')

    p('2-3. 선거 1회 정책 완성 (V-E)', 'subheading')
    p('StartElection 실행에는 endTime == 0 조건을 추가했다. 한 번이라도 시작하면 진행 중, 정지 중, 자연 종료 후, 확정 전 모두 재시작할 수 없다. 확정 후 재시작 금지도 기존대로 유지한다. 정지 해제는 기존 Resume 제안을 이용한다.')
    p('시작 전에 만든 제안 두 개도 한 개만 실행할 수 있다. 재시작 거부 후 종료 시각·득표·투표 여부가 유지되고, 종료 후 추가 투표는 거부되며 기존 결과를 확정할 수 있음을 확인했다. 0분 선거도 실행을 거부하고 새 유효 시간 제안은 실행할 수 있게 검증했다.')

    p('2-4. 자동 검증 결과', 'subheading')
    table([
        ['검증', '결과', '증거 파일 (docs/evidence/week9)'],
        ['8주차 코드·기존 테스트', '47 passing (탐지 5개 포함)', 'before-tests.txt'],
        ['8주차 코드·새 방어 테스트', '1 passing / 12 failing (예상한 실패)', 'before-defense-tests.txt'],
        ['보완 후 전체 테스트', '57 passing (탐지 2개 포함)', 'after-tests.txt'],
        ['추가 방어 묶음', 'V-C 4 / V-D 4 / V-E 4 / 시간 1 = 13개', 'Voting.test.js 9번 묶음'],
        ['프론트 TypeScript', '타입 검사 통과', 'verification.json'],
    ], [2500, 3000, 3860])
    p('총 개수는 기존 47개에서 탐지 3개를 빼고 새 방어 묶음 13개를 더한 57개다. V-G와 No.15의 탐지 테스트는 유지했으므로 57개 통과가 모든 취약점 해결을 의미하지 않는다.')
    p('현재 Windows 작업 폴더에서 Hardhat 가상 체인으로 검증했다. 자동 테스트의 시간 이동은 실제 대기와 구분한다. 컨트랙트 컴파일 산출물도 frontend/lib/Voting.json에 동기화했으며, 함수·이벤트의 ABI 형식은 이전과 동일하다. 실제 화면 검증용으로 새로 배포한 코드가 현재 컴파일 결과와 일치함을 확인했다.')
    p('2-5. 실제 MetaMask 연결 화면 검증', 'subheading')
    p('사용자의 별도 브라우저에서 실제 MetaMask 계정으로 연결하고 승인 버튼을 눌러 세 가지 차단 동작을 확인했다. 정상 선거 시작은 MetaMask 승인 후 카운트다운이 시작됐으며, 이후 재시작 요청은 거부됐다.')
    table([
        ['대상 제안', '화면의 거부 사유', '체인 상태 확인'],
        ['#4 중복 관리자 추가 (V-C)', 'Already admin', '실행 안 됨, 승인 1/2, 관리자 4명 유지'],
        ['#5 비관리자 제거 (V-D)', 'Not an admin', '실행 안 됨, 승인 1/2, 관리자 4명 유지'],
        ['#7 선거 재시작 (V-E)', 'Election already started', '실행 안 됨, 승인 1/2, 기존 종료 시각 유지'],
    ], [3000, 2500, 3860])
    p('재시작 승인 시도 전후의 종료 시각은 모두 2026-10-30 15:14:42(한국 시각)였다. 이 세 요청은 가스 추정 단계에서 거부될 수 있으므로 실패 거래가 체인에 기록됐다고 설명하지 않는다. 화면의 오류와 실행 여부·승인 수·관리자 수·종료 시각을 대조한 검증이다.')
    p('실제 캡처 원본 3장은 docs/evidence/week9/metamask의 01~03 PNG로 보관했다. screenshots.json에 원래 파일명과 SHA-256 해시를, result.json에 체인 대조 결과를 기록했다. 0주소, 최소 인원, 겹친 제안, 정지·종료 후 재시작 등의 추가 경계는 자동 테스트로 검증했으며 실제 화면에서 모두 재현했다고 적지 않았다.')

    p('3. 발견된 문제점 및 개선 사항', 'heading')
    table([
        ['ID', '9주차 조치', '최신 상태'],
        ['No.10 V-C', '중복 관리자 및 0주소 추가 거부', '예정 → 해결'],
        ['No.11 V-D', '비관리자 제거 거부, 최소 2명 유지', '예정 → 해결'],
        ['No.12 V-E', '확정 전을 포함한 모든 재시작 차단', '부분 해결 → 해결'],
        ['No.14 V-G', '등록 순서에 따른 동점 당선 탐지 유지', '10주차 보완 예정'],
        ['No.15', '정지 중 선두 후보 조회 탐지 유지', '10주차 보완 예정'],
    ], [1500, 4900, 2960])
    p('총 15건 중 해결 10건, 부분 해결 1건(No.3), 예정 4건(No.6·7·14·15)으로 갱신했다. 실행이 불가능한 제안도 목록에 남을 수 있으며 제안 만료·취소 및 제거된 관리자의 과거 승인 처리는 이번 주 범위에 포함하지 않았다.')

    p('4. 차주 계획', 'heading')
    for text in ['동점·0표 결과의 처리 정책을 결정하고 V-G 보완',
                 '정지 중 getWinner() 조회 정책 보완. 공개 득표 등 다른 노출 경로와 구분',
                 '남은 탐지 테스트를 방어 검증으로 전환하고 증거·보고서 갱신']:
        p(text, 'bullet')
    body.append(sect)
    parts['word/document.xml'] = E.tostring(root, encoding='utf-8', xml_declaration=True)
    with ZipFile(HERE / 'week9_report.docx', 'w', ZIP_DEFLATED) as out:
        for name, data in parts.items(): out.writestr(name, data)
    print(HERE / 'week9_report.docx')

    tree = ast.parse((HERE / 'generate_week8_reports.py').read_text(encoding='utf-8'))
    assignment = next(node for node in ast.walk(tree) if isinstance(node, ast.Assign)
                      and any(isinstance(t, ast.Name) and t.id == 'rows' for t in node.targets))
    rows = ast.literal_eval(assignment.value)
    for row in rows[1:]:
        if row[0] == '10 V-C':
            row[2:] = ['해결: 실행 시 0주소·중복 확인', '9번 방어 4개 + 실제 화면 #4 Already admin, 관리자 4명 유지']
        elif row[0] == '11 V-D':
            row[2:] = ['해결: 실제 구성원 확인·최소 2명 유지', '9번 방어 4개 + 실제 화면 #5 Not an admin, 관리자 4명 유지']
        elif row[0] == '12 V-E':
            row[2:] = ['해결: endTime == 0, 1회 제한', '9번 방어 4개 + 기존 확정 후 방어 + 실제 화면 #7 재시작 거부·종료 시각 불변']
        elif row[0] in ['14 V-G', '15']:
            row[2] = '예정: 10주차 정책·보완'
            row[3] = row[3].replace('9번', '10번')
    intro = section('9주차 취약점진단 현황', '기준일: 2026-10-30 / 총 15건: 해결 10 · 부분 해결 1 · 예정 4',
                    '기존 진단 분류와 자체 심각도 유지. 57 passing 중 탐지 묶음 2개는 취약점 존재 확인이다.',
                    '9주차 조치: V-C·V-D·V-E. 자동 테스트와 실제 MetaMask 연결 화면의 거부 안내·체인 상태 대조 완료. 8주차 증거는 과거 기록으로 보존한다.')
    save('vulnerability_report_week9.docx', intro + plain_table(rows, [800, 3400, 3500, 6300]), landscape=True)


if __name__ == '__main__':
    main()
