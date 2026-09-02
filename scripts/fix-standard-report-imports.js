const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'tests', 'admin', 'standard-report');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

// Longest prefix first so replacements don't cascade into each other.
const replacements = [
  { from: /'(\.\.\/){5}apr\//g, to: (m) => `'${'../'.repeat(6)}apr/` },
  { from: /'(\.\.\/){4}apr\//g, to: (m) => `'${'../'.repeat(5)}apr/` },
  { from: /'(\.\.\/){3}apr\//g, to: (m) => `'${'../'.repeat(4)}apr/` },
];

let changedFiles = 0;
let changedLines = 0;
for (const file of walk(root)) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    const origLines = original.split('\n');
    const newLines = content.split('\n');
    for (let i = 0; i < origLines.length; i++) {
      if (origLines[i] !== newLines[i]) changedLines++;
    }
    console.log('fixed', path.relative(root, file));
  }
}
console.log(`\n${changedFiles} files changed, ${changedLines} import lines updated`);
