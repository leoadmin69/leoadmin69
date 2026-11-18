// Envoi des emails, par ordre de préférence :
//  - Brevo (GRATUIT, 300 emails/jour, SANS nom de domaine : il suffit de vérifier une adresse d'envoi) ;
//  - Resend (gratuit 100/jour, demande un nom de domaine) ;
//  - SMTP (attention : bloqué sur les hébergeurs gratuits comme Render) ;
//  - sinon simple journal dans la console.
// Les notifications sur téléphone (lib/push.js) restent le canal principal : gratuites et illimitées.
import nodemailer from 'nodemailer';

const brevoReady = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL);
const resendReady = () => !!process.env.RESEND_API_KEY;
const smtpReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
export const mailEnabled = () => brevoReady() || resendReady() || smtpReady();
export const mailProvider = () => (brevoReady() ? 'Brevo' : resendReady() ? 'Resend' : smtpReady() ? 'SMTP' : null);
export const SITE_NAME = 'Lyon 1 · La Doua en lutte';
const FROM = () => process.env.MAIL_FROM || (process.env.MAIL_FROM_EMAIL ? `${SITE_NAME} <${process.env.MAIL_FROM_EMAIL}>` : process.env.SMTP_USER) || `${SITE_NAME} <alertes@example.org>`;
// Chaîne Telegram de la mobilisation, rappelée en bas des emails
const TELEGRAM_LINK = () => (process.env.TELEGRAM_URL && !/bot\/?$/i.test(process.env.TELEGRAM_URL) ? process.env.TELEGRAM_URL : 'https://t.me/ladoualyon1');
// Sur Render, l'adresse publique (https://xxx.onrender.com) est fournie automatiquement : pas besoin de nom de domaine.
export const SITE_URL = () => (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

// Plafond quotidien pour ne pas dépasser la formule gratuite (Brevo : 300/jour).
const DAILY_LIMIT = () => Number(process.env.MAIL_DAILY_LIMIT || (brevoReady() ? 290 : resendReady() ? 95 : 1000));
const counter = { day: '', n: 0 };
export function mailQuota() {
  const day = new Date().toISOString().slice(0, 10);
  if (counter.day !== day) { counter.day = day; counter.n = 0; }
  return { used: counter.n, limit: DAILY_LIMIT(), left: Math.max(0, DAILY_LIMIT() - counter.n) };
}

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
  const q = mailQuota();
  if (messages.length > q.left) {
    console.warn(`[mail] plafond gratuit : ${messages.length} emails demandés, ${q.left} restants aujourd'hui. Les notifications téléphone, elles, partent toutes.`);
    messages = messages.slice(0, q.left);
    if (!messages.length) return { sent: 0, skipped: true };
  }
  let sent = 0;
  if (brevoReady()) {
    const base = (process.env.BREVO_BASE || 'https://api.brevo.com/v3').replace(/\/$/, '');
    // Un appel par sujet, avec une version personnalisée par destinataire (lien de désinscription propre à chacun).
    for (let i = 0; i < messages.length; i += 99) {
      const chunk = messages.slice(i, i + 99);
      const res = await fetch(`${base}/smtp/email`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: SITE_NAME, email: process.env.MAIL_FROM_EMAIL },
          subject: chunk[0].subject,
          htmlContent: chunk[0].html,
          messageVersions: chunk.map((m) => ({ to: [{ email: m.to }], subject: m.subject, htmlContent: m.html })),
        }),
      });
      if (!res.ok) console.error('[mail] Brevo', res.status, (await res.text()).slice(0, 300));
      else sent += chunk.length;
    }
  } else if (resendReady()) {
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
  } else {
    for (const m of messages) {
      try { await transport().sendMail({ from: FROM(), ...m }); sent++; }
      catch (e) { console.error('[mail] SMTP', m.to, e.message); }
    }
  }
  counter.n += sent;
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
<tr><td style="padding:0 22px 14px;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif"><a href="${TELEGRAM_LINK()}" style="color:#229ED9;text-decoration:none">Rejoindre la chaîne Telegram</a></td></tr>
<tr><td style="padding:0 22px 20px;font:12px -apple-system,Segoe UI,Roboto,sans-serif;color:#8e8e93">${SITE_NAME}<br>Tu reçois cet email car tu t'es inscrit·e aux alertes. <a href="${unsub}" style="color:#8e8e93">Se désinscrire</a></td></tr>
</table></body></html>`;
  const text = `${kicker}\n${title}\n\n${body ? body + '\n\n' : ''}${items.map((i) => `- ${i.label}${i.value ? ' : ' + i.value : ''}`).join('\n')}\n\n${site}\nTelegram : ${TELEGRAM_LINK()}\n\n${SITE_NAME}\nSe désinscrire : ${unsub}`;
  return { html, text };
}
