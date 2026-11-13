"""11주차 문서 생성. 기존 제출 양식을 유지하며 문서화와 잔여 위험을 구분한다.
실행: python -B docs/reports/generate_week11_reports.py
"""
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
import xml.etree.ElementTree as E
from generate_week8_reports import section, table as plain_table, save

HERE = Path(__file__).resolve().parent
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
N = {'w': W}
E.register_namespace('w', W)


def render(name, entries):
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

    for entry in entries:
        if entry[0] == 'table':
            table(entry[1], entry[2])
        else:
            p(entry[1], entry[0])
    body.append(sect)
    parts['word/document.xml'] = E.tostring(root, encoding='utf-8', xml_declaration=True)
    with ZipFile(HERE / name, 'w', ZIP_DEFLATED) as out:
        for part, data in parts.items(): out.writestr(part, data)
    print(HERE / name)


def main():
    content = json.loads((HERE / 'week11_content.json').read_text(encoding='utf-8'))
    evidence = HERE.parent / 'evidence/week11/risk-observations.json'
    assert json.loads(evidence.read_text(encoding='utf-8'))['total'] == 8
    regression = (evidence.parent / 'regression-tests.txt').read_text(encoding='utf-8')
    assert '65 passing' in regression
    render('week11_report.docx', content['weekly'])
    render('security_guide_week11.docx', content['guide'])
    with ZipFile(HERE / 'vulnerability_report_week10.docx') as source:
        previous = E.fromstring(source.read('word/document.xml'))
    rows = []
    for tr in previous.findall('.//w:tbl/w:tr', N):
        rows.append([''.join(t.text or '' for t in tc.findall('.//w:t', N)) for tc in tr.findall('w:tc', N)])
    updates = {
        '3': ['부분 해결 유지: 다른 2명 운영 가능', '11주차 재개·최초 관리자 제거 거부 확인. 최초 키 유출 시 완전 폐기 불가'],
        '6': ['미해결: 진단·방침 문서화 완료, 익명 투표는 후속 과제', '11주차 거래 from+vote(1), 외부 참여·득표 조회 재현. 화면 비노출·private 선언은 해결책 아님'],
        '7': ['문서화 완료·잔여 위험: 키 관리·대응 지침', '11주차 임시 키 복사 선투표, 1/2 대기, 정상 2명 제거·대체 확인. 도용 판별·과거 승인 폐기 불가'],
    }
    for row in rows[1:]:
        if row[0] in updates: row[2:] = updates[row[0]]
    intro = section('11주차 취약점진단 현황',
        '기준일: 2026-11-13 / 총 15건: 해결 12 · 부분 해결 1 · 잔여 위험 2',
        'No.6·7의 예정 작업을 진단·문서화 완료로 구체화했다. 기술적 위험을 해결됨으로 올리지 않았다. 익명 투표는 후속 과제다.',
        '기존 자동 테스트 65개 통과 + 별도 진단·통제 확인 8항목. 8항목 확인 성공은 취약점 해결을 뜻하지 않는다.',
        '주간 제출물은 추진보고서이며, 이 표와 가이드는 최종 결과물용 누적 자료다. 기존 분류·자체 심각도 유지.')
    save('vulnerability_report_week11.docx', intro + plain_table(rows, [800, 3400, 3500, 6300]), landscape=True)


if __name__ == '__main__':
    main()
