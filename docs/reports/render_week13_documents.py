"""Word 출력 PDF를 독립 렌더러로 확인한다. 앱 의존성은 변경하지 않는다.
검토 도구: TEMP/capstone-pdf-review에 설치한 pymupdf (또는 CAPSTONE_PDF_TOOLS 경로).
"""
from pathlib import Path
import json
import os
import re
import sys
import tempfile

sys.path.insert(0, os.environ.get('CAPSTONE_PDF_TOOLS', str(Path(tempfile.gettempdir())/'capstone-pdf-review')))
import pymupdf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT/'docs/evidence/week13/document-preview'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pages = []
    filenames = ['week13_report', 'week13_easy_explanation', 'vulnerability_report_week13', 'final_diagnosis_report_draft']
    counts = {}
    for name in filenames:
        with pymupdf.open(HERE/f'{name}.pdf') as document:
            counts[name] = len(document)
            for index, page in enumerate(document):
                page.get_pixmap(matrix=pymupdf.Matrix(1.1,1.1)).save(OUT/f'{name}-{index+1}.png')
                pages.append({'filename': name+'.pdf', 'page':index+1, 'text':page.get_text()})
    positions = []
    for number in range(1,16):
        hits = [p['page'] for p in pages if p['filename']=='final_diagnosis_report_draft.pdf' and f'5-{number:02}.' in re.sub(r'\s+','',p['text'])]
        assert len(hits)==1,(number,hits)
        positions.append({'finding':number,'page':hits[0]})
    assert counts == {'week13_report':2,'week13_easy_explanation':2,'vulnerability_report_week13':3,'final_diagnosis_report_draft':26},counts
    with pymupdf.open() as contact:
        page = contact.new_page(width=1040,height=7*380)
        page.draw_rect(page.rect,color=None,fill=(.88,.90,.94))
        for number in range(1,27):
            x=((number-1)%4)*260; y=((number-1)//4)*380
            page.insert_text((x+8,y+14),f'Page {number}',fontsize=11)
            page.insert_image(pymupdf.Rect(x+5,y+20,x+255,y+374),filename=str(OUT/f'final_diagnosis_report_draft-{number}.png'))
        page.get_pixmap().save(OUT/'final-report-contact.png')
    schedule_out=ROOT/'docs/evidence/final-schedule'
    with pymupdf.open(HERE/'final_schedule_20261202.pdf') as schedule:
        for index,page in enumerate(schedule):
            page.get_pixmap(matrix=pymupdf.Matrix(1.1,1.1)).save(schedule_out/f'schedule-{index+1}.png')
    (OUT/'pages.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (OUT/'finding-pages.json').write_text(json.dumps(positions,indent=2)+'\n',encoding='utf-8')
    print('Independent PDF rendering and finding order checked:',counts)


if __name__=='__main__':
    main()
