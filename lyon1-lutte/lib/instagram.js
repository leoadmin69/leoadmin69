import crypto from 'node:crypto';
import { db, save, newId, now } from './store.js';
import { analyzeInstagramText } from './ai.js';
import { DEFAULT_SITE, site, siteName } from './sites.js';

const DEFAULT_CHANNEL = 'https://www.instagram.com/channel/UFc6KiIvKuUCSwgk/';
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
  return [...new Set(out)].filter((x) => !/^(js action|loading|log in|sign up|cookies|instagram)$/i.test(x));
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
  if (!messages.length) throw new Error('Aucun message exploitable : Instagram a demandé une connexion ou bloque la lecture automatique.');
  return { url, messages };
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
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (day) { const d = parisToDate(+day[1], +day[2], +day[3], 12, 0); return d ? d.toISOString() : ''; }
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

export async function syncInstagram(ctx = {}) {
  const channel = await fetchInstagramChannel();
  const text = channel.messages.slice(0, 30).join('\n\n');
  const result = await analyzeInstagramText(text);
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

  for (const item of result.data.buildings || []) {
    const needle = norm(item.name);
    if (!needle) continue;
    const b = db.buildings.find((x) => {
      const sameSite = (x.site || DEFAULT_SITE) === siteId;
      const name = norm(x.name);
      return sameSite && name === needle;
    });
    if (!b) continue;
    const status = ['bloque', 'partiel', 'ouvert'].includes(item.status) ? item.status : null;
    if (!status) continue;
    const key = `building:${b.id}:${status}:${String(item.note || '').slice(0, 80)}`;
    if (seen.has(hash(key))) continue;
    seen.add(hash(key));
    if (b.status !== status) {
      b.status = status;
      b.note = String(item.note || '').slice(0, 240);
      b.updatedAt = now();
      b.by = 'Instagram';
      delete b.yesterday;
      delete b.resetAt;
      db.audit.push({ id: newId(), at: now(), by: 'Instagram', org: 'Canal Instagram', action: 'mises à jour Instagram', detail: `${b.name} → ${status}`, site: siteId });
      db.feed.unshift({ at: now(), level: status === 'bloque' ? 'alert' : status === 'partiel' ? 'warn' : 'ok', text: `${siteName(siteId)} · ${b.name} → ${status === 'bloque' ? 'bloqué' : status === 'partiel' ? 'partiel' : 'rouvert'}${b.note ? ' · ' + b.note : ''} · Canal Instagram` });
      db.feed = db.feed.slice(0, 40);
      ctx.queueBuildingAlert?.(b);
      ctx.broadcast?.('buildings', { id: b.id });
      applied.buildings.push({ name: b.name, status });
    }
  }

  for (const item of result.data.events || []) {
    const start = parisIso(item.date);
    const title = String(item.title || '').trim().slice(0, 120);
    if (!start || !title) continue;
    const key = hash(`event:${title}:${start}:${item.place || ''}`);
    if (seen.has(key) || db.events.some((e) => e.title === title && e.start === start && (e.site || DEFAULT_SITE) === siteId)) continue;
    seen.add(key);
    db.events.push({
      id: newId(),
      site: siteId,
      type: ['AG', 'manif', 'rassemblement', 'action', 'autre'].includes(item.type) ? item.type : 'autre',
      title,
      start,
      place: String(item.place || '').slice(0, 140),
      address: '',
      description: String(item.description || '').slice(0, 1500),
      org: 'Canal Instagram',
      createdAt: now(),
    });
    db.audit.push({ id: newId(), at: now(), by: 'Instagram', org: 'Canal Instagram', action: 'événement Instagram', detail: title, site: siteId });
    ctx.broadcast?.('events', {});
    applied.events.push({ title, start });
  }

  for (const item of result.data.flashes || []) {
    const title = String(item.title || '').trim().slice(0, 120);
    const text = String(item.text || '').trim().slice(0, 500);
    if (!title || !text) continue;
    const key = hash(`flash:${title}:${text}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const expiresAt = new Date(Date.now() + 24 * 3600e3).toISOString();
    db.flashes.push({ id: newId(), site: siteId, title, text, type: ['info', 'warn', 'alert', 'ok'].includes(item.tone) ? item.tone : 'info', at: now(), expiresAt, org: 'Canal Instagram' });
    db.feed.unshift({ at: now(), level: ['warn', 'alert', 'ok'].includes(item.tone) ? item.tone : 'info', text: `${title}${text ? ' · ' + text : ''} · Canal Instagram` });
    db.feed = db.feed.slice(0, 40);
    db.audit.push({ id: newId(), at: now(), by: 'Instagram', org: 'Canal Instagram', action: 'flash Instagram', detail: title, site: siteId });
    ctx.broadcast?.('flashes', {});
    applied.flashes.push({ title, text });
  }

  db.settings.instagramSeen = [...seen].slice(-500);
  db.settings.instagram.lastApplied = now();
  db.settings.instagram.applied = applied;
  save();
  ctx.broadcast?.('buildings', {});
  ctx.broadcast?.('blocus', {});
  return { source: channel.url, sourceCount: channel.messages.length, aiSource: result.source, applied };
}

export function startInstagramSync(ctx = {}) {
  db.settings.instagram ||= {};
  let running = false, lastRun = 0;
  const run = async () => {
    if (running || !instagramEnabled() || Date.now() - lastRun < intervalMinutes() * 60e3) return;
    running = true; lastRun = Date.now();
    try {
      const r = await syncInstagram(ctx);
      console.log(`[instagram] canal lu : ${r.sourceCount} message(s), ${r.applied.buildings.length} bâtiment(s), ${r.applied.events.length} événement(s), ${r.applied.flashes.length} flash(s)`);
    } catch (e) {
      db.settings.instagram ||= {};
      db.settings.instagram.lastError = e.message;
      db.settings.instagram.lastErrorAt = now();
      save();
      console.error('[instagram]', e.message);
    } finally { running = false; }
  };
  setTimeout(run, 5000).unref();
  return setInterval(run, 60e3).unref();
}
