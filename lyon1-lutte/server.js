// Lyon 1 en lutte : plateforme d'information étudiante pendant la mobilisation.
// API JSON + flux temps réel (SSE) + site statique (public/).
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, save, newId, now } from './lib/store.js';
import { seed } from './lib/seed.js';
import { ensureAdmin, hashPassword, verifyPassword, createToken, readToken, cookieHeader, parseCookies, COOKIE, publicMod, SECRET } from './lib/auth.js';
import { mailEnabled, sendMany, renderEmail, SITE_URL } from './lib/mail.js';
import { aiEnabled, analyzeWithClaude, extractPdfText, analyzeLocally } from './lib/ai.js';
import { registerCommunity } from './lib/community.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ALERT_DELAY_MS = Number(process.env.ALERT_DELAY_MS ?? 60000);

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
const BLOCUS = ['actif', 'partiel', 'leve', 'inconnu'];
const BLOCUS_LABEL = { actif: 'BLOCUS EN COURS', partiel: 'BLOCUS PARTIEL', leve: 'PAS DE BLOCUS', inconnu: 'SITUATION NON CONFIRMÉE' };
const EVENT_TYPES = ['AG', 'manif', 'rassemblement', 'action', 'autre'];

const publicReport = (r) => ({ id: r.id, titre: r.titre, date: r.date, lieu: r.lieu, participants: r.participants, resume: r.resume, flashs: r.flashs, votes: r.votes, rdv: r.rdv, batiments_bloques: r.batiments_bloques, revendications: r.revendications, publishedAt: r.publishedAt, org: r.org, source: r.source });
const publicDemand = (d) => ({ ...d, support: (db.supports[d.id] || []).length });
function upcomingEvents() {
  const cutoff = Date.now() - 6 * 3600e3;
  return db.events.filter((e) => new Date(e.start).getTime() >= cutoff).sort((a, b) => a.start.localeCompare(b.start));
}

app.get('/api/state', (req, res) => {
  res.json({
    blocus: db.settings.blocus,
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
app.post('/api/subscribe', async (req, res) => {
  const email = clip(req.body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return bad(res, 'Adresse email invalide.');
  if (limited(`sub:${visitor(req)}`, 5, 3600e3)) return bad(res, 'Trop de tentatives, réessaie plus tard.', 429);
  const alerts = Array.isArray(req.body.alerts) ? req.body.alerts.filter((a) => ALERTS.includes(a)) : ALERTS;
  const campuses = Array.isArray(req.body.campuses) ? req.body.campuses.map((c) => clip(c, 60)).slice(0, 10) : [];
  let s = db.subscribers.find((x) => x.email === email);
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
    const { html, text } = renderEmail({ tone: 'blue', kicker: 'LYON 1 // ALERTES', title: 'Confirme ton inscription', body: `Clique sur le bouton pour recevoir les alertes (bâtiments bloqués, AG, manifs).\n\nLien direct : ${link}`, cta: 'Confirmer', token: s.token });
    await sendMany([{ to: email, subject: 'Confirme tes alertes Lyon 1', html: html.replace(SITE_URL() + '"', link + '"'), text }]);
    return res.json({ ok: true, message: 'Vérifie ta boîte mail pour confirmer (pense aux spams).' });
  }
  res.json({ ok: true, message: 'Préférences mises à jour.' });
});
const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f7;font:17px -apple-system,Segoe UI,Roboto,sans-serif;padding:16px"><div style="max-width:420px;text-align:center"><h1 style="font-size:28px">${title}</h1><p style="color:#a1a1aa">${msg}</p><a href="/" style="color:#30D158">Retour au site →</a></div>`;
app.get('/api/confirm', (req, res) => {
  const s = db.subscribers.find((x) => x.token === req.query.token);
  if (!s) return res.status(404).send(page('Lien invalide', 'Ce lien ne correspond à aucune inscription.'));
  s.confirmed = true; save();
  res.send(page('C’est bon ✅', 'Tu recevras les alertes par email. Tu peux te désinscrire à tout moment depuis chaque email.'));
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
    const { html, text } = renderEmail({ tone: anyBlocked ? 'red' : 'green', kicker: `LYON 1 // ${BLOCUS_LABEL[db.settings.blocus.state]}`, title, items, body: relevant.map((b) => b.note).filter(Boolean).join('\n'), token: s.token });
    messages.push({ to: s.email, subject, html, text });
  }
  const r = await sendMany(messages);
  console.log(`[alertes] bâtiments : ${messages.length} email(s), ${r.sent} envoyé(s)`);
}
async function notify(kind, { subject, kicker, title, body, items, tone }) {
  const recipients = db.subscribers.filter((s) => s.confirmed && s.alerts?.includes(kind));
  const messages = recipients.map((s) => ({ to: s.email, subject, ...renderEmail({ tone, kicker, title, body, items, token: s.token }) }));
  sendMany(messages).then((r) => console.log(`[alertes] ${kind} : ${r.sent ?? 0} envoyé(s)`)).catch((e) => console.error('[alertes]', e.message));
}

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
  const prev = b.state;
  b.state = oneOf(req.body.state, BLOCUS, b.state);
  b.message = clip(req.body.message, 400);
  b.updatedAt = now();
  b.by = req.mod.org;
  save();
  audit(req.mod, 'blocus', `${b.state} ${b.message}`);
  feed(`${BLOCUS_LABEL[b.state]}${b.message ? ' : ' + b.message : ''}`, b.state === 'actif' ? 'alert' : b.state === 'leve' ? 'ok' : 'warn');
  broadcast('blocus', b);
  if (prev !== b.state && req.body.notify !== false) {
    notify('buildings', { tone: b.state === 'leve' ? 'green' : 'red', subject: `${b.state === 'leve' ? '🟢' : '🔴'} ${BLOCUS_LABEL[b.state]} à Lyon 1`, kicker: 'LYON 1 // BLOCUS', title: BLOCUS_LABEL[b.state], body: b.message });
  }
  res.json(b);
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
  if (req.body.notify) notify('events', { tone: 'blue', subject: `📣 ${e.type} : ${e.title} (${when})`, kicker: `LYON 1 // ${e.type.toUpperCase()}`, title: e.title, body: `${when}\n${e.place}${e.address ? ' · ' + e.address : ''}\n\n${e.description}`.trim() });
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
  const d = { id: newId(), title, text: clip(req.body.text, 2000), category: clip(req.body.category, 40) || 'Général', status: oneOf(req.body.status, ['en-lutte', 'obtenu', 'refuse'], 'en-lutte'), createdAt: now(), org: req.mod.org };
  db.demands.push(d); save(); audit(req.mod, 'revendication', title);
  broadcast('demands', {});
  res.json(publicDemand(d));
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
    if (aiEnabled()) {
      send({ t: 'log', m: 'Lecture du PDF par l’IA (texte, tableaux, scans)…' });
      data = await analyzeWithClaude(pdf, send);
      send({ t: 'log', m: 'Structure validée. Noms de personnes retirés.' });
    } else {
      source = 'local';
      send({ t: 'log', m: 'IA non configurée : extraction locale du texte…' });
      const lines = await extractPdfText(pdf);
      send({ t: 'log', m: `${lines.length} lignes extraites. Repérage des votes, décisions, rendez-vous…` });
      if (!lines.length) throw new Error('Aucun texte trouvé (PDF scanné ?). Configure la clé IA pour lire les scans.');
      data = analyzeLocally(lines);
    }
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
    if (req.body.notify) notify('reports', { tone: 'blue', subject: `📝 Compte rendu : ${r.titre}`, kicker: 'LYON 1 // COMPTE RENDU AG', title: r.titre, body: r.resume, items: r.flashs.slice(0, 6).map((f) => ({ label: f.titre, value: '', tone: f.type === 'alerte' ? 'red' : undefined })) });
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
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '5m', index: 'index.html' }));
app.use('/api', (req, res) => bad(res, 'Route inconnue', 404));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Lyon 1 en lutte → ${SITE_URL()} (port ${PORT})`);
  console.log(`IA : ${aiEnabled() ? 'activée' : 'non configurée (mode local)'} · Emails : ${mailEnabled() ? 'activés' : 'non configurés (journal console)'}`);
});
