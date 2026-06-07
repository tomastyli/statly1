// Replace blurry logo.png with crisp inline-SVG logo (mark + wordmark) across all pages.
const fs = require('fs');
const path = require('path');
const DIR = '/Users/tomastylich/Desktop/Projekty/statly1';

const MARK_PATH = fs.readFileSync(path.join(DIR, 'bimi-logo.svg'), 'utf8').match(/<path d="([\s\S]*?)"\s*\/>/)[1];
const SYMBOL = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><symbol id="statly-mark" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="232" fill="#1B7F5F"/><g transform="translate(0,1024) scale(0.1,-0.1)" fill="#ffffff"><path d="${MARK_PATH}"/></g></symbol></svg>`;
const LOGO_HTML = `<svg class="logo-mark" aria-hidden="true"><use href="#statly-mark"/></svg><span class="logo-word">statly</span>`;
const IMG_RE = /<img src="logo\.png" alt="Statly" width="1920" height="1080">/g;

const CSS_OLD = `.nav-logo img { height: 34px; width: auto; }`;
const CSS_NEW = `.nav-logo { display: inline-flex; align-items: center; gap: 0.6rem; text-decoration: none; }
.nav-logo img { height: 34px; width: auto; }
.logo-mark { height: 34px; width: 34px; flex-shrink: 0; display: block; }
.logo-word { font-family: var(--sans); font-weight: 800; font-size: 1.4rem; letter-spacing: -0.045em; color: #fff; line-height: 1; }
.footer-logo .logo-mark { height: 30px; width: 30px; }
.footer-logo .logo-word { font-size: 1.25rem; }`;
const FCSS_OLD = `.footer-logo img { height: 32px; margin-bottom: 1rem; }`;
const FCSS_NEW = `.footer-logo { margin-bottom: 1.1rem; }
.footer-logo img { height: 32px; margin-bottom: 1rem; }`;

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  if (!s.includes('id="statly-mark"')) s = s.replace(/(<body[^>]*>)/, `$1\n${SYMBOL}`);
  s = s.replace(IMG_RE, LOGO_HTML);
  if (s.includes(CSS_OLD) && !s.includes('.logo-word')) s = s.replace(CSS_OLD, CSS_NEW);
  if (s.includes(FCSS_OLD) && !s.includes('.footer-logo { margin-bottom')) s = s.replace(FCSS_OLD, FCSS_NEW);
  if (s !== before) { fs.writeFileSync(p, s); changed++; console.log('✓ ' + f); }
}
console.log(`\nDone. ${changed} files updated.`);
