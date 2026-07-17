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
  assert.match(docsJs, /\.\/docs\/documentation\.md/);
  assert.match(docsJs, /buildToc/);
  assert.match(markdown, /# Documentation/);
  assert.match(markdown, /contrat comme référence commune/i);
});
