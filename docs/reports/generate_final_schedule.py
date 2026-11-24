"""12/2 영상 포함 전체 완성, 12/4 제출 마감에 맞춘 일정표 생성."""
from pathlib import Path
from datetime import date
import json
from generate_week11_reports import render

HERE = Path(__file__).resolve().parent


def main():
    data = json.loads((HERE / 'final_schedule.json').read_text(encoding='utf-8'))
    assert date.fromisoformat(data['internalCompletionTarget']) < date.fromisoformat(data['submissionDeadline'])
    rows = [['기간', '할 일', '완료 기준']]
    for item in data['milestones']:
        start, end = date.fromisoformat(item['start']), date.fromisoformat(item['end'])
        label = f'{start.month}/{start.day}'
        if start != end:
            label += f'~{end.month}/{end.day}'
        rows.append([label, item['task'], item['output']])
    entries = [
        ['title', '최종 제출 일정 수정안'],
        ['subtitle', '12월 2일(수) 영상 포함 전체 완성 · 12월 4일(금) 제출 마감'],
        ['metadata', '이태빈 | 수정일: 2026-11-24 | 블록체인 기반 전자투표시스템'],
        ['body', data['baseline']],
        ['body', data['scope']],
        ['heading', '1. 남은 작업 일정'],
        ['table', rows, [1600, 2600, 5160]],
        ['heading', '2. 이번 마감의 우선순위'],
    ]
    entries += [['bullet', text] for text in data['priorities']]
    entries += [
        ['heading', '3. 제출·발표 확인 사항'],
        ['body', '최종 결과물은 취약점진단보고서와 보안 개선 투표 시스템이다. 주간 추진보고서와 최종 진단보고서를 구분한다.'],
        ['body', '12/4는 사용자가 확인한 제출 마감이다. 내부 완료일은 12/2이며 영상 촬영만이 아니라 편집·내보내기·최종 재생 확인까지 포함한다. 정확한 마감 시각·영상 길이/파일 규격·현장 발표일은 학교 안내를 확인한다.'],
        ['body', '최종 파일 점검: PDF 표/그림, 시스템 실행 안내, 증거 경로, 영상 음성·글자·처음부터 끝까지 재생 확인, 비밀 설정·불필요한 의존성 제외, 원본과 제출본 백업. 실제 사용자 영상 촬영과 발표 연습은 사용자가 수행한다.'],
        ['body', '12/3~4는 제출·오류 대응 여유로 두고 새 기능이나 영상 첫 촬영을 배치하지 않는다. 이 문서는 일정 수정이며 이후 단계가 이미 완료됐다는 뜻은 아니다.'],
    ]
    render('final_schedule_20261202.docx', entries)


if __name__ == '__main__':
    main()
