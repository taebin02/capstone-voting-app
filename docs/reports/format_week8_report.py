"""사용자가 제공한 주간 보고서의 스타일과 구조를 유지하는 8주차 보고서."""
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as E

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / 'weekly_report_template.docx'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
N = {'w': W, 'r': R, 'a': A, 'wp': WP, 'pic': PIC}
for prefix, namespace in N.items():
    E.register_namespace(prefix, namespace)


def xml(root):
    return E.tostring(root, encoding='utf-8', xml_declaration=True)


def make_template(source):
    """원본을 변경하지 않고, 지난주 본문·이미지를 제외한 서식만 저장한다."""
    with ZipFile(source) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()
                 if not name.startswith('word/media/')}
    root = E.fromstring(parts['word/document.xml'])
    body = root.find('w:body', N)
    # 서식 예문의 텍스트를 비워 이전 주차의 본문과 증거를 포함하지 않는다.
    examples = E.Element(f'{{{W}}}body')
    paragraphs = body.findall('w:p', N)
    for index in [0, 1, 2, 3, 4, 8, 9, 14, 16]:
        paragraph = deepcopy(paragraphs[index])
        for child in list(paragraph):
            if child.tag != f'{{{W}}}pPr':
                paragraph.remove(child)
        examples.append(paragraph)
    examples.append(deepcopy(body.find('w:sectPr', N)))
    root.remove(body)
    root.append(examples)
    parts['word/document.xml'] = xml(root)
    rels = E.fromstring(parts['word/_rels/document.xml.rels'])
    for relation in list(rels):
        if relation.get('Type', '').endswith('/image'):
            rels.remove(relation)
    parts['word/_rels/document.xml.rels'] = xml(rels)
    # 원본의 문서 속성은 내용 없는 템플릿에 필요하지 않다.
    parts.pop('docProps/core.xml', None)
    parts.pop('docProps/app.xml', None)
    root_rels = E.fromstring(parts['_rels/.rels'])
    for relation in list(root_rels):
        if 'docProps/' in relation.get('Target', ''):
            root_rels.remove(relation)
    parts['_rels/.rels'] = xml(root_rels)
    content_types = E.fromstring(parts['[Content_Types].xml'])
    for item in list(content_types):
        if item.get('PartName', '').startswith('/docProps/'):
            content_types.remove(item)
    parts['[Content_Types].xml'] = xml(content_types)
    with ZipFile(TEMPLATE, 'w', ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)


def generate(destination=None):
    destination = Path(destination or HERE / 'week8_report.docx')
    with ZipFile(TEMPLATE) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    root = E.fromstring(parts['word/document.xml'])
    old_body = root.find('w:body', N)
    samples = old_body.findall('w:p', N)
    section = deepcopy(old_body.find('w:sectPr', N))
    root.remove(old_body)
    body = E.SubElement(root, f'{{{W}}}body')
    def tag(parent, name, attrs=None):
        return E.SubElement(parent, f'{{{W}}}{name}', {f'{{{W}}}{k}': str(v) for k, v in (attrs or {}).items()})
    def run(parent, text, bold=False, white=False, size=None):
        node = tag(parent, 'r')
        if bold or white or size:
            props = tag(node, 'rPr')
            if bold: tag(props, 'b')
            if white: tag(props, 'color', {'val': 'FFFFFF'})
            if size: tag(props, 'sz', {'val': size})
        text_node = tag(node, 't')
        text_node.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        text_node.text = text
    def p(text, kind='body', parent=None):
        parent = parent if parent is not None else body
        sample_index = {'title': 0, 'subtitle': 1, 'metadata': 2, 'heading': 3,
                        'summary': 4, 'bullet': 6, 'subheading': 7, 'body': 8}[kind]
        node = deepcopy(samples[sample_index])
        parent.append(node)
        if kind == 'subheading':
            props = node.find('w:pPr', N)
            if props is None: props = tag(node, 'pPr')
            tag(props, 'keepNext')
        run(node, text, bold=kind == 'subheading')
        return node
    def summary(label, text):
        node = p('', 'summary')
        node.remove(node.findall('w:r', N)[0])
        run(node, label + '  ', bold=True)
        run(node, text)
    def table(rows, widths):
        tbl = tag(body, 'tbl')
        props = tag(tbl, 'tblPr')
        tag(props, 'tblW', {'w': sum(widths), 'type': 'dxa'})
        tag(props, 'tblLayout', {'type': 'fixed'})
        borders = tag(props, 'tblBorders')
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
                cell_props = tag(cell, 'tcPr')
                tag(cell_props, 'tcW', {'w': width, 'type': 'dxa'})
                if index == 0: tag(cell_props, 'shd', {'val': 'clear', 'fill': '7C3AED'})
                node = tag(cell, 'p')
                run(node, text, bold=index == 0, white=index == 0)
        p('')
    pictures = []
    def screenshot(filename, caption):
        index = len(pictures) + 1
        image_id = f'week8Image{index}'
        pictures.append((image_id, filename))
        paragraph = tag(body, 'p')
        props = tag(paragraph, 'pPr')
        tag(props, 'jc', {'val': 'center'})
        tag(props, 'keepNext')
        # 여백을 제외한 결과 카드 부분만 문서 표시 영역에서 잘라 보인다. 원본 PNG는 그대로 보관한다.
        drawing = E.fromstring(f'''<w:r xmlns:w="{W}" xmlns:wp="{WP}" xmlns:a="{A}" xmlns:pic="{PIC}" xmlns:r="{R}"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="5943600" cy="1834200"/><wp:docPr id="{1000+index}" name="{image_id}" descr="{caption}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="{PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{image_id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{image_id}"/><a:srcRect l="24000" t="69000" r="24000" b="10000"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5943600" cy="1834200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>''')
        paragraph.append(drawing)
        node = tag(body, 'p')
        tag(tag(node, 'pPr'), 'jc', {'val': 'center'})
        run(node, caption, size=18)

    p('8주차 추진 내용', 'title')
    p('(이벤트 로깅 확대 및 보안 검증 증거 보강)', 'subtitle')
    p('프로젝트명: 블록체인 기반 전자투표시스템   |   작성자: 이태빈   |   기간: 8주차', 'metadata')
    p('한눈에 보기', 'heading')
    summary('계획', '유권자 등록·후보 추가·투표의 이벤트를 추가하고, 기존 이벤트와 멀티시그의 검증 증거를 보강한다.')
    summary('결과', '이벤트를 6종에서 12종으로 확대하고 감사 로그 조회 기능을 추가했다. 자동 테스트 47개 통과 및 실제 MetaMask로 후보 B 투표·종료·결과 확정까지 확인했다. 3분 이내 발표 자료도 준비했다.')
    summary('추가 확인', '실제 시간으로 기다리는 화면 검증에서 결과 확정의 가스 추정 문제를 발견해 보완했다. 47개 중 5개는 남은 취약점을 재현하는 테스트다.')

    p('1. 이번 주 추진 내용', 'heading')
    for text in ['등록·투표·관리자 변경·선거 시작 이벤트 추가 및 기록 정책 정리',
                 '제안 번호·거래 해시·로그 순번을 연결하는 감사 로그 조회 스크립트 구현',
                 '기존·신규 이벤트, 관리자 제거 승인, 최초 관리자 부재 시 운영 테스트 보강',
                 '정지 중 결과 조회(No.15) 탐지와 화면 결과 확정 문제 보완',
                 '취약점진단보고서 갱신 및 3차 발표 자료 준비']:
        p(text, 'bullet')

    p('2. 세부 내용', 'heading')
    p('2-1. 이벤트 로깅 확대 (진단 No.5)', 'subheading')
    p('7주차까지는 제안·승인·실행·정지·재개·결과 확정만 이벤트로 기록했다. 유권자 등록, 후보 추가, 투표에는 전용 이벤트가 없어 로그만으로 해당 행위를 확인하기 어려웠다. 관리자 변경과 선거 시작은 기존 제안 로그로도 간접 추적할 수 있었으며, 이번에는 실제 반영값을 전용 이벤트로 추가했다.')
    table([
        ['추가 이벤트', '기록 내용', '확인 목적'],
        ['VoterRegistered', '등록한 관리자, 유권자, 시각', '유권자 등록 이력'],
        ['CandidateAdded', '관리자, 후보 번호, 이름', '후보 추가 이력'],
        ['Voted', '투표자, 시각', '투표 사실 확인'],
        ['AdminAdded / AdminRemoved', '대상 관리자, 제안 번호', '실제 관리자 변경'],
        ['ElectionStarted', '종료 시각, 제안 번호', '승인된 선거 시작'],
    ], [2900, 3600, 2860])
    p('투표 이벤트에는 후보 번호를 넣지 않았다. 다만 거래 입력, 공개 득표, hasVoted로 선택을 추론할 수 있으므로 익명성을 해결한 것으로 보지는 않는다(No.6 유지). 중복 유권자 등록은 상태가 바뀌지 않아 이벤트도 다시 기록하지 않는다.')

    p('2-2. 감사 로그 조회와 시연', 'subheading')
    p('auditLog.js는 체인의 이벤트를 블록·로그 순서로 출력한다. 제안 번호로 제안자·승인자·실행 결과를 연결하고, 거래 해시와 로그 순번으로 원본을 대조할 수 있게 했다. 시각은 UTC로 표시한다.')
    p('별도 메모리 체인의 시연에서는 관리자 추가·제거 → 후보·유권자 등록 → 선거 시작 → 투표 → 정지·재개 → 결과 확정을 진행해 이벤트 12종, 총 35건과 당선자 B를 확인했다. 이 터미널 시연은 가상 시각으로 종료를 앞당겼으며, 아래 실제 대기 화면 검증과 구분한다.')

    p('2-3. 자동 테스트 (Hardhat)', 'subheading')
    p('기존 36개에 이벤트 검증 8개, 멀티시그 증거 보강 2개, No.15 탐지 1개를 추가해 47개 모두 통과했다. 특히 관리자 제거가 1/2 승인에서는 대기하고 2/2에서 실행되는지, 관리자 3명 중 최초 관리자 없이 다른 2명만으로 비상 정지를 실행할 수 있는지 직접 검증했다.')
    table([
        ['구분', '개수', '내용'],
        ['기존 동작·7주차 보완 검증', '32', '접근 제어, 멀티시그, 정지, 투표, 등록 차단, 결과 확정'],
        ['8주차 이벤트 검증', '8', '기존·신규 이벤트 인자와 기록, 중복 등록 시 재기록 없음'],
        ['8주차 멀티시그 증거 보강', '2', '관리자 제거 승인 2명, 최초 관리자 없이 비상 정지'],
        ['취약점 탐지 (남은 약점)', '5', 'V-C, V-D, V-E, V-G, No.15 — 통과는 취약점 존재 확인'],
        ['합계', '47', '47 passing (7주차 36개 → 47개)'],
    ], [3300, 800, 5260])

    p('2-4. 화면 동작 확인 및 결과 확정 보완', 'subheading')
    p('별도 로컬 체인과 Edge 브라우저에서 등록, 승인, 투표, 정지·재개를 거친 뒤 거래 없이 실제로 2분을 기다렸다. 종료 후 당선자를 바로 공개하지 않고 결과 확정 버튼을 표시하며, 확정 거래 후 후보 B가 표시되는 것까지 확인했다. 아래는 EIP-1193 테스트 지갑을 사용한 자동 브라우저 검증 캡처다.')
    screenshot('04-ended-before-finalize.png', '① 실제 시간 경과 후: 결과 확정 버튼 표시, 최종 당선자는 아직 비공개 (자동 테스트 지갑)')
    screenshot('05-finalized-winner.png', '② 확정 거래 후: 최종 당선자 후보 B 표시 (자동 테스트 지갑)')
    p('검증 중 첫 확정이 가스 추정 단계에서 Election still active로 거부되는 경우를 발견했다. 화면의 종료 판단을 현재 시각 > endTime으로 맞추고, 종료 후에도 최신 블록이 종료 이전이며 위 사유로 추정이 실패할 때만 명시한 가스 예산으로 전송하도록 보완했다. 최종 종료 조건은 거래 블록에서 컨트랙트가 검증한다.')
    p('정상 경로와 latest 블록으로 가스를 추정하는 실패 경로를 각각 재현해 화면 확정에 성공했다. 예산은 최대 3,000,000 가스이며 블록 한도를 넘지 않는다. 이 예산은 소규모 학급 선거 시연 범위로, 후보 수나 이름 길이가 매우 큰 경우의 확장성을 보장하는 것은 아니다.')
    p('2-5. 실제 MetaMask 투표 및 결과 확정 검증', 'subheading')
    p('사용자의 별도 브라우저에서 실제 MetaMask로 선거 시작을 승인하고 후보 B에 한 표를 보냈다. 화면 캡처 3장과 체인의 투표·확정 거래를 대조해 정상 투표 흐름을 검증했다. 종료 시각은 15:23:45였으며, 종료 후 15:24:34에 확정 거래가 기록됐다(2026-10-24, 한국 시각).')
    table([
        ['확인 단계', '화면 및 체인 확인 결과'],
        ['투표 완료', '총 유권자 7명, 투표 완료 1명, 후보 B 1표, 투표율 14.3%'],
        ['종료 후·확정 전', '결과 확정 버튼 표시, 최종 당선자 카드는 미공개'],
        ['확정 후', '최종 당선자 후보 B 및 체인에 확정된 결과입니다 문구 표시'],
    ], [2500, 6860])
    p('투표 거래의 입력도 확인해 vote(1), 즉 두 번째 후보 B에 대한 투표임을 검증했다. 투표 거래 0x369afaf8…2610018, 결과 확정 거래 0x1e1e4f63…bd6fa1bc의 전체 해시와 시각은 docs/evidence/week8/metamask/result.json에 저장했다. 실제 캡처 원본 3장은 같은 폴더의 01~03 PNG로 보관하고 screenshots.json에 원래 파일명과 SHA-256 해시를 기록했다. 위 문서 내 이미지는 자동 검증 캡처로 구분했다.')
    p('앞선 0표 선거에서 후보 A가 선택된 결과는 정상 투표 검증과 분리해 기존 V-G의 증거로 보존했다. 실제 MetaMask의 투표·종료·확정 검증은 완료했으며, 계정 전환 동작은 별도로 확인하지 않았다.')

    p('3. 발견된 문제점 및 개선 사항', 'heading')
    p('No.5는 현재 관리 함수의 이벤트 기록과 검증 범위에서 해결로 갱신했다. No.3·4는 직접 검증하는 증거를 보강했고, No.15는 외부 계정으로 노출을 재현했으며 수정은 다음 보안 테스트 단계로 남겼다.')
    table([
        ['ID', '내용', '8주차 결과'],
        ['No.5', '행위 이벤트 부족', '해결됨 (이벤트 12종 및 검증)'],
        ['No.3', '최초 관리자 키 분실 위험', '부분 해결 유지, 다른 2명 실행 검증'],
        ['No.4', '관리자 제거 통제', '해결 유지, 2명 승인 직접 검증'],
        ['No.2', '화면·체인 시각 차이', '확정의 가스 추정 실패 경로 추가 보완'],
        ['No.15', '정지 중 getWinner() 집계 공개', '탐지 테스트 추가, 수정 예정'],
    ], [1000, 4200, 4160])
    p('총 15건 중 해결 7건, 부분 해결 2건, 예정 6건이다. 통과한 취약점 탐지 테스트 5개는 해결을 뜻하지 않으며, 수정 후에는 새 정책에 맞는 방어 검증으로 바꿔야 한다. 최종 보고서용 테스트 원문, 감사 로그, 화면 캡처는 docs/evidence/week8에 구분해 저장했다.')

    p('4. 차주 계획', 'heading')
    for text in ['V-C·V-D: 관리자 중복 추가와 비관리자 제거로 인한 인원 계산 오류 보완',
                 'V-E·V-G·No.15: 확정 전 재시작, 동점 처리, 정지 중 결과 조회 보완',
                 '탐지 테스트를 방어 테스트로 전환하고 항목별 진단 → 조치 → 검증 증거 갱신']:
        p(text, 'bullet')
    body.append(section)
    parts['word/document.xml'] = xml(root)
    rels = E.fromstring(parts['word/_rels/document.xml.rels'])
    for image_id, filename in pictures:
        E.SubElement(rels, f'{{{PKG}}}Relationship', {'Id': image_id, 'Type': R + '/image', 'Target': 'media/' + filename})
        parts['word/media/' + filename] = (HERE.parent / 'evidence/week8/browser' / filename).read_bytes()
    parts['word/_rels/document.xml.rels'] = xml(rels)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    print(destination)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--template-source', type=Path)
    args = parser.parse_args()
    if args.template_source:
        make_template(args.template_source)
    generate()
