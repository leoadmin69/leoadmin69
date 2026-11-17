// Lyon 1 · La Doua en lutte : plateforme d'information étudiante pendant la mobilisation.
// API JSON + flux temps réel (SSE) + site statique (public/).
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, save, newId, now, initStore } from './lib/store.js';
import { remoteEnabled } from './lib/remote.js';
import { publicKey, subscribe as pushSubscribe, unsubscribe as pushUnsubscribe, sendPush, pushCount, PUSH_KINDS } from './lib/push.js';
import { seed } from './lib/seed.js';
import { ensureAdmin, hashPassword, verifyPassword, createToken, readToken, cookieHeader, parseCookies, COOKIE, publicMod, SECRET } from './lib/auth.js';
import { mailEnabled, mailProvider, mailQuota, sendMany, renderEmail, SITE_URL, SITE_NAME, INSTAGRAM_URL } from './lib/mail.js';
import { aiEnabled, aiProviders, analyzePdf } from './lib/ai.js';
import { registerCommunity, MAX_VIDEO_MB } from './lib/community.js';
import { telegramEnabled, telegramUrl, postTelegram, tgEsc } from './lib/telegram.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ALERT_DELAY_MS = Number(process.env.ALERT_DELAY_MS ?? 60000);

// Récupère la base sauvegardée (Supabase) AVANT tout le reste.
let storage = 'local';
try {
  storage = await initStore();
} catch (e) {
  // Ne pas démarrer avec une base vide par-dessus la vraie : mieux vaut s'arrêter et réessayer.
  console.error('[démarrage] Impossible de lire la sauvegarde Supabase :', e.message);
  process.exit(1);
}
if (process.env.RENDER && !remoteEnabled()) console.warn('\n⚠️  Hébergement sans disque et Supabase non configuré : les données seront PERDUES au prochain redémarrage.\n');
seed();
ensureAdmin();

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '200kb' }));

// ---------- Utilitaires ----------
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// Identifiant visiteur anonyme : hash de l'IP avec une graine qui change chaque jour (aucune IP stockée).
const visitor = (req) => crypto.createHmac('sha256', SECRET).update(`${new Date().toISOString().slice(0, 10)}|${req.ip}`).digest('hex').slice(0, 16);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// Limiteur simple en mémoire.
const buckets = new Map();
function limited(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key) || [];
  const recent = b.filter((x) => t - x < windowMs);
  if (recent.length >= max) { buckets.set(key, recent); return true; }
  recent.push(t);
  buckets.set(key, recent);
  return false;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of buckets) if (!v.some((x) => t - x < 3600e3)) buckets.delete(k); }, 600e3).unref();

// ---------- Temps réel (Server-Sent Events) ----------
const clients = new Set();
function broadcast(type, data = {}) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
app.get('/api/live', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: ${JSON.stringify({ online: clients.size + 1 })}\n\n`);
  clients.add(res);
  broadcast('online', { online: clients.size });
  req.on('close', () => { clients.delete(res); broadcast('online', { online: clients.size }); });
});
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

function feed(text, level = 'info') {
  const item = { at: now(), level, text: clip(text, 240) };
  db.feed.unshift(item);
  db.feed = db.feed.slice(0, 200);
  broadcast('feed', item);
}
function audit(mod, action, detail = '') {
  db.audit.unshift({ at: now(), by: mod.username, org: mod.org, action, detail: clip(detail, 300) });
  db.audit = db.audit.slice(0, 2000);
}

// ---------- Session modo ----------
function currentMod(req) { return readToken(parseCookies(req.headers.cookie)[COOKIE]); }
function requireMod(req, res, next) {
  const mod = currentMod(req);
  if (!mod) return bad(res, 'Connexion modo requise.', 401);
  // Protection CSRF : les requêtes d'écriture viennent du site lui-même (JSON ou PDF, jamais un formulaire externe).
  if (req.method !== 'GET' && !/^(application\/json|application\/pdf)/.test(req.headers['content-type'] || '') && req.method !== 'DELETE') return bad(res, 'Type de contenu refusé.', 415);
  req.mod = mod;
  next();
}
const requireAdmin = (req, res, next) => (req.mod.role === 'admin' ? next() : bad(res, 'Réservé aux admins.', 403));

// ---------- Lecture publique ----------
const STATUS = ['bloque', 'partiel', 'ouvert', 'inconnu'];
const STATUS_LABEL = { bloque: 'BLOQUÉ', partiel: 'PARTIELLEMENT BLOQUÉ', ouvert: 'OUVERT', inconnu: 'NON RENSEIGNÉ' };
const BLOCUS = ['auto', 'actif', 'partiel', 'leve', 'inconnu'];
// Statut affiché : choisi à la main par un modo, ou « auto » = déduit des bâtiments (par défaut).
// « inconnu » (ancien réglage par défaut) est traité comme « auto ».
function effectiveBlocus() {
  const s = db.settings.blocus.state;
  if (s !== 'auto' && s !== 'inconnu') return s;
  if (db.buildings.some((x) => x.status === 'bloque')) return 'actif';
  if (db.buildings.some((x) => x.status === 'partiel')) return 'partiel';
  if (db.buildings.some((x) => x.status === 'ouvert')) return 'leve';
  return 'inconnu';
}
const BLOCUS_LABEL = { actif: 'BLOCUS EN COURS', partiel: 'BLOCUS PARTIEL', leve: 'PAS DE BLOCUS', inconnu: 'SITUATION NON CONFIRMÉE', auto: 'AUTOMATIQUE' };
const EVENT_TYPES = ['AG', 'manif', 'rassemblement', 'action', 'autre'];

const publicReport = (r) => ({ id: r.id, titre: r.titre, date: r.date, lieu: r.lieu, participants: r.participants, resume: r.resume, flashs: r.flashs, votes: r.votes, rdv: r.rdv, batiments_bloques: r.batiments_bloques, revendications: r.revendications, publishedAt: r.publishedAt, org: r.org, source: r.source });
const publicDemand = (d) => ({ ...d, support: (db.supports[d.id] || []).length });
function upcomingEvents() {
  const cutoff = Date.now() - 6 * 3600e3;
  return db.events.filter((e) => new Date(e.start).getTime() >= cutoff).sort((a, b) => a.start.localeCompare(b.start));
}

// Contrôle de santé pour l'hébergeur (ne révèle rien).
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/state', (req, res) => {
  res.json({
    blocus: { ...db.settings.blocus, effective: effectiveBlocus(), auto: ['auto', 'inconnu'].includes(db.settings.blocus.state) },
    buildings: db.buildings,
    events: upcomingEvents(),
    flashes: db.flashes.slice(0, 20),
    reports: db.reports.filter((r) => r.status === 'published').sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 30).map(publicReport),
    demands: db.demands.map(publicDemand),
    contacts: db.contacts,
    channels: db.channels,
    feed: db.feed.slice(0, 40),
    subscribers: db.subscribers.filter((s) => s.confirmed).length,
    online: clients.size,
    pollsOpen: community.pollsOpen(),
    context: db.settings.context || null,
    telegramUrl: telegramUrl(),
    emailMode: EMAIL_MODE,
    digestHour: DIGEST_HOUR,
    emailSpots: mailEnabled() ? emailSpots() : 0,
    maxVideoMb: MAX_VIDEO_MB,
    instagram: INSTAGRAM_URL(),
    mailEnabled: mailEnabled(),
    aiEnabled: aiEnabled(),
  });
});
app.get('/api/reports/:id', (req, res) => {
  const r = db.reports.find((x) => x.id === req.params.id && x.status === 'published');
  return r ? res.json(publicReport(r)) : bad(res, 'Introuvable', 404);
});

// ---------- Chat anonyme ----------
const NICK = /^[\p{L}\p{N} _-]{2,24}$/u;
const BANNED = (process.env.CHAT_BANNED_WORDS || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
const publicMsg = (m) => ({ id: m.id, channel: m.channel, nick: m.nick, text: m.text, at: m.at, mod: m.mod || null });

app.get('/api/chat/:channel', (req, res) => {
  const list = db.messages.filter((m) => m.channel === req.params.channel && !m.hidden).slice(-150).map(publicMsg);
  res.json(list);
});
app.post('/api/chat', (req, res) => {
  const channel = clip(req.body.channel, 40);
  if (!db.channels.some((c) => c.id === channel)) return bad(res, 'Salon inconnu.');
  const nick = clip(req.body.nick, 24);
  const text = clip(req.body.text, 600).replace(/\s{3,}/g, '  ');
  if (!NICK.test(nick)) return bad(res, 'Pseudo : 2 à 24 lettres, chiffres, espaces ou tirets.');
  if (!text) return bad(res, 'Message vide.');
  const v = visitor(req);
  if (limited(`chat:${v}`, 1, 2500) || limited(`chatm:${v}`, 20, 60000)) return bad(res, 'Doucement 🙂 attends quelques secondes.', 429);
  if (BANNED.some((w) => text.toLowerCase().includes(w))) return bad(res, 'Message refusé par le filtre.');
  const mod = currentMod(req);
  const m = { id: newId(), channel, nick, text, at: now(), v, reports: [], mod: mod ? mod.org : null };
  db.messages.push(m);
  if (db.messages.length > 6000) db.messages = db.messages.slice(-5000);
  save();
  broadcast('chat', publicMsg(m));
  res.json(publicMsg(m));
});
app.post('/api/chat/:id/report', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  const v = visitor(req);
  if (!m.reports.includes(v)) m.reports.push(v);
  // Masqué automatiquement après 3 signalements ; un modo peut le rétablir.
  if (m.reports.length >= 3 && !m.hidden) { m.hidden = true; broadcast('chat-del', { id: m.id }); }
  save();
  res.json({ ok: true });
});

// ---------- Revendications : soutien anonyme ----------
app.post('/api/demands/:id/support', (req, res) => {
  const d = db.demands.find((x) => x.id === req.params.id);
  if (!d) return bad(res, 'Introuvable', 404);
  const v = crypto.createHmac('sha256', SECRET).update(`support|${req.ip}`).digest('hex').slice(0, 16);
  const list = (db.supports[d.id] ||= []);
  if (!list.includes(v)) list.push(v);
  save();
  broadcast('demand', { id: d.id, support: list.length });
  res.json({ support: list.length });
});

// ---------- Newsletter / alertes email ----------
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const ALERTS = ['buildings', 'events', 'reports'];
// Mode « digest » (par défaut) : un seul récapitulatif chaque matin, pour rester dans les quotas gratuits.
// Mode « instant » : un email à chaque changement (seulement avec un service d'email payant ou peu d'inscrit·es).
const EMAIL_MODE = process.env.EMAIL_MODE === 'instant' ? 'instant' : 'digest';
const DIGEST_HOUR = Number(process.env.EMAIL_DIGEST_HOUR ?? 7);
// Nombre maximum d'inscrit·es par email : 1 récap par personne et par jour doit tenir dans le quota gratuit.
const emailCap = () => Number(process.env.EMAIL_MAX_SUBSCRIBERS || (mailEnabled() ? Math.max(0, mailQuota().limit - 15) : 100000));
const emailSpots = () => Math.max(0, emailCap() - db.subscribers.length);
app.post('/api/subscribe', async (req, res) => {
  const email = clip(req.body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return bad(res, 'Adresse email invalide.');
  if (limited(`sub:${visitor(req)}`, 5, 3600e3)) return bad(res, 'Trop de tentatives, réessaie plus tard.', 429);
  const alerts = Array.isArray(req.body.alerts) ? req.body.alerts.filter((a) => ALERTS.includes(a)) : ALERTS;
  const campuses = Array.isArray(req.body.campuses) ? req.body.campuses.map((c) => clip(c, 60)).slice(0, 10) : [];
  let s = db.subscribers.find((x) => x.email === email);
  if (!s && emailSpots() <= 0) return bad(res, 'La liste email est complète (places limitées par la version gratuite). Active plutôt les notifications de l’app ou rejoins la chaîne Telegram : c’est gratuit et sans limite.', 409);
  if (!s) { s = { id: newId(), email, token: crypto.randomBytes(18).toString('base64url'), confirmed: false, createdAt: now() }; db.subscribers.push(s); }
  s.alerts = alerts.length ? alerts : ALERTS;
  s.campuses = campuses;
  if (!mailEnabled()) {
    // Sans service d'email, pas de confirmation possible : l'inscription est enregistrée telle quelle.
    s.confirmed = true;
    save();
    return res.json({ ok: true, message: "Inscription enregistrée. (L'envoi d'emails n'est pas encore activé sur ce serveur.)" });
  }
  save();
  if (!s.confirmed) {
    const link = `${SITE_URL()}/api/confirm?token=${encodeURIComponent(s.token)}`;
    const { html, text } = renderEmail({ tone: 'blue', kicker: 'LYON 1 · LA DOUA EN LUTTE', title: 'Confirme ton inscription', body: `Clique sur le bouton pour recevoir ${EMAIL_MODE === 'digest' ? `le récapitulatif de chaque matin (${DIGEST_HOUR} h : bâtiments bloqués, AG, manifs)` : 'les alertes (bâtiments bloqués, AG, manifs)'}.\n\nLien direct : ${link}`, cta: 'Confirmer', token: s.token });
    await sendMany([{ to: email, subject: 'Confirme tes alertes Lyon 1 · La Doua en lutte', html: html.replace(SITE_URL() + '"', link + '"'), text }]);
    return res.json({ ok: true, message: 'Vérifie ta boîte mail pour confirmer (pense aux spams).' });
  }
  res.json({ ok: true, message: 'Préférences mises à jour.' });
});
const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f7;font:17px -apple-system,Segoe UI,Roboto,sans-serif;padding:16px"><div style="max-width:420px;text-align:center"><h1 style="font-size:28px">${title}</h1><p style="color:#a1a1aa">${msg}</p><a href="/" style="color:#30D158">Retour au site →</a><p style="color:#6e6e73;font-size:13px;margin-top:24px">Lyon 1 · La Doua en lutte</p></div>`;
app.get('/api/confirm', (req, res) => {
  const s = db.subscribers.find((x) => x.token === req.query.token);
  if (!s) return res.status(404).send(page('Lien invalide', 'Ce lien ne correspond à aucune inscription.'));
  s.confirmed = true; save();
  res.send(page('C’est bon ✅', EMAIL_MODE === 'digest' ? `Tu recevras le récapitulatif chaque matin vers ${DIGEST_HOUR} h. Pour être prévenu·e tout de suite, active aussi les notifications de l’app.` : 'Tu recevras les alertes par email. Tu peux te désinscrire à tout moment depuis chaque email.'));
});
app.get('/api/unsubscribe', (req, res) => {
  const i = db.subscribers.findIndex((x) => x.token === req.query.token);
  if (i >= 0) { db.subscribers.splice(i, 1); save(); }
  res.send(page('Désinscription faite', 'Ton adresse a été supprimée. Aucune donnée n’est conservée.'));
});

// Alertes bâtiments regroupées : si un modo met à jour 10 bâtiments, un seul email part.
let pendingBuildings = new Map();
let alertTimer = null;
function queueBuildingAlert(b) {
  pendingBuildings.set(b.id, b);
  clearTimeout(alertTimer);
  alertTimer = setTimeout(flushBuildingAlert, ALERT_DELAY_MS);
}
async function flushBuildingAlert() {
  const changed = [...pendingBuildings.values()];
  pendingBuildings = new Map();
  if (!changed.length) return;
  const blocked = db.buildings.filter((b) => b.status === 'bloque' || b.status === 'partiel');
  const anyBlocked = changed.some((b) => b.status === 'bloque' || b.status === 'partiel');
  const tone = { bloque: 'red', partiel: 'orange', ouvert: 'green', inconnu: 'grey' };
  const title = anyBlocked ? `🔴 ${blocked.length} bâtiment${blocked.length > 1 ? 's' : ''} bloqué${blocked.length > 1 ? 's' : ''}` : '🟢 Bâtiments rouverts';
  const subject = anyBlocked
    ? `🔴 BLOQUÉ : ${changed.filter((b) => b.status !== 'ouvert').map((b) => b.name).slice(0, 4).join(', ')}`
    : `🟢 OUVERT : ${changed.map((b) => b.name).slice(0, 4).join(', ')}`;
  const recipients = db.subscribers.filter((s) => s.confirmed && s.alerts?.includes('buildings'));
  const messages = [];
  for (const s of recipients) {
    const relevant = s.campuses?.length ? changed.filter((b) => s.campuses.includes(b.campus)) : changed;
    if (!relevant.length) continue;
    const items = relevant.map((b) => ({ label: `${b.name} : ${STATUS_LABEL[b.status]}`, value: b.campus, tone: tone[b.status] }));
    const { html, text } = renderEmail({ tone: anyBlocked ? 'red' : 'green', kicker: `LYON 1 · LA DOUA EN LUTTE · ${BLOCUS_LABEL[effectiveBlocus()]}`, title, items, body: relevant.map((b) => b.note).filter(Boolean).join('\n'), token: s.token });
    messages.push({ to: s.email, subject, html, text });
  }
  // Notification téléphone : la plus rapide, gratuite et sans limite. Ciblée par campus si l'abonné·e l'a choisi.
  const campuses = [...new Set(changed.map((b) => b.campus))];
  for (const campus of [null, ...campuses]) {
    const list = campus ? changed.filter((b) => b.campus === campus) : changed;
    const names = (st) => list.filter((b) => b.status === st).map((b) => b.name);
    const parts = [['bloque', '🔴 Bloqué'], ['partiel', '🟠 Partiel'], ['ouvert', '🟢 Ouvert']].filter(([k]) => names(k).length).map(([k, l]) => `${l} : ${names(k).join(', ')}`);
    const filter = campus ? (s) => s.campuses?.length && s.campuses.includes(campus) : (s) => !s.campuses?.length;
    sendPush('buildings', { title: anyBlocked ? `🔴 ${title.replace(/^🔴 /, '')}` : title, body: parts.join(' · ').slice(0, 220), url: '/#/batiments', tag: 'batiments' }, filter).catch((e) => console.error('[push]', e.message));
  }
  // Chaîne Telegram : un message lisible d'un coup d'œil
  const tgNames = (st) => changed.filter((b) => b.status === st).map((b) => tgEsc(b.name));
  const tgLines = [['bloque', '🔴 <b>BLOQUÉ</b>'], ['partiel', '🟠 <b>PARTIEL</b>'], ['ouvert', '🟢 <b>OUVERT</b>']].filter(([k]) => tgNames(k).length).map(([k, l]) => `${l} : ${tgNames(k).join(', ')}`);
  const tgNotes = changed.filter((b) => b.note).map((b) => `<i>${tgEsc(b.name)} : ${tgEsc(b.note)}</i>`);
  postTelegram([`<b>${tgEsc(BLOCUS_LABEL[effectiveBlocus()])}</b>`, ...tgLines, ...tgNotes].join('\n'), '/#/batiments');
  if (EMAIL_MODE !== 'instant') return; // les emails partent dans le récapitulatif du matin
  const r = await sendMany(messages);
  console.log(`[alertes] bâtiments : ${messages.length} email(s), ${r.sent} envoyé(s)`);
}
async function notify(kind, { subject, kicker, title, body, items, tone, url = '/' }) {
  sendPush(kind, { title: subject, body: String(body || '').replace(/\s+/g, ' ').slice(0, 200), url, tag: kind }).catch((e) => console.error('[push]', e.message));
  postTelegram(`<b>${tgEsc(subject)}</b>${body ? '\n' + tgEsc(String(body).trim()).slice(0, 1500) : ''}${items?.length ? '\n' + items.map((i) => `• ${tgEsc(i.label)}`).join('\n') : ''}`, url);
  if (EMAIL_MODE !== 'instant') return;
  const recipients = db.subscribers.filter((s) => s.confirmed && s.alerts?.includes(kind));
  const messages = recipients.map((s) => ({ to: s.email, subject, ...renderEmail({ tone, kicker, title, body, items, token: s.token }) }));
  sendMany(messages).then((r) => console.log(`[alertes] ${kind} : ${r.sent ?? 0} envoyé(s)`)).catch((e) => console.error('[alertes]', e.message));
}

// ---------- Récapitulatif email du matin ----------
const parisNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};
async function sendDigest() {
  const since = db.settings.lastDigestAt || new Date(Date.now() - 86400e3).toISOString();
  db.settings.lastDigestAt = now();
  save();
  const tone = { bloque: 'red', partiel: 'orange' };
  const b = db.settings.blocus;
  const soon = db.events.filter((e) => { const t = new Date(e.start).getTime(); return t > Date.now() - 3600e3 && t < Date.now() + 36 * 3600e3; }).sort((x, y) => x.start.localeCompare(y.start));
  const reports = db.reports.filter((r) => r.status === 'published' && r.publishedAt > since);
  const alerts = db.flashes.filter((f) => f.level === 'alerte' && f.at > since);
  const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const messages = [];
  for (const s of db.subscribers.filter((x) => x.confirmed)) {
    const blds = db.buildings.filter((x) => (x.status === 'bloque' || x.status === 'partiel') && (!s.campuses?.length || s.campuses.includes(x.campus)));
    const nBlocked = blds.filter((x) => x.status === 'bloque').length;
    const title = nBlocked ? `🔴 ${nBlocked} bâtiment${nBlocked > 1 ? 's' : ''} bloqué${nBlocked > 1 ? 's' : ''} ce matin` : effectiveBlocus() === 'actif' ? '🔴 Blocus en cours' : '🟢 Aucun bâtiment signalé bloqué';
    const lines = [];
    if (b.message) lines.push(b.message);
    if (alerts.length) lines.push('', '🚨 Alertes d’hier :', ...alerts.map((f) => `• ${f.text}`));
    if (s.alerts?.includes('events') && soon.length) lines.push('', '📣 À venir :', ...soon.map((e) => `• ${e.type} · ${e.title} · ${fmt(e.start)}${e.place ? ' · ' + e.place : ''}`));
    if (s.alerts?.includes('reports') && reports.length) lines.push('', '📝 Nouveaux comptes rendus :', ...reports.map((r) => `• ${r.titre}`));
    lines.push('', 'Pour être prévenu·e tout de suite dans la journée : notifications de l’app ou chaîne Telegram.');
    const items = s.alerts?.includes('buildings') ? blds.map((x) => ({ label: `${x.name} : ${STATUS_LABEL[x.status]}`, value: x.campus, tone: tone[x.status] })) : [];
    const { html, text } = renderEmail({ tone: nBlocked || effectiveBlocus() === 'actif' ? 'red' : 'green', kicker: `LYON 1 · LA DOUA EN LUTTE · ${BLOCUS_LABEL[effectiveBlocus()]}`, title, items, body: lines.join('\n').trim(), token: s.token });
    messages.push({ to: s.email, subject: `☀️ Ce matin à Lyon 1 · ${title.replace(/^[^ ]+ /, '').replace(/ ce matin$/, '')}`, html, text });
  }
  const r = await sendMany(messages);
  console.log(`[récap] ${messages.length} email(s), ${r.sent} envoyé(s)`);
  return { count: messages.length, sent: r.sent };
}
setInterval(() => {
  // Inscriptions jamais confirmées depuis 48 h : supprimées (libère des places et ne garde pas d'adresses inutiles)
  const old = Date.now() - 48 * 3600e3;
  const before = db.subscribers.length;
  db.subscribers = db.subscribers.filter((x) => x.confirmed || new Date(x.createdAt).getTime() > old);
  if (db.subscribers.length !== before) save();
  if (EMAIL_MODE !== 'digest' || !mailEnabled()) return;
  const { day, hour } = parisNow();
  if (hour === DIGEST_HOUR && db.settings.lastDigestDay !== day) {
    db.settings.lastDigestDay = day;
    save();
    sendDigest().catch((e) => console.error('[récap]', e.message));
  }
}, 5 * 60e3).unref();

// ---------- Notifications sur le téléphone ----------
app.get('/api/push/key', (req, res) => res.json({ key: publicKey(), kinds: PUSH_KINDS }));
app.post('/api/push/subscribe', (req, res) => {
  if (limited(`push:${visitor(req)}`, 20, 3600e3)) return bad(res, 'Trop de tentatives.', 429);
  try { pushSubscribe(req.body || {}); res.json({ ok: true }); } catch (e) { bad(res, e.message); }
});
app.post('/api/push/unsubscribe', (req, res) => { pushUnsubscribe(String(req.body?.endpoint || '')); res.json({ ok: true }); });

// ---------- Connexion modo ----------
app.post('/api/auth/login', (req, res) => {
  const username = clip(req.body.username, 40).toLowerCase();
  if (limited(`login:${req.ip}`, 8, 15 * 60e3)) return bad(res, 'Trop de tentatives. Réessaie dans 15 minutes.', 429);
  const mod = db.mods.find((m) => m.username === username && !m.disabled);
  if (!mod || !verifyPassword(req.body.password || '', mod)) return bad(res, 'Identifiants incorrects.', 401);
  res.setHeader('Set-Cookie', cookieHeader(createToken(mod), 14 * 86400));
  res.json(publicMod(mod));
});
app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', cookieHeader('', 0)); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => { const m = currentMod(req); res.json(m ? publicMod(m) : null); });

const mod = express.Router();
mod.use(requireMod);
app.use('/api/mod', mod);
mod.post('/digest/send', requireAdmin, async (req, res) => {
  if (!mailEnabled()) return bad(res, 'Aucun service d’email configuré.');
  res.json(await sendDigest());
});
mod.post('/push/test', async (req, res) => {
  const r = await sendPush('urgent', { title: 'Test · La Doua en lutte', body: 'Les notifications marchent ✊', url: '/', tag: 'test' }, (s) => s.endpoint === req.body?.endpoint);
  res.json(r);
});

mod.post('/password', (req, res) => {
  if (!verifyPassword(req.body.current || '', req.mod)) return bad(res, 'Mot de passe actuel incorrect.');
  if (String(req.body.next || '').length < 10) return bad(res, 'Nouveau mot de passe : 10 caractères minimum.');
  Object.assign(req.mod, hashPassword(req.body.next));
  req.mod.version = (req.mod.version || 1) + 1;
  save();
  res.setHeader('Set-Cookie', cookieHeader(createToken(req.mod), 14 * 86400));
  res.json({ ok: true });
});

// Blocus général
mod.put('/blocus', (req, res) => {
  const b = db.settings.blocus;
  const prev = effectiveBlocus();
  b.state = oneOf(req.body.state, BLOCUS, b.state);
  const eff = effectiveBlocus();
  b.message = clip(req.body.message, 400);
  b.updatedAt = now();
  b.by = req.mod.org;
  save();
  audit(req.mod, 'blocus', `${b.state} ${b.message}`);
  feed(`${BLOCUS_LABEL[eff]}${b.state === 'auto' ? ' (automatique, selon les bâtiments)' : ''}${b.message ? ' : ' + b.message : ''}`, eff === 'actif' ? 'alert' : eff === 'leve' ? 'ok' : 'warn');
  broadcast('blocus', b);
  if (prev !== eff && req.body.notify !== false) {
    notify('buildings', { tone: eff === 'leve' ? 'green' : 'red', subject: `${eff === 'leve' ? '🟢' : '🔴'} ${BLOCUS_LABEL[eff]} à Lyon 1`, kicker: 'LYON 1 · LA DOUA EN LUTTE', title: BLOCUS_LABEL[eff], body: b.message });
  }
  res.json({ ...b, effective: eff });
});

// Bâtiments
mod.post('/buildings', (req, res) => {
  const name = clip(req.body.name, 80);
  if (!name) return bad(res, 'Nom requis.');
  const b = { id: newId(), name, campus: clip(req.body.campus, 60) || 'Autre', status: 'inconnu', note: '', updatedAt: null, by: '' };
  db.buildings.push(b); save(); audit(req.mod, 'bâtiment ajouté', name);
  broadcast('buildings', {});
  res.json(b);
});
mod.put('/buildings/:id', (req, res) => {
  const b = db.buildings.find((x) => x.id === req.params.id);
  if (!b) return bad(res, 'Introuvable', 404);
  const prev = b.status;
  if (req.body.name !== undefined) b.name = clip(req.body.name, 80) || b.name;
  if (req.body.campus !== undefined) b.campus = clip(req.body.campus, 60) || b.campus;
  if (req.body.note !== undefined) b.note = clip(req.body.note, 240);
  if (req.body.status !== undefined) b.status = oneOf(req.body.status, STATUS, b.status);
  b.updatedAt = now();
  b.by = req.mod.org;
  save();
  audit(req.mod, 'bâtiment', `${b.name} → ${b.status}`);
  if (prev !== b.status) {
    feed(`${b.name} (${b.campus}) → ${STATUS_LABEL[b.status]}${b.note ? ' · ' + b.note : ''}`, b.status === 'bloque' ? 'alert' : b.status === 'partiel' ? 'warn' : b.status === 'ouvert' ? 'ok' : 'info');
    if (b.status !== 'inconnu') queueBuildingAlert(b);
  }
  broadcast('buildings', { id: b.id });
  res.json(b);
});
// Plusieurs bâtiments d'un coup (sélection multiple, saisie rapide, dictée) : une seule ligne dans le fil, un seul email.
// undo:true = annulation juste après une erreur : l'alerte email en attente est retirée au lieu d'être renvoyée.
mod.put('/buildings-batch', (req, res) => {
  const changes = Array.isArray(req.body.changes) ? req.body.changes.slice(0, 200) : [];
  const undo = !!req.body.undo;
  const previous = [];
  const moved = { bloque: [], partiel: [], ouvert: [], inconnu: [] };
  for (const c of changes) {
    const b = db.buildings.find((x) => x.id === c.id);
    if (!b) continue;
    const status = oneOf(c.status, STATUS, b.status);
    if (c.note !== undefined) b.note = clip(c.note, 240);
    if (status === b.status && c.note === undefined) continue;
    previous.push({ id: b.id, status: b.status, note: b.note });
    const changed = status !== b.status;
    b.status = status;
    b.updatedAt = now();
    b.by = req.mod.org;
    if (!changed) continue;
    moved[status].push(b.name);
    if (undo) pendingBuildings.delete(b.id);
    else if (status !== 'inconnu') queueBuildingAlert(b);
  }
  if (!previous.length) return res.json({ previous, changed: 0 });
  save();
  const parts = [['bloque', 'BLOQUÉ'], ['partiel', 'PARTIEL'], ['ouvert', 'OUVERT'], ['inconnu', 'NON RENSEIGNÉ']].filter(([k]) => moved[k].length).map(([k, l]) => `${l} : ${moved[k].join(', ')}`);
  if (parts.length) feed(`${undo ? 'Correction · ' : ''}${parts.join(' · ')}`, moved.bloque.length ? 'alert' : moved.partiel.length ? 'warn' : 'ok');
  audit(req.mod, undo ? 'bâtiments (annulation)' : 'bâtiments (lot)', parts.join(' · '));
  broadcast('buildings', {});
  res.json({ previous, changed: previous.length });
});
mod.delete('/buildings/:id', (req, res) => {
  const i = db.buildings.findIndex((x) => x.id === req.params.id);
  if (i < 0) return bad(res, 'Introuvable', 404);
  audit(req.mod, 'bâtiment supprimé', db.buildings[i].name);
  db.buildings.splice(i, 1); save(); broadcast('buildings', {});
  res.json({ ok: true });
});

// Agenda : AG, manifs, rassemblements
function readEvent(body, e = {}) {
  const start = new Date(body.start ?? e.start);
  if (Number.isNaN(start.getTime())) throw new Error('Date et heure invalides.');
  return {
    ...e,
    type: oneOf(body.type ?? e.type, EVENT_TYPES, 'autre'),
    title: clip(body.title ?? e.title, 120),
    start: start.toISOString(),
    place: clip(body.place ?? e.place, 140),
    address: clip(body.address ?? e.address, 200),
    description: clip(body.description ?? e.description, 1500),
  };
}
mod.post('/events', (req, res) => {
  let e;
  try { e = readEvent(req.body); } catch (err) { return bad(res, err.message); }
  if (!e.title) return bad(res, 'Titre requis.');
  e.id = newId(); e.org = req.mod.org; e.createdAt = now();
  db.events.push(e); save(); audit(req.mod, 'événement', e.title);
  const when = new Date(e.start).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  feed(`Nouveau rendez-vous · ${e.type} · ${e.title} · ${when}${e.place ? ' · ' + e.place : ''}`, 'info');
  broadcast('events', {});
  if (req.body.notify) notify('events', { tone: 'blue', subject: `📣 ${e.type} : ${e.title} (${when})`, kicker: `LYON 1 · LA DOUA EN LUTTE · ${e.type.toUpperCase()}`, title: e.title, body: `${when}\n${e.place}${e.address ? ' · ' + e.address : ''}\n\n${e.description}`.trim(), url: '/#/agenda' });
  res.json(e);
});
mod.put('/events/:id', (req, res) => {
  const i = db.events.findIndex((x) => x.id === req.params.id);
  if (i < 0) return bad(res, 'Introuvable', 404);
  try { db.events[i] = readEvent(req.body, db.events[i]); } catch (err) { return bad(res, err.message); }
  save(); audit(req.mod, 'événement modifié', db.events[i].title); broadcast('events', {});
  res.json(db.events[i]);
});
mod.delete('/events/:id', (req, res) => {
  const i = db.events.findIndex((x) => x.id === req.params.id);
  if (i < 0) return bad(res, 'Introuvable', 404);
  audit(req.mod, 'événement supprimé', db.events[i].title);
  db.events.splice(i, 1); save(); broadcast('events', {});
  res.json({ ok: true });
});
mod.get('/events/all', (req, res) => res.json([...db.events].sort((a, b) => b.start.localeCompare(a.start))));

// Flash infos manuels (bandeau)
mod.post('/flashes', (req, res) => {
  const text = clip(req.body.text, 280);
  if (!text) return bad(res, 'Texte requis.');
  const f = { id: newId(), level: oneOf(req.body.level, ['alerte', 'info', 'ok'], 'info'), text, at: now(), org: req.mod.org };
  db.flashes.unshift(f); db.flashes = db.flashes.slice(0, 100); save();
  audit(req.mod, 'flash', text);
  feed(text, f.level === 'alerte' ? 'alert' : f.level === 'ok' ? 'ok' : 'info');
  if (f.level === 'alerte' && req.body.push !== false) postTelegram(`🚨 <b>ALERTE</b>\n${tgEsc(text)}`, '/');
  if (f.level === 'alerte' && req.body.push !== false) sendPush('urgent', { title: '🚨 Alerte · La Doua en lutte', body: text, url: '/', tag: `flash-${f.id}` }).catch((e) => console.error('[push]', e.message));
  broadcast('flashes', {});
  res.json(f);
});
mod.delete('/flashes/:id', (req, res) => {
  db.flashes = db.flashes.filter((f) => f.id !== req.params.id); save(); broadcast('flashes', {});
  res.json({ ok: true });
});

// Revendications
mod.post('/demands', (req, res) => {
  const title = clip(req.body.title, 160);
  if (!title) return bad(res, 'Titre requis.');
  const d = { id: newId(), order: Math.max(0, ...db.demands.map((x) => x.order || 0)) + 1, title, text: clip(req.body.text, 2000), category: clip(req.body.category, 60) || 'Général', status: oneOf(req.body.status, ['en-lutte', 'obtenu', 'refuse'], 'en-lutte'), createdAt: now(), org: req.mod.org };
  db.demands.push(d); save(); audit(req.mod, 'revendication', title);
  broadcast('demands', {});
  res.json(publicDemand(d));
});
// Texte « Le contexte » affiché en haut des revendications
mod.put('/context', (req, res) => {
  db.settings.context = { title: clip(req.body.title, 80) || 'Le contexte', text: clip(req.body.text, 6000), call: clip(req.body.call, 300), closing: clip(req.body.closing, 3000), source: clip(req.body.source, 600) };
  save(); audit(req.mod, 'contexte modifié', ''); broadcast('demands', {});
  res.json(db.settings.context);
});
mod.put('/demands/:id', (req, res) => {
  const d = db.demands.find((x) => x.id === req.params.id);
  if (!d) return bad(res, 'Introuvable', 404);
  if (req.body.title !== undefined) d.title = clip(req.body.title, 160) || d.title;
  if (req.body.text !== undefined) d.text = clip(req.body.text, 2000);
  if (req.body.category !== undefined) d.category = clip(req.body.category, 40) || 'Général';
  if (req.body.status !== undefined) {
    const prev = d.status;
    d.status = oneOf(req.body.status, ['en-lutte', 'obtenu', 'refuse'], d.status);
    if (prev !== d.status && d.status === 'obtenu') feed(`Revendication obtenue : ${d.title}`, 'ok');
  }
  save(); audit(req.mod, 'revendication modifiée', d.title); broadcast('demands', {});
  res.json(publicDemand(d));
});
mod.delete('/demands/:id', (req, res) => {
  db.demands = db.demands.filter((d) => d.id !== req.params.id); delete db.supports[req.params.id];
  save(); broadcast('demands', {}); res.json({ ok: true });
});

// Contacts : « à qui parler »
mod.post('/contacts', (req, res) => {
  const name = clip(req.body.name, 100);
  if (!name) return bad(res, 'Nom requis.');
  const c = { id: newId(), name, role: clip(req.body.role, 160), how: clip(req.body.how, 300), link: /^(https?:\/\/|mailto:|tel:)/i.test(req.body.link || '') ? clip(req.body.link, 300) : '' };
  db.contacts.push(c); save(); audit(req.mod, 'contact', name); broadcast('contacts', {});
  res.json(c);
});
mod.delete('/contacts/:id', (req, res) => {
  db.contacts = db.contacts.filter((c) => c.id !== req.params.id); save(); broadcast('contacts', {});
  res.json({ ok: true });
});

// Chat : modération
mod.get('/chat/reported', (req, res) => res.json(db.messages.filter((m) => m.reports.length || m.hidden).slice(-100).reverse().map((m) => ({ ...publicMsg(m), hidden: !!m.hidden, reports: m.reports.length }))));
mod.delete('/chat/:id', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  m.hidden = true; save(); audit(req.mod, 'message masqué', m.text.slice(0, 80));
  broadcast('chat-del', { id: m.id });
  res.json({ ok: true });
});
mod.post('/chat/:id/restore', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  m.hidden = false; m.reports = []; save(); broadcast('chat', publicMsg(m));
  res.json({ ok: true });
});

// Comptes rendus : PDF → IA → flash infos. Réponse en flux NDJSON pour voir l'IA travailler en direct.
mod.get('/reports', (req, res) => res.json([...db.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
mod.post('/reports/analyze', express.raw({ type: 'application/pdf', limit: '25mb' }), async (req, res) => {
  const pdf = req.body;
  if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== '%PDF-') return bad(res, 'Envoie un fichier PDF.');
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  const send = (o) => res.write(JSON.stringify(o) + '\n');
  const fileName = clip(req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'compte-rendu.pdf', 120);
  send({ t: 'log', m: `Fichier reçu : ${fileName} (${(pdf.length / 1024).toFixed(0)} Ko)` });
  let data;
  let source = 'ia';
  try {
    if (!aiEnabled()) send({ t: 'log', m: 'Aucune clé IA configurée : extraction locale du texte…' });
    const out = await analyzePdf(pdf, send);
    data = out.data;
    source = out.source === 'local' ? 'local' : 'ia';
    if (source === 'ia') send({ t: 'log', m: 'Structure validée. Noms de personnes retirés.' });
  } catch (e) {
    console.error('[cr]', e);
    send({ t: 'error', m: e.message || 'Erreur pendant l’analyse.' });
    return res.end();
  }
  const r = { id: newId(), status: 'draft', source, fileName, createdAt: now(), by: req.mod.username, org: req.mod.org, ...sanitizeReport(data) };
  db.reports.push(r); save();
  audit(req.mod, 'compte rendu analysé', r.titre);
  send({ t: 'done', report: r });
  res.end();
});
function sanitizeReport(d = {}) {
  const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    titre: clip(d.titre, 140) || "Compte rendu d'AG",
    date: clip(d.date, 10),
    lieu: clip(d.lieu, 140),
    participants: clip(d.participants, 40),
    resume: clip(d.resume, 600),
    flashs: arr(d.flashs, 15).map((f) => ({ type: oneOf(f.type, ['decision', 'vote', 'info', 'action', 'alerte'], 'info'), titre: clip(f.titre, 80), texte: clip(f.texte, 500) })).filter((f) => f.texte || f.titre),
    votes: arr(d.votes, 20).map((v) => ({ question: clip(v.question, 300), pour: clip(v.pour, 10), contre: clip(v.contre, 10), abstention: clip(v.abstention, 10), resultat: oneOf(v.resultat, ['adopte', 'rejete', 'inconnu'], 'inconnu') })).filter((v) => v.question),
    rdv: arr(d.rdv, 15).map((e) => ({ type: oneOf(e.type, EVENT_TYPES, 'autre'), titre: clip(e.titre, 120), date: clip(e.date, 10), heure: clip(e.heure, 5), lieu: clip(e.lieu, 140) })).filter((e) => e.titre),
    batiments_bloques: arr(d.batiments_bloques, 40).map((s) => clip(s, 80)).filter(Boolean),
    revendications: arr(d.revendications, 30).map((s) => clip(s, 300)).filter(Boolean),
  };
}
mod.put('/reports/:id', (req, res) => {
  const r = db.reports.find((x) => x.id === req.params.id);
  if (!r) return bad(res, 'Introuvable', 404);
  Object.assign(r, sanitizeReport({ ...r, ...req.body }));
  const publishing = req.body.publish && r.status !== 'published';
  if (publishing) { r.status = 'published'; r.publishedAt = now(); }
  if (req.body.unpublish) r.status = 'draft';
  save();
  audit(req.mod, publishing ? 'compte rendu publié' : 'compte rendu modifié', r.titre);
  if (publishing) {
    feed(`Compte rendu publié : ${r.titre}${r.flashs[0] ? ' · ' + r.flashs[0].titre : ''}`, 'info');
    // Import optionnel dans l'agenda et les revendications.
    if (req.body.importEvents) {
      for (const e of r.rdv) {
        const start = new Date(`${e.date}T${e.heure || '12:00'}:00`);
        if (!e.date || Number.isNaN(start.getTime())) continue;
        db.events.push({ id: newId(), type: e.type, title: e.titre, start: start.toISOString(), place: e.lieu, address: '', description: `Annoncé dans : ${r.titre}`, org: req.mod.org, createdAt: now() });
      }
      broadcast('events', {});
    }
    if (req.body.importDemands) {
      for (const t of r.revendications) if (!db.demands.some((d) => d.title.toLowerCase() === t.toLowerCase())) db.demands.push({ id: newId(), title: clip(t, 160), text: '', category: 'Votée en AG', status: 'en-lutte', createdAt: now(), org: req.mod.org });
      broadcast('demands', {});
    }
    save();
    if (req.body.notify) notify('reports', { tone: 'blue', subject: `📝 Compte rendu : ${r.titre}`, kicker: 'LYON 1 · LA DOUA EN LUTTE · COMPTE RENDU', title: r.titre, body: r.resume, items: r.flashs.slice(0, 6).map((f) => ({ label: f.titre, value: '', tone: f.type === 'alerte' ? 'red' : undefined })), url: `/#/cr/${r.id}` });
  }
  broadcast('reports', {});
  res.json(r);
});
mod.delete('/reports/:id', (req, res) => {
  db.reports = db.reports.filter((r) => r.id !== req.params.id); save(); broadcast('reports', {});
  res.json({ ok: true });
});

mod.get('/stats', (req, res) => res.json({
  subscribers: db.subscribers.filter((s) => s.confirmed).length,
  pending: db.subscribers.filter((s) => !s.confirmed).length,
  messages: db.messages.length,
  reported: db.messages.filter((m) => m.reports.length && !m.hidden).length,
  online: clients.size,
  mailEnabled: mailEnabled(),
  aiEnabled: aiEnabled(),
  aiProviders: aiProviders(),
  mailProvider: mailProvider(),
  mailQuota: mailQuota(),
  pushSubs: pushCount(),
  telegram: telegramEnabled(),
  emailMode: EMAIL_MODE,
  emailCap: emailCap(),
  storage: remoteEnabled() ? 'Supabase' : (process.env.RENDER ? 'temporaire' : 'disque'),
}));
mod.get('/audit', (req, res) => res.json(db.audit.slice(0, 200)));

// Admin : comptes modos (un compte par organisation / personne)
mod.get('/mods', requireAdmin, (req, res) => res.json(db.mods.map(publicMod)));
mod.post('/mods', requireAdmin, (req, res) => {
  const username = clip(req.body.username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return bad(res, 'Identifiant : 3 à 40 caractères (lettres, chiffres, . _ -).');
  if (db.mods.some((m) => m.username === username)) return bad(res, 'Identifiant déjà pris.');
  const password = crypto.randomBytes(9).toString('base64url');
  const m = { id: newId(), username, org: clip(req.body.org, 80) || 'Syndicat', role: req.body.role === 'admin' ? 'admin' : 'mod', ...hashPassword(password), createdAt: now(), version: 1 };
  db.mods.push(m); save(); audit(req.mod, 'compte modo créé', `${username} (${m.org})`);
  res.json({ ...publicMod(m), password });
});
mod.post('/mods/:id/reset', requireAdmin, (req, res) => {
  const m = db.mods.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  const password = crypto.randomBytes(9).toString('base64url');
  Object.assign(m, hashPassword(password)); m.version = (m.version || 1) + 1; m.disabled = false; save();
  audit(req.mod, 'mot de passe réinitialisé', m.username);
  res.json({ ...publicMod(m), password });
});
mod.delete('/mods/:id', requireAdmin, (req, res) => {
  const m = db.mods.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  if (m.id === req.mod.id) return bad(res, 'Tu ne peux pas désactiver ton propre compte.');
  m.disabled = true; m.version = (m.version || 1) + 1; save();
  audit(req.mod, 'compte désactivé', m.username);
  res.json({ ok: true });
});

// ---------- Votes, blog, témoignages ----------
const community = registerCommunity(app, mod, { broadcast, feed, audit, visitor, limited, clip, bad, oneOf });

// ---------- Site ----------
// Le service worker doit toujours être relu, sinon les mises à jour de l'app n'arriveraient pas.
app.get('/sw.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.sendFile(path.join(ROOT, 'public', 'sw.js')); });
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '5m', index: 'index.html' }));
app.use('/api', (req, res) => bad(res, 'Route inconnue', 404));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`${SITE_NAME} → ${SITE_URL()} (port ${PORT})`);
  console.log(`Stockage : ${storage === 'local' ? 'disque local' : 'Supabase'} · IA : ${aiEnabled() ? aiProviders().join(' → ') : 'non configurée (mode local)'} · Emails : ${mailProvider() || 'non configurés'} · Notifications : ${pushCount()} téléphone(s) · Telegram : ${telegramEnabled() ? 'oui' : 'non'}`);
});

// Hébergement gratuit : le service s'endort après 15 min sans visite. Il se rend visite lui-même toutes les 10 min
// pour que le direct et les alertes restent instantanés. Désactivable avec KEEP_AWAKE=false.
const awakeUrl = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
if (awakeUrl && process.env.KEEP_AWAKE !== 'false') {
  setInterval(() => { fetch(`${awakeUrl.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(20000) }).catch(() => {}); }, 10 * 60e3).unref();
}
