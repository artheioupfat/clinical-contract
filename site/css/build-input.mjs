import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cssDir = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(cssDir, 'tailwind.input.css');
const generatedPath = path.join(cssDir, '.tailwind.generated.css');

function readManifestImports() {
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const imports = [...manifest.matchAll(/@import\s+["'](.+?)["'];/g)].map((match) => match[1]);
  if (!imports.length) {
    throw new Error('No CSS partial imports found in site/css/tailwind.input.css.');
  }
  return imports;
}

function readPartial(relativePath) {
  const absolutePath = path.join(cssDir, relativePath);
  return `/* ${relativePath} */\n${fs.readFileSync(absolutePath, 'utf8').trim()}\n`;
}

function buildInput() {
  const partials = readManifestImports();
  const source = [
    '@tailwind base;',
    '@tailwind components;',
    '@tailwind utilities;',
    '',
    ...partials.map(readPartial),
  ].join('\n');

  fs.writeFileSync(generatedPath, `${source}\n`);
  console.log(`Built ${path.relative(process.cwd(), generatedPath)} from ${partials.length} CSS partials.`);
}

function startTailwindWatcher() {
  const child = spawn(
    'tailwindcss',
    [
      '-c',
      'tailwind.config.js',
      '-i',
      './site/css/.tailwind.generated.css',
      '-o',
      './site/css/tailwind.css',
      '--watch',
    ],
    { stdio: 'inherit' }
  );

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function watchSources() {
  let watchedFiles = new Set();

  function refresh() {
    const partials = readManifestImports().map((relativePath) => path.join(cssDir, relativePath));
    const nextFiles = new Set([manifestPath, ...partials]);

    for (const file of watchedFiles) {
      if (!nextFiles.has(file)) fs.unwatchFile(file);
    }

    for (const file of nextFiles) {
      if (!watchedFiles.has(file)) {
        fs.watchFile(file, { interval: 250 }, () => {
          try {
            buildInput();
            refresh();
          } catch (error) {
            console.error(error);
          }
        });
      }
    }

    watchedFiles = nextFiles;
  }

  refresh();
}

buildInput();

if (process.argv.includes('--watch')) {
  watchSources();
  startTailwindWatcher();
}
