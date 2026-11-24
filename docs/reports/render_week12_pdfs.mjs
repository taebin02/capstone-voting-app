// 12주차 PDF만 렌더링하며 8주차 증거 폴더는 변경하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const toolsDir = process.env.WEEK8_TOOLS_DIR || path.join(os.tmpdir(), 'capstone-week8-tools');
const require = createRequire(path.join(toolsDir, 'package.json'));
const { createCanvas, DOMMatrix, ImageData, Path2D } = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import(pathToFileURL(path.join(toolsDir, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const reports = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(reports, '../evidence/week12/document-preview');
fs.mkdirSync(output, { recursive: true });
const pages = [];
for (const filename of ['week12_report.pdf', 'week12_easy_explanation.pdf', 'deployment_guide_week12.pdf', 'final_evidence_index_week12.pdf', 'vulnerability_report_week12.pdf']) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(reports, filename))), useSystemFonts: true }).promise;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    fs.writeFileSync(path.join(output, `${filename.slice(0, -4)}-${number}.png`), canvas.toBuffer('image/png'));
    const content = await page.getTextContent();
    pages.push({ filename, page: number, text: content.items.map(item => item.str).join(' ') });
  }
  console.log(filename, pdf.numPages, 'pages');
}
fs.writeFileSync(path.join(output, 'pages.json'), JSON.stringify(pages, null, 2));
