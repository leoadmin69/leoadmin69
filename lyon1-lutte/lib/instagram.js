import crypto from 'node:crypto';
import { db, save, newId, now } from './store.js';
import { analyzeInstagramText, analyzeInstagramStoryImage, analyzeInstagramImageBytes } from './ai.js';
import { DEFAULT_SITE, site, siteName } from './sites.js';

const DEFAULT_CHANNEL = 'https://www.instagram.com/channel/UFc6KiIvKuUCSwgk/';
const DEFAULT_ACCOUNT = 'https://www.instagram.com/lyon1_ladoua.enlutte/';
const channelUrl = () => String(db.settings.instagram?.url || process.env.INSTAGRAM_CHANNEL_URL || DEFAULT_CHANNEL).trim();
export const instagramEnabled = () => (typeof db.settings.instagram?.enabled === 'boolean'
  ? db.settings.instagram.enabled
  : /^(true|1|yes|oui)$/i.test(String(process.env.INSTAGRAM_CHANNEL_ENABLED || '').trim()));
export const intervalMinutes = () => Math.max(5, Number(db.settings.instagram?.interval || process.env.INSTAGRAM_CHANNEL_INTERVAL_MINUTES || 15));

const decodeJsonText = (value) => {
  try { return JSON.parse(`"${value.replace(/\\$/g, '').replace(/"/g, '\\"')}"`); } catch { return value; }
};

const stripHtml = (html) => {
  const out = [];
  for (const match of html.matchAll(/>([^<>]{3,500})</g)) {
    const s = match[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();
    if (s && !/^(html|head|body|script|style)$/i.test(s)) out.push(s);
  }
  for (const match of html.matchAll(/"(?:text|body|message)"\s*:\s*"((?:[^"\\]|\\.){8,500})"/g)) {
    const s = decodeJsonText(match[1]).replace(/\\n/g, '\n').replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).trim();
    if (s) out.push(s);
  }
  // on écarte le code de la page (JSON, CSS, scripts) : seuls de vrais textes humains restent
  const looksLikeCode = (x) => /^[\[{(@]|\brequire\b|qplTimings|__comet|sjsNonce|\{[^}]*:[^}]*\}|;\s*$|^[\w-]+\{/.test(x) || (x.match(/[{}\[\]":;=]/g) || []).length > x.length / 12;
  return [...new Set(out)].filter((x) => !/^(js action|loading|log in|sign up|cookies|instagram)$/i.test(x) && !looksLikeCode(x) && /[a-zà-ÿ]{3,}\s+[a-zà-ÿ]{2,}/i.test(x));
};

export async function fetchInstagramChannel() {
  const url = channelUrl();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'fr-FR,fr;q=0.9',
  };
  if (process.env.INSTAGRAM_CHANNEL_COOKIES) headers.Cookie = process.env.INSTAGRAM_CHANNEL_COOKIES;
  const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Instagram HTTP ${r.status}`);
  const html = await r.text();
  // page de connexion à la place du canal : rien à lire (et surtout rien à publier)
  if (/\/accounts\/login/.test(r.url) || /loginForm|"is_logged_in"\s*:\s*false|Log in to Instagram|Connectez-vous à Instagram/i.test(html)) {
    throw new Error('Instagram demande une connexion : le canal ne peut pas être lu automatiquement (cookie de session requis).');
  }
  const messages = stripHtml(html);
  if (!messages.length) throw new Error('Aucun message lisible : Instagram n’envoie le contenu des canaux qu’à l’application (la page web ne contient que du code). La lecture automatique du canal ne peut pas marcher : utilise « Coller un message » ou envoie une capture.');
  return { url, messages };
}

const accountUrl = () => String(db.settings.instagram?.accountUrl || process.env.INSTAGRAM_ACCOUNT_URL || DEFAULT_ACCOUNT).trim();
const accountUsername = () => accountUrl().match(/instagram\.com\/([^/?#]+)/i)?.[1]?.replace(/\/$/, '') || 'lyon1_ladoua.enlutte';

// Cookie Instagram tel que collé sur Render : accepte « nom=valeur; … », un export JSON ([{name, value}]),
// « Cookie: » devant, ou une valeur sur plusieurs lignes ; renvoie « nom=valeur; nom=valeur »
export function igCookie() {
  let raw = String(process.env.INSTAGRAM_STORIES_COOKIES || process.env.INSTAGRAM_CHANNEL_COOKIES || '').trim().replace(/^cookie:\s*/i, '');
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try { const j = JSON.parse(raw); const list = Array.isArray(j) ? j : Object.entries(j).map(([name, value]) => ({ name, value })); raw = list.filter((c) => c?.name).map((c) => `${c.name}=${c.value}`).join('; '); } catch {}
  }
  return raw.split(/[;\n]+/).map((x) => x.trim()).filter((x) => /^[\w.-]+=/.test(x)).join('; ');
}

function instagramHeaders(extra = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'fr-FR,fr;q=0.9',
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '198387',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: accountUrl(),
    ...extra,
  };
  const cookies = igCookie();
  if (cookies) headers.Cookie = cookies;
  const csrf = cookies.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
  if (csrf) headers['X-CSRFToken'] = decodeURIComponent(csrf);
  return headers;
}

export async function fetchInstagramStories() {
  if (!(process.env.INSTAGRAM_STORIES_COOKIES || process.env.INSTAGRAM_CHANNEL_COOKIES)) {
    throw new Error('INSTAGRAM_STORIES_COOKIES est requis pour lire les stories du compte.');
  }
  const username = accountUsername();
  // 1. ID numérique du compte : donné par l'admin (le plus sûr), sinon gardé de la dernière fois, sinon cherché
  let userId = String(db.settings.instagram?.accountId || process.env.INSTAGRAM_ACCOUNT_ID || '').trim()
    || (db.settings.instagram?.resolvedFor === username ? db.settings.instagram?.resolvedId : '');
  const tries = [];
  if (!userId) {
    const ways = [
      ['web', `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, instagramHeaders()],
      ['app', `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, instagramHeaders({ 'User-Agent': 'Instagram 309.1.0.41.113 Android (33/13; 420dpi; 1080x2340; samsung; SM-S911B; dm1q; qcom; fr_FR; 541635890)', 'X-IG-App-ID': '567067343352427' })],
    ];
    for (const [how, url, headers] of ways) {
      try {
        const r = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
        if (r.status >= 300 && r.status < 400) { tries.push(`${how} : redirigé vers la connexion (cookie expiré ?)`); continue; }
        if (!r.ok) { tries.push(`${how} : HTTP ${r.status}`); continue; }
        const j = await r.json();
        userId = j?.data?.user?.id || j?.user?.pk || '';
        if (userId) break;
        tries.push(`${how} : compte introuvable`);
      } catch (e) { tries.push(`${how} : ${e.message}`); }
    }
    if (!userId) throw new Error(`Instagram ne donne pas le compte « ${username} » (${tries.join(' · ')}). Vérifie le nom du compte, ou mets son ID numérique dans l’onglet Instagram. Si c’est « redirigé vers la connexion », le cookie a expiré.`);
    db.settings.instagram.resolvedFor = username; db.settings.instagram.resolvedId = String(userId);
  }

  // 2. stories du compte (web, puis version appli en secours)
  let reel = null;
  for (const [how, host, extra] of [['web', 'www.instagram.com', {}], ['app', 'i.instagram.com', { 'User-Agent': 'Instagram 309.1.0.41.113 Android (33/13; 420dpi; 1080x2340; samsung; SM-S911B; dm1q; qcom; fr_FR; 541635890)', 'X-IG-App-ID': '567067343352427' }]]) {
    const r = await fetch(`https://${host}/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}&media_type=all`, { headers: instagramHeaders(extra), redirect: 'manual', signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) {
      // Instagram renvoie parfois sa page de connexion (HTML) avec un code 200 : ce n'est pas une réponse valable
      const raw = await r.text();
      try { reel = JSON.parse(raw); break; } catch {
        tries.push(`stories ${how} : page de connexion d’Instagram au lieu des stories (${/login|connexion|Log in/i.test(raw) ? 'non connecté' : 'réponse HTML'})`);
        continue;
      }
    }
    let detail = '';
    try { if (r.text) detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 120); } catch {}
    tries.push(`stories ${how} : ${r.status >= 300 && r.status < 400 ? `redirigé vers ${(r.headers?.get?.('location') || 'la connexion').slice(0, 60)} (cookie expiré ?)` : `HTTP ${r.status}${detail ? ' ' + detail : ''}`}`);
  }
  if (!reel) {
    // quels éléments du cookie sont présents (noms seulement, jamais les valeurs)
    const names = new Set(igCookie().split(';').map((x) => x.split('=')[0].trim()).filter(Boolean));
    const need = ['sessionid', 'csrftoken', 'ds_user_id'].filter((n) => !names.has(n));
    throw new Error(`Instagram ne reconnaît pas la connexion depuis le serveur pour l’ID ${userId} (${tries.join(' · ')}). ${need.length ? `Le cookie ne contient pas : ${need.join(', ')}. ` : 'Le cookie contient bien sessionid, csrftoken et ds_user_id : il a sans doute expiré, ou Instagram refuse les connexions venant de l’hébergeur. '}`);
  }
  const reelJson = reel;
  const groups = reelJson?.reels ? Object.values(reelJson.reels) : reelJson?.reels_media || reelJson?.tray || [];
  const items = groups.flatMap((group) => group?.items || group?.media || (group?.item ? [group.item] : [])).filter(Boolean);
  const stories = items.map((item) => {
    const candidates = item.image_versions2?.candidates || [];
    const image = candidates.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
    if (!image) return null;
    return {
      id: String(item.pk || item.id || item.code || image),
      takenAt: item.taken_at ? new Date(Number(item.taken_at) * 1000).toISOString() : '',
      imageUrl: image,
      caption: item.caption?.text || '',
    };
  }).filter(Boolean);
  return { username, userId, stories };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
// Date et heure lues à l'heure de Paris → Date UTC
function parisToDate(y, mo, d, h, mi) {
  if (h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const out = new Date(guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess));
  return Number.isNaN(out.getTime()) ? null : out;
}
const parisIso = (value) => {
  if (!value) return '';
  const clean = String(value).trim();
  const lower = clean.toLowerCase();
  if (/aujourd'hui|aujourdhui/.test(lower)) {
    const time = lower.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
    const paris = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [y, mo, da] = paris.split('-').map(Number);
    const d = parisToDate(y, mo, da, time ? Number(time[1]) : 12, time ? Number(time[2] || 0) : 0);
    return d ? d.toISOString() : '';
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (day) { const d = parisToDate(+day[1], +day[2], +day[3], 12, 0); return d ? d.toISOString() : ''; }
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(clean);
  if (local) { const d = parisToDate(+local[1], +local[2], +local[3], +local[4], +local[5]); return d ? d.toISOString() : ''; }
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const d = new Date(clean);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const match = clean.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})(?:[ ,]+(\d{1,2})[:h](\d{2}))?/);
  if (match) {
    const [, dd, mm, yyyy, hh = '12', min = '00'] = match;
    const d = parisToDate(Number(yyyy), Number(mm), Number(dd), Number(hh), Number(min));
    return d ? d.toISOString() : '';
  }
  return '';
};

const IG = { username: 'instagram', org: 'Canal Instagram' };

// Seuils : déduction sûre = publiée ; déduction probable = proposée aux modos ; supposition = ignorée
const AUTO_MIN = () => Number(process.env.IG_AUTO_MIN || 0.85);
const QUEUE_MIN = () => Number(process.env.IG_QUEUE_MIN || 0.5);
const conf = (x) => { const c = Number(x?.confidence); return Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0; };
const parisNowText = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
export function aiContext(siteId) {
  const names = db.buildings.filter((b) => (b.site || DEFAULT_SITE) === siteId).map((b) => b.name);
  return `Date courante (heure de Paris) : ${parisNowText()} (${new Date().toISOString()}).\nBâtiments connus de ce site : ${names.join(', ') || 'aucun'}.`;
}
// bâtiment : nom exact, sinon un seul bâtiment qui ressemble (≥ 4 lettres) → seulement proposé aux modos
function findBuilding(siteId, name) {
  const needle = norm(name);
  if (!needle) return { b: null };
  const list = db.buildings.filter((x) => (x.site || DEFAULT_SITE) === siteId);
  const exact = list.find((x) => norm(x.name) === needle);
  if (exact) return { b: exact, exact: true };
  if (needle.length < 4) return { b: null };
  const near = list.filter((x) => { const n = norm(x.name); return n.includes(needle) || needle.includes(n); });
  return near.length === 1 ? { b: near[0], exact: false } : { b: null };
}
function queue(kind, item, siteId, label, evidence, c) {
  db.settings.igQueue ||= [];
  const key = hash(`${kind}:${JSON.stringify(item)}`);
  if (db.settings.igQueue.some((q) => q.key === key)) return;
  db.settings.igQueue.unshift({ id: newId(), key, kind, item, site: siteId, label, evidence: String(evidence || '').slice(0, 300), confidence: c, at: now() });
  db.settings.igQueue = db.settings.igQueue.slice(0, 60);
}
// Publie un élément (bâtiment, événement, flash) ; renvoie un résumé ou null
export function applyItem(kind, item, siteId, ctx, label) {
  const tag = ` · ${label} (déduit par l’IA)`;
  if (kind === 'building') {
    const { b } = findBuilding(siteId, item.name);
    const status = ['bloque', 'partiel', 'ouvert'].includes(item.status) ? item.status : null;
    if (!b || !status || b.status === status) return null;
    b.status = status; b.note = String(item.note || '').slice(0, 240); b.updatedAt = now(); b.by = label;
    delete b.yesterday; delete b.resetAt;
    ctx.audit?.(IG, `${label} : bâtiment`, `${b.name} → ${status} · ${item.evidence || ''}`.slice(0, 280), siteId);
    ctx.feed?.(`${b.name} (${b.campus}) → ${status === 'bloque' ? 'BLOQUÉ' : status === 'partiel' ? 'PARTIEL' : 'OUVERT'}${b.note ? ' · ' + b.note : ''}${tag}`, status === 'bloque' ? 'alert' : status === 'partiel' ? 'warn' : 'ok');
    ctx.onBuilding?.(b); ctx.queueBuildingAlert?.(b); ctx.broadcast?.('buildings', { id: b.id });
    return { name: b.name, status };
  }
  if (kind === 'event') {
    const start = parisIso(item.date), title = String(item.title || '').trim().slice(0, 120);
    if (!start || !title || db.events.some((e) => e.title === title && e.start === start && (e.site || DEFAULT_SITE) === siteId)) return null;
    db.events.push({ id: newId(), site: siteId, type: ['AG', 'manif', 'rassemblement', 'action', 'autre'].includes(item.type) ? item.type : 'autre', title, start, place: String(item.place || '').slice(0, 140), address: '', description: String(item.description || '').slice(0, 1500), org: label, createdAt: now() });
    ctx.audit?.(IG, `${label} : événement`, title, siteId); ctx.broadcast?.('events', {});
    return { title, start };
  }
  if (kind === 'flash') {
    const title = String(item.title || '').trim().slice(0, 120), text = String(item.text || '').trim().slice(0, 500);
    if (!title || !text) return null;
    db.flashes.unshift({ id: newId(), site: siteId, level: { alert: 'alerte', warn: 'alerte', ok: 'ok' }[item.tone] || 'info', text: `${title} · ${text}`.slice(0, 500), at: now(), expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(), org: label, official: false });
    db.flashes = db.flashes.slice(0, 100);
    ctx.audit?.(IG, `${label} : flash`, title, siteId); ctx.broadcast?.('flashes', {});
    return { title, text };
  }
  return null;
}
// Trie ce que l'IA a déduit : sûr → publié ; probable → à valider par un·e modo ; supposition → ignoré
// Un·e admin colle le texte d'un message du canal, ou envoie une capture d'écran d'une story :
// l'IA déduit, puis même tri que la lecture automatique (sûr → publié, probable → à valider)
export async function analyzeManual({ text, image, mime }, ctx = {}) {
  const siteId = site(db.settings.instagram?.site) ? db.settings.instagram.site : DEFAULT_SITE;
  let data, source;
  if (image) { data = await analyzeInstagramImageBytes(image, mime, aiContext(siteId)); source = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini'; }
  else {
    const r = await analyzeInstagramText(String(text || '').slice(0, 8000), aiContext(siteId));
    if (r.source === 'local') throw new Error('Clé IA (Gemini ou Groq) requise.');
    data = r.data; source = r.source;
  }
  const applied = { buildings: [], events: [], flashes: [] };
  applyAi(data, siteId, ctx, new Set(), applied, image ? 'capture Instagram' : 'message Instagram', newId());
  save();
  ctx.broadcast?.('buildings', {});
  const seen = (k) => (data?.[k] || []).map((x) => ({ ...x }));
  return { source, applied, found: { buildings: seen('buildings'), events: seen('events'), flashes: seen('flashes') } };
}

function applyAi(data, siteId, ctx, seen, applied, label, from = '') {
  applied.queued ||= 0;
  const groups = [['building', data?.buildings, 'buildings'], ['event', data?.events, 'events'], ['flash', data?.flashes, 'flashes']];
  for (const [kind, list, out] of groups) {
    for (const item of list || []) {
      const c = conf(item);
      if (c < QUEUE_MIN()) continue;
      const key = hash(`${kind}:${item.name || item.title || ''}:${item.status || item.date || item.text || ''}:${from}`);
      if (seen.has(key)) continue;
      seen.add(key);
      let sure = c >= AUTO_MIN();
      if (kind === 'building') { const f = findBuilding(siteId, item.name); if (!f.b) continue; if (!f.exact) sure = false; item.name = f.b.name; }
      if (sure) { const r = applyItem(kind, item, siteId, ctx, label); if (r) applied[out].push(r); }
      else { queue(kind, item, siteId, label, item.evidence, c); applied.queued++; }
    }
  }
}
export async function syncInstagram(ctx = {}) {
  const channel = await fetchInstagramChannel();
  const text = channel.messages.slice(0, 30).join('\n\n');
  const siteForAi = site(db.settings.instagram?.site) ? db.settings.instagram.site : DEFAULT_SITE;
  const result = await analyzeInstagramText(text, aiContext(siteForAi));
  if (result.source === 'local') throw new Error('Clé IA (Gemini ou Groq) requise : sans IA, rien n’est publié automatiquement.');
  db.settings.instagram ||= {};
  db.settings.instagram.lastCheck = now();
  delete db.settings.instagram.lastError;
  db.settings.instagram.source = channel.url;
  db.settings.instagram.sourceCount = channel.messages.length;
  db.settings.instagram.sourceModel = result.source;
  db.settings.instagramSeen ||= [];
  db.settings.instagramSeen = db.settings.instagramSeen.slice(-500);
  const seen = new Set(db.settings.instagramSeen);
  const applied = { buildings: [], events: [], flashes: [] };
  const siteId = db.settings.instagram?.site || DEFAULT_SITE;
  if (!site(siteId)) db.settings.instagram.site = DEFAULT_SITE;

  applyAi(result.data, siteId, ctx, seen, applied, 'canal Instagram');

  db.settings.instagramSeen = [...seen].slice(-500);
  db.settings.instagram.lastApplied = now();
  db.settings.instagram.applied = applied;
  save();
  ctx.broadcast?.('buildings', {});
  ctx.broadcast?.('blocus', {});
  return { source: channel.url, sourceCount: channel.messages.length, aiSource: result.source, applied };
}

export async function syncInstagramStories(ctx = {}) {
  const reel = await fetchInstagramStories();
  db.settings.instagram ||= {};
  db.settings.instagramStorySeen ||= [];
  db.settings.instagramStorySeen = db.settings.instagramStorySeen.slice(-500);
  const seen = new Set(db.settings.instagramStorySeen);
  const applied = { buildings: [], events: [], flashes: [] };
  const siteId = db.settings.instagram?.site || DEFAULT_SITE;
  if (!site(siteId)) db.settings.instagram.site = DEFAULT_SITE;

  for (const story of reel.stories) {
    if (seen.has(story.id)) continue;
    let result;
    try {
      result = await analyzeInstagramStoryImage(story.imageUrl, aiContext(siteId));
    } catch (e) {
      db.settings.instagram.lastStoryError = e.message;
      db.settings.instagram.lastStoryErrorAt = now();
      continue;
    }
    seen.add(story.id);

    applyAi(result, siteId, ctx, seen, applied, 'story Instagram', story.id);
  }

  db.settings.instagramStorySeen = [...seen].slice(-500);
  db.settings.instagram.lastStoryCheck = now();
  db.settings.instagram.lastStoryCount = reel.stories.length;
  db.settings.instagram.lastStoryAccount = reel.username;
  db.settings.instagram.lastStoryApplied = now();
  db.settings.instagram.lastStoryResult = applied;
  save();
  ctx.broadcast?.('buildings', {});
  ctx.broadcast?.('blocus', {});
  return { username: reel.username, storyCount: reel.stories.length, applied };
}

export function startInstagramSync(ctx = {}) {
  db.settings.instagram ||= {};
  let running = false, lastRun = 0;
  const run = async () => {
    if (running || !instagramEnabled() || Date.now() - lastRun < intervalMinutes() * 60e3) return;
    running = true; lastRun = Date.now();
    db.settings.instagram ||= {};
    try {
      // 1. Stories d'abord (prioritaires)
      if (process.env.INSTAGRAM_STORIES_COOKIES || process.env.INSTAGRAM_CHANNEL_COOKIES) {
        try {
          const st = await syncInstagramStories(ctx);
          delete db.settings.instagram.lastStoryError;
          console.log(`[instagram stories] ${st.storyCount} story(s) · ${st.applied.buildings.length} bâtiment(s), ${st.applied.events.length} événement(s), ${st.applied.flashes.length} info(s), ${st.applied.queued || 0} à valider`);
        } catch (e) {
          db.settings.instagram.lastStoryError = e.message; db.settings.instagram.lastStoryErrorAt = now(); save();
          console.error('[instagram stories]', e.message);
        }
      } else {
        db.settings.instagram.lastStoryError = 'Aucun cookie Instagram : ajoute INSTAGRAM_STORIES_COOKIES sur Render pour lire les stories automatiquement.';
      }
      // 2. Canal : seulement si ce n'est pas un canal de diffusion (ceux-là ne se lisent que dans l'appli)
      if (!/instagram\.com\/channel\//i.test(channelUrl())) {
        try {
          const r = await syncInstagram(ctx);
          console.log(`[instagram] canal lu : ${r.sourceCount} message(s), ${r.applied.buildings.length} bâtiment(s), ${r.applied.events.length} événement(s), ${r.applied.flashes.length} flash(s)`);
        } catch (e) { db.settings.instagram.lastError = e.message; db.settings.instagram.lastErrorAt = now(); save(); console.error('[instagram]', e.message); }
      } else delete db.settings.instagram.lastError;
      save();
    } finally { running = false; }
  };
  setTimeout(run, 5000).unref();
  return setInterval(run, 60e3).unref();
}
