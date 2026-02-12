const fs = require('fs');
const path = require('path');

function generate() {
  const pkg = require(path.resolve(__dirname, '..', 'package.json'));
  const isDebug = process.argv.includes('--debug');

  const content = `export const BUILD_VERSION = '${pkg.version}';
export const BUILD_DEBUG = ${isDebug};
`;

  const outPath = path.resolve(__dirname, '..', 'src', 'generated', 'buildInfo.ts');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf-8');
}

generate();

module.exports = generate;
