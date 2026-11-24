"""13주차 추진보고서와 정정 분류를 반영한 누적 표 생성."""
from pathlib import Path
import json
from generate_week11_reports import render
from generate_week8_reports import section, table, save

HERE = Path(__file__).resolve().parent
OUT = HERE.parent/'evidence/week13'


def main():
    review = json.loads((OUT/'evidence-review.json').read_text(encoding='utf-8'))
    assert review['testNamesFound'] == 65 and len(review['references']) == 28 and review['imageCount'] == 6
    data = json.loads((HERE/'week13_content.json').read_text(encoding='utf-8'))
    render('week13_report.docx', data['weekly'])
    render('week13_easy_explanation.docx', data['easy'])
    findings = json.loads((HERE/'final_findings.json').read_text(encoding='utf-8'))['items']
    labels = {'resolved':'해결','partial':'부분 해결','residual':'잔여 위험'}
    rows = [['No.', '진단 / 자체 심각도', '2026 대응 / STRIDE', '상태·검증 및 한계']]
    for item in findings:
        rows.append([item['id'], item['title']+' / '+item['severity'], item['owasp2026']+' / '+item['stride'],
                     labels[item['status']]+' — '+item['verification']+' 한계: '+item['remaining']])
    intro = section('13주차 취약점진단 현황 (선행 작성)', '실제 작성일: 2026-11-24 / 해결 12 · 부분 해결 1 · 잔여 위험 2',
                    '공식 OWASP 2026 대조: 기존 SC03 로직은 SC02로 정정, SC10 DoS는 2026 직접 대응 없음. 과거 표·로그는 보존했다.',
                    '번호 정정과 본문 작성은 신규 취약점 해결 건수로 합산하지 않는다. 상세 본문은 final_diagnosis_report_draft.docx v0.1을 참조한다.',
                    '기존 코드 65개 회귀 통과, 28개 참조·6개 화면 연결. 최종 통합 리허설·사용자 검토·영상·제출은 남아 있다.')
    save('vulnerability_report_week13.docx', intro+table(rows,[700,3000,3000,7300]),landscape=True)


if __name__ == '__main__':
    main()
