/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Přijímá data z formuláře na statly.cz a odesílá je e-mailem přes Resend.
 *
 * Vyžaduje tyto Environment Variables nastavené v Cloudflare Pages:
 *   - RESEND_API_KEY    (povinné)  → API klíč z resend.com/api-keys
 *   - CONTACT_TO        (volitelné, výchozí: tomas.tylich@seznam.cz)  → kam chodí poptávky
 *   - CONTACT_FROM      (volitelné, výchozí: "Statly <onboarding@resend.dev>")
 *                                  → odesílatel; po ověření vlastní domény nastavte
 *                                    např. "Statly <poptavka@statly.cz>"
 */

const DEFAULT_TO   = 'tomas.tylich@seznam.cz';
const DEFAULT_FROM = 'Statly <onboarding@resend.dev>';

// jednoduchá in-memory rate limit (na worker isolate)
const recentSubmissions = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuta
const RATE_LIMIT_MAX       = 3;       // max 3 odeslání z jedné IP za minutu

// Povolené originy: produkce + Cloudflare Pages preview (*.pages.dev)
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin požadavky často Origin neposílají
  return origin === 'https://statly.cz'
      || origin === 'https://www.statly.cz'
      || /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin);
}

function corsHeaders(origin) {
  const allow = isAllowedOrigin(origin) && origin ? origin : 'https://statly.cz';
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function jsonResponse(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) }
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function clip(s, max) {
  s = String(s || '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function checkRateLimit(ip) {
  const now = Date.now();
  // úklid starých záznamů
  for (const [k, arr] of recentSubmissions) {
    const fresh = arr.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) recentSubmissions.delete(k);
    else recentSubmissions.set(k, fresh);
  }
  const entries = recentSubmissions.get(ip) || [];
  if (entries.length >= RATE_LIMIT_MAX) return false;
  entries.push(now);
  recentSubmissions.set(ip, entries);
  return true;
}

// Cloudflare Turnstile ověření.
// Aktivní jen když je nastavená env proměnná TURNSTILE_SECRET_KEY.
// Bez ní vrací { active: false } a formulář funguje jako dosud (honeypot + rate limit).
async function verifyTurnstile(token, ip, secret) {
  if (!secret) return { active: false, ok: true };
  if (!token)  return { active: true,  ok: false };
  try {
    const body = new URLSearchParams();
    body.append('secret', secret);
    body.append('response', token);
    if (ip && ip !== 'unknown') body.append('remoteip', ip);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const out = await resp.json().catch(() => ({ success: false }));
    return { active: true, ok: !!out.success };
  } catch (err) {
    console.error('Turnstile verify failed:', err);
    return { active: true, ok: false };
  }
}

// ── CORS preflight ───────────────────────────────────────
export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

// ── POST /api/contact ────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');

  // 0) Odmítnout požadavky z cizích originů (ochrana proti zneužití z jiných webů)
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, { error: 'Neplatný původ požadavku.' }, origin);
  }

  // 1) Rate limit podle IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return jsonResponse(429, { error: 'Příliš mnoho pokusů. Zkuste to za chvíli prosím.' }, origin);
  }

  // 2) Parse JSON
  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Neplatný formát požadavku.' });
  }

  // 3) Honeypot – pokud je vyplněný, mlčky zahodit a vrátit "ok"
  //    (bot si myslí, že prošel, my máme klid)
  if (data.website && String(data.website).trim() !== '') {
    return jsonResponse(200, { ok: true });
  }

  // 3b) Turnstile – aktivní jen při nastaveném TURNSTILE_SECRET_KEY
  const turnstile = await verifyTurnstile(data.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  if (turnstile.active && !turnstile.ok) {
    return jsonResponse(400, { error: 'Nepodařilo se ověřit, že nejste robot. Načtěte prosím stránku znovu.' }, origin);
  }

  // 4) Sanitizace & validace
  const name     = clip(data.name,     120);
  const company  = clip(data.company,  160);
  const email    = clip(data.email,    160);
  const phone    = clip(data.phone,    40);
  const industry = clip(data.industry, 160);
  const service  = clip(data.service,  160);
  const message  = clip(data.message,  3000);
  const mesto    = clip(data.mesto,    80);
  const gdpr     = !!data.gdpr;

  if (!name || name.length < 2)  return jsonResponse(400, { error: 'Chybí jméno.' });
  if (!isValidEmail(email))      return jsonResponse(400, { error: 'Neplatný e‑mail.' });
  if (!industry)                 return jsonResponse(400, { error: 'Chybí obor podnikání.' });
  if (!service)                  return jsonResponse(400, { error: 'Chybí typ služby.' });
  if (!gdpr)                     return jsonResponse(400, { error: 'Chybí souhlas se zpracováním.' });

  // 5) Resend API key
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Missing RESEND_API_KEY env var');
    return jsonResponse(500, { error: 'Server není správně nakonfigurován. Napište mi prosím přímo na e‑mail.' });
  }

  const to   = env.CONTACT_TO   || DEFAULT_TO;
  const from = env.CONTACT_FROM || DEFAULT_FROM;

  // 6) Sestavení e-mailu
  const subject = mesto
    ? `Nová poptávka z webu (${mesto}) — ${name}`
    : `Nová poptávka na statly.cz — ${name}`;

  const html = `
<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0a1410;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0d3d2c 0%,#1B7F5F 60%,#22c47e 130%);padding:28px 32px;color:#fff;">
          <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85;font-weight:600;">Statly · Nová poptávka</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;letter-spacing:-0.02em;">${escapeHtml(name)}</div>
          ${company ? `<div style="font-size:14px;opacity:0.85;margin-top:2px;">${escapeHtml(company)}</div>` : ''}
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.55;">
            <tr><td style="padding:8px 0;color:#5a7a6a;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;width:130px;vertical-align:top;">E‑mail</td>
                <td style="padding:8px 0;color:#0a1410;"><a href="mailto:${escapeHtml(email)}" style="color:#1B7F5F;text-decoration:none;">${escapeHtml(email)}</a></td></tr>
            ${phone ? `
            <tr><td style="padding:8px 0;color:#5a7a6a;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;">Telefon</td>
                <td style="padding:8px 0;color:#0a1410;"><a href="tel:${escapeHtml(phone)}" style="color:#1B7F5F;text-decoration:none;">${escapeHtml(phone)}</a></td></tr>` : ''}
            <tr><td style="padding:8px 0;color:#5a7a6a;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;">Obor</td>
                <td style="padding:8px 0;color:#0a1410;">${escapeHtml(industry)}</td></tr>
            <tr><td style="padding:8px 0;color:#5a7a6a;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;">Služba</td>
                <td style="padding:8px 0;color:#0a1410;"><strong>${escapeHtml(service)}</strong></td></tr>
            ${mesto ? `
            <tr><td style="padding:8px 0;color:#5a7a6a;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;">Stránka</td>
                <td style="padding:8px 0;color:#0a1410;">${escapeHtml(mesto)}</td></tr>` : ''}
          </table>
          ${message ? `
          <div style="margin-top:24px;padding-top:24px;border-top:1px solid #eef0ef;">
            <div style="color:#5a7a6a;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Zpráva</div>
            <div style="color:#0a1410;font-size:15px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(message)}</div>
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f4f6f5;color:#5a7a6a;font-size:12px;border-top:1px solid #eef0ef;">
          Odesláno z formuláře na <a href="https://statly.cz" style="color:#1B7F5F;text-decoration:none;">statly.cz</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const text =
`Nová poptávka na statly.cz
=============================

Jméno:    ${name}
${company ? `Firma:    ${company}\n` : ''}E-mail:   ${email}
${phone ? `Telefon:  ${phone}\n` : ''}Obor:     ${industry}
Služba:   ${service}
${mesto ? `Stránka:  ${mesto}\n` : ''}
${message ? `Zpráva:\n${message}\n` : '(bez zprávy)'}

---
Odesláno z https://statly.cz
`;

  // 7) Volání Resend API
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject,
        html,
        text
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error('Resend API error:', resp.status, errBody);
      return jsonResponse(502, { error: 'Odeslání e‑mailu se nezdařilo. Zkuste to prosím znovu nebo mi napište přímo.' });
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error('Resend fetch failed:', err);
    return jsonResponse(500, { error: 'Server momentálně nereaguje. Zkuste to prosím za chvíli.' });
  }
}

// Ostatní metody (GET, PUT, ...) — metodově specifické handlery výše mají přednost
export async function onRequest() {
  return jsonResponse(405, { error: 'Method not allowed' });
}
