/**
 * Pre-processes Apps Script HTML templates into flat HTML files for Playwright tests.
 * Replaces <?!= include('X') ?> tags with the actual file content.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(__dirname, 'dist');

function readFile(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function buildTemplate(filename) {
  const html = readFile(filename);
  return html.replace(/<\?!=\s*include\('(\w+)'\)\s*\?>/g, (_, name) => {
    return readFile(`${name}.html`);
  });
}

fs.mkdirSync(DIST, { recursive: true });

const files = ['Index.html', 'ScopeManager.html', 'ExportDialog.html'];
for (const file of files) {
  const output = buildTemplate(file);
  fs.writeFileSync(path.join(DIST, file), output, 'utf8');
  console.log(`Built: tests/dist/${file}`);
}
