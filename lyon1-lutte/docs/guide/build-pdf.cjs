// Fabrique le guide des modos en PDF à partir de guide-modos.html (sans IA).
// Usage : node docs/guide/build-pdf.cjs   (nécessite Playwright / Chromium)
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const dir = __dirname;
  const out = path.join(dir, 'guide-modos.pdf');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(dir, 'guide-modos.html'), { waitUntil: 'networkidle' });
  await p.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font:8px sans-serif;color:#8a8a93;padding:0 15mm;display:flex;justify-content:space-between"><span>Guide des modos · Lyon 1 · La Doua en lutte · document interne</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await b.close();
  console.log('PDF :', out);
})();
