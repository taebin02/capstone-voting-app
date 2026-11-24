"""12주차 보고서·학습 메모·배포 가이드 생성. 이전 주차 자료는 변경하지 않는다."""
from pathlib import Path
from zipfile import ZipFile
import json
import xml.etree.ElementTree as E
from generate_week11_reports import render, N
from generate_week8_reports import section, table, save
from build_week12_evidence import main as build_evidence

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE.parent / 'evidence/week12'


def main():
    deployment = json.loads((EVIDENCE / 'deployment-check.json').read_text(encoding='utf-8'))
    browser = json.loads((EVIDENCE / 'browser/result.json').read_text(encoding='utf-8'))
    assert len(deployment['checks']) == 8 and all(item['status'] == 'passed' for item in deployment['checks'])
    assert browser['status'] == 'passed' and len(browser['browserCases']) == 3
    assert len(browser['configCases']) == 6
    assert '65 passing' in (EVIDENCE / 'regression-tests.txt').read_text(encoding='utf-8-sig')
    content = json.loads((HERE / 'week12_content.json').read_text(encoding='utf-8'))
    render('week12_report.docx', content['weekly'])
    render('week12_easy_explanation.docx', content['easy'])
    render('deployment_guide_week12.docx', content['deployment'])
    build_evidence()
    with ZipFile(HERE / 'vulnerability_report_week11.docx') as archive:
        previous = E.fromstring(archive.read('word/document.xml'))
    rows = [[''.join(t.text or '' for t in cell.findall('.//w:t', N)) for cell in row.findall('w:tc', N)]
            for row in previous.findall('.//w:tbl/w:tr', N)]
    body = section('12주차 취약점진단 현황', '기준일: 2026-11-24 / 해결 12 · 부분 해결 1 · 잔여 위험 2 (총 15건)',
                   '11주차의 기술적 판단 유지. 12주차 배포 준비·연결 점검을 기존 취약점의 신규 해결 건수로 합산하지 않았다.',
                   '기존 테스트 65개 회귀 통과. 진단→근거→조치→검증→한계의 자료 목록을 final-evidence-index.json에 연결했다.',
                   '실제 Sepolia 배포·실제 MetaMask 테스트넷 확인은 미실시. 이 표는 최종 보고서용 누적 자료이며 주간 제출물은 추진보고서다.')
    save('vulnerability_report_week12.docx', body + table(rows, [800, 3400, 3500, 6300]), landscape=True)


if __name__ == '__main__':
    main()
