// Word에서 내보낸 PDF를 페이지별 PNG로 렌더링하고 텍스트·쪽 크기를 기록한다.
// 도구 패키지: TEMP/capstone-week8-tools의 pdfjs-dist, @napi-rs/canvas.
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
const output = path.resolve(reports, '../evidence/week8/document-preview');
fs.mkdirSync(output, { recursive: true });
const results = [];
for (const filename of fs.readdirSync(reports).filter(name => name.endsWith('.pdf') && !name.endsWith('_template.pdf'))) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(reports, filename))), useSystemFonts: true }).promise;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    fs.writeFileSync(path.join(output, `${filename.slice(0, -4)}-${number}.png`), canvas.toBuffer('image/png'));
    const text = await page.getTextContent();
    const strings = text.items.map(item => item.str).filter(Boolean);
    results.push({ filename, page: number, width: viewport.width, height: viewport.height, text: strings.join('\n') });
  }
  console.log(filename, pdf.numPages, 'pages rendered');
}
fs.writeFileSync(path.join(output, 'pages.json'), JSON.stringify(results, null, 2));
