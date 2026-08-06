const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');
const includePattern = /data-include="([^"]+)"/g;
const maxIncludeDepth = 10;

function resolveInclude(includePath) {
  return path.resolve(siteRoot, includePath);
}

function walkIncludes(filePath, stack = []) {
  assert.ok(fs.existsSync(filePath), `Missing HTML partial: ${filePath}`);
  assert.ok(stack.length < maxIncludeDepth, `Partial nesting exceeds ${maxIncludeDepth} levels`);
  assert.ok(!stack.includes(filePath), `Circular HTML partial include: ${filePath}`);

  const source = fs.readFileSync(filePath, 'utf8');
  const children = [...source.matchAll(includePattern)]
    .map((match) => resolveInclude(match[1]));
  return [filePath, ...children.flatMap((child) => walkIncludes(child, [...stack, filePath]))];
}

test('every editor partial resolves without cycles', () => {
  const files = walkIncludes(path.join(siteRoot, 'editor.html'));

  assert.ok(files.some((file) => file.endsWith('editor-panel.html')));
  assert.ok(files.some((file) => file.endsWith('schema-columns.html')));
  assert.ok(files.some((file) => file.endsWith('schema-quality.html')));
});

test('partial loader hydrates includes nested inside HTML templates', () => {
  const loader = fs.readFileSync(path.join(siteRoot, 'js/include-html.js'), 'utf8');

  assert.match(loader, /function findIncludeNodes/);
  assert.match(loader, /findIncludeNodes\(template\.content\)/);
  assert.match(loader, /const includeNodes = findIncludeNodes\(\)/);
});
