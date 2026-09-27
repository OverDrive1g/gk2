// Keep the static script usable both on Pages and when opening index.html directly.
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('./core.js');
const source = path.join(__dirname, 'workshop-2026-09-27.json');
const data = validate(JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')));
const script = '// Generated from workshop-2026-09-27.json by node build-default.cjs\n'
  + 'globalThis.DEFAULT_WORKSHOP = ' + JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n';
fs.writeFileSync(path.join(__dirname, 'default-workshop.js'), script, 'utf8');
