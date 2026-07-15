const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function readSiteFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, 'site', relativePath), 'utf8');
}

test('documentation page loads markdown content through the docs script', () => {
  const docsHtml = readSiteFile('docs.html');
  const docsJs = readSiteFile('js/docs.js');
  const markdown = readSiteFile('docs/documentation.md');

  assert.match(docsHtml, /js\/docs\.js/);
  assert.match(docsHtml, /marked@12\.0\.2/);
  assert.match(docsHtml, /docs-toc/);
  assert.match(docsHtml, /docs-toc-link--active/);
  assert.match(docsJs, /\.\/docs\/documentation\.md/);
  assert.match(docsJs, /buildToc/);
  assert.match(docsJs, /activeTocId/);
  assert.match(docsJs, /updateActiveTocFromScroll/);
  assert.match(docsJs, /isNearBottom/);
  assert.match(docsJs, /activeLine/);
  assert.match(markdown, /# Documentation/);
  assert.match(markdown, /échanges de données/i);
  assert.match(markdown, /contrat comme référence commune/i);
  assert.match(markdown, /uv tool install --python python3\.11 clinical-contract/);
  assert.match(markdown, /clinical-contract validate site\/examples\/contract\.yaml/);
  assert.match(markdown, /clinical-contract check site\/examples\/contract\.yaml site\/examples\/template\.parquet/);
  assert.match(markdown, /from clinical_contract import load_contract/);
});
