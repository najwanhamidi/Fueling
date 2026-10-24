// Copies the web app (../app) into ./www for Capacitor.
const fs = require('fs');
const path = require('path');
const dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, '..', 'app'), dst, { recursive: true });
console.log('Copied web app →', dst);
