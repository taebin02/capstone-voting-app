"""최종 보고서용 작은 DOCX 작성기. Python 표준 라이브러리만 사용한다."""
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_DEFLATED
import struct
import xml.etree.ElementTree as E

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
NS = {'w': W}
E.register_namespace('w', W)
E.register_namespace('r', R)


def tag(parent, name, attrs=None):
    return E.SubElement(parent, f'{{{W}}}{name}', {f'{{{W}}}{k}': str(v) for k, v in (attrs or {}).items()})


class ReportDocument:
    def __init__(self, template):
        with ZipFile(template) as source:
            self.parts = {name: source.read(name) for name in source.namelist()}
        self.root = E.fromstring(self.parts['word/document.xml'])
        body = self.root.find('w:body', NS)
        self.section = deepcopy(body.find('w:sectPr', NS))
        # Match a readable A4 portrait layout for long final reports.
        for child in list(self.section):
            if child.tag in (f'{{{W}}}headerReference', f'{{{W}}}footerReference'):
                self.section.remove(child)
        size = self.section.find('w:pgSz', NS)
        size.set(f'{{{W}}}w', '11906'); size.set(f'{{{W}}}h', '16838')
        margins = self.section.find('w:pgMar', NS)
        for key, value in {'top': 900, 'bottom': 900, 'left': 1000, 'right': 1000}.items():
            margins.set(f'{{{W}}}{key}', str(value))
        self.root.remove(body)
        self.body = E.SubElement(self.root, f'{{{W}}}body')
        rel_name = 'word/_rels/document.xml.rels'
        self.rels = E.fromstring(self.parts[rel_name]) if rel_name in self.parts else E.Element(f'{{{PKG}}}Relationships')
        self.image_count = 0

    def paragraph(self, text, size=21, bold=False, color=None, keep=False, center=False, after=100, mono=False):
        p = tag(self.body, 'p')
        props = tag(p, 'pPr')
        tag(props, 'spacing', {'after': after, 'line': 285, 'lineRule': 'auto'})
        if keep: tag(props, 'keepNext')
        if center: tag(props, 'jc', {'val': 'center'})
        r = tag(p, 'r'); rp = tag(r, 'rPr')
        tag(rp, 'rFonts', {'ascii': 'Consolas' if mono else 'Malgun Gothic', 'hAnsi': 'Consolas' if mono else 'Malgun Gothic', 'eastAsia': '맑은 고딕'})
        tag(rp, 'sz', {'val': size})
        if bold: tag(rp, 'b')
        if color: tag(rp, 'color', {'val': color})
        for index, line in enumerate(str(text).split('\n')):
            if index: tag(r, 'br')
            t = tag(r, 't'); t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve'); t.text = line
        return p

    def heading(self, text, level=1):
        return self.paragraph(text, size=30 if level == 1 else 24, bold=True, color='3C2B8E', keep=True, after=150)

    def page(self, title=None):
        if len(self.body):
            p = tag(self.body, 'p'); tag(tag(p, 'r'), 'br', {'type': 'page'})
        if title: self.heading(title)

    def code(self, text):
        p = self.paragraph(text, size=17, mono=True, after=140)
        props = p.find('w:pPr', NS)
        props.find('w:spacing', NS).set(f'{{{W}}}line', '230')
        tag(props, 'keepLines')
        tag(props, 'shd', {'fill': 'F0F3F8'})

    def table(self, rows, widths):
        tbl = tag(self.body, 'tbl'); props = tag(tbl, 'tblPr')
        tag(props, 'tblW', {'w': sum(widths), 'type': 'dxa'}); tag(props, 'tblLayout', {'type': 'fixed'})
        borders = tag(props, 'tblBorders')
        for side in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
            tag(borders, side, {'val': 'single', 'sz': 4, 'color': 'CDD6E5'})
        grid = tag(tbl, 'tblGrid')
        for width in widths: tag(grid, 'gridCol', {'w': width})
        for index, row in enumerate(rows):
            tr = tag(tbl, 'tr'); tp = tag(tr, 'trPr'); tag(tp, 'cantSplit')
            if index == 0: tag(tp, 'tblHeader')
            for text, width in zip(row, widths):
                cell = tag(tr, 'tc'); cp = tag(cell, 'tcPr'); tag(cp, 'tcW', {'w': width, 'type': 'dxa'})
                if index == 0: tag(cp, 'shd', {'fill': 'EEE9FB'})
                p = self.paragraph(text, size=18, bold=index == 0, after=50)
                self.body.remove(p); cell.append(p)
        self.paragraph('', size=8, after=40)

    def image_row(self, paths, max_width_mm=78, max_height_mm=155):
        p = tag(self.body, 'p'); tag(tag(p, 'pPr'), 'jc', {'val': 'center'})
        for path in paths:
            path = Path(path); data = path.read_bytes()
            assert data[:8] == b'\x89PNG\r\n\x1a\n'
            width, height = struct.unpack('>II', data[16:24])
            scale = min(max_width_mm / width, max_height_mm / height)
            cx, cy = int(width * scale * 36000), int(height * scale * 36000)
            self.image_count += 1; number = self.image_count
            relid = f'rIdReportImage{number}'
            target = f'media/report-image-{number}.png'
            self.parts['word/' + target] = data
            E.SubElement(self.rels, f'{{{PKG}}}Relationship', {'Id': relid, 'Type': R + '/image', 'Target': target})
            drawing = f'''<w:r xmlns:w="{W}" xmlns:r="{R}"><w:drawing>
<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{number}" name="Evidence {number}"/><wp:cNvGraphicFramePr/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="{path.name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{relid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'''
            p.append(E.fromstring(drawing))

    def save(self, destination):
        # Number every page; final pagination is determined by Word's PDF export.
        footer_id = 'rIdFinalReportFooter'
        E.SubElement(self.rels, f'{{{PKG}}}Relationship', {'Id': footer_id, 'Type': R + '/footer', 'Target': 'reportFooter.xml'})
        reference = tag(self.section, 'footerReference', {'type': 'default'})
        reference.set(f'{{{R}}}id', footer_id)
        self.section.remove(reference); self.section.insert(0, reference)
        footer = E.Element(f'{{{W}}}ftr')
        p = tag(footer, 'p'); tag(tag(p, 'pPr'), 'jc', {'val': 'center'})
        r = tag(p, 'r'); tag(r, 't').text = '13주차 선행 작성 · 최종 진단보고서 초안 | '
        field = tag(p, 'fldSimple', {'instr': 'PAGE'}); tag(tag(field, 'r'), 't').text = '1'
        self.parts['word/reportFooter.xml'] = E.tostring(footer, encoding='utf-8', xml_declaration=True)
        self.body.append(self.section)
        self.parts['word/document.xml'] = E.tostring(self.root, encoding='utf-8', xml_declaration=True)
        self.parts['word/_rels/document.xml.rels'] = E.tostring(self.rels, encoding='utf-8', xml_declaration=True)
        content_types = E.fromstring(self.parts['[Content_Types].xml'])
        if not any(n.get('Extension') == 'png' for n in content_types):
            E.SubElement(content_types, f'{{{CT}}}Default', {'Extension': 'png', 'ContentType': 'image/png'})
        E.SubElement(content_types, f'{{{CT}}}Override', {'PartName': '/word/reportFooter.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'})
        self.parts['[Content_Types].xml'] = E.tostring(content_types, encoding='utf-8', xml_declaration=True)
        with ZipFile(destination, 'w', ZIP_DEFLATED) as output:
            for name, data in self.parts.items(): output.writestr(name, data)
