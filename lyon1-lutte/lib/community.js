// Votes anonymes, blog/tribunes et témoignages de violences (avec photos/vidéos).
// Principes de protection :
//  - votes : 1 par appareil (cookie aléatoire). On ne stocke qu'un hash propre à chaque vote → impossible de relier deux votes.
//  - témoignages : jamais publiés sans validation d'un·e modo ; métadonnées des fichiers supprimées (GPS, appareil, date) ;
//    aucune IP ni identifiant stocké ; le contact facultatif n'est visible que par les modos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { db, save, newId, now, DATA_DIR } from './store.js';
import { SECRET, parseCookies } from './auth.js';
import { Readable } from 'node:stream';
import { remoteEnabled, putFile, fetchObject, removeObjects } from './remote.js';
import { postTelegram, tgEsc } from './telegram.js';
import { DEFAULT_SITE, site, siteName, siteOf, canSite } from './sites.js';

const UPLOADS = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
// ffmpeg : celui du système (image Docker) s'il existe, sinon la version installée par npm (hébergement « Node » sans Docker).
const works = (bin) => !!bin && spawnSync(bin, ['-version']).status === 0;
let staticFfmpeg = null;
try { staticFfmpeg = (await import('ffmpeg-static')).default; } catch {}
const FFMPEG = [process.env.FFMPEG_PATH, 'ffmpeg', staticFfmpeg].find(works) || 'ffmpeg';
const HAS_FFMPEG = works(FFMPEG);
const MAX_IMAGE = 15 * 1024 * 1024;
// Supabase gratuit limite chaque fichier à 50 Mo : on reste en dessous quand il est utilisé.
export const MAX_VIDEO_MB = Number(process.env.MAX_VIDEO_MB || (remoteEnabled() ? 45 : 150));
const MAX_VIDEO = MAX_VIDEO_MB * 1024 * 1024;

for (const k of ['polls', 'posts', 'testimonies', 'media']) db[k] ||= [];

// ---------- Fichiers : type réel détecté par les premiers octets ----------
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (buf.subarray(4, 8).toString() === 'ftyp') {
    const brand = buf.subarray(8, 12).toString();
    return brand.startsWith('qt') ? { mime: 'video/quicktime', ext: 'mov', kind: 'video' } : { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  return null;
}

// Suppression des métadonnées sans outil externe (secours si ffmpeg absent).
function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return buf; // structure inattendue : on rend tel quel
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // début de l'image : on garde tout le reste
    const len = buf.readUInt16BE(i + 2);
    const isAppN = marker >= 0xe1 && marker <= 0xef; // EXIF, XMP, IPTC…
    if (!isAppN && marker !== 0xfe) out.push(buf.subarray(i, i + 2 + len)); // 0xFE = commentaire
    i += 2 + len;
  }
  return Buffer.concat(out);
}
function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  const drop = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString();
    if (!drop.has(type)) out.push(buf.subarray(i, i + 12 + len));
    i += 12 + len;
  }
  return Buffer.concat(out);
}
function runFfmpeg(args) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args]);
    p.on('close', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}
// Nettoie un fichier : renvoie true si les métadonnées ont été retirées.
async function cleanMedia(m) {
  const file = path.join(UPLOADS, m.file);
  try {
    if (m.kind === 'image') {
      const buf = fs.readFileSync(file);
      fs.writeFileSync(file, m.mime === 'image/png' ? stripPng(buf) : stripJpeg(buf));
      return true;
    }
    if (!HAS_FFMPEG) return false;
    const ext = m.ext === 'webm' ? 'webm' : 'mp4';
    const out = path.join(UPLOADS, `${m.id}.clean.${ext}`);
    const ok = await runFfmpeg(['-y', '-i', file, '-map', '0:v?', '-map', '0:a?', '-map_metadata', '-1', '-map_chapters', '-1', '-c', 'copy', ...(ext === 'mp4' ? ['-movflags', '+faststart'] : []), out]);
    if (!ok) { fs.rmSync(out, { force: true }); return false; }
    fs.rmSync(file, { force: true });
    m.file = path.basename(out); m.ext = ext; m.mime = ext === 'webm' ? 'video/webm' : 'video/mp4';
    return true;
  } catch (e) {
    console.error('[media] nettoyage', e.message);
    return false;
  }
}
// Fichiers téléversés mais jamais rattachés : supprimés après 2 h.
setInterval(() => {
  const limit = Date.now() - 2 * 3600e3;
  const keep = [];
  for (const m of db.media) {
    if (m.status === 'tmp' && new Date(m.createdAt).getTime() < limit) fs.rmSync(path.join(UPLOADS, m.file), { force: true });
    else keep.push(m);
  }
  if (keep.length !== db.media.length) { db.media = keep; save(); }
}, 15 * 60e3).unref();

function deleteMedia(ids) {
  const remote = [];
  for (const id of ids || []) {
    const m = db.media.find((x) => x.id === id);
    if (!m) continue;
    fs.rmSync(path.join(UPLOADS, m.file), { force: true });
    if (m.remote) remote.push(`media/${m.remote}`);
  }
  db.media = db.media.filter((m) => !(ids || []).includes(m.id));
  if (remote.length) removeObjects(remote).catch((e) => console.error('[media] suppression Supabase', e.message));
}

// Nettoie le fichier (métadonnées), puis le met à l'abri dans Supabase si configuré
// (sur un hébergement gratuit, le disque local s'efface au redémarrage).
async function persistMedia(m) {
  m.cleaned = await cleanMedia(m);
  if (remoteEnabled()) {
    try {
      await putFile(`media/${m.file}`, path.join(UPLOADS, m.file), m.mime);
      m.remote = m.file;
    } catch (e) { console.error('[media] envoi Supabase', e.message); }
  }
  save();
}

// ---------- Mise en forme légère du blog : paragraphes, **gras**, liens ----------
export function renderRich(text) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = (x) => x.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
  // Ligne par ligne : « ## » titre, « - » puce, « > » encadré, le reste en paragraphes.
  const out = [];
  let cur = null; // { kind: 'p' | 'ul' | 'note', lines: [] }
  const close = () => {
    if (!cur) return;
    if (cur.kind === 'ul') out.push(`<ul>${cur.lines.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
    else if (cur.kind === 'note') out.push(`<div class="note">${inline(cur.lines.join('<br>'))}</div>`);
    else out.push(`<p>${inline(cur.lines.join('<br>'))}</p>`);
    cur = null;
  };
  for (const raw of String(text || '').split('\n')) {
    const l = esc(raw.trim());
    if (!l) { close(); continue; }
    if (/^## /.test(l)) { close(); out.push(`<h3>${l.slice(3)}</h3>`); continue; }
    const kind = /^- /.test(l) ? 'ul' : /^&gt; ?/.test(l) ? 'note' : 'p';
    if (cur?.kind !== kind) { close(); cur = { kind, lines: [] }; }
    cur.lines.push(kind === 'ul' ? l.slice(2) : kind === 'note' ? l.replace(/^&gt; ?/, '') : l);
  }
  close();
  return out.join('');
}

export function registerCommunity(app, mod, ctx) {
  const { broadcast, feed, audit, visitor, limited, clip, bad, oneOf, needSite, targetSite, stale, touch } = ctx;
  const visible = (req, x) => canSite(req.mod, siteOf(x));
  const pubSite = (v) => (site(v) ? v : DEFAULT_SITE);

  // ================= Téléversement (public) =================
  // Le fichier arrive brut (pas de formulaire multipart) et est écrit directement sur disque.
  app.post('/api/uploads', async (req, res) => {
    const v = visitor(req);
    if (limited(`up:${v}`, 12, 3600e3)) return bad(res, 'Trop de fichiers envoyés, réessaie dans une heure.', 429);
    const declared = String(req.headers['content-type'] || '');
    if (!/^(image\/(jpeg|png)|video\/(mp4|quicktime|webm))$/.test(declared)) return bad(res, 'Formats acceptés : photo JPEG/PNG, vidéo MP4/MOV/WEBM.', 415);
    const max = declared.startsWith('video') ? MAX_VIDEO : MAX_IMAGE;
    if (Number(req.headers['content-length'] || 0) > max) return bad(res, `Fichier trop lourd (max ${Math.round(max / 1048576)} Mo).`, 413);
    const id = newId();
    const tmp = path.join(UPLOADS, `${id}.part`);
    const out = fs.createWriteStream(tmp);
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max && !aborted) { aborted = true; req.unpipe(out); out.destroy(); fs.rmSync(tmp, { force: true }); bad(res, 'Fichier trop lourd.', 413); req.destroy(); }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (aborted) return;
      const fd = fs.openSync(tmp, 'r');
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      fs.closeSync(fd);
      const type = sniff(head);
      if (!type || size < 100) { fs.rmSync(tmp, { force: true }); return bad(res, 'Fichier non reconnu.'); }
      const file = `${id}.${type.ext}`;
      fs.renameSync(tmp, path.join(UPLOADS, file));
      db.media.push({ id, file, size, ...type, status: 'tmp', cleaned: false, public: false, createdAt: now() });
      save();
      res.json({ id, kind: type.kind, size });
    });
    out.on('error', () => { if (!aborted) bad(res, 'Erreur d’écriture.', 500); });
  });

  const sendMedia = async (req, res, m) => {
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.type(m.mime);
    const local = path.join(UPLOADS, m.file);
    if (fs.existsSync(local)) return res.sendFile(local);
    if (!m.remote) return res.status(404).end();
    // Fichier plus sur le disque (redémarrage) : relu depuis Supabase, lecture vidéo par morceaux comprise.
    try {
      const r = await fetchObject(`media/${m.remote}`, req.headers.range);
      if (!r.ok && r.status !== 206) return res.status(r.status === 404 ? 404 : 502).end();
      res.status(r.status);
      for (const h of ['content-length', 'content-range', 'accept-ranges']) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
      Readable.fromWeb(r.body).pipe(res);
    } catch (e) {
      console.error('[media] lecture Supabase', e.message);
      res.status(502).end();
    }
  };
  app.get('/media/:id', (req, res) => {
    const m = db.media.find((x) => x.id === req.params.id && x.public);
    if (!m) return res.status(404).end();
    sendMedia(req, res, m);
  });
  // à qui appartient un média (témoignage ou article) : le modo doit avoir les droits sur ce site
  const mediaSite = (id) => {
    const t = db.testimonies.find((x) => (x.media || []).includes(id));
    if (t) return siteOf(t);
    const p = db.posts.find((x) => x.cover === id || (x.media || []).includes(id));
    return p ? siteOf(p) : null;
  };
  mod.get('/media/:id', (req, res) => {
    const m = db.media.find((x) => x.id === req.params.id);
    if (!m) return res.status(404).end();
    const sid = mediaSite(m.id);
    if (sid ? !canSite(req.mod, sid) : req.mod.role !== 'admin') return res.status(403).end();
    sendMedia(req, res, m);
  });
  const mediaInfo = (ids, forMod = false) => (ids || []).map((id) => db.media.find((m) => m.id === id)).filter((m) => m && (forMod || m.public)).map((m) => ({ id: m.id, kind: m.kind, size: m.size, cleaned: m.cleaned, public: m.public, url: forMod ? `/api/mod/media/${m.id}` : `/media/${m.id}` }));

  // ================= Votes anonymes =================
  const DEVICE = 'l1_dev';
  function deviceId(req, res) {
    let d = parseCookies(req.headers.cookie)[DEVICE];
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(d || '')) {
      d = crypto.randomBytes(24).toString('base64url');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${DEVICE}=${d}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${secure}`);
    }
    return d;
  }
  const ballot = (pollId, dev) => crypto.createHmac('sha256', SECRET).update(`vote|${pollId}|${dev}`).digest('base64url').slice(0, 22);
  const isOpen = (p) => !p.closed && new Date(p.closesAt).getTime() > Date.now() && new Date(p.opensAt || 0).getTime() <= Date.now();
  function publicPoll(p, dev) {
    const mine = dev ? p.ballots[ballot(p.id, dev)] : undefined;
    const open = isOpen(p);
    const showResults = !open || p.results === 'live' || mine !== undefined;
    const counts = p.options.map((_, i) => Object.values(p.ballots).filter((b) => b === i).length);
    return {
      id: p.id, site: siteOf(p), ag: p.ag || '', question: p.question, description: p.description, options: p.options,
      opensAt: p.opensAt, closesAt: p.closesAt, open, org: p.org, createdAt: p.createdAt, results: p.results,
      total: Object.keys(p.ballots).length,
      counts: showResults ? counts : null,
      myVote: mine ?? null,
    };
  }
  app.get('/api/polls', (req, res) => {
    const dev = parseCookies(req.headers.cookie)[DEVICE];
    const list = db.polls.filter((p) => !p.hidden).sort((a, b) => (isOpen(b) - isOpen(a)) || b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
    res.json(list.map((p) => publicPoll(p, dev)));
  });
  app.post('/api/polls/:id/vote', (req, res) => {
    const p = db.polls.find((x) => x.id === req.params.id && !x.hidden);
    if (!p) return bad(res, 'Vote introuvable.', 404);
    if (!isOpen(p)) return bad(res, 'Ce vote est clos.');
    const choice = Number(req.body.option);
    if (!Number.isInteger(choice) || choice < 0 || choice >= p.options.length) return bad(res, 'Choix invalide.');
    // Garde-fou contre le bourrage : 40 votes max par réseau et par heure sur un même scrutin (wifi du campus partagé).
    if (limited(`vote:${p.id}:${visitor(req)}`, Number(process.env.VOTES_PER_NETWORK_HOUR || 40), 3600e3)) return bad(res, 'Trop de votes depuis ce réseau, réessaie plus tard.', 429);
    const dev = deviceId(req, res);
    const b = ballot(p.id, dev);
    if (p.ballots[b] !== undefined) return bad(res, 'Tu as déjà voté sur cet appareil.', 409);
    p.ballots[b] = choice;
    save();
    broadcast('poll', { id: p.id });
    res.json(publicPoll(p, dev));
  });

  const DURATIONS = { '1h': 1, '3h': 3, '6h': 6, '12h': 12, '24h': 24, '48h': 48, '72h': 72, '7j': 168 };
  mod.get('/polls', (req, res) => res.json(db.polls.filter((p) => visible(req, p)).map((p) => ({ ...publicPoll(p), counts: p.options.map((_, i) => Object.values(p.ballots).filter((b) => b === i).length), hidden: !!p.hidden, closed: !!p.closed }))));
  mod.post('/polls', (req, res) => {
    const question = clip(req.body.question, 200);
    const options = (Array.isArray(req.body.options) ? req.body.options : []).map((o) => clip(o, 100)).filter(Boolean).slice(0, 8);
    if (!question) return bad(res, 'Question requise.');
    if (options.length < 2) return bad(res, 'Au moins 2 choix.');
    let closesAt;
    if (req.body.closesAt) closesAt = new Date(req.body.closesAt);
    else closesAt = new Date(Date.now() + (DURATIONS[req.body.duration] || 24) * 3600e3);
    if (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now()) return bad(res, 'Date de clôture invalide.');
    const psite = targetSite(req);
    if (!needSite(req, res, psite)) return;
    // « ag » : l'assemblée générale qui organise ce vote (ex. « AG du 18/11 · Doua »), affichée sur la page des votes
    const p = { id: newId(), site: psite, ag: clip(req.body.ag, 80) || `AG ${siteName(psite)}`, question, description: clip(req.body.description, 600), options, opensAt: now(), closesAt: closesAt.toISOString(), results: oneOf(req.body.results, ['live', 'after'], 'live'), ballots: {}, org: req.mod.org, createdAt: now() };
    db.polls.push(p); save();
    audit(req.mod, 'vote créé', question, psite);
    feed(`${p.ag} · Nouveau vote anonyme : « ${question} » · jusqu'au ${closesAt.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`, 'info');
    postTelegram(`🗳️ <b>Vote anonyme · ${tgEsc(p.ag)}</b>\n${tgEsc(question)}\n${options.map((o) => `• ${tgEsc(o)}`).join('\n')}\n<i>Jusqu'au ${tgEsc(closesAt.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }))}, 1 vote par téléphone</i>`, '/#/votes', site(psite)?.telegramChatId);
    broadcast('poll', { id: p.id });
    res.json(publicPoll(p));
  });
  mod.put('/polls/:id', (req, res) => {
    const p = db.polls.find((x) => x.id === req.params.id);
    if (!p) return bad(res, 'Introuvable', 404);
    if (!needSite(req, res, siteOf(p))) return;
    if (req.body.close) { p.closed = true; p.closesAt = now(); feed(`Vote clos : « ${p.question} » (${Object.keys(p.ballots).length} votes)`, 'ok'); }
    if (req.body.hidden !== undefined) p.hidden = !!req.body.hidden;
    if (req.body.extendHours) { const h = Math.min(168, Number(req.body.extendHours) || 0); p.closesAt = new Date(Math.max(Date.now(), new Date(p.closesAt).getTime()) + h * 3600e3).toISOString(); p.closed = false; }
    save(); audit(req.mod, 'vote modifié', p.question, siteOf(p)); broadcast('poll', { id: p.id });
    res.json({ ok: true });
  });
  mod.delete('/polls/:id', (req, res) => {
    const pp = db.polls.find((x) => x.id === req.params.id);
    if (pp && !needSite(req, res, siteOf(pp))) return;
    audit(req.mod, 'vote supprimé', pp?.question || '', siteOf(pp));
    db.polls = db.polls.filter((p) => p.id !== req.params.id); save(); broadcast('poll', {});
    res.json({ ok: true });
  });

  // ================= Blog & tribunes =================
  const publicPost = (p, full = false) => ({
    id: p.id, site: siteOf(p), title: p.title, excerpt: clip(p.body.replace(/^#+\s*|#+$|\*\*|__|^[>-]\s+/gm, '').replace(/#{2,}/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim(), 220), html: full ? renderRich(p.body) : undefined,
    author: p.author, kind: p.kind, cover: mediaInfo(p.cover ? [p.cover] : [])[0]?.url || null, publishedAt: p.publishedAt, tags: p.tags || [],
  });
  app.get('/api/blog', (req, res) => res.json(db.posts.filter((p) => p.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map((p) => publicPost(p))));
  app.get('/api/blog/:id', (req, res) => {
    const p = db.posts.find((x) => x.id === req.params.id && x.status === 'published');
    return p ? res.json(publicPost(p, true)) : bad(res, 'Article introuvable.', 404);
  });
  // Tribune proposée par un·e étudiant·e : anonyme, publiée seulement après relecture.
  app.post('/api/blog/submit', (req, res) => {
    if (limited(`trib:${visitor(req)}`, 3, 3600e3)) return bad(res, 'Trop d’envois, réessaie plus tard.', 429);
    const title = clip(req.body.title, 140);
    const body = clip(req.body.body, 12000);
    if (title.length < 5 || body.length < 80) return bad(res, 'Titre (5 caractères min.) et texte (80 caractères min.) requis.');
    db.posts.push({ id: newId(), site: pubSite(req.body.site), title, body, author: clip(req.body.signature, 60) || 'Tribune anonyme', kind: 'tribune', status: 'pending', createdAt: now(), tags: [] });
    save();
    broadcast('mod-queue', {});
    res.json({ ok: true, message: 'Merci ! Ta tribune sera relue par les modos avant publication.' });
  });
  mod.get('/posts', (req, res) => res.json(db.posts.filter((p) => visible(req, p)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => ({ ...p, coverUrl: p.cover ? `/api/mod/media/${p.cover}` : null }))));
  mod.post('/posts', (req, res) => {
    const title = clip(req.body.title, 140);
    const body = clip(req.body.body, 30000);
    if (!title || !body) return bad(res, 'Titre et texte requis.');
    const bsite = targetSite(req);
    if (!needSite(req, res, bsite)) return;
    const p = { id: newId(), site: bsite, updatedAt: now(), by: req.mod.org, title, body, author: clip(req.body.author, 60) || req.mod.org, kind: 'article', status: req.body.publish ? 'published' : 'draft', createdAt: now(), tags: [] };
    if (req.body.cover) attachCover(p, req.body.cover);
    if (p.status === 'published') { p.publishedAt = now(); feed(`Nouvel article : ${title}`, 'info'); }
    db.posts.push(p); save(); audit(req.mod, 'article', title, bsite); broadcast('blog', {});
    res.json(p);
  });
  function attachCover(p, mediaId) {
    const m = db.media.find((x) => x.id === mediaId && x.kind === 'image');
    if (!m) return;
    if (p.cover && p.cover !== m.id) deleteMedia([p.cover]);
    m.status = 'attached'; m.public = p.status === 'published';
    persistMedia(m);
    p.cover = m.id;
  }
  mod.put('/posts/:id', (req, res) => {
    const p = db.posts.find((x) => x.id === req.params.id);
    if (!p) return bad(res, 'Introuvable', 404);
    if (!needSite(req, res, siteOf(p))) return;
    if (stale(req, res, p)) return;
    touch(req, p);
    if (req.body.title !== undefined) p.title = clip(req.body.title, 140) || p.title;
    if (req.body.body !== undefined) p.body = clip(req.body.body, 30000) || p.body;
    if (req.body.author !== undefined) p.author = clip(req.body.author, 60) || p.author;
    if (req.body.cover) attachCover(p, req.body.cover);
    if (req.body.status) {
      const prev = p.status;
      p.status = oneOf(req.body.status, ['draft', 'pending', 'published', 'rejected'], p.status);
      if (p.status === 'published' && prev !== 'published') { p.publishedAt = now(); feed(`${p.kind === 'tribune' ? 'Tribune' : 'Article'} publié : ${p.title}`, 'info'); }
    }
    const cover = db.media.find((m) => m.id === p.cover);
    if (cover) cover.public = p.status === 'published';
    save(); audit(req.mod, `article ${p.status}`, p.title, siteOf(p)); broadcast('blog', {});
    res.json(p);
  });
  mod.delete('/posts/:id', (req, res) => {
    const p = db.posts.find((x) => x.id === req.params.id);
    if (p && !needSite(req, res, siteOf(p))) return;
    if (p?.cover) deleteMedia([p.cover]);
    db.posts = db.posts.filter((x) => x.id !== req.params.id); save(); broadcast('blog', {});
    res.json({ ok: true });
  });

  // ================= Témoignages =================
  const CATEGORIES = { police: 'Violences policières', vigiles: 'Vigiles / sécurité', administration: 'Pression de l’administration', agression: 'Agression (militants opposés, passants…)', discrimination: 'Propos ou actes discriminatoires', autre: 'Autre' };
  const publicTestimony = (t) => ({ site: siteOf(t), id: t.id, text: t.text, place: t.place, date: t.date, category: t.category, categoryLabel: CATEGORIES[t.category], media: mediaInfo(t.media), publishedAt: t.publishedAt, sensitive: t.sensitive !== false });
  app.get('/api/testimonies', (req, res) => res.json({ categories: CATEGORIES, items: db.testimonies.filter((t) => t.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map(publicTestimony) }));
  app.post('/api/testimonies', (req, res) => {
    if (limited(`tem:${visitor(req)}`, 4, 3600e3)) return bad(res, 'Trop d’envois, réessaie dans une heure.', 429);
    const text = clip(req.body.text, 8000);
    if (text.length < 30) return bad(res, 'Décris ce qui s’est passé (30 caractères minimum).');
    if (!req.body.consent) return bad(res, 'Merci de cocher la case de consentement.');
    const mediaIds = (Array.isArray(req.body.media) ? req.body.media : []).slice(0, 6).filter((id) => db.media.some((m) => m.id === id && m.status === 'tmp'));
    const t = {
      id: newId(), site: pubSite(req.body.site), text, place: clip(req.body.place, 140), date: clip(req.body.date, 10), category: oneOf(req.body.category, Object.keys(CATEGORIES), 'autre'),
      contact: clip(req.body.contact, 160), media: mediaIds, status: 'pending', createdAt: now(),
    };
    for (const id of mediaIds) {
      const m = db.media.find((x) => x.id === id);
      m.status = 'attached';
      persistMedia(m);
    }
    db.testimonies.push(t); save();
    broadcast('mod-queue', {});
    res.json({ ok: true, message: 'Témoignage reçu. Il sera relu par les modos avant toute publication. Prends soin de toi.' });
  });
  mod.get('/testimonies', (req, res) => res.json(db.testimonies.filter((t) => visible(req, t)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => ({ ...t, categoryLabel: CATEGORIES[t.category], media: mediaInfo(t.media, true) }))));
  mod.put('/testimonies/:id', (req, res) => {
    const t = db.testimonies.find((x) => x.id === req.params.id);
    if (!t) return bad(res, 'Introuvable', 404);
    if (!needSite(req, res, siteOf(t))) return;
    if (stale(req, res, t)) return;
    touch(req, t);
    if (req.body.text !== undefined) t.text = clip(req.body.text, 8000) || t.text;
    if (req.body.place !== undefined) t.place = clip(req.body.place, 140);
    if (req.body.sensitive !== undefined) t.sensitive = !!req.body.sensitive;
    // Médias publiés un par un : le modo peut publier le texte sans les photos/vidéos (visages reconnaissables…).
    const publishMedia = Array.isArray(req.body.publishMedia) ? req.body.publishMedia : null;
    if (req.body.removeMedia && t.media.includes(req.body.removeMedia)) { deleteMedia([req.body.removeMedia]); t.media = t.media.filter((id) => id !== req.body.removeMedia); }
    if (req.body.removeContact) t.contact = '';
    if (req.body.status) {
      const prev = t.status;
      t.status = oneOf(req.body.status, ['pending', 'published', 'rejected'], t.status);
      if (t.status === 'published' && prev !== 'published') { t.publishedAt = now(); feed(`Nouveau témoignage publié · ${CATEGORIES[t.category]}${t.place ? ' · ' + t.place : ''}`, 'warn'); }
    }
    for (const id of t.media) {
      const m = db.media.find((x) => x.id === id);
      if (!m) continue;
      if (publishMedia) m.public = t.status === 'published' && publishMedia.includes(id);
      else if (t.status !== 'published') m.public = false;
    }
    save(); audit(req.mod, `témoignage ${t.status}`, t.text.slice(0, 60), siteOf(t)); broadcast('testimonies', {});
    res.json({ ok: true });
  });
  mod.delete('/testimonies/:id', (req, res) => {
    const t = db.testimonies.find((x) => x.id === req.params.id);
    if (t && !needSite(req, res, siteOf(t))) return;
    if (t) deleteMedia(t.media);
    db.testimonies = db.testimonies.filter((x) => x.id !== req.params.id); save(); broadcast('testimonies', {});
    audit(req.mod, 'témoignage supprimé', '', siteOf(t));
    res.json({ ok: true });
  });

  mod.get('/queue', (req, res) => res.json({
    testimonies: db.testimonies.filter((t) => t.status === 'pending' && visible(req, t)).length,
    tribunes: db.posts.filter((p) => p.status === 'pending' && visible(req, p)).length,
    ffmpeg: HAS_FFMPEG,
  }));

  // Fin d'un vote : résultats publiés automatiquement (fil en direct + Telegram), une seule fois par vote.
  function announceResults() {
    for (const p of db.polls) {
      if (p.hidden || p.resultsAnnounced || isOpen(p)) continue;
      p.resultsAnnounced = true;
      const counts = p.options.map((_, i) => Object.values(p.ballots).filter((b) => b === i).length);
      const total = counts.reduce((a, b) => a + b, 0);
      save();
      if (!total) continue;
      const max = Math.max(...counts);
      const lines = p.options.map((o, i) => `${counts[i] === max ? '✅' : '▫️'} ${o} : ${Math.round((counts[i] / total) * 100)} %`);
      feed(`${p.ag || siteName(siteOf(p))} · Résultat du vote « ${p.question} » : ${p.options[counts.indexOf(max)]} (${total} votes)`, 'ok');
      postTelegram(`📊 <b>Résultats · ${tgEsc(p.ag || siteName(siteOf(p)))}</b>\n${tgEsc(p.question)}\n${lines.map(tgEsc).join('\n')}\n<i>${total} votes · vote anonyme et indicatif</i>`, `/#/votes/${p.id}`, site(siteOf(p))?.telegramChatId);
      broadcast('poll', { id: p.id });
    }
  }
  // Au démarrage, les votes déjà terminés avant cette fonctionnalité ne sont pas réannoncés.
  for (const p of db.polls) if (!p.resultsAnnounced && !isOpen(p) && new Date(p.closesAt).getTime() < Date.now() - 3600e3) p.resultsAnnounced = true;
  setInterval(announceResults, 60e3).unref();

  return {
    pollsOpen: () => db.polls.filter((p) => !p.hidden && isOpen(p)).length,
    pollsOpenBySite: () => db.polls.filter((p) => !p.hidden && isOpen(p)).reduce((o, p) => ({ ...o, [siteOf(p)]: (o[siteOf(p)] || 0) + 1 }), {}),
  };
}

