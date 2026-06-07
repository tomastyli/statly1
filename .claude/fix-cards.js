// Remove domain from the browser bar; add a green domain pill inside the image (live cards only).
const fs = require('fs');
const path = require('path');
const DIR = '/Users/tomastylich/Desktop/Projekty/statly1';
const files = ['index.html', 'portfolio.html'];

const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/></svg>';
const pill = (d) => `<span class="folio-domain">${GLOBE}${d}<span class="fd-arrow">↗</span></span>`;

// Match: browser-url (with optional lock svg) ... up to the folio-img close + folio-info open.
const RE = /<span class="browser-url">(?:<svg[\s\S]*?<\/svg>)?([^<]+)<\/span>([\s\S]*?)\n\s*<\/div>\n\s*<div class="folio-info">/g;

const CSS_ANCHOR = '.folio:hover .folio-visit { transform: translateY(0); }';
const CSS_ADD = `${CSS_ANCHOR}
.folio-domain { position: absolute; left: 14px; bottom: 14px; z-index: 5; display: inline-flex; align-items: center; gap: 0.45rem; background: var(--green-bright); color: var(--green-deep); font-family: var(--mono); font-size: 0.76rem; font-weight: 700; letter-spacing: -0.01em; padding: 0.45rem 0.8rem; border-radius: 100px; box-shadow: 0 6px 22px rgba(34,196,126,0.35); transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s; }
.folio:hover .folio-domain { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(34,196,126,0.5); }
.folio-domain svg { width: 13px; height: 13px; flex-shrink: 0; }
.fd-arrow { font-weight: 700; opacity: 0.85; }`;

for (const f of files) {
  const p = path.join(DIR, f);
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes('folio-domain')) { console.log('skip (already done): ' + f); continue; }
  let live = 0, soon = 0;
  s = s.replace(RE, (m, domain, mid) => {
    domain = domain.trim();
    const isSoon = /folio-ph/.test(mid);
    if (isSoon) soon++; else live++;
    const insert = isSoon ? '' : `\n          ${pill(domain)}`;
    return `${mid}${insert}\n        </div>\n        <div class="folio-info">`;
  });
  if (s.includes(CSS_ANCHOR) && !s.includes('.folio-domain {')) s = s.replace(CSS_ANCHOR, CSS_ADD);
  fs.writeFileSync(p, s);
  console.log(`updated ${f} — live pills: ${live}, soon (dots only): ${soon}`);
}
