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
  assert.match(markdown, /# Guide d'utilisation/);
  assert.match(markdown, /Purpose.*Usage.*Limitations/s);
  assert.match(markdown, /Bien qu'elles soient facultatives/);
  assert.match(markdown, /sans contrainte de type/);
});
