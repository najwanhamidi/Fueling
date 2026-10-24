// Copies the web app (../app) into ./www before running or packaging the desktop build.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'app');
const dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('Copied web app →', dst);
