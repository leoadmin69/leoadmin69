// Lyon 1 · La Doua en lutte : plateforme d'information étudiante pendant la mobilisation.
// API JSON + flux temps réel (SSE) + site statique (public/).
import express from 'express';
import { createRequire } from 'node:module';
// Express 4 n'attrape pas les erreurs des routes « async » : on les renvoie au gestionnaire d'erreurs (réponse 500 propre)
{
  const Layer = createRequire(import.meta.url)('express/lib/router/layer.js');
  const handle = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function (req, res, next) {
    if (this.handle.length > 3) return handle.call(this, req, res, next);
    try { const r = this.handle(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); }
  };
}
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, save, newId, now, initStore } from './lib/store.js';
import { remoteEnabled } from './lib/remote.js';
import { publicKey, subscribe as pushSubscribe, unsubscribe as pushUnsubscribe, sendPush, sendPushAll, pushCount, PUSH_KINDS, modSubscribe, modUnsubscribe, modPushOn, sendModPush } from './lib/push.js';
import { seed } from './lib/seed.js';
import { ensureAdmin, hashPassword, verifyPassword, createToken, readToken, cookieHeader, parseCookies, COOKIE, publicMod, SECRET } from './lib/auth.js';
import { mailEnabled, mailProvider, mailQuota, sendMany, renderEmail, SITE_URL, SITE_NAME } from './lib/mail.js';
import { aiEnabled, aiProviders, analyzePdf } from './lib/ai.js';
import { registerCommunity, MAX_VIDEO_MB } from './lib/community.js';
import { registerExtras } from './lib/extras.js';
import { recordVisit, recordInstall, audienceSummary } from './lib/audience.js';
import { saveSnap, readSnap, deleteSnap, purgeSnaps, sweepSnaps, stripJpeg, isJpeg, SNAP_TTL } from './lib/snaps.js';
import { isSystemNick } from './public/nicks.js';
import { EMOTES } from './public/emotes.js';
const EMOTE_SET = new Set(EMOTES.map((e) => e.code));
import { bannedList, findBanned, normalize as normalizeWord, BANNED_BASE } from './lib/moderation.js';
import { telegramEnabled, telegramUrl, postTelegram, tgEsc, telegramCheck, telegramTest, telegramStatus, normalizeChat } from './lib/telegram.js';
import { DEFAULT_SITE, site, siteName, modSites, canSite, siteOf, migrateSites, effectiveBlocus, wantsSite, isAdmin, ALL_SITES, telegramChats } from './lib/sites.js';
import { syncInstagram, syncInstagramStories, startInstagramSync, instagramEnabled, intervalMinutes as instagramInterval } from './lib/instagram.js';

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
migrateSites();

const app = express();
let extras = null; // options (lib/extras.js), branché plus bas
process.on('unhandledRejection', (e) => console.error('[erreur async]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[erreur]', e?.stack || e));
app.disable('x-powered-by');
// « true » ferait confiance à n'importe quel X-Forwarded-For écrit par le client : on ne garde que le dernier proxy (l'hébergeur).
if (process.env.TRUST_PROXY) app.set('trust proxy', /^(true|yes|on)$/i.test(process.env.TRUST_PROXY) ? 1 : /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  if (!DEVICE_ROUTES.test(`${req.method} ${req.path}`) || hasDevice(req)) return next();
  deviceKey(req, res); // pose le cookie
  res.status(428).json({ error: 'Recharge la page et réessaie.', retry: true });
});
// Requête illisible (JSON cassé, trop gros) : réponse claire, sans trace d'erreur dans les journaux
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête illisible.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Envoi trop volumineux.' });
  next(err);
});

// ---------- Utilitaires ----------
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// Identifiant visiteur anonyme : hash de l'IP avec une graine qui change chaque jour (aucune IP stockée).
const visitor = (req) => crypto.createHmac('sha256', SECRET).update(`${new Date().toISOString().slice(0, 10)}|${req.ip}`).digest('hex').slice(0, 16);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
// Empreinte anonyme par appareil (cookie aléatoire, le même que pour les votes), qui change chaque jour.
// Sur le wifi du campus, des centaines d'étudiant·es partagent la même IP : on ne peut pas limiter par IP seule.
function deviceKey(req, res, stable = false) {
  let d = parseCookies(req.headers.cookie).l1_dev;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(d || '')) {
    d = crypto.randomBytes(24).toString('base64url');
    res.append('Set-Cookie', `l1_dev=${d}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  }
  return crypto.createHmac('sha256', SECRET).update(`${stable ? 'stable' : new Date().toISOString().slice(0, 10)}|dev|${d}`).digest('hex').slice(0, 16);
}

// Ce qui est compté « une fois par appareil » (signalement, vue d'une photo, réaction, vote, soutien…) exige un cookie
// d'appareil déjà présent : sinon chaque requête sans cookie compterait comme un nouvel appareil.
// Le site pose ce cookie dès l'ouverture (/api/hit) ; s'il manque, on le pose et l'app réessaie toute seule (428).
const hasDevice = (req) => /^[A-Za-z0-9_-]{20,64}$/.test(parseCookies(req.headers.cookie).l1_dev || '');
const DEVICE_ROUTES = /^(POST \/api\/hit|POST \/api\/chat(\/photo|\/[\w-]+\/(report|react))?|GET \/api\/chat\/photo\/[\w-]+|POST \/api\/sightings(\/photo)?|POST \/api\/events\/[\w-]+\/going|POST \/api\/polls\/[\w-]+\/vote|POST \/api\/demands\/[\w-]+\/support|POST \/api\/entraide(\/[\w-]+\/(report|reply))?)$/;

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
function audit(mod, action, detail = '', siteId = '') {
  db.audit.unshift({ at: now(), by: mod.username, org: mod.org, action, detail: clip(detail, 300), site: siteId });
  db.audit = db.audit.slice(0, 2000);
}

// ---------- Session modo ----------
function currentMod(req) { return readToken(parseCookies(req.headers.cookie)[COOKIE]); }
// Dans le chat, seul·es les vrais modos ont des droits en plus (pas les comptes piquet)
function chatMod(req) { const m = currentMod(req); return m && m.role !== 'terrain' ? m : null; }
const TERRAIN_OK = [/^GET \/terrain\/buildings$/, /^POST \/terrain\/buildings$/, /^PUT \/buildings-batch$/, /^PUT \/buildings\/[\w-]+$/, /^POST \/terrain\/building\/[\w-]+\/photo$/, /^GET \/sightings$/, /^POST \/sightings\/(ignore|remind)$/, /^GET \/sightings\/photo\/[\w-]+$/, /^POST \/push\/(subscribe|unsubscribe|status)$/, /^GET \/presence$/, /^GET \/guide\.pdf$/];
function requireMod(req, res, next) {
  const mod = currentMod(req);
  if (!mod) return bad(res, 'Connexion modo requise.', 401);
  // Protection CSRF : les requêtes d'écriture viennent du site lui-même (JSON ou PDF, jamais un formulaire externe).
  if (req.method !== 'GET' && !/^(application\/json|application\/pdf|image\/jpeg)/.test(req.headers['content-type'] || '') && req.method !== 'DELETE') return bad(res, 'Type de contenu refusé.', 415);
  req.mod = mod;
  presence.set(mod.id, Date.now());
  // Compte « terrain » (personnes des piquets) : seulement les bâtiments et les signalements
  if (mod.role === 'terrain' && !TERRAIN_OK.some((r) => r.test(`${req.method} ${req.path}`))) return bad(res, 'Compte piquet : tu peux seulement mettre à jour les bâtiments.', 403);
  next();
}
// Qui est connecté·e en ce moment dans l'espace modo (pour savoir qu'on n'est pas seul·e à modifier)
const presence = new Map();
// Refuse si le modo n'a pas les droits sur ce site. Renvoie false si la réponse est déjà partie.
function needSite(req, res, id) {
  if (id === ALL_SITES) { if (isAdmin(req.mod)) return true; bad(res, 'Seul·e l’admin peut publier pour tous les sites.', 403); return false; }
  if (!site(id)) { bad(res, 'Site inconnu.'); return false; }
  if (!canSite(req.mod, id)) { bad(res, `Tu n'as pas les droits sur « ${siteName(id)} ». Demande à l'admin.`, 403); return false; }
  return true;
}
// Site visé par une création : celui demandé, sinon le premier site du modo
const targetSite = (req) => req.body?.site || req.headers['x-site'] || modSites(req.mod)[0] || DEFAULT_SITE;
// Anti-écrasement : si quelqu'un d'autre a modifié l'élément depuis que le modo l'a ouvert, on refuse.
function stale(req, res, item) {
  const v = req.body?.version;
  if (v && item.updatedAt && v !== item.updatedAt) {
    bad(res, `Modifié entre-temps par ${item.by || item.org || 'un·e autre modo'} (${new Date(item.updatedAt).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}). La page a été rechargée : vérifie puis recommence.`, 409);
    return true;
  }
  return false;
}
const touch = (req, item) => { item.updatedAt = now(); item.by = req.mod.org; };
const requireAdmin = (req, res, next) => (req.mod.role === 'admin' ? next() : bad(res, 'Réservé aux admins.', 403));

// ---------- Lecture publique ----------
const STATUS = ['bloque', 'partiel', 'ouvert', 'inconnu'];
const STATUS_LABEL = { bloque: 'BLOQUÉ', partiel: 'PARTIELLEMENT BLOQUÉ', ouvert: 'OUVERT', inconnu: 'NON RENSEIGNÉ' };
const BLOCUS = ['auto', 'actif', 'partiel', 'leve', 'inconnu'];
const BLOCUS_LABEL = { actif: 'BLOCUS EN COURS', partiel: 'BLOCUS PARTIEL', leve: 'PAS DE BLOCUS', inconnu: 'SITUATION NON CONFIRMÉE', auto: 'AUTOMATIQUE' };
const EVENT_TYPES = ['AG', 'manif', 'rassemblement', 'action', 'autre'];

const publicReport = (r) => ({ site: siteOf(r), id: r.id, titre: r.titre, date: r.date, lieu: r.lieu, participants: r.participants, resume: r.resume, flashs: r.flashs, votes: r.votes, rdv: r.rdv, batiments_bloques: r.batiments_bloques, revendications: r.revendications, publishedAt: r.publishedAt, org: r.org, source: r.source });
const publicDemand = (d) => ({ ...d, support: (db.supports[d.id] || []).length });
function upcomingEvents() {
  const cutoff = Date.now() - 6 * 3600e3;
  return db.events.filter((e) => new Date(e.start).getTime() >= cutoff).sort((a, b) => a.start.localeCompare(b.start)).map(({ going, reminded, ...e }) => ({ ...e, goingCount: Object.keys(going || {}).length }));
}

// Audience anonyme : une visite par ouverture (navigateur ou app installée), et les installations
app.post('/api/hit', (req, res) => {
  if (limited(`hit:${visitor(req)}`, 600, 3600e3)) return res.json({ ok: false });
  const dev = deviceKey(req, res, true).slice(0, 12);
  if (limited(`hitd:${dev}`, 30, 3600e3)) return res.json({ ok: false });
  if (req.body?.event === 'install') recordInstall();
  else recordVisit(dev, req.body?.mode === 'app' ? 'app' : 'browser');
  res.json({ ok: true });
});

// Contrôle de santé pour l'hébergeur (ne révèle rien).
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/state', (req, res) => {
  res.json({
    defaultSite: DEFAULT_SITE,
    sites: db.sites.map(({ id, name, short }) => ({ id, name, short })),
    siteStatus: Object.fromEntries(db.sites.map((x) => { const st = db.siteStatus[x.id] || {}; return [x.id, { ...st, effective: effectiveBlocus(x.id), auto: !st.state || ['auto', 'inconnu'].includes(st.state) }]; })),
    contexts: db.contexts || {},
    // Anciens champs gardés pour les apps pas encore mises à jour (site principal)
    blocus: { ...(db.siteStatus[DEFAULT_SITE] || {}), effective: effectiveBlocus(DEFAULT_SITE), auto: ['auto', 'inconnu'].includes(db.siteStatus[DEFAULT_SITE]?.state || 'auto') },
    context: db.contexts?.[DEFAULT_SITE] || null,
    // la photo du piquet reste privée ; on indique seulement qu'elle existe (pour le bouton des modos)
    buildings: db.buildings.map(({ terrainProof, ...b }) => (terrainProof ? { ...b, proofAt: terrainProof.at } : b)),
    events: upcomingEvents(),
    flashes: liveFlashes().slice(0, 20),
    reports: db.reports.filter((r) => r.status === 'published').sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 30).map(publicReport),
    demands: db.demands.map(publicDemand),
    contacts: db.contacts,
    channels: db.channels,
    feed: db.feed.slice(0, 40),
    subscribers: db.subscribers.filter((s) => s.confirmed).length,
    online: clients.size,
    pollsOpen: community.pollsOpen(),
    pollsOpenBySite: community.pollsOpenBySite(),
    telegramUrl: telegramUrl(),
    emailMode: EMAIL_MODE,
    digestHour: DIGEST_HOUR,
    emailSpots: mailEnabled() ? emailSpots() : 0,
    maxVideoMb: MAX_VIDEO_MB,
    sightings: extras ? extras.sightingSummary().map(({ building, status, count, crowd, publicAt }) => ({ building, status, count, crowd, publicAt })) : [],
    droitsPublished: !!db.pages?.droits?.published,
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
const reactCounts = (m) => Object.fromEntries(Object.entries(m.reactions || {}).filter(([, l]) => l.length).map(([c, l]) => [c, l.length]));
const publicPhoto = (p) => (p ? { id: p.id, thumb: p.gone ? '' : p.thumb, gone: !!p.gone, w: p.w, h: p.h } : null);
const publicMsg = (m) => ({ id: m.id, channel: m.channel, nick: m.nick, text: m.text, at: m.at, mod: m.mod || null, reply: m.reply || null, reactions: reactCounts(m), photo: publicPhoto(m.photo) });

// Liste noire (déjà normalisée) envoyée à l'app : le message est bloqué sur le téléphone avant même d'être envoyé.
app.get('/api/chat-rules', (req, res) => res.json({ words: bannedList() }));
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
  if (!chatMod(req) && !isSystemNick(nick)) return bad(res, 'Pseudo non reconnu : les pseudos sont donnés par le système. Recharge la page.');
  if (!text) return bad(res, 'Message vide.');
  const modNow = chatMod(req);
  if (!modNow && req.body.charter !== true) return bad(res, 'Lis et accepte la charte du chat avant d’écrire.', 403);
  if (findBanned(nick)) return bad(res, 'Ce pseudo contient un mot interdit par la charte.');
  if (findBanned(text)) return bad(res, 'Message bloqué : il contient un mot ou une expression interdits par la charte du chat.');
  const v = deviceKey(req, res);
  if (limited(`chat:${v}`, 1, 1500) || limited(`chatm:${v}`, 20, 60000)) return bad(res, 'Doucement 🙂 attends quelques secondes.', 429);
  if (limited(`chatip:${visitor(req)}`, 300, 60000)) return bad(res, 'Le chat est très sollicité depuis ce réseau, réessaie dans une minute.', 429);
  const mod = chatMod(req);
  if ((text.match(/:[a-z0-9]+:/g) || []).length > 15) return bad(res, 'Trop de stickers dans un seul message (15 max).');
  // Réponse à un message : on garde l'auteur et un extrait (le message d'origine peut ensuite être masqué)
  let reply = null;
  if (req.body.replyTo) {
    const o = db.messages.find((x) => x.id === String(req.body.replyTo) && x.channel === channel && !x.hidden);
    if (o) reply = { id: o.id, nick: o.mod ? `${o.nick} (${o.mod})` : o.nick, text: (o.text || (o.photo ? '📸 Photo' : '')).slice(0, 100) };
  }
  const m = { id: newId(), channel, nick, text, at: now(), v, reports: [], mod: mod ? mod.org : null, reply };
  pushMessage(m);
  broadcast('chat', publicMsg(m));
  res.json(publicMsg(m));
});
function pushMessage(m) {
  db.messages.push(m);
  if (db.messages.length > 6000) {
    for (const old of db.messages.slice(0, db.messages.length - 5000)) if (old.photo && !old.photo.gone) deleteSnap(old.photo.id);
    db.messages = db.messages.slice(-5000);
  }
  save();
}

// ---------- Photos éphémères du chat (caméra seulement, 1 vue par appareil, 24 h) ----------
app.post('/api/chat/photo', express.raw({ type: 'image/jpeg', limit: '2mb' }), async (req, res) => {
  const channel = clip(req.query.channel, 40);
  const nick = clip(req.query.nick, 24);
  const modNow = chatMod(req);
  if (!db.channels.some((c) => c.id === channel)) return bad(res, 'Salon inconnu.');
  if (!modNow && !isSystemNick(nick)) return bad(res, 'Pseudo non reconnu. Recharge la page.');
  if (!modNow && req.query.charter !== '2') return bad(res, 'Lis et accepte la nouvelle charte du chat (photos) avant d’envoyer.', 403);
  if (!Buffer.isBuffer(req.body) || !isJpeg(req.body)) return bad(res, 'Photo invalide.');
  const v = deviceKey(req, res);
  if (limited(`photo:${v}`, 1, 20000) || limited(`photoh:${v}`, 15, 3600e3)) return bad(res, 'Une photo toutes les 20 secondes maximum (15 par heure).', 429);
  if (limited(`photoip:${visitor(req)}`, 120, 3600e3)) return bad(res, 'Trop de photos depuis ce réseau, réessaie plus tard.', 429);
  const clean = stripJpeg(req.body);
  if (!clean) return bad(res, 'Photo illisible.');
  const thumb = String(req.get('x-thumb') || '');
  const id = newId() + newId();
  await saveSnap(id, clean);
  const m = {
    id: newId(), channel, nick, text: '', at: now(), v, reports: [], mod: modNow ? modNow.org : null, reply: null,
    photo: { id, thumb: /^data:image\/jpeg;base64,[A-Za-z0-9+/=]{20,4000}$/.test(thumb) ? thumb : '', w: Math.max(0, Math.min(4000, Math.round(Number(req.query.w)) || 0)), h: Math.max(0, Math.min(4000, Math.round(Number(req.query.h)) || 0)), views: [deviceKey(req, res, true)] },
  };
  pushMessage(m);
  broadcast('chat', publicMsg(m));
  res.json(publicMsg(m));
});
// Voir une photo : une seule fois par appareil (les modos : toujours)
app.get('/api/chat/photo/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const m = db.messages.find((x) => x.photo?.id === req.params.id);
  if (!m || m.photo.gone) return bad(res, 'Photo expirée ou supprimée.', 410);
  const modNow = chatMod(req);
  if (!modNow) {
    if (m.hidden) return bad(res, 'Photo retirée par les modos.', 410);
    const v = deviceKey(req, res, true);
    if (m.photo.views.includes(v)) return bad(res, 'Déjà vue : une seule vue par personne.', 410);
    m.photo.views.push(v);
    save();
  }
  const buf = await readSnap(m.photo.id);
  if (!buf) return bad(res, 'Photo introuvable.', 410);
  res.type('image/jpeg').send(buf);
});
setInterval(purgeSnaps, 10 * 60e3).unref();
// fichiers photo orphelins (envoi interrompu, plantage) : effacés au bout de 10 min
setInterval(() => {
  const used = new Set([
    ...db.messages.filter((m) => m.photo && !m.photo.gone).map((m) => m.photo.id),
    ...(db.sightings || []).filter((s) => s.photo).map((s) => s.photo),
    ...(db.buildings || []).filter((b) => b.terrainProof?.id).map((b) => b.terrainProof.id),
  ]);
  const n = sweepSnaps((id) => used.has(id));
  if (n) console.log(`[photo] ${n} fichier(s) orphelin(s) effacé(s)`);
}, 15 * 60e3).unref();
setTimeout(purgeSnaps, 20e3).unref();
app.post('/api/chat/:id/report', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  const v = deviceKey(req, res);
  if (limited(`chatrep:${visitor(req)}`, 60, 3600e3)) return bad(res, 'Trop de signalements depuis ce réseau.', 429);
  if (!m.reports.includes(v)) m.reports.push(v);
  // Masqué automatiquement après 3 signalements ; un modo peut le rétablir.
  if (m.reports.length >= 3 && !m.hidden && !m.mod) { m.hidden = true; broadcast('chat-del', { id: m.id }); }
  save();
  res.json({ ok: true });
});

// Réactions (stickers posés sous un message) : une par sticker et par appareil, un 2e tap la retire.
app.post('/api/chat/:id/react', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id && !x.hidden);
  if (!m) return bad(res, 'Message introuvable.', 404);
  const code = String(req.body.emote || '');
  if (!EMOTE_SET.has(code)) return bad(res, 'Sticker inconnu.');
  const v = deviceKey(req, res, true);
  if (limited(`react:${v}`, 40, 60000) || limited(`reactip:${visitor(req)}`, 600, 60000)) return bad(res, 'Doucement 🙂', 429);
  m.reactions ||= {};
  const list = (m.reactions[code] ||= []);
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  else {
    if (Object.keys(m.reactions).filter((c) => m.reactions[c].length).length >= 12 && !list.length) return bad(res, 'Trop de stickers différents sous ce message.');
    list.push(v);
  }
  if (!list.length) delete m.reactions[code];
  save();
  const reactions = reactCounts(m);
  broadcast('chat-react', { id: m.id, reactions });
  res.json({ on: i < 0, reactions });
});

// ---------- Revendications : soutien anonyme ----------
app.post('/api/demands/:id/support', (req, res) => {
  const d = db.demands.find((x) => x.id === req.params.id);
  if (!d) return bad(res, 'Introuvable', 404);
  if (limited(`support:${visitor(req)}`, 200, 3600e3)) return bad(res, 'Trop de soutiens depuis ce réseau, réessaie plus tard.', 429);
  const v = crypto.createHmac('sha256', SECRET).update(`support|${deviceKey(req, res, true)}`).digest('hex').slice(0, 16);
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
  const sitesWanted = (Array.isArray(req.body.sites) ? req.body.sites : []).filter((x) => site(x)).slice(0, 20);
  let s = db.subscribers.find((x) => x.email === email);
  if (!s && emailSpots() <= 0) return bad(res, 'La liste email est complète (places limitées par la version gratuite). Active plutôt les notifications de l’app ou rejoins la chaîne Telegram : c’est gratuit et sans limite.', 409);
  if (!s) { s = { id: newId(), email, token: crypto.randomBytes(18).toString('base64url'), confirmed: false, createdAt: now() }; db.subscribers.push(s); }
  if (s.confirmed && mailEnabled()) {
    // adresse déjà confirmée : les nouveaux choix ne s'appliquent qu'après un clic dans l'email (preuve que c'est bien la sienne)
    s.pending = { alerts: alerts.length ? alerts : ALERTS, sites: sitesWanted, at: now() };
    save();
    const link = `${SITE_URL()}/api/confirm?token=${encodeURIComponent(s.token)}&apply=1`;
    const { html, text } = renderEmail({ tone: 'blue', kicker: 'LYON 1 · LA DOUA EN LUTTE', title: 'Modifier tes alertes', body: `Clique sur le bouton pour appliquer tes nouveaux choix d'alertes.\n\nLien direct : ${link}`, cta: 'Appliquer', token: s.token });
    sendMany([{ to: email, subject: 'Modifier tes alertes · La Doua en lutte', html: html.replace(SITE_URL() + '"', link + '"'), text }]).catch(() => {});
    return res.json({ ok: true, message: 'Vérifie ta boîte mail pour confirmer (pense aux spams).' });
  }
  s.alerts = alerts.length ? alerts : ALERTS;
  s.sites = sitesWanted;
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
  res.json({ ok: true, message: 'Vérifie ta boîte mail pour confirmer (pense aux spams).' });
});
const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f7;font:17px -apple-system,Segoe UI,Roboto,sans-serif;padding:16px"><div style="max-width:420px;text-align:center"><h1 style="font-size:28px">${title}</h1><p style="color:#a1a1aa">${msg}</p><a href="/" style="color:#30D158">Retour au site →</a><p style="color:#6e6e73;font-size:13px;margin-top:24px">Lyon 1 · La Doua en lutte</p></div>`;
app.get('/api/confirm', (req, res) => {
  const s = db.subscribers.find((x) => x.token === req.query.token);
  if (!s) return res.status(404).send(page('Lien invalide', 'Ce lien ne correspond à aucune inscription.'));
  if (req.query.apply && s.pending) { s.alerts = s.pending.alerts; s.sites = s.pending.sites; delete s.pending; s.confirmed = true; save(); return res.send(page('C’est à jour ✅', 'Tes nouveaux choix d’alertes sont enregistrés.')); }
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
let alertFirstAt = 0;
function queueBuildingAlert(b) {
  pendingBuildings.set(b.id, b);
  if (!alertFirstAt) alertFirstAt = Date.now();
  clearTimeout(alertTimer);
  // on regroupe les changements rapprochés, mais on n'attend jamais plus de 3 min après le premier
  const wait = Math.max(0, Math.min(ALERT_DELAY_MS, alertFirstAt + Math.max(ALERT_DELAY_MS, 180e3) - Date.now()));
  alertTimer = setTimeout(() => { alertFirstAt = 0; flushBuildingAlert(); }, wait);
}
async function flushBuildingAlert() {
  const changedAll = [...pendingBuildings.values()];
  pendingBuildings = new Map();
  if (!changedAll.length) return;
  const tone = { bloque: 'red', partiel: 'orange', ouvert: 'green', inconnu: 'grey' };
  const messages = [];
  for (const sid of [...new Set(changedAll.map(siteOf))]) {
    const changed = changedAll.filter((b) => siteOf(b) === sid);
    const label = siteName(sid);
    const blocked = db.buildings.filter((b) => siteOf(b) === sid && (b.status === 'bloque' || b.status === 'partiel'));
    const anyBlocked = changed.some((b) => b.status === 'bloque' || b.status === 'partiel');
    const title = anyBlocked ? `🔴 ${label} : ${blocked.length} bâtiment${blocked.length > 1 ? 's' : ''} bloqué${blocked.length > 1 ? 's' : ''}` : `🟢 ${label} : bâtiments rouverts`;
    const names = (st) => changed.filter((b) => b.status === st).map((b) => b.name);
    const parts = [['bloque', '🔴 Bloqué'], ['partiel', '🟠 Partiel'], ['ouvert', '🟢 Ouvert']].filter(([k]) => names(k).length).map(([k, l]) => `${l} : ${names(k).join(', ')}`);
    // Notification téléphone : seulement aux personnes qui suivent ce site
    sendPush('buildings', { title, body: parts.join(' · ').slice(0, 220), url: '/#/batiments', tag: `batiments-${sid}` }, (sub) => wantsSite(sub, sid)).catch((e) => console.error('[push]', e.message));
    // Telegram : la chaîne du site si elle existe, sinon la chaîne principale (avec le nom du site)
    const tgNames = (st) => names(st).map(tgEsc);
    const tgLines = [['bloque', '🔴 <b>BLOQUÉ</b>'], ['partiel', '🟠 <b>PARTIEL</b>'], ['ouvert', '🟢 <b>OUVERT</b>']].filter(([k]) => tgNames(k).length).map(([k, l]) => `${l} : ${tgNames(k).join(', ')}`);
    const tgNotes = changed.filter((b) => b.note).map((b) => `<i>${tgEsc(b.name)} : ${tgEsc(b.note)}</i>`);
    postTelegram([`📍 <b>${tgEsc(label)}</b> · ${tgEsc(BLOCUS_LABEL[effectiveBlocus(sid)])}`, ...tgLines, ...tgNotes].join('\n'), '/#/batiments', site(sid)?.telegramChatId);
    if (EMAIL_MODE !== 'instant') continue; // les emails partent dans le récapitulatif du matin
    for (const s of db.subscribers.filter((x) => x.confirmed && x.alerts?.includes('buildings') && wantsSite(x, sid))) {
      const items = changed.map((b) => ({ label: `${b.name} : ${STATUS_LABEL[b.status]}`, value: label, tone: tone[b.status] }));
      const { html, text } = renderEmail({ tone: anyBlocked ? 'red' : 'green', kicker: `${label.toUpperCase()} · ${BLOCUS_LABEL[effectiveBlocus(sid)]}`, title, items, body: changed.map((b) => b.note).filter(Boolean).join('\n'), token: s.token });
      messages.push({ to: s.email, subject: title, html, text });
    }
  }
  if (messages.length) {
    const r = await sendMany(messages);
    console.log(`[alertes] bâtiments : ${messages.length} email(s), ${r.sent} envoyé(s)`);
  }
}
// Date + heure lues à l'heure de Paris (« 18:00 », « 18h », « 9h30 ») → Date, ou null si illisible
function parisDate(date, heure) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!d) return null;
  const t = /^(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(String(heure || '12:00').trim()) || [0, 12, 0];
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +(t[2] || 0)];
  if (h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const offset = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - guess;
  const out = new Date(guess - offset);
  return Number.isNaN(out.getTime()) ? null : out;
}

// ---------- Flash infos : durée de vie ----------
// 1 h, 6 h, 24 h (par défaut), 72 h, ou 0 = jusqu'à suppression. Expiré = retiré de l'accueil, gardé dans l'historique des modos.
const FLASH_TTLS = [1, 6, 24, 72, 0];
const flashTtl = (v) => (FLASH_TTLS.includes(Number(v)) ? Number(v) : 24);
const flashLive = (f) => !f.expiresAt || new Date(f.expiresAt).getTime() > Date.now();
const liveFlashes = () => db.flashes.filter(flashLive);
// Anciens flash (avant cette fonction) : ils expirent 24 h après leur publication
if (!db.settings.flashTtlV1) { for (const f of db.flashes) if (f.expiresAt === undefined) f.expiresAt = new Date(new Date(f.at).getTime() + 24 * 3600e3).toISOString(); db.settings.flashTtlV1 = true; save(); }
// Toutes les minutes : si un flash vient d'expirer, les écrans se mettent à jour
let liveFlashIds = liveFlashes().map((f) => f.id).join(',');
setInterval(() => { const ids = liveFlashes().map((f) => f.id).join(','); if (ids !== liveFlashIds) { liveFlashIds = ids; broadcast('flashes', {}); } }, 60e3).unref();

// ---------- Chaque soir à 22 h : les statuts de la journée passent « à reconfirmer » ----------
// Les blocages se refont chaque jour : à 22 h (DAY_RESET_HOUR, « off » pour désactiver), chaque bâtiment repasse
// en « non renseigné » en gardant la dernière info (« Dernière info : bloqué »), jusqu'à ce qu'un·e modo reconfirme le lendemain.
// Fenêtre 22 h → minuit seulement : un redémarrage du site en journée ne remet jamais rien à zéro.
const RESET_HOUR = () => process.env.DAY_RESET_HOUR ?? '22';
function dayReset() {
  const hourCfg = RESET_HOUR();
  const H = Number(hourCfg);
  if (hourCfg === 'off' || !Number.isInteger(H) || H < 0 || H > 23) return;
  const { day, hour } = parisNow();
  const yesterday = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 864e5));
  let target = null;
  if (hour >= H && db.settings.lastDayReset !== day) target = day;
  // le site dormait à l'heure prévue : rattrapage dans la nuit (avant 6 h) pour la veille
  else if (H >= 6 && hour < 6 && db.settings.lastDayReset && db.settings.lastDayReset < yesterday) target = yesterday;
  if (!target) return;
  db.settings.lastDayReset = target;
  let n = 0;
  for (const b of db.buildings) if (b.status !== 'inconnu') { b.yesterday = b.status; b.status = 'inconnu'; b.resetAt = now(); n++; }
  // le titre de chaque site revient en automatique (il suit les bâtiments) ; on garde l'ancien réglage au cas où
  let titles = 0;
  for (const st of Object.values(db.siteStatus || {})) if (st.state && st.state !== 'auto') { st.beforeReset = st.state; st.state = 'auto'; st.updatedAt = now(); titles++; }
  save();
  if (titles && !n) broadcast('blocus', {});
  if (n) { feed(`🌙 Fin de journée : ${n} bâtiment(s) à reconfirmer demain matin par les modos sur place`, 'info'); broadcast('buildings', {}); broadcast('blocus', {}); }
}
// Réparation : la première version (5 h) s'est déclenchée au démarrage en pleine journée et a effacé les statuts du jour.
// On remet ceux qu'aucun·e modo n'a reconfirmés depuis.
if (!db.settings.resetRestoreV1) {
  let n = 0;
  for (const b of db.buildings) if (b.yesterday && b.status === 'inconnu' && b.resetAt) { b.status = b.yesterday; delete b.yesterday; delete b.resetAt; n++; }
  db.settings.resetRestoreV1 = true; delete db.settings.lastMorningReset; save();
  if (n) console.log(`[réparation] ${n} bâtiment(s) remis à leur statut d’avant la remise à zéro`);
}
setInterval(dayReset, 60e3).unref();
setTimeout(dayReset, 10e3).unref();

// Bilan affiché au modo juste après une publication : combien de personnes vont être prévenues, et par où.
function reach(kind, sid, { push = true, delayMs = 0 } = {}) {
  const sids = sid === ALL_SITES ? null : [sid];
  const phones = push && kind ? (db.pushSubs || []).filter((s) => s.kinds?.includes(kind) && (!sids || wantsSite(s, sid))).length : 0;
  const emails = push && kind && mailEnabled() ? db.subscribers.filter((s) => s.confirmed && s.alerts?.includes(kind) && (!sids || wantsSite(s, sid))).length : 0;
  return { phones, emails, emailMode: EMAIL_MODE, telegram: telegramEnabled() ? telegramChats(sid).length : 0, online: clients.size, delaySec: Math.round(delayMs / 1000) };
}

// Publication sur Telegram (chaîne du site, ou toutes pour « tous les sites »)
function tgAnnounce(sid, subject, body, items, url) {
  for (const chat of telegramChats(sid)) postTelegram(`📍 ${tgEsc(siteName(sid))}\n<b>${tgEsc(subject)}</b>${body ? '\n' + tgEsc(String(body).trim()).slice(0, 1500) : ''}${items?.length ? '\n' + items.map((i) => `• ${tgEsc(i.label)}`).join('\n') : ''}`, url, chat);
}
async function notify(kind, { subject, kicker, title, body, items, tone, url = '/', site: sid = DEFAULT_SITE }) {
  if (sid !== DEFAULT_SITE) subject = `${siteName(sid)} · ${subject}`;
  sendPush(kind, { title: subject, body: String(body || '').replace(/\s+/g, ' ').slice(0, 200), url, tag: `${kind}-${sid}` }, (sub) => wantsSite(sub, sid)).catch((e) => console.error('[push]', e.message));
  tgAnnounce(sid, subject, body, items, url);
  if (EMAIL_MODE !== 'instant') return;
  const recipients = db.subscribers.filter((s) => s.confirmed && s.alerts?.includes(kind) && wantsSite(s, sid));
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
  const soonAll = db.events.filter((e) => { const t = new Date(e.start).getTime(); return t > Date.now() - 3600e3 && t < Date.now() + 36 * 3600e3; }).sort((x, y) => x.start.localeCompare(y.start));
  const reportsAll = db.reports.filter((r) => r.status === 'published' && r.publishedAt > since);
  const alertsAll = db.flashes.filter((f) => f.level === 'alerte' && f.at > since);
  const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const messages = [];
  for (const s of db.subscribers.filter((x) => x.confirmed)) {
    const mine = (x) => wantsSite(s, siteOf(x));
    const main = s.sites?.[0] || DEFAULT_SITE;
    const b = db.siteStatus[main] || {};
    const soon = soonAll.filter(mine); const reports = reportsAll.filter(mine); const alerts = alertsAll.filter(mine);
    const blds = db.buildings.filter((x) => (x.status === 'bloque' || x.status === 'partiel') && mine(x));
    const nBlocked = blds.filter((x) => x.status === 'bloque').length;
    const title = nBlocked ? `🔴 ${nBlocked} bâtiment${nBlocked > 1 ? 's' : ''} bloqué${nBlocked > 1 ? 's' : ''} ce matin` : effectiveBlocus(main) === 'actif' ? '🔴 Blocus en cours' : '🟢 Aucun bâtiment signalé bloqué';
    const lines = [];
    if (b.message) lines.push(b.message);
    if (alerts.length) lines.push('', '🚨 Alertes d’hier :', ...alerts.map((f) => `• ${f.text}`));
    if (s.alerts?.includes('events') && soon.length) lines.push('', '📣 À venir :', ...soon.map((e) => `• ${e.type} · ${e.title} · ${fmt(e.start)}${e.place ? ' · ' + e.place : ''}`));
    if (s.alerts?.includes('reports') && reports.length) lines.push('', '📝 Nouveaux comptes rendus :', ...reports.map((r) => `• ${r.titre}`));
    lines.push('', 'Pour être prévenu·e tout de suite dans la journée : notifications de l’app ou chaîne Telegram.');
    const items = s.alerts?.includes('buildings') ? blds.map((x) => ({ label: `${x.name} : ${STATUS_LABEL[x.status]}`, value: siteName(siteOf(x)), tone: tone[x.status] })) : [];
    const { html, text } = renderEmail({ tone: nBlocked || effectiveBlocus(main) === 'actif' ? 'red' : 'green', kicker: `LYON 1 · LA DOUA EN LUTTE · ${BLOCUS_LABEL[effectiveBlocus(main)]}`, title, items, body: lines.join('\n').trim(), token: s.token });
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
  try { pushSubscribe({ ...(req.body || {}), sites: (Array.isArray(req.body?.sites) ? req.body.sites : []).filter((x) => site(x)) }); res.json({ ok: true }); } catch (e) { bad(res, e.message); }
});
app.post('/api/push/unsubscribe', (req, res) => { pushUnsubscribe(String(req.body?.endpoint || '')); res.json({ ok: true }); });

// ---------- Connexion modo ----------
app.post('/api/auth/login', (req, res) => {
  const username = clip(req.body.username, 40).toLowerCase();
  // Seuls les échecs comptent : par identifiant (force brute sur un compte) et, plus large, par réseau (wifi partagé)
  const failKey = `loginfail:${username}`, netKey = `loginnet:${visitor(req)}`;
  const recent = (k, w) => (buckets.get(k) || []).filter((x) => Date.now() - x < w).length;
  if (recent(failKey, 15 * 60e3) >= 8 || recent(netKey, 15 * 60e3) >= 60) return bad(res, 'Trop de tentatives. Réessaie dans 15 minutes.', 429);
  const mod = db.mods.find((m) => m.username === username && !m.disabled);
  if (!mod || !verifyPassword(req.body.password || '', mod)) { limited(failKey, 1e9, 15 * 60e3); limited(netKey, 1e9, 15 * 60e3); return bad(res, 'Identifiants incorrects.', 401); }
  res.setHeader('Set-Cookie', cookieHeader(createToken(mod), 14 * 86400));
  res.json(publicMod(mod));
});
// Compte terrain : connexion par lien / QR code (pas de mot de passe à retenir)
const hashLink = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
app.post('/api/auth/terrain', (req, res) => {
  if (limited(`tlogin:${req.ip}`, 20, 15 * 60e3)) return bad(res, 'Trop de tentatives. Réessaie dans 15 minutes.', 429);
  const t = String(req.body.token || '');
  const m = t.length >= 20 && db.mods.find((x) => x.role === 'terrain' && !x.disabled && x.linkHash && x.linkHash === hashLink(t));
  if (!m) return bad(res, 'Lien invalide ou désactivé. Demande un nouveau lien à l’admin.', 401);
  res.setHeader('Set-Cookie', cookieHeader(createToken(m, 30), 30 * 86400));
  audit(m, 'connexion terrain', '');
  res.json(publicMod(m));
});
app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', cookieHeader('', 0)); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => { const m = currentMod(req); res.json(m ? publicMod(m) : null); });

const mod = express.Router();
mod.use(requireMod);
app.use('/api/mod', mod);
// Alertes modo sur le téléphone (signalements des étudiant·es à vérifier…)
mod.post('/push/subscribe', (req, res) => {
  try { modSubscribe(req.mod.id, req.body.subscription); } catch (e) { return bad(res, e.message); }
  audit(req.mod, 'alertes modo activées', '');
  // les signalements déjà en attente arrivent tout de suite sur ce téléphone
  setTimeout(() => extras?.remindSightings({ mods: [req.mod.id] }).catch(() => {}), 1500);
  res.json({ ok: true, pending: extras ? extras.sightingSummary().filter((x) => canSite(req.mod, x.site) && x.count >= Number(process.env.SIGHTING_THRESHOLD || 3)).length : 0 });
});
mod.post('/push/unsubscribe', (req, res) => { modUnsubscribe(req.mod.id, String(req.body.endpoint || '')); res.json({ ok: true }); });
mod.post('/push/status', (req, res) => res.json({ on: modPushOn(req.mod.id, String(req.body.endpoint || '')) }));

// Audience anonyme (admin)
mod.get('/audience', requireAdmin, (req, res) => res.json(audienceSummary({ pushSubs: db.pushSubs || [], subscribers: db.subscribers || [], sites: db.sites })));

// Telegram : diagnostic (jeton, chaîne, droits du bot) et message de test, pour l'admin
mod.get('/telegram', requireAdmin, async (req, res) => {
  const r = await telegramCheck(db.sites.map((x) => x.telegramChatId).filter(Boolean));
  r.sites = db.sites.map((x) => ({ id: x.id, short: x.short, chat: normalizeChat(x.telegramChatId) || '' }));
  res.json(r);
});
mod.post('/telegram/test', requireAdmin, async (req, res) => {
  if (limited(`tgtest:${req.mod.id}`, 10, 600e3)) return bad(res, 'Trop de tests, attends quelques minutes.', 429);
  const r = await telegramTest(req.body.chat ? String(req.body.chat) : null);
  audit(req.mod, 'test Telegram', `${r.chat || ''} ${r.ok ? 'OK' : r.error}`);
  res.json(r);
});

// Mots interdits ajoutés par les modos (en plus de la liste de base)
mod.get('/chat-banned', (req, res) => res.json({ base: BANNED_BASE.length, extra: db.settings.chatBanned || [] }));
mod.put('/chat-banned', (req, res) => {
  const list = (Array.isArray(req.body.words) ? req.body.words : String(req.body.words || '').split(/[,\n]/)).map((w) => clip(w, 60).toLowerCase()).filter((w) => normalizeWord(w).length >= 2);
  const before = new Set(db.settings.chatBanned || []);
  db.settings.chatBanned = [...new Set(list)].slice(0, 500);
  const after = new Set(db.settings.chatBanned);
  const added = [...after].filter((w) => !before.has(w)), removed = [...before].filter((w) => !after.has(w));
  save(); audit(req.mod, 'liste noire du chat', `${added.length ? '+ ' + added.join(', ') : ''}${removed.length ? ' − ' + removed.join(', ') : ''}`.trim() || 'sans changement');
  res.json({ extra: db.settings.chatBanned });
});
// Guide des modos (PDF) : réservé aux modos connecté·es, document interne
mod.get('/guide.pdf', (req, res) => {
  res.setHeader('Content-Disposition', 'inline; filename="guide-modos-ladoua-en-lutte.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path.join(ROOT, 'docs', 'guide', 'guide-modos.pdf'));
});
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

// Titre de l'accueil d'un site (« Auto » = déduit de ses bâtiments)
mod.put('/blocus', (req, res) => {
  const sid = req.body.site || DEFAULT_SITE;
  if (!needSite(req, res, sid)) return;
  const b = (db.siteStatus[sid] ||= { state: 'auto', message: '', updatedAt: null, by: '' });
  // Un·e autre modo l'a changé depuis que la page est ouverte : on ne l'écrase pas
  if (req.body.from && req.body.from !== b.state && b.by && b.by !== req.mod.org && Date.now() - new Date(b.updatedAt || 0).getTime() < 10 * 60e3) {
    return bad(res, `Le titre de ${siteName(sid)} vient d'être changé par ${b.by}. Vérifie avant de le modifier.`, 409);
  }
  const prev = effectiveBlocus(sid);
  b.state = oneOf(req.body.state, BLOCUS, b.state);
  const eff = effectiveBlocus(sid);
  if (req.body.message !== undefined) b.message = clip(req.body.message, 400);
  b.updatedAt = now();
  b.by = req.mod.org;
  save();
  audit(req.mod, 'titre', `${siteName(sid)} : ${b.state} ${b.message}`, sid);
  feed(`${siteName(sid)} · ${BLOCUS_LABEL[eff]}${b.state === 'auto' ? ' (automatique)' : ''}${b.message ? ' : ' + b.message : ''}`, eff === 'actif' ? 'alert' : eff === 'leve' ? 'ok' : 'warn');
  broadcast('blocus', { site: sid });
  if (prev !== eff && req.body.notify !== false) {
    notify('buildings', { site: sid, tone: eff === 'leve' ? 'green' : 'red', subject: `${eff === 'leve' ? '🟢' : '🔴'} ${BLOCUS_LABEL[eff]}`, kicker: siteName(sid).toUpperCase(), title: BLOCUS_LABEL[eff], body: b.message, url: '/' });
  }
  res.json({ ...b, effective: eff, auto: ['auto', 'inconnu'].includes(b.state) });
});

// Bâtiments
// Notes toutes prêtes pour les comptes piquet (partagés) : pas de texte libre, pas d'info tactique
const TERRAIN_NOTES = ['Toutes les entrées bloquées', 'Entrée principale bloquée', 'Une seule entrée ouverte', 'Accès PMR ouvert', 'Barricade levée', 'Cours annulés', 'Cours maintenus', 'Police présente'];
mod.get('/terrain/buildings', (req, res) => {
  if (req.mod.role !== 'terrain') return bad(res, 'Réservé aux comptes piquet.', 403);
  const buildings = db.buildings
    .filter((b) => canSite(req.mod, siteOf(b)))
    .sort((a, b) => a.campus.localeCompare(b.campus) || a.name.localeCompare(b.name))
    .map(({ terrainProof, ...b }) => b);
  res.json({ buildings, notes: TERRAIN_NOTES, sites: modSites(req.mod).map((id) => ({ id, name: siteName(id) })) });
});

mod.post('/terrain/buildings', (req, res) => {
  if (req.mod.role !== 'terrain') return bad(res, 'Réservé aux comptes piquet.', 403);
  const name = clip(req.body.name, 80);
  if (!name) return bad(res, 'Nom du bâtiment requis.');
  const dev = deviceKey(req, res, true);
  if ((db.settings.blockedDevices || []).includes(dev)) return bad(res, 'Ce téléphone a été bloqué par les modos.', 403);
  if (limited(`terrainadd:${dev}`, 5, 24 * 3600e3)) return bad(res, 'Limite d’ajouts atteinte pour aujourd’hui : demande à un·e modo.', 429);
  const sid = targetSite(req);
  if (!needSite(req, res, sid)) return;
  const normalizeName = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (db.buildings.some((b) => siteOf(b) === sid && normalizeName(b.name) === normalizeName(name))) {
    return bad(res, 'Ce bâtiment existe déjà sur ce site.');
  }
  const b = { id: newId(), name, site: sid, campus: siteName(sid), status: 'inconnu', note: '', updatedAt: null, by: '' };
  db.buildings.push(b);
  save();
  audit(req.mod, 'bâtiment piquet ajouté', `${name} · tél. ${dev.slice(0, 6)}`, sid);
  broadcast('buildings', {});
  res.json(b);
});

mod.post('/buildings', (req, res) => {
  const name = clip(req.body.name, 80);
  const sid = targetSite(req);
  if (!name) return bad(res, 'Nom requis.');
  if (!needSite(req, res, sid)) return;
  const b = { id: newId(), name, site: sid, campus: siteName(sid), status: 'inconnu', note: '', updatedAt: null, by: '' };
  db.buildings.push(b); save(); audit(req.mod, 'bâtiment ajouté', name, sid);
  broadcast('buildings', {});
  res.json(b);
});
mod.put('/buildings/:id', (req, res) => {
  if (req.mod.role === 'terrain') return bad(res, 'Compte piquet : mets à jour un bâtiment avec une photo obligatoire.');
  const b = db.buildings.find((x) => x.id === req.params.id);
  if (!b) return bad(res, 'Introuvable', 404);
  if (!needSite(req, res, siteOf(b))) return;
  if (req.body.from !== undefined && req.body.status !== undefined && req.body.from !== b.status) return bad(res, `${b.name} vient d'être mis à « ${STATUS_LABEL[b.status]} » par ${b.by || 'un·e autre modo'}.`, 409);
  const prev = b.status;
  if (req.body.name !== undefined && req.mod.role !== 'terrain') b.name = clip(req.body.name, 80) || b.name;
  if (req.body.note !== undefined) b.note = clip(req.body.note, 240);
  if (req.body.status !== undefined) { b.status = oneOf(req.body.status, STATUS, b.status); delete b.yesterday; delete b.resetAt; }
  touch(req, b);
  save();
  audit(req.mod, 'bâtiment', `${b.name} → ${b.status}`, siteOf(b));
  if (prev !== b.status) {
    feed(`${b.name} (${b.campus}) → ${STATUS_LABEL[b.status]}${b.note ? ' · ' + b.note : ''}`, b.status === 'bloque' ? 'alert' : b.status === 'partiel' ? 'warn' : b.status === 'ouvert' ? 'ok' : 'info');
    if (b.status !== 'inconnu') queueBuildingAlert(b);
    extras?.onBuilding(b);
  }
  broadcast('buildings', { id: b.id });
  res.json(b);
});

// Mise à jour « piquet » : une photo est obligatoire avant tout changement de statut.
mod.post('/terrain/building/:id/photo', express.raw({ type: 'image/jpeg', limit: '2mb' }), async (req, res) => {
  if (req.mod.role !== 'terrain') return bad(res, 'Réservé aux comptes piquet.', 403);
  if (!Buffer.isBuffer(req.body) || !isJpeg(req.body)) return bad(res, 'Photo invalide.');
  const status = oneOf(req.query.status, ['bloque', 'partiel', 'ouvert'], null);
  if (!status) return bad(res, 'État invalide.');
  const b = db.buildings.find((x) => x.id === req.params.id);
  if (!b) return bad(res, 'Bâtiment introuvable.', 404);
  if (!needSite(req, res, siteOf(b))) return;
  const clean = stripJpeg(req.body);
  if (!clean) return bad(res, 'Photo illisible.');
  // les comptes piquet sont partagés : on limite et on trace par téléphone, pas par compte
  const dev = deviceKey(req, res, true);
  if ((db.settings.blockedDevices || []).includes(dev)) return bad(res, 'Ce téléphone a été bloqué par les modos.', 403);
  if (limited(`terrainph:${dev}`, 1, 5000) || limited(`terrainphh:${dev}`, 60, 3600e3)) return bad(res, 'Attends quelques secondes entre deux mises à jour.', 429);
  const pid = `terrain-${newId()}${newId()}`;
  try { await saveSnap(pid, clean); } catch (e) { return bad(res, 'Enregistrement de la photo impossible.', 500); }
  if (b.terrainProof?.id) deleteSnap(b.terrainProof.id);
  const prev = b.status;
  b.status = status;
  // note : une des notes toutes prêtes, sinon effacée (l'ancienne ne correspond plus à la photo)
  b.note = TERRAIN_NOTES.includes(String(req.query.note || '')) ? String(req.query.note) : '';
  b.terrainProof = { id: pid, at: now(), status, by: req.mod.org, dev };
  delete b.yesterday;
  delete b.resetAt;
  touch(req, b);
  save();
  audit(req.mod, 'bâtiment piquet', `${b.name} → ${STATUS_LABEL[status]} · tél. ${dev.slice(0, 6)}`, siteOf(b));
  if (prev !== status) {
    feed(`${b.name} (${b.campus}) → ${STATUS_LABEL[status]}${b.note ? ' · ' + b.note : ''} · confirmé sur place avec photo`, status === 'bloque' ? 'alert' : status === 'partiel' ? 'warn' : 'ok');
    if (status !== 'inconnu') queueBuildingAlert(b);
    extras?.onBuilding(b);
  }
  broadcast('buildings', { id: b.id });
  res.json({ ...b, terrainProof: undefined });
});

// Photo prise par le compte piquet (24 h) : visible par les modos du site
mod.get('/buildings/:id/proof', async (req, res) => {
  const b = db.buildings.find((x) => x.id === req.params.id);
  if (!b?.terrainProof) return bad(res, 'Pas de photo (ou plus de 24 h).', 404);
  if (!needSite(req, res, siteOf(b))) return;
  const buf = await readSnap(b.terrainProof.id).catch(() => null);
  if (!buf) return bad(res, 'Photo expirée.', 404);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' }).send(buf);
});

mod.post('/buildings/:id/proof/block', (req, res) => {
  const b = db.buildings.find((x) => x.id === req.params.id);
  if (!b?.terrainProof?.dev) return bad(res, 'Pas de photo récente pour ce bâtiment.', 404);
  if (!needSite(req, res, siteOf(b))) return;
  db.settings.blockedDevices = [...new Set([...(db.settings.blockedDevices || []), b.terrainProof.dev])].slice(-500);
  save();
  audit(req.mod, 'téléphone piquet bloqué', `${b.name} · tél. ${b.terrainProof.dev.slice(0, 6)}`, siteOf(b));
  res.json({ ok: true });
});
mod.delete('/blocked-devices', requireAdmin, (req, res) => {
  const n = (db.settings.blockedDevices || []).length;
  db.settings.blockedDevices = []; save();
  audit(req.mod, 'téléphones piquet débloqués', `${n}`);
  res.json({ ok: true, n });
});

// Plusieurs bâtiments d'un coup (sélection multiple, saisie rapide, dictée) : une seule ligne dans le fil, un seul email.
// - « from » = statut que le modo voyait : si un·e autre modo l'a changé entre-temps, ce bâtiment n'est pas écrasé (conflit renvoyé).
// - les bâtiments des sites où le modo n'a pas de droits sont ignorés.
// - undo:true = annulation juste après une erreur : l'alerte email en attente est retirée au lieu d'être renvoyée.
mod.put('/buildings-batch', (req, res) => {
  if (req.mod.role === 'terrain') return bad(res, 'Compte piquet : mets à jour chaque bâtiment avec une photo obligatoire.');
  const changes = Array.isArray(req.body.changes) ? req.body.changes.filter((c) => c && typeof c === 'object' && typeof c.id === 'string').slice(0, 200) : [];
  const undo = !!req.body.undo;
  const previous = [];
  const conflicts = [];
  const forbidden = [];
  const moved = { bloque: [], partiel: [], ouvert: [], inconnu: [] };
  const touchedSites = new Set();
  for (const c of changes) {
    const b = db.buildings.find((x) => x.id === c.id);
    if (!b) continue;
    if (!canSite(req.mod, siteOf(b))) { forbidden.push(b.name); continue; }
    if (c.from !== undefined && c.from !== b.status) { conflicts.push({ id: b.id, name: b.name, status: b.status, by: b.by, at: b.updatedAt }); continue; }
    const status = oneOf(c.status, STATUS, b.status);
    if (status === b.status && c.note === undefined) continue;
    previous.push({ id: b.id, status: b.status, note: b.note, from: status }); // from : pour annuler sans écraser un·e autre modo
    if (c.note !== undefined) b.note = clip(c.note, 240);
    const changed = status !== b.status;
    b.status = status;
    if (!undo) { delete b.yesterday; delete b.resetAt; }
    touch(req, b);
    touchedSites.add(siteOf(b));
    if (!changed) continue;
    moved[status].push(b.name);
    extras?.onBuilding(b);
    if (undo) pendingBuildings.delete(b.id);
    else if (status !== 'inconnu') queueBuildingAlert(b);
  }
  if (!previous.length) return res.json({ previous, changed: 0, conflicts, forbidden });
  save();
  const where = [...touchedSites].map(siteName).join(', ');
  const parts = [['bloque', 'BLOQUÉ'], ['partiel', 'PARTIEL'], ['ouvert', 'OUVERT'], ['inconnu', 'NON RENSEIGNÉ']].filter(([k]) => moved[k].length).map(([k, l]) => `${l} : ${moved[k].join(', ')}`);
  if (parts.length) feed(`${where} · ${undo ? 'Correction · ' : ''}${parts.join(' · ')}`, moved.bloque.length ? 'alert' : moved.partiel.length ? 'warn' : 'ok');
  audit(req.mod, undo ? 'bâtiments (annulation)' : 'bâtiments (lot)', parts.join(' · '), [...touchedSites][0]);
  broadcast('buildings', {});
  const ts = [...touchedSites];
  const sumReach = ts.map((sid) => reach('buildings', sid, { push: !undo, delayMs: ALERT_DELAY_MS }));
  const total = sumReach.reduce((a, r) => ({ ...r, phones: a.phones + r.phones, emails: a.emails + r.emails, telegram: Math.max(a.telegram, r.telegram) }), { phones: 0, emails: 0, telegram: 0 });
  res.json({ previous, changed: previous.length, conflicts, forbidden, reach: undo ? null : total });
});
mod.delete('/buildings/:id', (req, res) => {
  const i = db.buildings.findIndex((x) => x.id === req.params.id);
  if (i < 0) return bad(res, 'Introuvable', 404);
  if (!needSite(req, res, siteOf(db.buildings[i]))) return;
  audit(req.mod, 'bâtiment supprimé', db.buildings[i].name, siteOf(db.buildings[i]));
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
  e.site = targetSite(req);
  if (!needSite(req, res, e.site)) return;
  e.id = newId(); e.org = req.mod.org; e.createdAt = now(); touch(req, e);
  db.events.push(e); save(); audit(req.mod, 'événement', e.title, e.site);
  const when = new Date(e.start).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  feed(`${siteName(e.site)} · Nouveau rendez-vous · ${e.type} · ${e.title} · ${when}${e.place ? ' · ' + e.place : ''}`, 'info');
  broadcast('events', {});
  const evMsg = { site: e.site, tone: 'blue', subject: `📣 ${e.type} : ${e.title} (${when})`, kicker: `LYON 1 · LA DOUA EN LUTTE · ${e.type.toUpperCase()}`, title: e.title, body: `${when}\n${e.place}${e.address ? ' · ' + e.address : ''}\n\n${e.description}`.trim(), url: '/#/agenda' };
  if (req.body.notify) notify('events', evMsg);
  else tgAnnounce(evMsg.site, evMsg.subject, evMsg.body, null, evMsg.url); // Telegram : toujours
  res.json({ ...e, reach: reach(req.body.notify ? 'events' : null, e.site) });
});
mod.put('/events/:id', (req, res) => {
  const i = db.events.findIndex((x) => x.id === req.params.id);
  if (i < 0) return bad(res, 'Introuvable', 404);
  if (!needSite(req, res, siteOf(db.events[i]))) return;
  if (stale(req, res, db.events[i])) return;
  const prevStart = db.events[i].start;
  try { db.events[i] = readEvent(req.body, db.events[i]); } catch (err) { return bad(res, err.message); }
  if (db.events[i].start !== prevStart) delete db.events[i].reminded; // nouvel horaire → nouveau rappel
  // L'admin peut passer un rendez-vous à « tous les sites » (ou le ramener au site choisi)
  if (typeof req.body.allSites === 'boolean' && isAdmin(req.mod)) {
    if (req.body.allSites) db.events[i].site = ALL_SITES;
    else if (db.events[i].site === ALL_SITES) db.events[i].site = site(req.body.site) ? req.body.site : DEFAULT_SITE;
  }
  touch(req, db.events[i]);
  save(); audit(req.mod, 'événement modifié', db.events[i].title, siteOf(db.events[i])); broadcast('events', {});
  res.json(db.events[i]);
});
mod.delete('/events/:id', (req, res) => {
  const i = db.events.findIndex((x) => x.id === req.params.id);
  if (i < 0) return bad(res, 'Introuvable', 404);
  if (!needSite(req, res, siteOf(db.events[i]))) return;
  audit(req.mod, 'événement supprimé', db.events[i].title, siteOf(db.events[i]));
  db.events.splice(i, 1); save(); broadcast('events', {});
  res.json({ ok: true });
});
mod.get('/events/all', (req, res) => res.json(db.events.filter((e) => canSite(req.mod, siteOf(e))).sort((a, b) => b.start.localeCompare(a.start))));

// Flash infos manuels (bandeau)
mod.post('/flashes', (req, res) => {
  const text = clip(req.body.text, 280);
  if (!text) return bad(res, 'Texte requis.');
  // Annonce officielle (admin) : tous les sites, notification à tout le monde + Telegram, signée « Administration du site »
  const official = !!req.body.official;
  if (official && !isAdmin(req.mod)) return bad(res, 'Seul·e l’admin peut faire une annonce officielle.', 403);
  const fsite = official ? ALL_SITES : targetSite(req);
  if (!needSite(req, res, fsite)) return;
  const ttl = flashTtl(req.body.ttl);
  const f = { id: newId(), site: fsite, level: oneOf(req.body.level, ['alerte', 'info', 'ok'], 'info'), text, at: now(), org: official ? 'Administration du site' : req.mod.org, official, expiresAt: ttl ? new Date(Date.now() + ttl * 3600e3).toISOString() : null };
  if (official) {
    db.flashes.unshift(f); db.flashes = db.flashes.slice(0, 100); save();
    audit(req.mod, 'annonce officielle', text, fsite);
    feed(`📢 Administration du site · ${text}`, f.level === 'alerte' ? 'alert' : f.level === 'ok' ? 'ok' : 'info');
    const icon = { alerte: '🚨', info: '📢', ok: '✅' }[f.level];
    for (const chat of telegramChats(ALL_SITES)) postTelegram(`${icon} <b>Administration du site · La Doua en lutte</b>\n${tgEsc(text)}`, '/', chat);
    const pushed = sendPushAll({ title: `${icon} Administration · La Doua en lutte`, body: text, url: '/', tag: `officiel-${f.id}` }).catch((e) => console.error('[push]', e.message));
    broadcast('flashes', {});
    return res.json({ ...f, reach: { phones: (db.pushSubs || []).length, emails: 0, telegram: telegramEnabled() ? telegramChats(ALL_SITES).length : 0, online: clients.size, delaySec: 0 } });
  }
  db.flashes.unshift(f); db.flashes = db.flashes.slice(0, 100); save();
  audit(req.mod, 'flash', text, fsite);
  feed(`${siteName(fsite)} · ${text}`, f.level === 'alerte' ? 'alert' : f.level === 'ok' ? 'ok' : 'info');
  if (req.body.push !== false) for (const chat of telegramChats(fsite)) postTelegram(`${{ alerte: '🚨 <b>ALERTE', info: 'ℹ️ <b>Info', ok: '✅ <b>Bonne nouvelle' }[f.level]} · ${tgEsc(siteName(fsite))}</b>\n${tgEsc(text)}`, '/', chat);
  if (f.level === 'alerte' && req.body.push !== false) sendPush('urgent', { title: `🚨 Alerte · ${siteName(fsite)}`, body: text, url: '/', tag: `flash-${f.id}` }, (sub) => wantsSite(sub, fsite)).catch((e) => console.error('[push]', e.message));
  broadcast('flashes', {});
  res.json({ ...f, reach: { ...reach(f.level === 'alerte' && req.body.push !== false ? 'urgent' : null, fsite), telegram: req.body.push !== false ? telegramChats(fsite).length * (telegramEnabled() ? 1 : 0) : 0 } });
});
// Historique complet pour les modos (y compris les flash expirés)
mod.get('/flashes', (req, res) => res.json(db.flashes.filter((f) => canSite(req.mod, siteOf(f)) || siteOf(f) === ALL_SITES)));
// Changer la durée d'un flash (le remettre en ligne, le prolonger, le rendre permanent)
mod.put('/flashes/:id', (req, res) => {
  const f = db.flashes.find((x) => x.id === req.params.id);
  if (!f) return bad(res, 'Introuvable', 404);
  if (!needSite(req, res, siteOf(f))) return;
  const ttl = flashTtl(req.body.ttl);
  f.expiresAt = ttl ? new Date(Date.now() + ttl * 3600e3).toISOString() : null;
  save(); audit(req.mod, 'flash : durée', `${f.text.slice(0, 60)} → ${ttl ? ttl + ' h' : 'sans limite'}`, siteOf(f)); broadcast('flashes', {});
  res.json(f);
});
mod.delete('/flashes/:id', (req, res) => {
  const f = db.flashes.find((x) => x.id === req.params.id);
  if (f && !needSite(req, res, siteOf(f))) return;
  db.flashes = db.flashes.filter((f) => f.id !== req.params.id); save(); broadcast('flashes', {});
  res.json({ ok: true });
});

// Revendications
mod.post('/demands', (req, res) => {
  const title = clip(req.body.title, 160);
  if (!title) return bad(res, 'Titre requis.');
  const dsite = targetSite(req);
  if (!needSite(req, res, dsite)) return;
  const d = { id: newId(), site: dsite, updatedAt: now(), by: req.mod.org, order: Math.max(0, ...db.demands.map((x) => x.order || 0)) + 1, title, text: clip(req.body.text, 2000), category: clip(req.body.category, 60) || 'Général', status: oneOf(req.body.status, ['en-lutte', 'obtenu', 'refuse'], 'en-lutte'), createdAt: now(), org: req.mod.org };
  db.demands.push(d); save(); audit(req.mod, 'revendication', title, dsite);
  broadcast('demands', {});
  res.json(publicDemand(d));
});
// Texte « Le contexte » affiché en haut des revendications
mod.put('/context', (req, res) => {
  const csite = req.body.site || DEFAULT_SITE;
  if (!needSite(req, res, csite)) return;
  db.contexts[csite] = { title: clip(req.body.title, 80) || 'Le contexte', text: clip(req.body.text, 6000), call: clip(req.body.call, 300), closing: clip(req.body.closing, 3000), source: clip(req.body.source, 600) };
  save(); audit(req.mod, 'contexte modifié', siteName(csite), csite); broadcast('demands', {});
  res.json(db.contexts[csite]);
});
mod.put('/demands/:id', (req, res) => {
  const d = db.demands.find((x) => x.id === req.params.id);
  if (!d) return bad(res, 'Introuvable', 404);
  if (!needSite(req, res, siteOf(d))) return;
  if (stale(req, res, d)) return;
  touch(req, d);
  if (req.body.title !== undefined) d.title = clip(req.body.title, 160) || d.title;
  if (req.body.text !== undefined) d.text = clip(req.body.text, 2000);
  if (req.body.category !== undefined) d.category = clip(req.body.category, 60) || 'Général';
  if (req.body.status !== undefined) {
    const prev = d.status;
    d.status = oneOf(req.body.status, ['en-lutte', 'obtenu', 'refuse'], d.status);
    if (prev !== d.status) d.obtainedAt = d.status === 'obtenu' ? now() : null;
    if (prev !== d.status && d.status === 'obtenu') feed(`Revendication obtenue : ${d.title}`, 'ok');
  }
  save(); audit(req.mod, 'revendication modifiée', d.title, siteOf(d)); broadcast('demands', {});
  res.json(publicDemand(d));
});
mod.delete('/demands/:id', (req, res) => {
  const dd = db.demands.find((x) => x.id === req.params.id);
  if (dd && !needSite(req, res, siteOf(dd))) return;
  db.demands = db.demands.filter((d) => d.id !== req.params.id); delete db.supports[req.params.id];
  save(); broadcast('demands', {}); res.json({ ok: true });
});

// Contacts : « à qui parler »
mod.post('/contacts', (req, res) => {
  const name = clip(req.body.name, 100);
  if (!name) return bad(res, 'Nom requis.');
  const csite = targetSite(req);
  if (!needSite(req, res, csite)) return;
  const c = { id: newId(), site: csite, org: req.mod.org, name, role: clip(req.body.role, 160), how: clip(req.body.how, 300), link: /^(https?:\/\/|mailto:|tel:)/i.test(req.body.link || '') ? clip(req.body.link, 300) : '' };
  db.contacts.push(c); save(); audit(req.mod, 'contact', name); broadcast('contacts', {});
  res.json(c);
});
mod.delete('/contacts/:id', (req, res) => {
  const cc = db.contacts.find((x) => x.id === req.params.id);
  if (cc && !needSite(req, res, siteOf(cc))) return;
  db.contacts = db.contacts.filter((c) => c.id !== req.params.id); save(); broadcast('contacts', {});
  res.json({ ok: true });
});

// Chat : modération
mod.get('/chat/reported', (req, res) => res.json(db.messages.filter((m) => m.reports.length || m.hidden).slice(-100).reverse().map((m) => ({ ...publicMsg(m), hidden: !!m.hidden, reports: m.reports.length }))));
mod.delete('/chat/:id', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  m.hidden = true;
  if (m.photo && !m.photo.gone && req.query.photo === 'delete') { deleteSnap(m.photo.id); m.photo.gone = true; m.photo.thumb = ''; }
  save(); audit(req.mod, m.photo ? 'photo du chat retirée' : 'message masqué', m.text.slice(0, 80) || '📸 photo');
  broadcast('chat-del', { id: m.id });
  res.json({ ok: true });
});
mod.post('/chat/:id/restore', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  m.hidden = false; m.reports = []; save(); broadcast('chat', publicMsg(m));
  audit(req.mod, 'message rétabli', (m.text || '📸 photo').slice(0, 80));
  res.json({ ok: true });
});

// Comptes rendus : PDF → IA → flash infos. Réponse en flux NDJSON pour voir l'IA travailler en direct.
mod.get('/reports', (req, res) => res.json(db.reports.filter((r) => canSite(req.mod, siteOf(r))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
mod.post('/reports/analyze', express.raw({ type: 'application/pdf', limit: '25mb' }), async (req, res) => {
  const pdf = req.body;
  if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== '%PDF-') return bad(res, 'Envoie un fichier PDF.');
  const rsite = targetSite(req);
  if (!needSite(req, res, rsite)) return;
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
  const r = { id: newId(), site: rsite, updatedAt: now(), status: 'draft', source, fileName, createdAt: now(), by: req.mod.username, org: req.mod.org, ...sanitizeReport(data) };
  db.reports.push(r); save();
  audit(req.mod, 'compte rendu analysé', r.titre, rsite);
  send({ t: 'done', report: r });
  res.end();
});
function sanitizeReport(d = {}) {
  const arr = (a, n) => (Array.isArray(a) ? a.filter((y) => y && typeof y === 'object').slice(0, n) : []);
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
  if (!needSite(req, res, siteOf(r))) return;
  if (stale(req, res, r)) return;
  Object.assign(r, sanitizeReport({ ...r, ...req.body }));
  touch(req, r);
  const publishing = req.body.publish && r.status !== 'published';
  if (publishing) { r.status = 'published'; r.publishedAt = now(); }
  if (req.body.unpublish) r.status = 'draft';
  save();
  audit(req.mod, publishing ? 'compte rendu publié' : 'compte rendu modifié', r.titre, siteOf(r));
  if (publishing) {
    feed(`${siteName(siteOf(r))} · Compte rendu publié : ${r.titre}${r.flashs[0] ? ' · ' + r.flashs[0].titre : ''}`, 'info');
    // Import optionnel dans l'agenda et les revendications.
    if (req.body.importEvents) {
      r.skippedEvents = [];
      for (const e of r.rdv) {
        const start = parisDate(e.date, e.heure);
        if (!start) { r.skippedEvents.push(e.titre || e.date || '?'); continue; }
        db.events.push({ id: newId(), site: siteOf(r), type: e.type, title: e.titre, start: start.toISOString(), place: e.lieu, address: '', description: `Annoncé dans : ${r.titre}`, org: req.mod.org, createdAt: now() });
      }
      broadcast('events', {});
    }
    if (req.body.importDemands) {
      for (const t of r.revendications) if (!db.demands.some((d) => d.title.toLowerCase() === t.toLowerCase())) db.demands.push({ id: newId(), site: siteOf(r), title: clip(t, 160), text: '', category: 'Votée en AG', status: 'en-lutte', createdAt: now(), org: req.mod.org });
      broadcast('demands', {});
    }
    save();
    const crMsg = { site: siteOf(r), tone: 'blue', subject: `📝 Compte rendu : ${r.titre}`, kicker: 'LYON 1 · LA DOUA EN LUTTE · COMPTE RENDU', title: r.titre, body: r.resume, items: r.flashs.slice(0, 6).map((f) => ({ label: f.titre, value: '', tone: f.type === 'alerte' ? 'red' : undefined })), url: `/#/cr/${r.id}` };
    if (req.body.notify) notify('reports', crMsg);
    else tgAnnounce(crMsg.site, crMsg.subject, crMsg.body, crMsg.items, crMsg.url); // Telegram : toujours
  }
  broadcast('reports', {});
  res.json(r);
});
mod.delete('/reports/:id', (req, res) => {
  const rr = db.reports.find((x) => x.id === req.params.id);
  if (rr && !needSite(req, res, siteOf(rr))) return;
  db.reports = db.reports.filter((r) => r.id !== req.params.id); save(); broadcast('reports', {});
  res.json({ ok: true });
});

// Canal Instagram officiel : lecture périodique, extraction IA, publication automatique.
mod.get('/instagram', requireAdmin, (req, res) => res.json({
 enabled: instagramEnabled(),
 url: db.settings.instagram?.url || process.env.INSTAGRAM_CHANNEL_URL || 'https://www.instagram.com/channel/UFc6KiIvKuUCSwgk/',
 accountUrl: db.settings.instagram?.accountUrl || process.env.INSTAGRAM_ACCOUNT_URL || 'https://www.instagram.com/lyon1_ladoua.enlutte/',
 interval: instagramInterval(),
 site: db.settings.instagram?.site || DEFAULT_SITE,
 status: db.settings.instagram || {},
}));
mod.put('/instagram', requireAdmin, (req, res) => {
 db.settings.instagram ||= {};
  if (req.body.url !== undefined) {
    const u = String(req.body.url).trim().slice(0, 500);
    if (!/^https:\/\/(www\.)?instagram\.com\//i.test(u)) return bad(res, 'Lien Instagram attendu (https://www.instagram.com/…).');
    db.settings.instagram.url = u;
  }
 if (req.body.accountUrl !== undefined) {
   const u = String(req.body.accountUrl).trim().slice(0, 500);
   if (u && !/^https:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/i.test(u)) return bad(res, 'Lien de compte Instagram attendu (https://www.instagram.com/nom_du_compte/).');
   db.settings.instagram.accountUrl = u;
 }
 if (req.body.site !== undefined && site(req.body.site)) db.settings.instagram.site = req.body.site;
 if (req.body.enabled !== undefined) db.settings.instagram.enabled = !!req.body.enabled;
 if (req.body.interval !== undefined) db.settings.instagram.interval = Math.min(1440, Math.max(5, Number(req.body.interval) || 15));
 save();
 res.json({ ok: true, enabled: db.settings.instagram.enabled, site: db.settings.instagram.site });
});
// Contenu lu par l'IA sur Instagram : publié sur le site, mais SANS notification à tout le monde ni Telegram
// (une erreur de lecture ne doit pas partir sur 150 téléphones). Les modos relaient s'ils le jugent utile.
const instagramCtx = () => ({ broadcast, feed, audit, queueBuildingAlert, onBuilding: (b) => extras?.onBuilding(b) });
mod.post('/instagram/sync', requireAdmin, async (req, res) => {
 let channel = null, stories = null;
 try { channel = await syncInstagram(instagramCtx()); } catch (e) {
   db.settings.instagram ||= {}; db.settings.instagram.lastError = e.message; db.settings.instagram.lastErrorAt = now(); save();
   channel = { error: e.message, applied: {} };
 }
 if (process.env.INSTAGRAM_STORIES_COOKIES || process.env.INSTAGRAM_CHANNEL_COOKIES) {
   try { stories = await syncInstagramStories(instagramCtx()); } catch (e) { stories = { error: e.message, applied: {}, storyCount: 0 }; }
 }
 if (channel.error && (!stories || stories.error)) return bad(res, [channel.error, stories?.error].filter(Boolean).join(' · '), 502);
 audit(req.mod, 'Instagram synchronisé', `${channel.source || 'canal : erreur'}${stories ? ` · ${stories.storyCount} stories` : ''}`, db.settings.instagram?.site || DEFAULT_SITE);
 res.json({ channel, stories });
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
// Journal : l'admin voit tout ; un modo voit ses actions et celles de ses sites
mod.get('/audit', (req, res) => res.json(db.audit.filter((a) => isAdmin(req.mod) || a.by === req.mod.username || (a.site && canSite(req.mod, a.site))).slice(0, 200).map((a) => ({ ...a, siteName: a.site ? siteName(a.site) : '' }))));
// Autres modos actifs dans les 3 dernières minutes sur au moins un site en commun
mod.get('/presence', (req, res) => {
  const mine = new Set(modSites(req.mod));
  const list = [];
  for (const [id, at] of presence) {
    if (id === req.mod.id || Date.now() - at > 3 * 60e3) continue;
    const m = db.mods.find((x) => x.id === id);
    if (!m) continue;
    const shared = modSites(m).filter((x) => mine.has(x));
    if (shared.length) list.push({ org: m.org, username: m.username, sites: shared.map(siteName), ago: Math.round((Date.now() - at) / 1000) });
  }
  res.json(list);
});

// Admin : comptes modos (un compte par organisation / personne)
// L'admin voit qui a activé les alertes modo sur son téléphone (nombre d'appareils, dernière activation)
mod.get('/mods', requireAdmin, (req, res) => res.json(db.mods.map((m) => {
  const subs = (db.modPushSubs || []).filter((x) => x.modId === m.id);
  return { ...publicMod(m), modPush: subs.length, modPushAt: subs.map((x) => x.at || x.createdAt).sort().at(-1) || null };
})));
mod.post('/mods', requireAdmin, (req, res) => {
  const username = clip(req.body.username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return bad(res, 'Identifiant : 3 à 40 caractères (lettres minuscules, chiffres, . _ -).');
  if (db.mods.some((m) => m.username === username)) return bad(res, 'Identifiant déjà pris.');
  const password = crypto.randomBytes(9).toString('base64url');
  const role = ['admin', 'terrain'].includes(req.body.role) ? req.body.role : 'mod';
  const msites = (Array.isArray(req.body.sites) ? req.body.sites : []).filter((x) => site(x));
  if (role !== 'admin' && !msites.length) return bad(res, 'Choisis au moins un site pour ce compte.');
  const m = { id: newId(), username, org: clip(req.body.org, 80) || 'Syndicat', role, sites: role === 'admin' ? [] : msites, ...hashPassword(password), createdAt: now(), version: 1 };
  let link;
  if (role === 'terrain') { const t = crypto.randomBytes(24).toString('base64url'); m.linkHash = hashLink(t); link = `${SITE_URL()}/#/terrain/${t}`; }
  db.mods.push(m); save(); audit(req.mod, role === 'terrain' ? 'compte terrain créé' : 'compte modo créé', `${username} (${m.org})`);
  res.json({ ...publicMod(m), ...(role === 'terrain' ? { link } : { password }) });
});
// Modifier un compte : nom affiché (AG, syndicat…), sites, rôle
mod.put('/mods/:id', requireAdmin, (req, res) => {
  const m = db.mods.find((x) => x.id === req.params.id);
  if (!m) return bad(res, 'Introuvable', 404);
  if (req.body.org !== undefined) m.org = clip(req.body.org, 80) || m.org;
  if (Array.isArray(req.body.sites)) {
    const msites = req.body.sites.filter((x) => site(x));
    if (m.role !== 'admin' && !msites.length) return bad(res, 'Choisis au moins un site pour ce compte.');
    m.sites = msites;
  }
  if (req.body.role && m.id !== req.mod.id && m.role !== 'terrain') m.role = req.body.role === 'admin' ? 'admin' : 'mod';
  save(); audit(req.mod, 'compte modifié', `${m.username} : ${m.role === 'admin' ? 'admin' : (m.sites || []).map(siteName).join(', ')}`);
  res.json(publicMod(m));
});
// Nouveau lien de connexion pour un compte terrain (l'ancien lien et les sessions ouvertes ne marchent plus)
mod.post('/mods/:id/link', requireAdmin, (req, res) => {
  const m = db.mods.find((x) => x.id === req.params.id && x.role === 'terrain');
  if (!m) return bad(res, 'Compte piquet introuvable.', 404);
  const t = crypto.randomBytes(24).toString('base64url');
  m.linkHash = hashLink(t); m.version = (m.version || 1) + 1; m.disabled = false; save();
  audit(req.mod, 'nouveau lien terrain', m.username);
  res.json({ ...publicMod(m), link: `${SITE_URL()}/#/terrain/${t}` });
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

// Sites : liste gérée par l'admin
mod.post('/sites', requireAdmin, (req, res) => {
  const name = clip(req.body.name, 80);
  const short = clip(req.body.short, 30) || name;
  if (!name) return bad(res, 'Nom requis.');
  let id = short.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || newId();
  if (site(id) || id === ALL_SITES) id = `${id}-${newId().slice(0, 4)}`;
  db.sites.push({ id, name, short });
  db.siteStatus[id] = { state: 'auto', message: '', updatedAt: null, by: '' };
  save(); audit(req.mod, 'site créé', name, id); broadcast('buildings', {});
  res.json(site(id));
});
mod.put('/sites/:id', requireAdmin, (req, res) => {
  const x = site(req.params.id);
  if (!x) return bad(res, 'Introuvable', 404);
  if (req.body.name !== undefined) x.name = clip(req.body.name, 80) || x.name;
  if (req.body.short !== undefined) x.short = clip(req.body.short, 30) || x.short;
  if (req.body.telegramChatId !== undefined) x.telegramChatId = normalizeChat(clip(req.body.telegramChatId, 80));
  for (const b of db.buildings) if (siteOf(b) === x.id) b.campus = x.short;
  save(); audit(req.mod, 'site modifié', x.name, x.id); broadcast('buildings', {});
  res.json(x);
});
mod.delete('/sites/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  if (id === DEFAULT_SITE) return bad(res, 'Le site principal ne peut pas être supprimé.');
  const used = ['buildings', 'events', 'demands', 'polls', 'reports', 'posts', 'flashes', 'contacts', 'testimonies', 'entraide'].some((k) => (db[k] || []).some((x) => siteOf(x) === id));
  if (used) return bad(res, 'Ce site a encore du contenu : supprime-le ou déplace-le d’abord.');
  db.sites = db.sites.filter((x) => x.id !== id);
  for (const m of db.mods) if (m.sites) m.sites = m.sites.filter((x) => x !== id);
  save(); audit(req.mod, 'site supprimé', id); broadcast('buildings', {});
  res.json({ ok: true });
});

// ---------- Votes, blog, témoignages ----------
const community = registerCommunity(app, mod, { broadcast, feed, audit, visitor, limited, clip, bad, oneOf, needSite, targetSite, stale, touch });
// Signalements, « J'y vais », frise, page droits, entraide
extras = registerExtras(app, mod, { broadcast, feed, audit, visitor, limited, clip, bad, oneOf, needSite, sendPush, postTelegram, tgEsc, sendModPush, deviceKey });

// ---------- Site ----------
// Le service worker doit toujours être relu, sinon les mises à jour de l'app n'arriveraient pas.
app.get('/sw.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.sendFile(path.join(ROOT, 'public', 'sw.js')); });
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '5m', index: 'index.html' }));
app.use('/api', (req, res) => bad(res, 'Route inconnue', 404));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Envoi trop volumineux.' });
  console.error('[erreur]', req.method, req.path, err?.message || err);
  if (!res.headersSent) res.status(err?.status && err.status < 500 ? err.status : 500).json({ error: err?.status && err.status < 500 ? 'Requête refusée.' : 'Erreur du serveur, réessaie.' });
});
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

startInstagramSync(instagramCtx());

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
