/**
 * Cloudflare Pages Function: POST /api/litomysl
 *
 * Zpracovává formulář z litomysl.html.
 * Pošle ti mail přes Resend a odešle automatickou odpověď klientovi.
 *
 * Nasazení:
 *   1. Ulož jako:  functions/api/litomysl.js
 *   2. V Cloudflare Pages → Settings → Environment Variables používá
 *      stejné proměnné jako contact.js:
 *        RESEND_API_KEY
 *        CONTACT_TO_EMAIL    (např. tomas.tylich@seznam.cz)
 *        CONTACT_FROM_EMAIL  (např. formular@statly.cz)
 */

export async function onRequestPost({ request, env }) {
  const baseHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  // ── 1. Parsování JSON ─────────────────────────────────────
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ error: 'Nesprávný formát požadavku.' }, 400, baseHeaders);
  }

  // ── 2. Honeypot ───────────────────────────────────────────
  if (data.website && String(data.website).trim().length > 0) {
    return json({ ok: true }, 200, baseHeaders);
  }

  // ── 3. Validace + normalizace ─────────────────────────────
  const name = clean(data.name, 120);
  if (!name || name.length < 2) {
    return json({ error: 'Doplň prosím své jméno.' }, 400, baseHeaders);
  }

  if (!data.gdpr) {
    return json({ error: 'Pro odeslání je nutný souhlas se zpracováním údajů.' }, 400, baseHeaders);
  }

  // Z litomyšlského formuláře chodí jedno pole "contact" (mail NEBO telefon)
  const contact = clean(data.contact, 160);
  if (!contact || contact.length < 5) {
    return json({ error: 'Doplň e‑mail nebo telefon.' }, 400, baseHeaders);
  }

  let email = '';
  let phone = '';
  if (contact.includes('@')) {
    if (!validEmail(contact)) {
      return json({ error: 'Zadej platný e‑mail.' }, 400, baseHeaders);
    }
    email = contact;
  } else {
    phone = contact;
  }

  const topics = Array.isArray(data.topics)
    ? data.topics.filter(Boolean).map(t => clean(t, 40))
    : [];
  const message = clean(data.message, 3000);

  // ── 4. Env proměnné ───────────────────────────────────────
  const apiKey = env.RESEND_API_KEY;
  const toEmail = env.CONTACT_TO_EMAIL || 'tomas.tylich@seznam.cz';
  const fromEmail = env.CONTACT_FROM_EMAIL || 'formular@statly.cz';

  if (!apiKey) {
    console.error('RESEND_API_KEY není nastavený');
    return json({ error: 'Chyba na straně serveru. Napiš mi prosím přímo na e‑mail.' }, 500, baseHeaders);
  }

  // ── 5. Mail pro tebe ──────────────────────────────────────
  const topicsLabel = topics.length ? ` (${mapTopics(topics).join(', ')})` : '';
  const subject = `🟢 Litomyšl: ${name}${topicsLabel}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Statly Litomyšl <${fromEmail}>`,
        to: [toEmail],
        reply_to: email || undefined,
        subject,
        html: buildOwnerEmail({ name, email, phone, topics, message }),
        tags: [
          { name: 'source', value: 'litomysl-landing' },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend error (owner):', res.status, errBody);
      return json({ error: 'Odeslání se nezdařilo. Zkus to prosím znovu.' }, 502, baseHeaders);
    }
  } catch (err) {
    console.error('Resend fetch error:', err);
    return json({ error: 'Síťová chyba. Napiš mi prosím přímo na e‑mail.' }, 502, baseHeaders);
  }

  // ── 6. Auto‑odpověď klientovi ─────────────────────────────
  if (email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Tomáš Tylich <${fromEmail}>`,
          to: [email],
          reply_to: toEmail,
          subject: 'Tvoje zpráva dorazila — Statly',
          html: buildClientEmail({ name }),
        }),
      });
    } catch (err) {
      console.warn('Auto-reply failed:', err);
    }
  }

  return json({ ok: true }, 200, baseHeaders);
}

// ─── Reject ne‑POST ────────────────────────────────────────
export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(v, maxLen = 500) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, maxLen);
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mapTopics(topics) {
  const map = {
    web: '🌐 Web',
    social: '📱 Sociální sítě',
    video: '🎬 Video',
    poradit: '🤷 Poradit',
  };
  return topics.map(t => map[t] || t);
}

// ─── Mail pro tebe ─────────────────────────────────────────
function buildOwnerEmail({ name, email, phone, topics, message }) {
  const rows = [];
  if (email) rows.push(['E‑mail', `<a href="mailto:${esc(email)}" style="color:#1B7F5F;">${esc(email)}</a>`]);
  if (phone) rows.push(['Telefon', `<a href="tel:${esc(phone)}" style="color:#1B7F5F;">${esc(phone)}</a>`]);
  if (topics && topics.length) rows.push(['Témata', mapTopics(topics).map(esc).join(', ')]);

  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 0;color:#5a7a6a;font-size:13px;font-family:Arial,sans-serif;width:110px;vertical-align:top;">${esc(k)}</td>
      <td style="padding:8px 0;color:#0a1410;font-size:14px;font-family:Arial,sans-serif;">${v}</td>
    </tr>`).join('');

  const messageBlock = message ? `
    <div style="margin-top:24px;padding:18px 20px;background:#f4f7f5;border-left:3px solid #22c47e;border-radius:6px;">
      <div style="color:#5a7a6a;font-size:12px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Zpráva</div>
      <div style="color:#0a1410;font-size:14px;font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap;">${esc(message)}</div>
    </div>` : '';

  const timestamp = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#e8efe9;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">

      <div style="background:#1B7F5F;padding:20px 24px;">
        <div style="display:inline-block;background:rgba(255,255,255,0.15);color:#fff;font-family:Arial,sans-serif;font-size:11px;font-weight:600;padding:4px 10px;border-radius:100px;letter-spacing:0.05em;">🟢 Litomyšl landing</div>
        <h1 style="margin:12px 0 0;color:#fff;font-family:Arial,sans-serif;font-size:20px;font-weight:700;">Nová zpráva od ${esc(name)}</h1>
      </div>

      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#5a7a6a;font-size:13px;font-family:Arial,sans-serif;width:110px;">Jméno</td>
            <td style="padding:8px 0;color:#0a1410;font-size:14px;font-family:Arial,sans-serif;font-weight:600;">${esc(name)}</td>
          </tr>
          ${rowsHtml}
        </table>

        ${messageBlock}

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e8efe9;color:#8aa39a;font-size:12px;font-family:Arial,sans-serif;">
          Zdroj: <strong>statly.cz/litomysl.html</strong> · ${timestamp}
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}

// ─── Auto‑odpověď klientovi ────────────────────────────────
function buildClientEmail({ name }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#e8efe9;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">

      <div style="margin-bottom:20px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.05em;color:#1B7F5F;">STATLY</div>

      <p style="font-family:Arial,sans-serif;font-size:15px;color:#0a1410;line-height:1.6;margin:0 0 16px;">Ahoj ${esc(name)},</p>
      <p style="font-family:Arial,sans-serif;font-size:15px;color:#0a1410;line-height:1.6;margin:0 0 16px;">díky za zprávu z litomyšlské stránky. Ozvu se ti do 48 hodin, často ještě dnes. Pokud to budeš chtít probrat osobně, klidně se sejdeme na kafi.</p>
      <p style="font-family:Arial,sans-serif;font-size:15px;color:#0a1410;line-height:1.6;margin:0 0 24px;">Pokud bys chtěl rychleji, klidně volej na <a href="tel:+420737372708" style="color:#1B7F5F;">+420 737 372 708</a>.</p>

      <div style="padding-top:20px;border-top:1px solid #e8efe9;">
        <p style="font-family:Arial,sans-serif;font-size:14px;color:#0a1410;margin:0 0 4px;">Měj se,</p>
        <p style="font-family:Arial,sans-serif;font-size:14px;color:#0a1410;margin:0;font-weight:600;">Tomáš Tylich · Statly</p>
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#5a7a6a;margin:8px 0 0;">
          <a href="https://statly.cz" style="color:#5a7a6a;">statly.cz</a> ·
          <a href="mailto:tomas.tylich@seznam.cz" style="color:#5a7a6a;">tomas.tylich@seznam.cz</a> ·
          <a href="tel:+420737372708" style="color:#5a7a6a;">+420 737 372 708</a>
        </p>
      </div>
    </div>
    <div style="text-align:center;color:#8aa39a;font-family:Arial,sans-serif;font-size:11px;margin-top:16px;">
      Tento e‑mail je automatická odpověď. Na tvou zprávu ti brzy odpovím osobně.
    </div>
  </div>
</body></html>`;
}
