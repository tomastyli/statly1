// OG image generator — branded 1200x630 cards rendered SVG -> PNG/JPG via sharp.
// Usage: node og-gen.js   (renders every config in CONFIGS below)
const path = require('path');
const sharp = require('/Users/tomastylich/Desktop/Projekty/Lifefinance/node_modules/sharp');

const ROOT = '/Users/tomastylich/Desktop/Projekty';

// Escape text for XML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildSVG(c) {
  const {
    name, badge, line1, line2, sub, domain,
    bg1, bg2, accent, ink = '#ffffff', muted = 'rgba(255,255,255,0.62)',
  } = c;
  const FONT = "'Helvetica Neue', Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="22%" r="62%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <!-- accent top hairline -->
  <rect x="0" y="0" width="1200" height="6" fill="${accent}"/>
  <!-- watermark monogram -->
  <text x="1245" y="560" text-anchor="end" font-family="${FONT}" font-weight="800" font-size="540" fill="${accent}" fill-opacity="0.06" letter-spacing="-20">${esc(name.trim().charAt(0))}</text>
  <!-- brand row -->
  <rect x="80" y="92" width="40" height="40" rx="11" fill="${accent}"/>
  <text x="138" y="124" font-family="${FONT}" font-weight="800" font-size="40" fill="${ink}" letter-spacing="-1">${esc(name)}</text>
  <!-- badge -->
  <g>
    <rect x="80" y="250" width="${48 + badge.length * 13.0}" height="46" rx="23" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
    <text x="104" y="280" font-family="${FONT}" font-weight="700" font-size="21" fill="${accent}" letter-spacing="2">${esc(badge)}</text>
  </g>
  <!-- headline -->
  <text x="78" y="408" font-family="${FONT}" font-weight="800" font-size="84" fill="${ink}" letter-spacing="-2.5">${esc(line1)}</text>
  <text x="78" y="500" font-family="${FONT}" font-weight="800" font-size="84" fill="${accent}" letter-spacing="-2.5">${esc(line2)}</text>
  <!-- sub -->
  <text x="80" y="565" font-family="${FONT}" font-weight="500" font-size="31" fill="${ink}" fill-opacity="0.7">${esc(sub)}</text>
  <!-- domain -->
  <text x="1120" y="600" text-anchor="end" font-family="${FONT}" font-weight="700" font-size="28" fill="${accent}">${esc(domain)}</text>
</svg>`;
}

const CONFIGS = [
  {
    out: 'strechmont 2/og.jpg',
    name: 'Strechmont MR',
    badge: 'POKRÝVAČSTVÍ · ZLÍNSKÝ KRAJ',
    line1: 'Střecha je naše starost,',
    line2: 'vaše jistota.',
    sub: 'Pokrývač · Klempíř · Tesař · Hydroizolace',
    domain: 'strechmont-mr.cz',
    bg1: '#0c2347', bg2: '#071831', accent: '#ff5b63',
  },
  {
    out: 'stehovanileo/og-image.jpg',
    name: 'Stěhování Leo',
    badge: 'STĚHOVÁNÍ · LITOMYŠL & CELÁ ČR',
    line1: 'Stěhujeme vás',
    line2: 'bez stresu.',
    sub: 'Byty · Domy · Kanceláře · Po celé ČR a EU',
    domain: 'stehovanileo.cz',
    bg1: '#161310', bg2: '#0a0a0a', accent: '#e7253f',
  },
];

(async () => {
  for (const c of CONFIGS) {
    const svg = buildSVG(c);
    const outPath = path.join(ROOT, c.out);
    const img = sharp(Buffer.from(svg));
    if (outPath.endsWith('.jpg') || outPath.endsWith('.jpeg')) {
      await img.jpeg({ quality: 92 }).toFile(outPath);
    } else {
      await img.png().toFile(outPath);
    }
    console.log('✓ ' + c.out);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
