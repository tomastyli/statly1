/**
 * Cloudflare Pages Function — /api/mesto
 * Obsluhuje kontaktní formuláře ze VŠECH lokálních stránek (Svitavy, Polička,
 * Vysoké Mýto, Chrudim, Lanškroun, ...). Město přichází v poli "mesto".
 *
 * Potřebné Environment Variables (Cloudflare Pages → Settings → Environment variables):
 *   RESEND_API_KEY  (povinné)  – API klíč z resend.com
 *   FROM_EMAIL      (volitelné) – odesílatel, musí být na doméně ověřené v Resendu.
 *                                 Default: "Statly web <formular@statly.cz>"
 *   TO_EMAIL        (volitelné) – kam chodí poptávky. Default: "tomas.tylich@seznam.cz"
 *
 * Pozn.: dokud nemáš v Resendu ověřenou doménu statly.cz, nastav FROM_EMAIL
 * na "Statly <onboarding@resend.dev>" (testovací odesílatel Resendu).
 */

const TOPIC_LABELS = {
  web: "Web",
  social: "Sociální sítě",
  video: "Video",
  poradit: "Jen poradit",
};

const ALLOWED_CITIES = [
  "Svitavy", "Polička", "Vysoké Mýto", "Chrudim", "Lanškroun",
  "Litomyšl", "Česká Třebová", "Choceň", "Ústí nad Orlicí", "Moravská Třebová",
];

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function looksLikeEmail(s = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function onRequestPost({ request, env }) {
  // 1) Parse
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: "Neplatný formát požadavku." }, 400);
  }

  const name = (body.name || "").toString().trim();
  const contact = (body.contact || "").toString().trim();
  const message = (body.message || "").toString().trim();
  const honeypot = (body.website || "").toString().trim();
  const gdpr = body.gdpr === true || body.gdpr === "true";
  let mesto = (body.mesto || "").toString().trim();
  const topics = Array.isArray(body.topics) ? body.topics : [];

  // 2) Honeypot — bot vyplnil skryté pole. Tváříme se, že je vše OK.
  if (honeypot) {
    return json({ ok: true });
  }

  // 3) Validace
  if (name.length < 2 || name.length > 120) {
    return json({ ok: false, error: "Vyplň prosím své jméno." }, 422);
  }
  if (contact.length < 5 || contact.length > 160) {
    return json({ ok: false, error: "Doplň prosím e-mail nebo telefon." }, 422);
  }
  if (!gdpr) {
    return json({ ok: false, error: "Pro odeslání je nutný souhlas se zpracováním údajů." }, 422);
  }
  if (message.length > 2000) {
    return json({ ok: false, error: "Zpráva je příliš dlouhá." }, 422);
  }
  if (mesto && !ALLOWED_CITIES.includes(mesto)) {
    mesto = "Neznámé město"; // sanitizace, ať nelze podstrčit cokoliv do subjectu
  }
  if (!mesto) mesto = "Lokální stránka";

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: "Server zatím není nastavený. Napiš mi prosím přímo na e-mail." }, 500);
  }

  const fromEmail = env.FROM_EMAIL || "Statly web <formular@statly.cz>";
  const toEmail = env.TO_EMAIL || "tomas.tylich@seznam.cz";

  const topicLabels = topics
    .map((t) => TOPIC_LABELS[t])
    .filter(Boolean);
  const topicsText = topicLabels.length ? topicLabels.join(", ") : "neuvedeno";

  const replyTo = looksLikeEmail(contact) ? contact : undefined;
  const submittedAt = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });

  // 4) E-mail pro Tomáše
  const adminHtml = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2520;">
    <div style="background:#0d3d2c;border-radius:14px 14px 0 0;padding:22px 26px;">
      <div style="color:#22c47e;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-family:monospace;">Nová poptávka · ${escapeHtml(mesto)}</div>
      <div style="color:#fff;font-size:21px;font-weight:700;margin-top:4px;">${escapeHtml(name)}</div>
    </div>
    <div style="border:1px solid #e3ebe6;border-top:none;border-radius:0 0 14px 14px;padding:24px 26px;background:#fff;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:8px 0;color:#5a7a6a;width:120px;">Kontakt</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(contact)}</td></tr>
        <tr><td style="padding:8px 0;color:#5a7a6a;">Zájem o</td><td style="padding:8px 0;">${escapeHtml(topicsText)}</td></tr>
        <tr><td style="padding:8px 0;color:#5a7a6a;">Stránka</td><td style="padding:8px 0;">${escapeHtml(mesto)}</td></tr>
        <tr><td style="padding:8px 0;color:#5a7a6a;vertical-align:top;">Zpráva</td><td style="padding:8px 0;white-space:pre-wrap;line-height:1.55;">${message ? escapeHtml(message) : "<em style='color:#8aa39a;'>bez zprávy</em>"}</td></tr>
      </table>
      <div style="margin-top:18px;padding-top:16px;border-top:1px dashed #dde7e1;font-size:12px;color:#8aa39a;">Odesláno ${escapeHtml(submittedAt)} · formulář /api/mesto</div>
    </div>
  </div>`;

  const adminText =
    `Nová poptávka (${mesto})\n\n` +
    `Jméno: ${name}\nKontakt: ${contact}\nZájem o: ${topicsText}\nStránka: ${mesto}\n\n` +
    `Zpráva:\n${message || "(bez zprávy)"}\n\nOdesláno: ${submittedAt}`;

  const sendAdmin = fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `Nová poptávka z webu (${mesto}) – ${name}`,
      html: adminHtml,
      text: adminText,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  // 5) Hlavní odeslání musí projít
  let adminRes;
  try {
    adminRes = await sendAdmin;
  } catch (_) {
    return json({ ok: false, error: "E-mail se nepodařilo odeslat. Zkus to prosím znovu." }, 502);
  }
  if (!adminRes.ok) {
    return json({ ok: false, error: "E-mail se nepodařilo odeslat. Zkus to prosím znovu." }, 502);
  }

  // 6) Auto-odpověď odesílateli (best-effort, neblokuje úspěch)
  if (replyTo) {
    const ackHtml = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a2520;">
      <div style="background:#0d3d2c;border-radius:14px 14px 0 0;padding:24px 26px;text-align:center;">
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Statly</div>
      </div>
      <div style="border:1px solid #e3ebe6;border-top:none;border-radius:0 0 14px 14px;padding:26px;background:#fff;line-height:1.6;font-size:15px;">
        <p style="margin:0 0 14px;">Ahoj ${escapeHtml(name)},</p>
        <p style="margin:0 0 14px;">díky za zprávu! Dorazila v pořádku a já se ti ozvu <strong>do 48 hodin</strong>, často ještě dnes.</p>
        <p style="margin:0 0 14px;">Mezitím můžeš mrknout na <a href="https://statly.cz/#portfolio" style="color:#1B7F5F;">portfolio</a> nebo si rovnou zavolat.</p>
        <p style="margin:18px 0 4px;">Měj se,<br><strong>Tomáš Tylich</strong></p>
        <p style="margin:0;color:#5a7a6a;font-size:13px;">Statly · +420 737 372 708 · <a href="https://statly.cz" style="color:#1B7F5F;">statly.cz</a></p>
      </div>
    </div>`;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: [contact],
          subject: "Díky za zprávu – ozvu se ti co nejdřív",
          html: ackHtml,
          text: `Ahoj ${name},\n\ndíky za zprávu! Ozvu se ti do 48 hodin, často ještě dnes.\n\nTomáš Tylich\nStatly · +420 737 372 708 · statly.cz`,
        }),
      });
    } catch (_) {
      /* auto-reply je nice-to-have, případnou chybu ignorujeme */
    }
  }

  return json({ ok: true });
}

// Drobnost: GET na endpoint vrátí jasnou hlášku místo prázdna
export async function onRequestGet() {
  return json({ ok: false, error: "Tento endpoint přijímá pouze POST z formuláře." }, 405);
}
