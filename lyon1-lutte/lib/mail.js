// Envoi des emails : Resend (API HTTPS, recommandé) ou SMTP, sinon simple journal dans la console.
import nodemailer from 'nodemailer';

const resendReady = () => !!process.env.RESEND_API_KEY;
const smtpReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
export const mailEnabled = () => resendReady() || smtpReady();
const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'Lyon 1 · La Doua en lutte <alertes@example.org>';
export const SITE_NAME = 'Lyon 1 · La Doua en lutte';
export const INSTAGRAM_URL = () => process.env.INSTAGRAM_URL || 'https://www.instagram.com/lyon1_ladoua.enlutte/';
export const INSTAGRAM_HANDLE = () => '@' + (INSTAGRAM_URL().match(/instagram\.com\/([^/?#]+)/) || [0, 'lyon1_ladoua.enlutte'])[1];
export const SITE_URL = () => (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

let smtp = null;
const transport = () => (smtp ||= nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}));

// messages : [{ to, subject, html, text }]
export async function sendMany(messages) {
  if (!messages.length) return { sent: 0 };
  if (!mailEnabled()) {
    for (const m of messages) console.log(`[mail non configuré] → ${m.to} : ${m.subject}`);
    return { sent: 0, skipped: messages.length };
  }
  let sent = 0;
  if (resendReady()) {
    const base = (process.env.RESEND_BASE || 'https://api.resend.com').replace(/\/$/, '');
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100).map((m) => ({ from: FROM(), to: [m.to], subject: m.subject, html: m.html, text: m.text }));
      const res = await fetch(`${base}/emails/batch`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) console.error('[mail] Resend', res.status, (await res.text()).slice(0, 300));
      else sent += chunk.length;
    }
    return { sent };
  }
  for (const m of messages) {
    try { await transport().sendMail({ from: FROM(), ...m }); sent++; }
    catch (e) { console.error('[mail] SMTP', m.to, e.message); }
  }
  return { sent };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Gabarit d'email lisible en 3 secondes : bandeau de couleur, liste courte, lien vers le site.
export function renderEmail({ tone = 'red', kicker, title, items = [], body = '', cta = 'Voir en direct', token }) {
  const color = { red: '#FF3B30', green: '#34C759', orange: '#FF9500', blue: '#0A84FF' }[tone] || '#FF3B30';
  const site = SITE_URL();
  const unsub = `${site}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  const rows = items.map((it) => {
    const c = { red: '#FF3B30', green: '#34C759', orange: '#FF9500', grey: '#8E8E93' }[it.tone] || '#1C1C1E';
    return `<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;font:600 16px -apple-system,Segoe UI,Roboto,sans-serif;color:${c}">${esc(it.label)}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font:14px -apple-system,Segoe UI,Roboto,sans-serif;color:#3a3a3c;text-align:right">${esc(it.value || '')}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f7;padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:${color};padding:22px 22px 18px;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="font:700 12px ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.9">${esc(kicker)}</div>
<div style="font:800 24px -apple-system,Segoe UI,Roboto,sans-serif;margin-top:6px;line-height:1.2">${esc(title)}</div></td></tr>
${body ? `<tr><td style="padding:16px 22px 4px;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1e">${esc(body).replace(/\n/g, '<br>')}</td></tr>` : ''}
${rows ? `<tr><td style="padding:8px 8px 0"><table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table></td></tr>` : ''}
<tr><td style="padding:20px 22px"><a href="${site}" style="display:inline-block;background:#1c1c1e;color:#fff;text-decoration:none;font:600 15px -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 20px;border-radius:12px">${esc(cta)} →</a></td></tr>
<tr><td style="padding:0 22px 14px;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif"><a href="${INSTAGRAM_URL()}" style="color:#d62976;text-decoration:none">Instagram ${esc(INSTAGRAM_HANDLE())}</a></td></tr>
<tr><td style="padding:0 22px 20px;font:12px -apple-system,Segoe UI,Roboto,sans-serif;color:#8e8e93">${SITE_NAME}<br>Tu reçois cet email car tu t'es inscrit·e aux alertes. <a href="${unsub}" style="color:#8e8e93">Se désinscrire</a></td></tr>
</table></body></html>`;
  const text = `${kicker}\n${title}\n\n${body ? body + '\n\n' : ''}${items.map((i) => `- ${i.label}${i.value ? ' : ' + i.value : ''}`).join('\n')}\n\n${site}\nInstagram : ${INSTAGRAM_URL()}\n\n${SITE_NAME}\nSe désinscrire : ${unsub}`;
  return { html, text };
}
