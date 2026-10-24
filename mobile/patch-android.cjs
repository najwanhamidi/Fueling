// Adds the camera permission (label scanning) and app icons to the generated Android project.
const fs = require('fs');
const path = require('path');
const manifest = path.join(__dirname, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let xml = fs.readFileSync(manifest, 'utf8');
if (!xml.includes('android.permission.CAMERA')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
  fs.writeFileSync(manifest, xml);
}
const res = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const icon = path.join(__dirname, 'www', 'icons', 'icon-192.png');
for (const d of fs.readdirSync(res).filter((d) => d.startsWith('mipmap-') && !d.includes('anydpi'))) {
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const t = path.join(res, d, f);
    if (fs.existsSync(t)) fs.copyFileSync(icon, t);
  }
}
// use plain PNG icons instead of the adaptive (vector) defaults
fs.rmSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });
console.log('Patched Android project');
