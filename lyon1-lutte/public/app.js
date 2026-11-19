import { randomNick, isSystemNick } from './nicks.js';
import { EMOTES } from './emotes.js';
// Lyon 1 · La Doua en lutte : application monopage (sans framework).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Arrivée depuis l'ancienne adresse du site : « oldpush=1 » = ce téléphone reçoit déjà les notifications
// par son ancien abonnement (on ne lui redemande pas, sinon il les recevrait en double)
try {
  const q = new URLSearchParams(location.search);
  if (q.has('oldpush') || q.has('moved')) {
    if (q.has('oldpush')) store.set('l1-oldpush', 1);
    q.delete('oldpush'); q.delete('moved');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
} catch {}

const state = { raw: null, data: null, site: store.get('l1-site', null), modSite: null, me: null, chatChannel: store.get('l1-channel', 'general'), chatMsgs: [], dirty: false, modTab: 'situation', campus: 'Tous', demandCat: 'Toutes', ctxOpen: false };

// Le serveur demande parfois de réessayer (428) le temps de poser le cookie anonyme de l'appareil : on réessaie une fois, sans que la personne le voie.
{
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    const r = await nativeFetch(u, o);
    if (r.status === 428 && String(u).startsWith('/api/')) return nativeFetch(u, o);
    return r;
  };
}
async function api(path, { method = 'GET', body, raw } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  // Chaque action d'un modo s'applique au site qu'il a choisi en haut de l'espace modo ;
  // un témoignage ou une tribune est rattaché au site que l'étudiant·e consulte.
  if (body && typeof body === 'object' && !Array.isArray(body) && body.site === undefined && method !== 'GET') {
    if (path.startsWith('/api/mod/') && state.modSite) body = { ...body, site: state.modSite };
    else if (path === '/api/blog/submit' || path === '/api/testimonies') body = { ...body, site: publicSite() };
  }
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (method !== 'GET' && body === undefined && !raw) { opt.headers['Content-Type'] = 'application/json'; opt.body = '{}'; }
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && path.startsWith('/api/mod/')) setTimeout(async () => { try { await refresh(); if (route() === 'modo' && state.modTab === 'situation' && window.drawTiles) { applyScope(); window.drawTiles(); } else render(true); } catch {} }, 600);
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// ---------- Sites (campus, IUT…) ----------
// state.raw : toutes les données ; state.data : seulement celles du site affiché
// (site choisi par l'étudiant·e, ou site de travail du modo dans l'espace modo).
const ALL = 'all';
const siteList = () => state.raw?.sites || [];
const ALL_SITES = 'all'; // flash / rendez-vous envoyé par l'admin à tous les sites
const siteShort = (id) => (id === ALL_SITES ? 'Tous les sites' : siteList().find((x) => x.id === id)?.short || id);
const siteFull = (id) => siteList().find((x) => x.id === id)?.name || id;
const defaultSite = () => state.raw?.defaultSite || 'doua';
const publicSite = () => (state.site && state.site !== ALL && siteList().some((x) => x.id === state.site) ? state.site : defaultSite());
// Pages communes à tous les sites : pas de choix de site, tout est ensemble
const UNIFIED = ['droits', 'frise', 'temoignages', 'revendications', 'contacts'];
const unified = () => UNIFIED.includes(route().split('/')[0]);
const scopeSite = () => (unified() ? ALL : route().startsWith('modo') && state.me ? state.modSite || defaultSite() : state.site && siteList().some((x) => x.id === state.site) ? state.site : state.site === ALL ? ALL : defaultSite());
const inScope = (x, sc = scopeSite()) => sc === ALL || x.site === ALL_SITES || (x.site || defaultSite()) === sc;
function applyScope() {
  const r = state.raw;
  if (!r) return;
  const sc = scopeSite();
  const main = sc === ALL ? defaultSite() : sc;
  const f = (arr) => (arr || []).filter((x) => inScope(x, sc));
  state.data = {
    ...r,
    scope: sc,
    buildings: f(r.buildings), events: f(r.events), flashes: f(r.flashes), reports: f(r.reports),
    demands: f(r.demands), contacts: f(r.contacts),
    blocus: r.siteStatus?.[main] || { state: 'auto', effective: 'inconnu', auto: true },
    context: r.contexts?.[main] || null,
    pollsOpen: sc === ALL ? r.pollsOpen : (r.pollsOpenBySite || {})[sc] || 0,
  };
}
// Pastille du site sur une carte quand on regarde « Tous les sites »
const siteTag = (x) => (x.site === ALL_SITES ? '<span class="pill purple site-tag">🌍 Tous les sites</span>' : state.data?.scope === ALL && !unified() ? `<span class="pill grey site-tag">📍 ${esc(siteShort(x.site || defaultSite()))}</span>` : '');
function renderSiteBar() {
  const bar = $('#sitebar');
  if (!bar) return;
  const r = route().split('/')[0];
  const show = state.raw && siteList().length > 1 && !['modo', 'chat', 'plus', 'alertes', ...UNIFIED].includes(r);
  bar.hidden = !show;
  if (!show) return;
  const cur = scopeSite();
  bar.innerHTML = `<div class="sitebar-inner">${[...siteList().map((x) => [x.id, x.short]), [ALL, 'Tous les sites']].map(([id, label]) => `<button data-site="${esc(id)}" class="${id === cur ? 'on' : ''}">${id === ALL ? '🌐 ' : '📍 '}${esc(label)}</button>`).join('')}</div>`;
  bar.onclick = (e) => {
    const id = e.target.closest('[data-site]')?.dataset.site;
    if (!id) return;
    state.site = id; store.set('l1-site', id);
    applyScope(); render(true);
  };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---------- Icônes (traits fins, façon SF Symbols) ----------
const P = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  building: '<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-4h6v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z"/>',
  doc: '<path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5l-5-5Z"/><path d="M14 2.5v5h5M9 13h6M9 17h6"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
  ballot: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8.5 12 2.5 2.5L16 9.5"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6L12 3Z"/><path d="M12 8v5M12 16h.01"/>',
  timeline: '<path d="M6 3v18"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M10 7h10M10 17h7"/>',
  scale: '<path d="M12 3v18M7 21h10M4 7h16"/><path d="m4 7-2.5 6a3 3 0 0 0 5 0L4 7ZM20 7l-2.5 6a3 3 0 0 0 5 0L20 7Z"/>',
  hands: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.4 14a1.5 1.5 0 0 1 2.5-1.6L7 14"/>',
};
const icon = (n, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

const NAV = [
  { id: '', label: 'Live', icon: 'bolt' },
  { id: 'batiments', label: 'Bâtiments', icon: 'building' },
  { id: 'agenda', label: 'AG & manifs', icon: 'calendar' },
  { id: 'chat', label: 'Chat anonyme', icon: 'chat' },
  { id: 'cr', label: 'Comptes rendus', icon: 'doc' },
  { id: 'votes', label: 'Votes anonymes', icon: 'ballot' },
  { id: 'revendications', label: 'Revendications', icon: 'megaphone' },
  { id: 'blog', label: 'Blog & tribunes', icon: 'pen' },
  { id: 'temoignages', label: 'Témoignages', icon: 'shield' },
  { id: 'frise', label: 'Frise de la lutte', icon: 'timeline' },
  { id: 'entraide', label: 'Entraide', icon: 'hands' },
  { id: 'droits', label: 'Tes droits', icon: 'scale' },
  { id: 'contacts', label: 'Parler à qui ?', icon: 'people' },
  { id: 'alertes', label: 'Alertes & notifs', icon: 'bell' },
  { id: 'modo', label: 'Espace modos', icon: 'lock' },
];
const TABS = [
  { id: '', label: 'Live', icon: 'bolt' },
  { id: 'batiments', label: 'Bâtiments', icon: 'building' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'plus', label: 'Plus', icon: 'more' },
];

// ---------- Libellés ----------
const STATUS = {
  bloque: { label: 'BLOQUÉ', pill: 'red', dot: '🔴' },
  partiel: { label: 'PARTIEL', pill: 'orange', dot: '🟠' },
  ouvert: { label: 'OUVERT', pill: 'green', dot: '🟢' },
  inconnu: { label: 'NON RENSEIGNÉ', pill: 'grey', dot: '⚪' },
};
const BLOCUS = {
  actif: 'BLOCUS EN COURS',
  partiel: 'BLOCUS PARTIEL',
  leve: 'PAS DE BLOCUS',
  inconnu: 'SITUATION NON CONFIRMÉE',
  auto: 'AUTOMATIQUE',
};
// Statut réellement affiché (le serveur le déduit des bâtiments en mode automatique)
const blocusNow = (b) => b?.effective || (b?.state === 'auto' ? 'inconnu' : b?.state) || 'inconnu';
const EVENT_TYPE = { AG: ['AG', 'purple'], manif: ['Manif', 'red'], rassemblement: ['Rassemblement', 'orange'], action: ['Action', 'green'], autre: ['Rendez-vous', 'grey'] };
const FLASH_ICO = { decision: '⚖️', vote: '🗳️', info: 'ℹ️', action: '📣', alerte: '🚨' };
const DEMAND_STATUS = { 'en-lutte': ['En lutte', 'red'], obtenu: ['Obtenu ✊', 'green'], refuse: ['Refusé', 'grey'] };

// ---------- Dates (heure de Paris) ----------
const TZ = 'Europe/Paris';
const tgCard = (text = 'Les alertes postées automatiquement, gratuit et sans limite') => (state.data?.telegramUrl ? `<a class="card tg-card" href="${esc(state.data.telegramUrl)}" target="_blank" rel="noopener" style="margin-top:14px"><svg class="tg-logo" viewBox="0 0 24 24" width="38" height="38" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.4 11.7 16.9 7.3c.5-.2 1 .1.8.9l-1.9 9.1c-.1.6-.5.8-1.1.5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9Z" fill="#fff"/></svg><div class="grow"><b>Rejoindre la chaîne Telegram</b><div class="muted small">${esc(text)}</div></div><span class="chev">${icon('chev', 18)}</span></a>` : '');
// Lien Telegram discret : les notifications du téléphone restent le moyen principal
const tgLink = (text = 'Pas de notifs sur ton téléphone ? Les alertes sont aussi sur Telegram') => (state.data?.telegramUrl ? `<a class="tg-link" href="${esc(state.data.telegramUrl)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.4 11.7 16.9 7.3c.5-.2 1 .1.8.9l-1.9 9.1c-.1.6-.5.8-1.1.5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9Z" fill="#fff"/></svg><span>${esc(text)}</span></a>` : '');
// Carte principale : activer les notifications (ou rappel discret si déjà fait)
function notifCard() {
  const on = !!store.get('l1-push', null);
  if (on) return `<a class="card notif-card on" href="#/alertes"><div class="nc-ico">🔔</div><div class="grow"><b>Notifications activées ✓</b><div class="muted small">Tu es prévenu·e dès qu’un bâtiment est bloqué. Régler les sites et les types d’alertes.</div></div><span class="chev">${icon('chev', 18)}</span></a>`;
  return `<a class="card notif-card" href="#/alertes"><div class="nc-ico">🔔</div><div class="grow"><b>Sois prévenu·e dès qu’un bâtiment est bloqué</b><div class="muted small">Une notification sur ton téléphone pour chaque blocage, AG ou alerte. Gratuit, sans compte, sans email.</div><span class="btn red small nc-btn">Activer les notifications</span></div></a>`;
}
const fmt = (iso, o) => new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, ...o });
const hhmm = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit' });
const dayLabel = (iso) => {
  const d = fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt(new Date().toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  const tomorrow = fmt(new Date(Date.now() + 864e5).toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (d === today) return "Aujourd'hui";
  if (d === tomorrow) return 'Demain';
  return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
};
function ago(iso) {
  if (!iso) return 'jamais';
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.max(1, Math.round(s / 3600))} h`;
  return fmt(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const isoDate = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? fmt(`${s}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : s);

// ---------- Navigation ----------
const route = () => location.hash.replace(/^#\/?/, '');
function renderNav() {
  const r = route().split('/')[0];
  const blocked = (state.data?.buildings || []).filter((b) => b.status === 'bloque').length;
  const polls = state.data?.pollsOpen || 0;
  const badge = (id) => (id === 'batiments' && blocked ? `<span class="badge">${blocked}</span>` : id === 'votes' && polls ? `<span class="badge" style="background:var(--blue)">${polls}</span>` : '');
  $('#sidenav').innerHTML = NAV.map((n, i) => `${n.id === 'modo' ? '<div class="sep"></div>' : ''}<a href="#/${n.id}" class="${r === n.id ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span>${badge(n.id)}</a>`).join('');
  const inPlus = !TABS.some((t) => t.id === r) || r === 'plus';
  $('#tabbar').innerHTML = TABS.map((t) => `<a href="#/${t.id}" class="${(t.id === 'plus' ? inPlus : r === t.id) ? 'active' : ''}">${icon(t.icon)}<span>${t.label}</span>${badge(t.id)}</a>`).join('');
}

function renderAlertBar() {
  const bar = $('#alertbar');
  const d = state.data;
  if (!d) return;
  const blocked = d.buildings.filter((b) => b.status === 'bloque');
  const partial = d.buildings.filter((b) => b.status === 'partiel');
  const crowdB = d.buildings.filter((b) => crowdOf(b)?.status === 'bloque');
  const eff = blocusNow(d.blocus);
  if (!blocked.length && !partial.length && !crowdB.length && eff !== 'actif') { bar.hidden = true; setTopOffset(); return; }
  const parts = [];
  if (eff === 'actif') parts.push(`${BLOCUS.actif}${d.blocus.message ? ' : ' + d.blocus.message : ''}`);
  if (blocked.length) parts.push(`BLOQUÉ : ${blocked.map((b) => b.name).join(' · ')}`);
  if (partial.length) parts.push(`PARTIEL : ${partial.map((b) => b.name).join(' · ')}`);
  if (crowdB.length) parts.push(`BLOQUÉ SELON LES PERSONNES SUR PLACE : ${crowdB.map((b) => b.name).join(' · ')}`);
  const txt = esc(parts.join('   ///   '));
  bar.innerHTML = `<span class="tag">ALERTE</span><span class="mask"><span class="ticker"><span>${txt}</span><span aria-hidden="true">${txt}</span></span></span>`;
  bar.onclick = () => (location.hash = '#/batiments');
  bar.hidden = false;
  setTopOffset();
}
// iPhone à encoche / Dynamic Island : l'app installée passe sous la barre d'état.
// Le bandeau rouge prend la zone de la barre d'état (marge « safe area ») et les barres du haut se calent dessous.
function setTopOffset() {
  const bar = $('#alertbar');
  const on = bar && !bar.hidden;
  document.body.classList.toggle('has-alert', !!on);
  document.documentElement.style.setProperty('--top-off', on ? `${bar.offsetHeight}px` : '0px');
  const tb = $('.topbar');
  if (tb) document.documentElement.style.setProperty('--topbar-h', `${tb.offsetHeight}px`);
}
addEventListener('resize', () => setTopOffset());

function setOnline(n) {
  const txt = `${n} connecté·e${n > 1 ? 's' : ''}`;
  $('#online-side').textContent = txt;
  $('#online-top').textContent = txt;
}

// ---------- Rendu ----------
const view = () => $('#view');
// Chat : aucune sélection de texte possible (appui long = menu de réactions), sauf dans la zone de saisie
function chatNoSelect() {
  const on = route().split('/')[0] === 'chat';
  document.documentElement.classList.toggle('no-select', on);
}
document.addEventListener('selectstart', (e) => {
  if (!document.documentElement.classList.contains('no-select')) return;
  if (e.target.closest?.('textarea, input') || e.target.parentElement?.closest?.('textarea, input')) return;
  e.preventDefault();
});
document.addEventListener('selectionchange', () => {
  if (!document.documentElement.classList.contains('no-select')) return;
  const a = document.activeElement;
  if (a && /TEXTAREA|INPUT/.test(a.tagName)) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
});
// Pages où l'on remplit un formulaire : une mise à jour en direct ne les redessine pas (on perdrait ce qui est coché ou tapé)
const FORM_ROUTES = ['alertes', 'temoignages', 'entraide'];
function render(force = false) {
  const active = document.activeElement;
  if (!force && active && view().contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) { state.dirty = true; return; }
  if (!force && FORM_ROUTES.includes(route().split('/')[0])) { applyScope(); renderNav(); renderAlertBar(); return; }
  state.dirty = false;
  // les écouteurs posés par la page précédente sur la zone principale ne doivent pas survivre
  const v = view(); v.onclick = null; v.onsubmit = null; v.oninput = null; v.onchange = null;
  const keepY = force ? null : window.scrollY;
  applyScope();
  chatNoSelect();
  renderNav();
  renderAlertBar();
  renderSiteBar();
  let [r, arg] = route().split('/');
  if (r === 'batiments' && state.me?.role === 'terrain') { history.replaceState(null, '', '#/modo'); r = 'modo'; }
  if (!state.data) { view().innerHTML = '<div class="empty"><div class="big typing mono">_</div>Connexion au flux…</div>'; return; }
  const views = { '': viewLive, batiments: viewBuildings, agenda: viewAgenda, chat: viewChat, cr: arg ? () => viewReport(arg) : viewReports, revendications: viewDemands, votes: () => viewPolls(arg), blog: () => viewBlog(arg), temoignages: viewTestimonies, contacts: viewContacts, alertes: viewAlerts, plus: viewPlus, modo: viewModo, terrain: () => terrainLogin(arg), frise: viewFrise, entraide: () => viewEntraide(arg), droits: viewDroits };
  const out = (views[r] || viewLive)();
  // mise à jour en direct : on reste au même endroit de la page
  if (keepY != null) Promise.resolve(out).then(() => { if (Math.abs(window.scrollY - keepY) > 2) window.scrollTo(0, keepY); });
}
window.addEventListener('hashchange', () => { render(true); window.scrollTo(0, 0); });
document.addEventListener('focusout', () => setTimeout(() => { if (state.dirty && !view().contains(document.activeElement)) render(); }, 50));

// ===== Live =====
function viewLive() {
  const d = state.data;
  const b = d.blocus;
  const blocked = d.buildings.filter((x) => x.status === 'bloque');
  const partial = d.buildings.filter((x) => x.status === 'partiel');
  const open = d.buildings.filter((x) => x.status === 'ouvert');
  const next = d.events.slice(0, 3);
  const lastReport = d.reports[0];
  view().innerHTML = `
    <section class="hero ${esc(blocusNow(b))}">
      <div class="kicker">${d.scope === ALL ? 'Lyon 1 · tous les sites' : esc(siteFull(d.scope))}</div>
      <div class="state" data-glitch="${esc(BLOCUS[blocusNow(b)])}">${esc(BLOCUS[blocusNow(b)])}</div>
      ${b.message ? `<div class="msg">${esc(b.message)}</div>` : '<div class="msg muted">Les infos sont mises à jour en direct par les étudiant·es syndiqué·es.</div>'}
      <div class="meta">${esc(heroMeta(d))}</div>
      <div class="stats">
        <a class="stat red" href="#/batiments"><b>${blocked.length}</b><span>bloqué${blocked.length > 1 ? 's' : ''}</span></a>
        <a class="stat orange" href="#/batiments"><b>${partial.length}</b><span>partiel${partial.length > 1 ? 's' : ''}</span></a>
        <a class="stat green" href="#/batiments"><b>${open.length}</b><span>ouvert${open.length > 1 ? 's' : ''}</span></a>
        <a class="stat" href="#/agenda"><b>${d.events.length}</b><span>RDV</span></a>
      </div>
    </section>

    ${store.get('l1-push', null) ? '' : notifCard()}

    ${d.pollsOpen ? `<a class="card" href="#/votes" style="display:flex;gap:14px;align-items:center;margin-top:14px;color:inherit;border-color:rgba(10,132,255,0.5)"><div style="font-size:28px">🗳️</div><div class="grow"><b>${d.pollsOpen} vote${d.pollsOpen > 1 ? 's' : ''} anonyme${d.pollsOpen > 1 ? 's' : ''} en cours</b><div class="muted small">Un tap, aucune trace. Donne ton avis.</div></div><span class="chev">${icon('chev', 18)}</span></a>` : ''}

    ${d.flashes.length ? `<h2 class="section">⚡ Flash infos</h2>${d.flashes.slice(0, 4).map((f) => `
      <div class="flash ${f.level === 'alerte' ? 'alerte' : f.level === 'ok' ? 'action' : 'vote'}"><div class="ico">${f.level === 'alerte' ? '🚨' : f.level === 'ok' ? '✅' : 'ℹ️'}</div><div><div class="fx">${f.official ? '<span class="pill official-pill">📢 Administration du site</span> ' : ''}${linkify(f.text)}</div><div class="faint small mono">${esc(ago(f.at))} · ${esc(f.org || '')}</div></div></div>`).join('')}` : ''}

    <h2 class="section">${blocked.length ? '🔴' : '🏛️'} Bâtiments bloqués <a href="#/batiments">Tout voir</a></h2>
    ${blocked.length || partial.length
      ? `<div class="chips">${blocked.map((x) => `<span class="pill red">● ${esc(x.name)}</span>`).join('')}${partial.map((x) => `<span class="pill orange">◐ ${esc(x.name)}</span>`).join('')}</div>`
      : '<div class="card muted">Aucun bâtiment signalé bloqué pour l’instant.</div>'}

    <div class="grid cols-2" style="margin-top:24px">
      <div>
        <h2 class="section" style="margin-top:0">📡 Fil en direct</h2>
        <div class="terminal"><div class="bar"><i></i><i></i><i></i><span>lyon1@lutte:~$ tail -f infos.log</span></div>
          <div class="body" id="feed">${d.feed.slice(0, 30).map(feedLine).join('')}<div class="line cursor"></div></div>
        </div>
      </div>
      <div>
        <h2 class="section" style="margin-top:0">📅 Prochains rendez-vous <a href="#/agenda">Agenda</a></h2>
        ${next.length ? `<div class="list">${next.map((e) => `
          <a class="row" href="#/agenda" style="color:inherit">
            <div class="event"><div class="time"><b>${esc(hhmm(e.start))}</b><span>${esc(dayLabel(e.start))}</span></div></div>
            <div class="grow"><span class="pill ${EVENT_TYPE[e.type][1]}">${EVENT_TYPE[e.type][0]}</span><div class="title" style="margin-top:4px">${esc(e.title)}</div><div class="sub">${icon('pin', 13)} ${esc(e.place || 'Lieu à confirmer')}</div></div>
            <span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div>`
          : '<div class="card muted">Aucun rendez-vous annoncé pour le moment.</div>'}
      </div>
    </div>

    ${lastReport ? `<h2 class="section">📝 Dernière AG <a href="#/cr">Tous les CR</a></h2>
      <a class="card" href="#/cr/${esc(lastReport.id)}" style="display:block;color:inherit">
        <div class="kicker">${esc(isoDate(lastReport.date) || 'Compte rendu')}</div>
        <div style="font-weight:700;font-size:20px;margin:6px 0">${esc(lastReport.titre)}</div>
        <div class="muted">${esc(lastReport.resume)}</div>
        <div class="chips" style="margin-top:10px">${lastReport.flashs.slice(0, 3).map((f) => `<span class="pill ${f.type === 'alerte' ? 'red' : 'blue'}">${FLASH_ICO[f.type]} ${esc(f.titre)}</span>`).join('')}</div>
      </a>` : ''}

    ${store.get('l1-push', null) ? notifCard() : ''}
    ${appCardHtml()}
    ${tgLink()}`;
  const f = $('#feed');
  if (f) f.scrollTop = 0;
}
// Texte échappé avec les liens https://… et t.me/… cliquables (ouverts dans un nouvel onglet)
const linkify = (t) => esc(t).replace(/\b(https:\/\/[^\s<]+|t\.me\/[^\s<]+)/g, (u) => {
  const clean = u.replace(/[.,;:!?)»]+$/, ''), rest = u.slice(clean.length);
  const href = clean.startsWith('http') ? clean : `https://${clean}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${clean}</a>${rest}`;
});
const feedLine = (f) => `<div class="line ${esc(f.level)}"><span class="t">[${esc(hhmm(f.at))}]</span> ${esc(f.text)}</div>`;

// Ligne tapée « en direct » dans le terminal.
function typeFeedLine(f) {
  const box = $('#feed');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `line ${f.level}`;
  el.innerHTML = `<span class="t">[${esc(hhmm(f.at))}]</span> <span class="x typing"></span>`;
  box.prepend(el);
  const x = $('.x', el);
  let i = 0;
  const step = () => { x.textContent = f.text.slice(0, ++i); if (i < f.text.length) setTimeout(step, 14); else x.classList.remove('typing'); };
  step();
}

// Ligne « MAJ » de l'accueil : en automatique, le titre suit les bâtiments, donc on montre leur dernière mise à jour
function heroMeta(d) {
  const b = d.blocus || {};
  if (b.auto) {
    const last = (d.buildings || []).filter((x) => x.updatedAt).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
    return last ? `MAJ ${ago(last.updatedAt)} · ${last.name}${last.by ? ' · ' + last.by : ''}` : 'MAJ : pas encore de bâtiment renseigné';
  }
  return `MAJ ${ago(b.updatedAt)}${b.by ? ' · ' + b.by : ''}`;
}

// ===== Bâtiments =====
// Recherche tolérante : sans accents ni majuscules, tous les mots doivent apparaître (nom, note, campus)
const normSearch = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sightCount = (id) => (state.raw?.sightings || []).filter((s) => s.building === id).reduce((n, s) => n + s.count, 0);
function viewBuildings() {
  const d = state.data;
  const campuses = ['Tous', ...new Set(d.buildings.map((b) => b.campus))];
  if (!campuses.includes(state.campus)) state.campus = 'Tous';
  const order = { bloque: 0, partiel: 1, ouvert: 2, inconnu: 3 };
  // Les bâtiments signalés par des étudiant·es remontent en haut (les plus signalés d'abord), puis bloqués, partiels…
  const list = d.buildings.filter((b) => state.campus === 'Tous' || b.campus === state.campus)
    .sort((a, b) => sightCount(b.id) - sightCount(a.id) || order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const count = (s) => d.buildings.filter((b) => b.status === s).length;
  const signaled = list.filter((b) => sightCount(b.id)).length;
  view().innerHTML = `
    <h1 class="large-title">Bâtiments</h1>
    <p class="subtitle">Rouge = bloqué. Mis à jour par les modos sur place. ${count('bloque')} bloqué(s), ${count('partiel')} partiel(s), ${count('ouvert')} ouvert(s).</p>
    <div class="bsearch"><span aria-hidden="true">🔎</span><input type="search" id="bsearch" placeholder="Chercher un bâtiment…" autocomplete="off" enterkeyhint="search" value="${esc(state.bsearch || '')}" aria-label="Chercher un bâtiment"><button type="button" id="bclear" aria-label="Effacer" ${state.bsearch ? '' : 'hidden'}>✕</button></div>
    ${campuses.length > 2 ? `<div class="segmented" id="campus">${campuses.map((c) => `<button data-c="${esc(c)}" class="${c === state.campus ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : '<div id="campus" hidden></div>'}
    ${signaled ? `<p class="sight-hint">👀 ${signaled} bâtiment${signaled > 1 ? 's' : ''} signalé${signaled > 1 ? 's' : ''} par des étudiant·es, en haut de la liste (pas encore confirmé${signaled > 1 ? 's' : ''} par les modos).</p>` : ''}
    <div class="grid cols-3" id="bgrid">${list.map((b) => `
      <div class="bld ${esc(crowdOf(b)?.status || b.status)} ${crowdOf(b) ? 'crowd' : ''} ${sightCount(b.id) ? 'signaled' : ''}" data-q="${esc(normSearch(`${b.name} ${b.note || ''} ${b.campus}`))}">
        <div class="status">${crowdOf(b) ? `${STATUS[crowdOf(b).status].dot} ${STATUS[crowdOf(b).status].label}` : b.yesterday && b.status === 'inconnu' ? '⚪ À CONFIRMER' : `${STATUS[b.status].dot} ${STATUS[b.status].label}`}</div>
        <div class="name">${esc(b.name)}</div>
        <div class="campus">${esc(b.campus)}</div>
        ${crowdOf(b) ? `<div class="crowd-tag">👀 Selon ${crowdOf(b).count} personnes sur place, photos à l’appui · pas encore confirmé par les modos</div>` : ''}
        ${!crowdOf(b) && b.yesterday && b.status === 'inconnu' ? `<div class="yday">Dernière info : ${STATUS[b.yesterday].dot} ${esc(STATUS[b.yesterday].label.toLowerCase())} · à reconfirmer sur place</div>` : ''}
        ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
        <div class="when">${b.updatedAt ? 'MAJ ' + esc(ago(b.updatedAt)) : ''}</div>
        ${sightLine(b)}
        <button class="see-btn" data-see="${esc(b.id)}">👀 Signaler</button>
      </div>`).join('') || '<div class="empty">Aucun bâtiment.</div>'}
    </div>
    <div class="card empty" id="bnone" hidden>Aucun bâtiment ne correspond. Vérifie l’orthographe, ou change de site en haut.</div>
    <p class="faint small" style="margin-top:18px">Tu es devant un bâtiment et l’info est fausse ? Touche « 👀 Signaler ». Avec plusieurs photos, les modos sont prévenu·es. Sans validation en 5 min, l’état peut s’afficher « selon les personnes sur place », sans notification publique.</p>`;
  const input = $('#bsearch');
  const filter = () => {
    state.bsearch = input.value;
    const words = normSearch(input.value).split(' ').filter(Boolean);
    let shown = 0;
    $$('#bgrid .bld').forEach((card) => { const ok = words.every((w) => card.dataset.q.includes(w)); card.hidden = !ok; if (ok) shown++; });
    $('#bnone').hidden = shown > 0 || !words.length;
    $('#bclear').hidden = !input.value;
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  $('#bclear').onclick = () => { input.value = ''; filter(); input.focus(); };
  if (state.bsearch) filter();
  $('#campus').onclick = (e) => { const c = e.target.dataset?.c; if (c) { state.campus = c; render(true); } };
  view().onclick = (e) => { const id = e.target.closest('[data-see]')?.dataset.see; if (id) openSighting(id); };
}

// ===== Agenda =====
function icsFor(e) {
  const d = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const endIso = new Date(new Date(e.start).getTime() + 2 * 3600e3).toISOString();
  const clean = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lyon 1 La Doua en lutte//FR', 'BEGIN:VEVENT', `UID:${e.id}@lyon1-lutte`, `DTSTAMP:${d(new Date().toISOString())}`, `DTSTART:${d(e.start)}`, `DTEND:${d(endIso)}`, `SUMMARY:${clean(`[${EVENT_TYPE[e.type][0]}] ${e.title}`)}`, `LOCATION:${clean([e.place, e.address].filter(Boolean).join(', '))}`, `DESCRIPTION:${clean(e.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
function viewAgenda() {
  const evs = state.data.events;
  const groups = {};
  for (const e of evs) (groups[dayLabel(e.start)] ||= []).push(e);
  view().innerHTML = `
    <h1 class="large-title">AG & manifs</h1>
    <p class="subtitle">Assemblées générales, manifestations, rassemblements et actions annoncés.</p>
    ${evs.length ? Object.entries(groups).map(([day, list]) => `
      <div class="day">${esc(day)}</div>
      ${list.map((e) => `
        <div class="card event ${Date.now() - new Date(e.start) > 2 * 3600e3 ? 'past' : ''}">
          <div class="time"><b>${esc(hhmm(e.start))}</b>${Date.now() - new Date(e.start) > 2 * 3600e3 ? '<span class="pill">passé</span>' : ''}<span>${esc(fmt(e.start, { day: 'numeric', month: 'short' }))}</span></div>
          <div class="grow" style="flex:1;min-width:0">
            <span class="pill ${EVENT_TYPE[e.type][1]}">${EVENT_TYPE[e.type][0]}</span> ${siteTag(e)}
            <div class="title" style="margin-top:6px">${esc(e.title)}</div>
            <div class="place">${icon('pin', 14)} ${esc(e.place || 'Lieu à confirmer')}${e.address ? ' · ' + esc(e.address) : ''}</div>
            ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
            <div class="actions">
              ${e.place || e.address ? `<a class="btn small ghost" target="_blank" rel="noopener" href="https://www.openstreetmap.org/search?query=${encodeURIComponent([e.address || e.place, 'Lyon'].join(' '))}">${icon('pin', 16)} Itinéraire</a>` : ''}
              <button class="btn small ghost" data-ics="${esc(e.id)}">${icon('calendar', 16)} Calendrier</button>
              <button class="btn small ghost" data-share="${esc(e.id)}">${icon('share', 16)} Partager</button>
              <button class="btn small going-btn ${myGoing().includes(e.id) ? 'on' : ''}" data-going="${esc(e.id)}">✋ J’y vais <b class="mono">${e.goingCount || 0}</b></button>
            </div>
            <div class="faint small" style="margin-top:8px">Annoncé par ${esc(e.org || 'les modos')}</div>
          </div>
        </div>`).join('')}`).join('')
    : '<div class="card empty"><div class="big">📅</div>Aucun rendez-vous annoncé.<br>Inscris-toi aux <a href="#/alertes">alertes</a> pour être prévenu·e.</div>'}`;
  view().onclick = async (ev) => {
    const gid = ev.target.closest('[data-going]')?.dataset.going;
    if (gid) return toggleGoing(gid, ev.target.closest('[data-going]'));
    const ics = ev.target.closest('[data-ics]')?.dataset.ics;
    const sh = ev.target.closest('[data-share]')?.dataset.share;
    const e = evs.find((x) => x.id === (ics || sh));
    if (!e) return;
    if (ics) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([icsFor(e)], { type: 'text/calendar' }));
      a.download = `${e.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else {
      const text = `${EVENT_TYPE[e.type][0]} · ${e.title}\n${dayLabel(e.start)} à ${hhmm(e.start)}\n${e.place}${e.address ? ', ' + e.address : ''}`;
      try { if (navigator.share) await navigator.share({ title: e.title, text, url: location.origin + '/#/agenda' }); else { await navigator.clipboard.writeText(`${text}\n${location.origin}/#/agenda`); toast('Copié, colle-le où tu veux.'); } } catch {}
    }
  };
}

// ===== Comptes rendus =====
function viewReports() {
  const rs = state.data.reports;
  view().innerHTML = `
    <h1 class="large-title">Comptes rendus</h1>
    <p class="subtitle">Les AG résumées en flash infos : décisions, votes, prochains rendez-vous.</p>
    ${rs.length ? rs.map((r) => `
      <a class="card" href="#/cr/${esc(r.id)}" style="display:block;color:inherit">
        <div class="kicker">${esc(isoDate(r.date) || ago(r.publishedAt))}${r.lieu ? ' · ' + esc(r.lieu) : ''}</div>
        <div style="font-weight:700;font-size:20px;margin:6px 0">${esc(r.titre)}</div>
        <div class="muted">${esc(r.resume)}</div>
        <div class="chips" style="margin-top:10px">
          <span class="pill blue">${r.flashs.length} flash${r.flashs.length > 1 ? 's' : ''}</span>
          ${r.votes.length ? `<span class="pill purple">${r.votes.length} vote${r.votes.length > 1 ? 's' : ''}</span>` : ''}
          ${r.rdv.length ? `<span class="pill green">${r.rdv.length} rdv</span>` : ''}
          ${r.batiments_bloques.length ? `<span class="pill red">${r.batiments_bloques.length} bât. bloqué(s)</span>` : ''}
        </div>
      </a>`).join('') : '<div class="card empty"><div class="big">📝</div>Aucun compte rendu publié pour le moment.</div>'}`;
}
function viewReport(id) {
  const r = state.data.reports.find((x) => x.id === id);
  if (!r) { view().innerHTML = '<div class="empty">Compte rendu introuvable. <a href="#/cr">Retour</a></div>'; return; }
  const n = (s) => Number(String(s).replace(/\D/g, '')) || 0;
  view().innerHTML = `
    <a href="#/cr" style="display:inline-block;margin-top:10px">‹ Comptes rendus</a>
    <h1 class="large-title">${esc(r.titre)}</h1>
    <p class="subtitle">${esc([isoDate(r.date), r.lieu, r.participants && r.participants + ' participant·es'].filter(Boolean).join(' · '))}</p>
    ${r.resume ? `<div class="card" style="font-size:18px">${esc(r.resume)}</div>` : ''}
    <h2 class="section">⚡ En bref</h2>
    ${r.flashs.map((f, i) => `<div class="flash ${esc(f.type)}" style="animation-delay:${i * 60}ms"><div class="ico">${FLASH_ICO[f.type]}</div><div><div class="ft">${esc(f.titre)}</div><div class="fx">${esc(f.texte)}</div></div></div>`).join('')}
    ${r.votes.length ? `<h2 class="section">🗳️ Votes</h2><div class="card">${r.votes.map((v) => {
      const total = n(v.pour) + n(v.contre) + n(v.abstention) || 1;
      return `<div class="vote"><div class="q">${esc(v.question)} <span class="pill ${v.resultat === 'adopte' ? 'green' : v.resultat === 'rejete' ? 'red' : 'grey'}">${v.resultat === 'adopte' ? 'Adopté' : v.resultat === 'rejete' ? 'Rejeté' : '—'}</span></div>
        ${n(v.pour) + n(v.contre) + n(v.abstention) ? `<div class="bar"><i style="width:${(n(v.pour) / total) * 100}%;background:var(--green)"></i><i style="width:${(n(v.contre) / total) * 100}%;background:var(--red)"></i><i style="width:${(n(v.abstention) / total) * 100}%;background:#636366"></i></div>` : ''}
        <div class="nums"><span>Pour ${esc(v.pour || '?')}</span><span>Contre ${esc(v.contre || '?')}</span><span>Abst. ${esc(v.abstention || '?')}</span></div></div>`;
    }).join('')}</div>` : ''}
    ${r.rdv.length ? `<h2 class="section">📅 Prochains rendez-vous</h2><div class="list">${r.rdv.map((e) => `<div class="row"><span class="pill ${EVENT_TYPE[e.type][1]}">${EVENT_TYPE[e.type][0]}</span><div class="grow"><div class="title">${esc(e.titre)}</div><div class="sub">${esc([isoDate(e.date), e.heure, e.lieu].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>` : ''}
    ${r.batiments_bloques.length ? `<h2 class="section">🔴 Bâtiments bloqués</h2><div class="chips">${r.batiments_bloques.map((b) => `<span class="pill red">● ${esc(b)}</span>`).join('')}</div>` : ''}
    ${r.revendications.length ? `<h2 class="section">✊ Revendications</h2><div class="list">${r.revendications.map((t) => `<div class="row"><div class="grow">${esc(t)}</div></div>`).join('')}</div>` : ''}
    <p class="faint small" style="margin-top:20px">Publié par ${esc(r.org || 'les modos')} · ${esc(ago(r.publishedAt))}${r.source === 'ia' ? ' · mis en forme par IA puis relu par un·e modo' : ''}</p>
    <button class="btn ghost" id="share-cr">${icon('share', 18)} Partager</button>`;
  $('#share-cr').onclick = async () => {
    const text = `${r.titre}\n${r.resume}\n\n${r.flashs.map((f) => `${FLASH_ICO[f.type]} ${f.titre} : ${f.texte}`).join('\n')}`;
    try { if (navigator.share) await navigator.share({ title: r.titre, text, url: location.href }); else { await navigator.clipboard.writeText(`${text}\n\n${location.href}`); toast('Résumé copié.'); } } catch {}
  };
}

// ===== Revendications =====
function viewDemands() {
  const all = state.data.demands;
  const ctx = state.data.context;
  const byOrder = (x, y) => (x.order || 9999) - (y.order || 9999) || x.createdAt.localeCompare(y.createdAt);
  const sorted = [...all].sort(byOrder);
  const cats = [...new Set(sorted.map((d) => d.category))];
  if (state.demandCat !== 'Toutes' && !cats.includes(state.demandCat)) state.demandCat = 'Toutes';
  const mine = store.get('l1-supported', []);
  const shown = state.demandCat === 'Toutes' ? cats : [state.demandCat];
  const paras = (t) => String(t || '').split(/\n{2,}/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
  const item = (d) => `
      <div class="card demand">
        <div class="grow">
          ${d.status !== 'en-lutte' ? `<div class="chips"><span class="pill ${DEMAND_STATUS[d.status][1]}">${DEMAND_STATUS[d.status][0]}</span></div>` : ''}
          <h3>${esc(d.title)}</h3>
          ${d.text ? `<p>${esc(d.text)}</p>` : ''}
          ${siteTag(d)}
        </div>
        <button class="support ${mine.includes(d.id) ? 'done' : ''}" data-id="${esc(d.id)}" aria-label="Soutenir"><span>✊</span><b>${d.support}</b><span>${mine.includes(d.id) ? 'soutenu' : 'soutenir'}</span></button>
      </div>`;
  const won = all.filter((d) => d.status === 'obtenu').length;
  view().innerHTML = `
    <h1 class="large-title">Revendications</h1>
    <p class="subtitle">Ce que porte la mobilisation. Soutiens d’un tap, anonymement.${won ? ` <b style="color:var(--green)">${won} déjà obtenue${won > 1 ? 's' : ''} ✊</b>` : ''}</p>
    ${ctx?.text ? `
    <div class="card context">
      <div class="kicker" style="color:var(--red)">${esc(ctx.title || 'Le contexte')}</div>
      <div class="ctx-body ${state.ctxOpen ? 'open' : ''}">${paras(ctx.text)}</div>
      <button class="btn small ghost" id="ctxToggle" type="button">${state.ctxOpen ? 'Réduire' : 'Lire la suite'}</button>
    </div>` : ''}
    ${ctx?.call ? `<div class="call">${esc(ctx.call)}</div>` : ''}
    ${cats.length > 1 ? `<div class="tabs-inline" id="cats">${['Toutes', ...cats].map((c) => `<button data-c="${esc(c)}" class="${c === state.demandCat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
    ${all.length ? shown.map((c) => `<h2 class="section demand-cat">${esc(c)}</h2>${sorted.filter((d) => d.category === c).map(item).join('')}`).join('')
      : '<div class="card empty"><div class="big">✊</div>Les revendications votées en AG apparaîtront ici.</div>'}
    ${ctx?.closing ? `<div class="card closing">${paras(ctx.closing)}</div>` : ''}
    ${ctx?.source ? `<p class="faint small" style="margin-top:12px">${esc(ctx.source)}</p>` : ''}
    <div class="btn-row" style="margin-top:14px"><button class="btn ghost" id="shareDemands" type="button">${icon('share', 18)} Partager les revendications</button></div>`;
  const cat = $('#cats');
  if (cat) cat.onclick = (e) => { if (e.target.dataset.c) { state.demandCat = e.target.dataset.c; render(true); } };
  if ($('#ctxToggle')) $('#ctxToggle').onclick = () => { state.ctxOpen = !state.ctxOpen; render(true); };
  $('#shareDemands').onclick = async () => {
    const text = cats.map((c) => `${c.toUpperCase()}\n${sorted.filter((d) => d.category === c).map((d) => `• ${d.title}`).join('\n')}`).join('\n\n');
    try { if (navigator.share) await navigator.share({ title: 'Nos revendications · La Doua en lutte', text, url: location.origin + '/#/revendications' }); else { await navigator.clipboard.writeText(`${text}\n\n${location.origin}/#/revendications`); toast('Revendications copiées.'); } } catch {}
  };
  $$('.support').forEach((b) => (b.onclick = async () => {
    try {
      const r = await api(`/api/demands/${b.dataset.id}/support`, { method: 'POST' });
      const m = store.get('l1-supported', []);
      if (!m.includes(b.dataset.id)) store.set('l1-supported', [...m, b.dataset.id]);
      const d = state.data.demands.find((x) => x.id === b.dataset.id);
      if (d) d.support = r.support;
      render(true);
    } catch (e) { toast(e.message); }
  }));
}

// ===== Chat anonyme =====
// Le pseudo est toujours donné par le système (public/nicks.js) : on peut en tirer un autre, pas l'écrire.
function nick() {
  let n = store.get('l1-nick', null);
  if (!isSystemNick(n)) { n = randomNick(); store.set('l1-nick', n); }
  return n;
}
// Stickers : « :code: » dans le texte → image (public/emotes/*.svg). Pas d'emoji standard dans le sélecteur.
const EMOTE_CODES = new Set(EMOTES.map((e) => e.code));
const withEmotes = (escaped) => escaped.replace(/:([a-z0-9]+):/g, (all, c) => (EMOTE_CODES.has(c) ? `<img class="emote" src="/emotes/${c}.svg" alt=":${c}:" title=":${c}:" draggable="false">` : all));
const onlyEmotes = (t) => { const x = t.trim(); return /^(:[a-z0-9]+:\s*){1,3}$/.test(x) && x.match(/:([a-z0-9]+):/g).every((c) => EMOTE_CODES.has(c.slice(1, -1))); };
// Réactions sous un message ; on retient sur le téléphone celles qu'on a posées
const myReacts = () => store.get('l1-reacts', {});
function reactsHtml(m) {
  const r = Object.entries(m.reactions || {}).filter(([, n]) => n > 0);
  const mine = myReacts()[m.id] || [];
  return `<div class="reacts">${r.map(([c, n]) => (EMOTE_CODES.has(c) ? `<button class="react ${mine.includes(c) ? 'on' : ''}" data-react="${esc(c)}"><img src="/emotes/${esc(c)}.svg" alt=":${esc(c)}:"><b>${n}</b></button>` : '')).join('')}</div>`;
}
function msgHtml(m) {
  const me = m.nick === nick() && !m.mod;
  const forMe = m.reply && !me && m.reply.nick === nick();
  return `<div class="msg ${me ? 'me' : ''} ${m.mod ? 'modo' : ''} ${forMe ? 'for-me' : ''}" data-id="${esc(m.id)}">
    <div class="who">${m.mod ? '🛡️ ' : ''}<b>${esc(m.nick)}</b>${m.mod ? ` <span class="pill green" style="padding:1px 6px;font-size:10px">${esc(m.mod)}</span>` : ''} <span class="faint">${esc(hhmm(m.at))}</span>
      <button class="act" data-reply="${esc(m.id)}" aria-label="Répondre">↩ répondre</button><button class="act" data-menu="${esc(m.id)}" aria-label="Réagir">＋ réagir</button>${me ? '' : ` <button class="act rep" data-rep="${esc(m.id)}">signaler</button>`}</div>
    ${m.photo ? snapHtml(m, me) : ''}<div class="bubble ${onlyEmotes(m.text) && !m.reply ? 'jumbo' : ''}" ${m.photo && !m.text && !m.reply ? 'hidden' : ''}>${m.reply ? `<div class="quote" data-goto="${esc(m.reply.id)}"><b>↩ ${esc(m.reply.nick)}</b><span>${withEmotes(esc(m.reply.text))}</span></div>` : ''}${withEmotes(esc(m.text))}</div>${reactsHtml(m)}<span class="swipe-ico" aria-hidden="true">↩</span></div>`;
}
async function viewChat() {
  const chans = state.data.channels;
  if (!chans.some((c) => c.id === state.chatChannel)) state.chatChannel = chans[0]?.id;
  const ch = chans.find((c) => c.id === state.chatChannel);
  view().innerHTML = `
    <div class="chat ${charterOk() ? '' : 'gated'}">
      <div class="chat-head"><h1 class="large-title" style="margin:8px 0 2px">Chat anonyme</h1></div>
      <div class="tabs-inline" id="chans">${chans.map((c) => `<button data-c="${esc(c.id)}" class="${c.id === state.chatChannel ? 'on' : ''}"># ${esc(c.name)}</button>`).join('')}</div>
      <div class="notice">🕶️ Pas de compte, pas d’email. Tu es <b>${esc(nick())}</b> · <a href="#" id="renick">changer</a> · <a href="#" id="charte">📜 charte</a>. Ne donne jamais ton nom, ton numéro étudiant ni d’info qui t’identifie. ${ch ? esc(ch.description) : ''}</div>
      <div class="msgs" id="msgs"><div class="empty faint mono">chargement…</div></div>
      ${charterOk() ? '' : charterHtml(true)}
      <div class="replybar" id="replybar" hidden></div>
      <div class="emote-picker" id="picker" hidden>${EMOTES.map((e) => `<button type="button" data-emote="${esc(e.code)}" title="${esc(e.label)} · :${esc(e.code)}:"><img src="/emotes/${esc(e.code)}.svg" alt="${esc(e.label)}"></button>`).join('')}</div>
      <form class="composer" id="composer" ${charterOk() ? '' : 'hidden'}>
        <button type="button" class="emote-btn" id="emobtn" aria-label="Stickers"><img src="/emotes/mdr.svg" alt=""></button>
        ${navigator.mediaDevices?.getUserMedia ? '<button type="button" class="cam-btn" id="cambtn" aria-label="Prendre une photo">📸</button>' : ''}
        <textarea id="text" rows="1" maxlength="600" placeholder="Message dans #${esc(ch?.name || '')}" aria-label="Message"></textarea>
        <button type="submit" aria-label="Envoyer">${icon('send', 20)}</button>
      </form>
    </div>`;
  $('#chans').onclick = (e) => { const c = e.target.dataset.c; if (c) { state.chatChannel = c; store.set('l1-channel', c); render(true); } };
  $('#renick').onclick = (e) => {
    e.preventDefault();
    let cand = nick();
    sheet(`<h3>Ton pseudo</h3><div class="nick-big" id="nn">${esc(cand)}</div><p class="faint small">Les pseudos sont donnés par le système, pour rester anonyme et éviter les abus. Tire-en un autre autant que tu veux.</p><div class="btn-row"><button type="button" class="btn ghost" id="nrand">🎲 Un autre</button><button type="button" class="btn" id="nok">Garder celui-ci</button></div>`, (root, close) => {
      $('#nrand', root).onclick = () => { cand = randomNick(); $('#nn', root).textContent = cand; };
      $('#nok', root).onclick = () => { store.set('l1-nick', cand); close(); render(true); };
    });
  };
  $('#charte').onclick = (e) => { e.preventDefault(); sheet(charterHtml(false)); };
  if ($('#charter-ok')) {
    $('#charter-chk').onchange = () => { $('#charter-ok').disabled = !$('#charter-chk').checked; };
    $('#charter-ok').onclick = () => { store.set('l1-charte', CHARTER_V); $('#charter-gate').remove(); $('.chat')?.classList.remove('gated'); $('#msgs').scrollTop = 1e9; $('#composer').hidden = false; $('#text').focus(); toast('Bienvenue dans le chat ✊'); };
  }
  loadChatRules();
  const ta = $('#text');
  ta.addEventListener('input', () => {
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    const bad = findBannedLocal(ta.value);
    $('#composer').classList.toggle('banned', !!bad);
    $('#composer').title = bad ? 'Ce message contient un mot interdit par la charte' : '';
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });
  $('#composer').onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    if (!charterOk() && !state.me) return toast('Accepte d’abord la charte du chat.');
    // Liste noire : le message est supprimé ici, il ne part jamais
    const bad = findBannedLocal(text) || findBannedLocal(nick());
    if (bad) {
      ta.value = ''; ta.style.height = '';
      const c = $('#composer'); c.classList.remove('banned', 'shake'); void c.offsetWidth; c.classList.add('shake');
      toast('🚫 Message supprimé : il contient un mot ou une expression interdits par la charte du chat.');
      return;
    }
    const btn = $('#composer button[type=submit]');
    btn.disabled = true;
    try { await api('/api/chat', { method: 'POST', body: { channel: state.chatChannel, nick: nick(), text, charter: charterOk(), replyTo: state.replyTo?.id } }); ta.value = ''; ta.style.height = ''; setReply(null); $('#picker').hidden = true; }
    catch (err) { toast(err.message); if (/charte/.test(err.message) && /bloqué/.test(err.message)) ta.value = ''; }
    btn.disabled = false;
    ta.focus();
  };
  // Stickers
  $('#emobtn').onclick = () => { $('#picker').hidden = !$('#picker').hidden; };
  if ($('#cambtn')) $('#cambtn').onclick = () => openCamera();
  $('#picker').onclick = (e) => {
    const c = e.target.closest('[data-emote]')?.dataset.emote;
    if (!c) return;
    const st = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? st;
    const before = ta.value.slice(0, st), ins = `${before && !/\s$/.test(before) ? ' ' : ''}:${c}: `;
    ta.value = before + ins + ta.value.slice(en);
    ta.focus(); ta.selectionStart = ta.selectionEnd = st + ins.length;
    ta.dispatchEvent(new Event('input'));
  };
  // Répondre à un message
  function setReply(m) {
    state.replyTo = m;
    const bar = $('#replybar');
    if (!bar) return;
    bar.hidden = !m;
    bar.innerHTML = m ? `<div class="grow">↩ Réponse à <b>${esc(m.nick)}</b><span>${withEmotes(esc(m.text.slice(0, 100)))}</span></div><button type="button" id="replyx" aria-label="Annuler la réponse">✕</button>` : '';
    if (m) { $('#replyx').onclick = () => setReply(null); ta.focus(); }
  }
  setReply(null);

  // ---- Réactions ----
  async function react(id, code) {
    try {
      const r = await api(`/api/chat/${encodeURIComponent(id)}/react`, { method: 'POST', body: { emote: code } });
      const mine = myReacts(); const l = new Set(mine[id] || []);
      if (r.on) l.add(code); else l.delete(code);
      mine[id] = [...l]; if (!l.size) delete mine[id];
      const keys = Object.keys(mine); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete mine[k];
      store.set('l1-reacts', mine);
      updateReacts(id, r.reactions);
    } catch (err) { toast(err.message); }
  }
  const QUICK = ['poing', 'mdr', 'coeur', 'feu', 'cheh', 'choc', 'gg'];
  function openMenu(id) {
    closeMenu();
    const el = $(`.msg[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    navigator.vibrate?.(12);
    el.classList.add('held');
    const me = el.classList.contains('me');
    const pop = document.createElement('div');
    pop.className = 'react-pop';
    pop.innerHTML = `<div class="react-quick">${QUICK.map((c) => `<button data-pick="${c}"><img src="/emotes/${c}.svg" alt=":${c}:"></button>`).join('')}<button class="more" data-more aria-label="Tous les stickers">＋</button></div>
      <div class="react-all" hidden>${EMOTES.map((e) => `<button data-pick="${esc(e.code)}" title="${esc(e.label)}"><img src="/emotes/${esc(e.code)}.svg" alt=""></button>`).join('')}</div>
      <div class="react-acts"><button data-do="reply">↩ Répondre</button>${me ? '' : '<button data-do="report">⚑ Signaler</button>'}</div>`;
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect();
    const w = Math.min(330, innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, me ? r.right - w : r.left)) + 'px';
    const top = r.top - pop.offsetHeight - 8;
    pop.style.top = (top > 60 ? top : Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 8)) + 'px';
    const shade = document.createElement('div');
    shade.className = 'react-shade';
    document.body.appendChild(shade);
    const openedAt = Date.now();
    shade.onclick = () => { if (Date.now() - openedAt > 500) closeMenu(); };
    pop.onclick = async (e) => {
      if (e.target.closest('[data-more]')) { $('.react-all', pop).hidden = false; $('.react-quick', pop).hidden = true; return; }
      const c = e.target.closest('[data-pick]')?.dataset.pick;
      const d = e.target.closest('[data-do]')?.dataset.do;
      closeMenu();
      if (c) react(id, c);
      if (d === 'reply') replyTo(id);
      if (d === 'report' && confirm('Signaler ce message aux modos ?')) { try { await api(`/api/chat/${id}/report`, { method: 'POST' }); toast('Merci, les modos vont regarder.'); } catch (err) { toast(err.message); } }
    };
  }
  function closeMenu() { $$('.react-pop, .react-shade').forEach((x) => x.remove()); $$('.msg.held').forEach((x) => x.classList.remove('held')); }
  window.__closeReactMenu = closeMenu;
  if (!window.__reactHashOn) { window.__reactHashOn = true; window.addEventListener('hashchange', () => window.__closeReactMenu?.()); }
  function replyTo(rid) {
    const el = $(`.msg[data-id="${CSS.escape(rid)}"]`);
    const m = (state.chatMsgs || []).find((x) => x.id === rid) || (el && { id: rid, nick: $('.who b', el).textContent, text: $('.bubble', el).innerText });
    if (m) setReply({ id: m.id, nick: m.nick, text: m.text });
  }

  // ---- Gestes : glisser vers la droite = répondre (comme Insta), appui long = réactions ----
  const box = $('#msgs');
  if (matchMedia('(hover: none)').matches && charterOk() && !store.get('l1-chat-tip', false)) { store.set('l1-chat-tip', true); setTimeout(() => toast('Astuce : glisse un message vers la droite pour répondre, garde le doigt dessus pour réagir'), 800); }
  let g = null;
  box.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.msg');
    if (!el || e.target.closest('button, a, .quote') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    g = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, dx: 0, swiping: false, pid: e.pointerId };
    g.timer = setTimeout(() => { if (g && !g.swiping) { const id = g.id; g = null; openMenu(id); } }, 450);
  });
  box.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.pid) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.swiping && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) clearTimeout(g.timer);
    if (!g.swiping && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) { g.swiping = true; g.el.classList.add('swiping'); try { box.setPointerCapture(g.pid); } catch {} }
    if (!g.swiping) { if (Math.abs(dy) > 10) g = null; return; }
    g.dx = Math.max(0, Math.min(90, dx * 0.7));
    g.el.style.setProperty('--sx', g.dx + 'px');
    g.el.classList.toggle('armed', g.dx > 55);
    if (g.dx > 55 && !g.buzz) { g.buzz = true; navigator.vibrate?.(8); }
  });
  const end = () => {
    if (!g) return;
    clearTimeout(g.timer);
    const { el, id, dx, swiping } = g;
    g = null;
    if (!swiping) return;
    el.classList.remove('swiping', 'armed');
    el.style.setProperty('--sx', '0px');
    if (dx > 55) replyTo(id);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('contextmenu', (e) => { const el = e.target.closest('.msg'); if (el) { e.preventDefault(); if (!$('.react-pop')) openMenu(el.dataset.id); } });

  $('#msgs').onclick = async (e) => {
    const sp = e.target.closest('[data-snap]');
    if (sp) return openSnap(sp.dataset.snap);
    const rc = e.target.closest('[data-react]');
    if (rc) return react(rc.closest('.msg').dataset.id, rc.dataset.react);
    const mid = e.target.closest('[data-menu]')?.dataset.menu;
    if (mid) return openMenu(mid);
    const rid = e.target.closest('[data-reply]')?.dataset.reply;
    if (rid) return replyTo(rid);
    const go = e.target.closest('[data-goto]')?.dataset.goto;
    if (go) {
      const t = $(`.msg[data-id="${CSS.escape(go)}"]`);
      if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
      else toast('Message trop ancien ou retiré.');
      return;
    }
    const id = e.target.dataset.rep;
    if (!id) return;
    if (!confirm('Signaler ce message aux modos ?')) return;
    try { await api(`/api/chat/${id}/report`, { method: 'POST' }); toast('Merci, les modos vont regarder.'); } catch (err) { toast(err.message); }
  };
  try {
    const channel = state.chatChannel;
    const msgs = await api(`/api/chat/${encodeURIComponent(channel)}`);
    if (channel !== state.chatChannel || !$('#msgs')) return;
    state.chatMsgs = msgs;
    $('#msgs').innerHTML = msgs.length ? msgs.map(msgHtml).join('') : '<div class="empty faint">Personne n’a encore écrit ici. Lance la discussion 👋</div>';
    $('#msgs').scrollTop = 1e9;
  } catch (err) { $('#msgs').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
function onChat(m) {
  if (route().split('/')[0] !== 'chat' || m.channel !== state.chatChannel) return;
  const box = $('#msgs');
  if (!box) return;
  if ($(`[data-id="${CSS.escape(m.id)}"]`, box)) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!$('.msg', box)) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', msgHtml(m));
  (state.chatMsgs ||= []).push(m);
  if (near || m.nick === nick()) box.scrollTop = 1e9;
}

// ===== Contacts =====
function viewContacts() {
  // Tous les sites ensemble ; un même contact saisi sur plusieurs sites n'apparaît qu'une fois
  const seen = new Set();
  const cs = state.data.contacts.filter((c) => { const k = `${c.name}|${c.link || c.how || ''}`.toLowerCase().replace(/\s+/g, ' ').trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  view().innerHTML = `
    <h1 class="large-title">Parler à qui ?</h1>
    <p class="subtitle">Syndicats, collectifs, soutien. Tu n’es pas seul·e.</p>
    ${cs.length ? `<div class="list">${cs.map((c) => `
      <div class="row"><div style="font-size:26px">✊</div><div class="grow"><div class="title">${esc(c.name)}</div>${c.role ? `<div class="sub">${esc(c.role)}</div>` : ''}${c.how ? `<div class="sub" style="color:var(--text)">${esc(c.how)}</div>` : ''}</div>
      ${c.link ? `<a class="btn small ghost" href="${esc(c.link)}" target="_blank" rel="noopener">Contacter</a>` : ''}</div>`).join('')}</div>`
      : '<div class="card muted">Les syndicats et collectifs ajouteront leurs contacts ici.</div>'}
    <h2 class="section">🕶️ Parler anonymement</h2>
    <a class="card" href="#/chat" style="display:block;color:inherit">Le <b>chat anonyme</b> est ouvert à tou·tes, sans compte. Salon <b>#Entraide</b> pour les cours, partiels, logement, soutien.</a>
    ${notifCard()}
    ${tgLink('Les alertes sont aussi sur la chaîne Telegram')}
    <h2 class="section">🆘 Urgences & écoute</h2>
    <div class="list">
      <a class="row" href="tel:112" style="color:inherit"><div class="grow"><div class="title">112</div><div class="sub">Urgences (police, pompiers, SAMU)</div></div><span class="pill red">Appeler</span></a>
      <a class="row" href="tel:15" style="color:inherit"><div class="grow"><div class="title">15</div><div class="sub">SAMU, urgence médicale</div></div><span class="pill red">Appeler</span></a>
      <a class="row" href="tel:3114" style="color:inherit"><div class="grow"><div class="title">3114</div><div class="sub">Prévention du suicide, 24 h/24, gratuit</div></div><span class="pill blue">Appeler</span></a>
      <a class="row" href="tel:0800235236" style="color:inherit"><div class="grow"><div class="title">Fil Santé Jeunes · 0 800 235 236</div><div class="sub">Écoute anonyme et gratuite pour les 12-25 ans</div></div><span class="pill blue">Appeler</span></a>
    </div>`;
}

// ===== Alertes : notifications sur le téléphone + email =====
async function viewAlerts() {
  const d = state.data;
  const sitesAll = siteList();
  const saved = store.get('l1-push', null);
  const savedSites = saved?.sites || [publicSite()];
  const sub = await currentPushSub().catch(() => null);
  const on = !!sub && !!saved;
  const kinds = saved?.kinds || ['buildings', 'urgent', 'events', 'reports'];
  const KINDS = [['buildings', '🔴 Bâtiments bloqués / rouverts et blocus'], ['urgent', '🚨 Alertes urgentes (danger, nasse, changement de dernière minute)'], ['events', '📣 Nouvelles AG, manifs, rassemblements'], ['reports', '📝 Comptes rendus d’AG']];
  const iosNeedsInstall = isIOS && !isStandalone();
  view().innerHTML = `
    <h1 class="large-title">Alertes</h1>
    <p class="subtitle">Un bâtiment est bloqué ? Ton téléphone vibre tout de suite. Gratuit, anonyme, sans compte.</p>
    <div class="card" style="border-color:${on ? 'rgba(48,209,88,0.5)' : 'rgba(255,69,58,0.5)'}">
      <div class="kicker">📳 Notifications sur ton téléphone <span class="pill ${on ? 'green' : 'grey'}" style="margin-left:6px">${on ? 'activées' : 'désactivées'}</span></div>
      ${iosNeedsInstall ? `<p class="notice" style="margin-top:10px">Sur iPhone, il faut d’abord <b>ajouter l’app à l’écran d’accueil</b>, puis l’ouvrir depuis l’icône pour activer les notifications.</p><button class="btn red" data-install type="button">📲 Comment l’installer</button>` : `
      <div style="margin-top:8px">${KINDS.map(([k, l]) => `<label class="check"><input type="checkbox" name="pk" value="${k}" ${kinds.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="field" style="margin-top:6px"><label>Sites suivis (aucun coché = tous)</label></div>
      ${sitesAll.map((x) => `<label class="check"><input type="checkbox" name="pc" value="${esc(x.id)}" ${savedSites.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn ${on ? 'green' : 'red'}" id="pushOn" type="button">${on ? '✓ Mettre à jour' : '🔔 Activer les notifications'}</button>
        ${on ? '<button class="btn ghost" id="pushTest" type="button">Tester</button><button class="btn ghost" id="pushOff" type="button">Désactiver</button>' : ''}
      </div>
      <p class="faint small">Aucune donnée perso : ton téléphone reçoit les alertes, c’est tout. Tu peux les couper ici ou dans les réglages.</p>`}
    </div>
    ${appCardHtml()}
    <h2 class="section">✉️ Ou par email : le récap du matin</h2>
    <div class="card">
      ${d.mailEnabled && d.emailSpots <= 0 ? '<p class="muted" style="margin:0">📭 La liste email est <b>complète</b> (places limitées par la version gratuite). Active les notifications ci-dessus ou rejoins la chaîne Telegram : c’est gratuit et sans limite.</p>' : d.mailEnabled ? `<p class="muted small" style="margin:0 0 10px">${d.emailMode === 'digest' ? `Un seul email chaque matin vers ${d.digestHour} h : bâtiments bloqués, AG et manifs du jour, alertes de la veille.` : 'Un email à chaque changement.'} <b>${d.emailSpots} place${d.emailSpots > 1 ? 's' : ''} restante${d.emailSpots > 1 ? 's' : ''}.</b></p><form class="form" id="sub">
        <div class="field"><label for="email">Ton email (perso ou étudiant)</label><input type="email" id="email" required autocomplete="email" placeholder="prenom.nom@exemple.fr"></div>
        <div>${[['buildings', '🔴 Bâtiments bloqués / rouverts et blocus'], ['events', '📣 Nouvelles AG, manifs, rassemblements'], ['reports', '📝 Comptes rendus d’AG']].map(([k, l]) => `<label class="check"><input type="checkbox" name="a" value="${k}" checked> ${l}</label>`).join('')}</div>
        <div><div class="field"><label>Sites suivis (aucun coché = tous)</label></div>
          ${sitesAll.map((x) => `<label class="check"><input type="checkbox" name="c" value="${esc(x.id)}" ${x.id === publicSite() ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}
        </div>
        <button class="btn ghost">✉️ M’inscrire par email</button>
        <p class="faint small">Ton email sert uniquement à ces alertes. Il n’est jamais affiché ni transmis. Tu recevras un email de confirmation. Les emails gratuits sont limités par jour : les notifications restent le moyen le plus sûr.</p>
      </form>` : '<p class="muted" style="margin:0">Les alertes par email ne sont pas encore activées. Active les notifications ci-dessus : c’est plus rapide.</p>'}
    </div>
    ${tgLink('Pas de notifs possibles sur ton téléphone ? Les alertes sont aussi sur Telegram')}
    `;
  const pick = (n) => $$(`input[name=${n}]:checked`).map((x) => x.value);
  if ($('#pushOn')) $('#pushOn').onclick = async (e) => {
    e.target.disabled = true;
    try { if (await enablePush(pick('pk'), pick('pc'))) { toast('Notifications activées ✊'); viewAlerts(); } }
    catch (err) {
      console.warn('push', err);
      toast(/denied|permission/i.test(err.message || '') ? 'Notifications bloquées : autorise-les dans les réglages du navigateur, puis réessaie.' : 'Activation impossible sur ce navigateur. Essaie Chrome (Android) ou l’app installée (iPhone).');
    }
    e.target.disabled = false;
  };
  if ($('#pushOff')) $('#pushOff').onclick = async () => { await disablePush(); toast('Notifications désactivées.'); viewAlerts(); };
  if ($('#pushTest')) $('#pushTest').onclick = async () => {
    const s2 = await currentPushSub();
    try { await api('/api/push/subscribe', { method: 'POST', body: { subscription: s2.toJSON(), kinds: pick('pk'), sites: pick('pc') } }); } catch {}
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.showNotification('Test · La Doua en lutte', { body: 'Les notifications marchent ✊', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png' });
  };
  if ($('#sub')) $('#sub').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#sub button');
    btn.disabled = true;
    try {
      const r = await api('/api/subscribe', { method: 'POST', body: { email: $('#email').value, alerts: pick('a'), sites: pick('c') } });
      $('#sub').innerHTML = `<div class="empty"><div class="big">✅</div>${esc(r.message)}</div>`;
    } catch (err) { toast(err.message); btn.disabled = false; }
  };
}

// ===== Menu « Plus » (mobile) =====
function viewPlus() {
  const items = NAV.filter((n) => !TABS.some((t) => t.id === n.id));
  const sub = { votes: 'Donne ton avis, anonymement', blog: 'Articles et tribunes', temoignages: 'Violences : témoigner', frise: 'La mobilisation jour par jour', entraide: 'Je propose / je cherche', droits: 'Absences, examens, interpellation', cr: 'Les AG en flash infos', revendications: 'Soutiens les revendications', contacts: 'Syndicats, écoute, urgences', alertes: 'Notifs quand un bâtiment est bloqué', modo: 'Accès syndicats' };
  view().innerHTML = `<h1 class="large-title">Plus</h1><p class="subtitle">Tout ce qu’il faut savoir sur la mobilisation.</p>
    <div class="menu-grid">${items.map((n) => `<a href="#/${n.id}">${icon(n.icon)}<span>${n.label}<br><small>${sub[n.id] || ''}</small></span></a>`).join('')}</div>
    ${notifCard()}
    ${tgLink('Les alertes sont aussi sur la chaîne Telegram')}`;
}

// ---------- Feuille modale ----------
function sheet(html, setup) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const openedAt = Date.now();
  function k(e) { if (e.key === 'Escape') close(); }
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', k); window.removeEventListener('hashchange', close); };
  window.addEventListener('hashchange', close);
  $('.sheet-backdrop', root).onclick = (e) => { if (e.target.classList.contains('sheet-backdrop') && Date.now() - openedAt > 500) close(); };
  document.addEventListener('keydown', k);
  setup?.($('.sheet', root), close);
  $('.sheet input, .sheet textarea', root)?.focus();
}

// =====================================================================
// Espace modos
// =====================================================================
const MOD_TABS = [
  ['situation', '🚧 Bâtiments'], ['instagram', '📷 Instagram'], ['story', '📸 Story Insta'], ['agenda', '📅 Agenda'], ['cr', '🤖 CR + IA'], ['flash', '⚡ Flash'],
  ['votes', '🗳️ Votes'], ['blog', '✍️ Blog'], ['temoignages', '🛡️ Témoignages'], ['entraide', '🤝 Entraide'], ['droits', '⚖️ Page droits'], ['revendications', '✊ Revendications'], ['contacts', '📇 Contacts'], ['chat', '🛡️ Chat'], ['comptes', '👥 Comptes'], ['sites', '📍 Sites'], ['audience', '📊 Audience'], ['journal', '📜 Journal'], ['moi', '🔑 Mon compte'],
];
async function viewModo() {
  if (!state.me) {
    view().innerHTML = `
      <h1 class="large-title">Espace modos</h1>
      <p class="subtitle">Réservé aux étudiant·es syndiqué·es et collectifs habilités. Les comptes sont créés par l’admin du site.</p>
      <div class="card" style="max-width:420px">
        <form class="form" id="login">
          <div class="field"><label for="u">Identifiant</label><input type="text" id="u" autocomplete="username" autocapitalize="none" required></div>
          <div class="field"><label for="p">Mot de passe</label><input type="password" id="p" autocomplete="current-password" required></div>
          <button class="btn neon">&gt; connexion_</button>
        </form>
      </div>`;
    $('#login').onsubmit = async (e) => {
      e.preventDefault();
      try { state.me = await api('/api/auth/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } }); try { sessionStorage.removeItem('l1-modpush-ask'); } catch {} toast(`Connecté·e : ${state.me.org}`); render(true); }
      catch (err) { toast(err.message); }
    };
    return;
  }
  const isAdm = state.me.role === 'admin';
  const isTerrain = state.me.role === 'terrain';
  // le compte piquet a sa propre page, calquée sur la page publique Bâtiments
  if (isTerrain) { if (!state.modSite) state.modSite = (state.me.sites || [])[0] || defaultSite(); return viewTerrain(); }
  const tabs = isTerrain ? [['situation', '🚧 Bâtiments']] : MOD_TABS.filter(([id]) => (!['comptes', 'sites', 'audience', 'instagram'].includes(id) || isAdm));
  // Sites où ce modo peut agir (l'admin : tous). Le site de travail est choisi ici et s'applique à tous les onglets.
  const mySites = isAdm ? siteList().map((x) => x.id) : (state.me.sites || []).filter((id) => siteList().some((x) => x.id === id));
  if (!mySites.includes(state.modSite)) { state.modSite = mySites.includes(store.get('l1-modsite', '')) ? store.get('l1-modsite', '') : mySites[0] || defaultSite(); applyScope(); }
  view().innerHTML = `
    <h1 class="large-title">${isTerrain ? 'Bâtiments' : 'Espace modos'}</h1>
    <p class="subtitle mono small">${esc(state.me.username)} · ${esc(state.me.org)}${isTerrain ? ' · compte piquet' : ` · ${isAdm ? 'admin (tous les sites)' : 'modo'} · <span id="mstats">…</span>`}</p>
    <div class="modsites" id="msites"><span class="faint small">Tu agis sur :</span>${mySites.map((id) => `<button data-ms="${esc(id)}" class="${id === state.modSite ? 'on' : ''}">📍 ${esc(siteShort(id))}</button>`).join('')}</div>
    ${isTerrain ? '' : `<a class="guide-link" href="/api/mod/guide.pdf" target="_blank" rel="noopener">📘 Guide des modos (PDF) : comment faire, à faire / à ne jamais faire</a>
    <div id="modpush"></div>
    <div class="presence" id="presence" hidden></div>
    <div class="tabs-inline" id="mtabs">${tabs.map(([id, l]) => `<button data-t="${id}" class="${id === state.modTab ? 'on' : ''}">${l}</button>`).join('')}</div>`}
    <div id="mod"></div>`;
  // le compte piquet n'a pas d'onglets
  const mtabs = $('#mtabs');
  if (mtabs) mtabs.onclick = (e) => { if (e.target.dataset.t) { state.modTab = e.target.dataset.t; render(true); } };
  $('#msites').onclick = (e) => { const id = e.target.closest('[data-ms]')?.dataset.ms; if (id) { state.modSite = id; store.set('l1-modsite', id); applyScope(); render(true); } };
  showPresence();
  modPushCard();
  api('/api/mod/stats').then((s) => { const el = $('#mstats'); if (el) el.innerHTML = `${s.pushSubs} téléphone(s) · ${s.subscribers} email(s) · ${s.aiEnabled ? 'IA ' + esc(s.aiProviders.join(' → ')) : 'sans IA'} · emails ${s.mailProvider ? `${esc(s.mailProvider)} ${s.mailQuota.used}/${s.mailQuota.limit} aujourd’hui` : 'OFF'} · stockage ${s.storage === 'temporaire' ? '<b style="color:var(--red)">TEMPORAIRE (configure Supabase !)</b>' : esc(s.storage)}${s.reported ? ` · ${s.reported} msg signalé(s)` : ''}`; }).catch(() => {});
  const fn = { story: modStory, instagram: modInstagram, votes: modPolls, blog: modBlog, temoignages: modTestimonies, entraide: modEntraide, droits: modDroits, situation: modSituation, agenda: modAgenda, cr: modReports, flash: modFlash, revendications: modDemands, contacts: modContacts, chat: modChat, comptes: modAccounts, sites: modSites, audience: modAudience, journal: modJournal, moi: modMe }[state.modTab] || modSituation;
  try { await fn($('#mod')); } catch (err) { if (/Connexion modo/.test(err.message)) { state.me = null; render(true); } else toast(err.message); }
}
// Autres modos connectés sur les mêmes sites : on le voit pour ne pas se marcher dessus
async function showPresence() {
  try {
    const list = await api('/api/mod/presence');
    const el = $('#presence');
    if (!el) return;
    el.hidden = !list.length;
    el.innerHTML = list.length ? `👥 Aussi connecté·e${list.length > 1 ? 's' : ''} en ce moment : ${list.map((x) => `<b>${esc(x.org)}</b> (${esc(x.sites.join(', '))})`).join(' · ')}. Si vous modifiez la même chose, le site empêche d'écraser le travail de l'autre.` : '';
  } catch {}
}
setInterval(() => { if (route().startsWith('modo') && state.me && !document.hidden) showPresence(); }, 45000);
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message); throw e; } };

// Compte piquet : même écran que la page publique « Bâtiments », rien d'autre.
// Toucher un bâtiment ouvre directement la caméra (pas d'import possible), puis on choisit l'état sur la photo.
async function viewTerrain() {
  const el = view();
  if (!el.querySelector('#terrain-grid')) el.innerHTML = '<div class="empty mono typing">Chargement des bâtiments…</div>';
  let list, notes = [];
  try { const r = await api('/api/mod/terrain/buildings'); list = r.buildings || []; notes = r.notes || []; }
  catch (e) { if (/Connexion modo/.test(e.message)) { state.me = null; return render(true); } el.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  const campuses = ['Tous', ...new Set(list.map((b) => b.campus))];
  if (!campuses.includes(state.tcampus)) state.tcampus = 'Tous';
  const count = (st) => list.filter((b) => b.status === st).length;
  el.innerHTML = `
    <h1 class="large-title">Bâtiments</h1>
    <p class="subtitle">📍 Compte piquet · ${esc(state.me.org)}. Touche un bâtiment, vise l’entrée et touche 🔴 🟠 🟢 : photo et envoi en un seul geste. ${count('bloque')} bloqué(s), ${count('partiel')} partiel(s), ${count('ouvert')} ouvert(s).</p>
    <div class="bsearch"><span aria-hidden="true">🔎</span><input type="search" id="terrain-search" placeholder="Chercher un bâtiment…" autocomplete="off" enterkeyhint="search" value="${esc(state.tsearch || '')}" aria-label="Chercher un bâtiment"><button type="button" id="terrain-clear" aria-label="Effacer" ${state.tsearch ? '' : 'hidden'}>✕</button></div>
    ${campuses.length > 2 ? `<div class="segmented" id="terrain-campus">${campuses.map((c) => `<button data-c="${esc(c)}" class="${c === state.tcampus ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div class="grid cols-3" id="terrain-grid"></div>
    <p class="faint small" style="margin-top:18px">📷 Photo prise sur le moment obligatoire : l’import depuis la galerie est impossible. La photo n’est vue que par les modos et effacée après 24 h.</p>
    <div class="btn-row" style="margin-top:8px"><button type="button" class="btn ghost" id="terrain-add">＋ Bâtiment absent de la liste</button><button type="button" class="btn ghost" id="terrain-out">Se déconnecter</button></div>`;
  const order = { bloque: 0, partiel: 1, ouvert: 2, inconnu: 3 };
  const draw = () => {
    const words = normSearch(state.tsearch).split(' ').filter(Boolean);
    const shown = list.filter((b) => (state.tcampus === 'Tous' || b.campus === state.tcampus) && words.every((w) => normSearch(`${b.name} ${b.note || ''} ${b.campus}`).includes(w)))
      .sort((a, b) => order[a.status] - order[b.status] || (b.yesterday ? 1 : 0) - (a.yesterday ? 1 : 0) || a.name.localeCompare(b.name));
    $('#terrain-grid').innerHTML = shown.map((b) => `
      <div class="bld ${esc(b.status)}" data-update="${esc(b.id)}">
        <div class="status">${b.yesterday && b.status === 'inconnu' ? '⚪ À CONFIRMER' : `${STATUS[b.status].dot} ${STATUS[b.status].label}`}</div>
        <div class="name">${esc(b.name)}</div>
        <div class="campus">${esc(b.campus)}</div>
        ${b.yesterday && b.status === 'inconnu' ? `<div class="yday">Dernière info : ${STATUS[b.yesterday].dot} ${esc(STATUS[b.yesterday].label.toLowerCase())} · à reconfirmer</div>` : ''}
        ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
        <div class="when">${b.updatedAt ? 'MAJ ' + esc(ago(b.updatedAt)) : ''}</div>
        <button class="see-btn" data-update="${esc(b.id)}">📷 Mettre à jour</button>
      </div>`).join('') || `<div class="card empty">${words.length ? 'Aucun bâtiment ne correspond.' : 'Aucun bâtiment.'}</div>`;
  };
  draw();
  const input = $('#terrain-search');
  input.oninput = () => { state.tsearch = input.value; $('#terrain-clear').hidden = !input.value; draw(); };
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
  $('#terrain-clear').onclick = () => { input.value = ''; state.tsearch = ''; $('#terrain-clear').hidden = true; draw(); input.focus(); };
  $('#terrain-campus')?.addEventListener('click', (e) => { const c = e.target.dataset.c; if (c) { state.tcampus = c; $$('#terrain-campus button').forEach((x) => x.classList.toggle('on', x.dataset.c === c)); draw(); } });
  $('#terrain-out').onclick = async () => { if (!confirm('Se déconnecter du compte piquet ?')) return; await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); state.me = null; location.hash = '#/batiments'; render(true); };
  $('#terrain-add').onclick = () => sheet(`<h2 style="margin:0 0 10px">＋ Bâtiment absent</h2>
      <form class="form" id="terrain-add-form"><div class="field"><label>Nom du bâtiment</label><input type="text" id="terrain-add-name" maxlength="80" required placeholder="Ex : Hall des sciences"></div>
      <button class="btn" type="submit" style="width:100%">Ajouter</button></form>`, (root, close) => {
    $('#terrain-add-form', root).onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#terrain-add-name', root).value.trim();
      if (!name) return;
      const siteOfFilter = state.tcampus !== 'Tous' ? (list.find((x) => x.campus === state.tcampus)?.site || state.modSite) : state.modSite;
      try { const nb = await api('/api/mod/terrain/buildings', { method: 'POST', body: { name, site: siteOfFilter } }); list.push(nb); close(); toast(`✅ Ajouté : ${nb.name}`); draw(); } catch (err) { toast(err.message); }
    };
  });
  el.onclick = (e) => {
    const id = e.target.closest('[data-update]')?.dataset.update;
    const b = id && list.find((x) => x.id === id);
    if (!b || state.terrainBusy || $('.cam')) return;
    // 1. la caméra s'ouvre tout de suite
    terrainQuick(b, notes, draw);
  };
}
// Caméra du piquet : une note toute prête (facultative), puis 🔴 🟠 🟢 = photo + envoi en un seul geste
function terrainQuick(b, notes, draw) {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Caméra indisponible sur ce téléphone.');
  const ov = document.createElement('div');
  ov.className = 'cam quick';
  ov.innerHTML = `<div class="cam-frame"><video autoplay playsinline muted></video><div class="cam-flash"></div></div>
    <div class="cam-top"><button class="cam-x" aria-label="Fermer">✕</button><span>📍 ${esc(b.name)}</span><button class="cam-flip" aria-label="Changer de caméra">🔄</button></div>
    <div class="cam-bottom">
      ${notes.length ? `<div class="qnotes" role="group" aria-label="Précision (facultatif)">${notes.map((n) => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      <p id="qmsg">Vise l’entrée, puis touche ce que tu vois</p>
      <div class="qst"><button class="red" data-st="bloque">🔴<b>Bloqué</b></button><button class="orange" data-st="partiel">🟠<b>Partiel</b></button><button class="green" data-st="ouvert">🟢<b>Ouvert</b></button></div>
    </div>`;
  document.body.appendChild(ov);
  const video = $('video', ov), msg = $('#qmsg', ov);
  let stream = null, facing = 'environment', closed = false, seq = 0, note = '', busy = false;
  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  let ctrl = null;
  const close = () => {
    closed = true; ctrl?.abort(); stop(); ov.remove();
    if (state.terrainStale) { state.terrainStale = false; setTimeout(() => { if (route().startsWith('modo') && !$('.cam') && !$('.sheet')) render(true); }, 50); }
  };
  const start = async () => {
    stop();
    const my = ++seq;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1440 } }, audio: false });
      if (closed || my !== seq) { st.getTracks().forEach((t) => t.stop()); return; }
      stream = st; video.srcObject = st; video.classList.toggle('mirror', facing === 'user');
    } catch (e) { close(); toast(e.name === 'NotAllowedError' ? 'Autorise la caméra pour mettre à jour le bâtiment.' : 'Caméra indisponible.'); }
  };
  $('.cam-x', ov).onclick = close;
  $('.cam-flip', ov).onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
  $('.qnotes', ov)?.addEventListener('click', (e) => {
    const n = e.target.closest('[data-n]')?.dataset.n;
    if (n === undefined) return;
    note = note === n ? '' : n;
    $$('.qnotes button', ov).forEach((x) => x.classList.toggle('on', x.dataset.n === note));
  });
  $('.qst', ov).onclick = async (e) => {
    const status = e.target.closest('[data-st]')?.dataset.st;
    if (!status || busy) return;
    if (!video.videoWidth) { msg.textContent = '⏳ Caméra en cours de démarrage…'; return; }
    busy = true;
    // photo au format 3:4 (comme le cadre)
    const vw = video.videoWidth, vh = video.videoHeight;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vw / vh > 3 / 4) { sw = Math.round(vh * 3 / 4); sx = Math.round((vw - sw) / 2); } else { sh = Math.round(vw * 4 / 3); sy = Math.round((vh - sh) / 2); }
    const k = Math.min(1, 1280 / sh);
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const c = cv.getContext('2d');
    if (facing === 'user') { c.translate(cv.width, 0); c.scale(-1, 1); }
    c.drawImage(video, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    $('.cam-flash', ov).classList.add('on'); navigator.vibrate?.(20);
    video.pause();
    msg.textContent = '⏳ Envoi…';
    ov.classList.add('sending');
    try {
      const blob = await new Promise((r, j) => cv.toBlob((x) => (x ? r(x) : j(new Error('Photo illisible, réessaie.'))), 'image/jpeg', 0.8));
      ctrl = new AbortController();
      const r = await fetch(`/api/mod/terrain/building/${encodeURIComponent(b.id)}/photo?${new URLSearchParams({ status, note })}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob, signal: ctrl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Mise à jour impossible.');
      Object.assign(b, { status, note, updatedAt: j.updatedAt || new Date().toISOString(), by: j.by }); delete b.yesterday;
      close(); navigator.vibrate?.([15, 60, 15]);
      toast(`✅ ${b.name} : ${STATUS[status].label}${note ? ' · ' + note : ''}`);
      draw();
    } catch (err) {
      if (closed) return; // fermé pendant l'envoi : envoi annulé
      msg.textContent = `⚠ ${err instanceof TypeError ? 'Pas de réseau : rapproche-toi du wifi ou de la 4G, puis retouche la couleur.' : err.message}`;
      ov.classList.remove('sending'); $('.cam-flash', ov).classList.remove('on');
      video.play().catch(() => {});
      busy = false;
    }
  };
  start();
}

// (ancien écran : la photo est affichée, puis on choisit l'état) — gardé pour « Reprendre la photo »
async function terrainChoose(b, blob, draw) {
  let photo;
  try { photo = await shrinkPhoto(blob); } catch { return toast('📷 Photo illisible, réessaie.'); }
  const url = URL.createObjectURL(photo);
  sheet(`<h2 style="margin:0 0 4px">📍 ${esc(b.name)}</h2>
    <img class="tp-prev" src="${url}" alt="Ta photo" style="display:block;width:100%;max-height:38dvh;object-fit:cover;border-radius:16px;margin:8px 0 6px">
    <button type="button" class="btn ghost" id="tp-retake" style="width:100%;margin-bottom:12px">🔄 Reprendre la photo</button>
    <p class="faint small" style="margin:0 0 8px">Qu’est-ce que tu vois ?</p>
    <div class="see-grid" id="tp-grid">
      <button class="ab red" data-st="bloque">🔴 Bloqué</button>
      <button class="ab orange" data-st="partiel">🟠 Partiel</button>
      <button class="ab green" data-st="ouvert">🟢 Ouvert</button>
    </div>`, (root, close) => {
    $('#tp-retake', root).onclick = () => { close(); openTerrainCamera((nb) => { if (nb) terrainChoose(b, nb, draw); }); };
    $('#tp-grid', root).onclick = async (e) => {
      const status = e.target.closest('[data-st]')?.dataset.st;
      if (!status || state.terrainBusy) return;
      state.terrainBusy = true;
      $('#tp-grid', root).classList.add('locked');
      try {
        const r = await fetch(`/api/mod/terrain/building/${encodeURIComponent(b.id)}/photo?${new URLSearchParams({ status })}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: photo });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Mise à jour impossible.');
        Object.assign(b, { status, updatedAt: j.updatedAt, by: j.by }); delete b.yesterday;
        navigator.vibrate?.(15);
        toast(`✅ ${b.name} : ${STATUS[status].label}`);
        close(); draw();
      } catch (err) { toast(err.message); $('#tp-grid', root)?.classList.remove('locked'); }
      finally { state.terrainBusy = false; }
    };
  });
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60e3);
}

// ----- Situation : mise à jour éclair des bâtiments -----
// Trois façons, du plus rapide au plus précis :
//  1. Écrire ou dicter une phrase : « Thémis, Nautibus bloqués, Darwin partiel, le reste ouvert »
//  2. Toucher plusieurs tuiles puis un seul bouton 🔴 / 🟠 / 🟢
//  3. Reprendre la liste du dernier compte rendu d'AG
// Chaque envoi peut être annulé pendant 10 secondes (l'email d'alerte en attente est alors retiré).
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const STATUS_WORDS = [
  ['ouvert', /^(debloqu|rouvert|reouvert|ouvert|ouvre|libre|accessible|leve|normal)/],
  ['partiel', /^(partiel|filtr|semi|moitie|demi)/],
  ['bloque', /^(bloqu|blocus|ferme|piquet|occup|barricad)/],
];
const ALIASES = { deambu: 'deambulatoire', deambulatoire: 'deambulatoire', bu: 'bu sciences', 'bu sciences': 'bu sciences', rocke: 'rockefeller', rockef: 'rockefeller' };
function buildingIndex(buildings) {
  const names = buildings.map((b) => ({ b, key: norm(b.name), words: norm(b.name).split(' ') }));
  const campuses = [...new Set(buildings.map((b) => b.campus))].map((c) => ({ campus: c, key: norm(c).replace(/^(la|le|les) /, '') }));
  return { names, campuses };
}
// Renvoie { changes: Map(id → status), unknown: [mots non reconnus] }
function parseQuick(text, buildings) {
  const { names, campuses } = buildingIndex(buildings);
  const changes = new Map();
  const unknown = [];
  const clauses = String(text).split(/[\n.;|·]+|(?:\s+-\s+)/).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const toks = norm(clause).split(' ').filter(Boolean);
    const items = []; // { kind: 'b'|'campus'|'rest'|'all'|'status', pos, value }
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const st = STATUS_WORDS.find(([, re]) => re.test(t));
      if (st) { items.push({ kind: 'status', pos: i, value: st[0] }); continue; }
      if ((t === 'reste' || t === 'autres') ) { items.push({ kind: 'rest', pos: i }); continue; }
      if ((t === 'tout' || t === 'tous' || t === 'toute' || t === 'toutes') && !toks.slice(i + 1, i + 4).some((x) => campuses.some((c) => c.key.split(' ').includes(x)) || x === 'reste')) { items.push({ kind: 'all', pos: i }); continue; }
      // Nom de bâtiment : on essaie d'abord les noms en plusieurs mots
      let hit = null;
      for (const n of names) {
        const len = n.words.length;
        const chunk = toks.slice(i, i + len).join(' ');
        if (chunk === n.key || ALIASES[chunk] === n.key || ALIASES[t] === n.key) { hit = { n, len: ALIASES[t] === n.key ? 1 : len }; break; }
      }
      if (!hit && t.length >= 4) {
        const near = names.filter((n) => n.words.length === 1 && lev(t, n.key) <= (t.length >= 7 ? 2 : 1));
        if (near.length === 1) hit = { n: near[0], len: 1 };
      }
      if (hit) { items.push({ kind: 'b', pos: i, value: hit.n.b }); i += hit.len - 1; continue; }
      const camp = campuses.find((c) => c.key === t || c.key.split(' ').includes(t) && t.length > 3);
      if (camp) { items.push({ kind: 'campus', pos: i, value: camp.campus }); i += camp.key.split(' ').filter((w) => toks.slice(i + 1, i + 3).includes(w)).length; continue; }
      if (t.length >= 4 && !/^(est|sont|les|des|aux|avec|pour|dans|entree|entrees|batiment|batiments|campus|cote|depuis|matin|soir|aujourd|hui|maintenant|reste|toute|tout|tous|encore|plus|aussi|egalement|devant)$/.test(t)) unknown.push(t);
    }
    const statuses = items.filter((x) => x.kind === 'status');
    if (!statuses.length) continue;
    const targets = items.filter((x) => x.kind !== 'status');
    for (const tg of targets) {
      // statut le plus proche APRÈS la cible dans la phrase, sinon le plus proche AVANT
      const after = statuses.find((s) => s.pos > tg.pos);
      const before = [...statuses].reverse().find((s) => s.pos < tg.pos);
      const st = (after || before).value;
      if (tg.kind === 'b') changes.set(tg.value.id, st);
      if (tg.kind === 'campus') for (const b of buildings) if (b.campus === tg.value && !changes.has(b.id)) changes.set(b.id, st);
      if (tg.kind === 'all') for (const b of buildings) changes.set(b.id, st);
      if (tg.kind === 'rest') tg.restStatus = st;
    }
    if (!targets.length && statuses.length === 1 && /^(tout|tous|toute)/.test(norm(clause))) for (const b of buildings) changes.set(b.id, statuses[0].value);
    for (const tg of targets.filter((x) => x.kind === 'rest')) for (const b of buildings) if (!changes.has(b.id)) changes.set(b.id, tg.restStatus);
  }
  return { changes, unknown: [...new Set(unknown)].slice(0, 6) };
}

let lastUndo = null;
function showUndo(previous, label) {
  lastUndo = previous;
  const bar = $('#undo');
  if (!bar) return;
  bar.hidden = false;
  $('#undo-txt', bar).textContent = label;
  clearTimeout(showUndo.t);
  showUndo.t = setTimeout(() => { bar.hidden = true; lastUndo = null; }, 10000);
}
async function applyChanges(list, label) {
  if (!list.length) return toast('Rien à changer.');
  // « from » : ce que ce modo voyait. Si quelqu'un l'a changé entre-temps, le serveur ne l'écrase pas.
  list = list.map((c) => ({ ...c, from: state.raw.buildings.find((b) => b.id === c.id)?.status }));
  const r = await act(() => api('/api/mod/buildings-batch', { method: 'PUT', body: { changes: list } }));
  if (r.conflicts?.length) {
    toast(`⚠️ Déjà changé par un·e autre modo : ${r.conflicts.map((c) => `${c.name} → ${STATUS[c.status].label} (${c.by})`).join(', ')}`);
    for (const c of r.conflicts) { const b = state.raw.buildings.find((x) => x.id === c.id); if (b) b.status = c.status; }
    window.drawTiles?.();
    list = list.filter((c) => !r.conflicts.some((x) => x.id === c.id));
  }
  if (!r.changed) { if (!r.conflicts?.length) toast('Déjà à jour.'); return; }
  for (const c of list) { const b = state.data.buildings.find((x) => x.id === c.id); if (b) b.status = c.status; }
  window.drawTiles?.();
  showUndo(r.previous, `${label} · ${r.changed} bâtiment${r.changed > 1 ? 's' : ''}`);
  publishedCard(r.reach, list);
}

function modSituation(el) {
  const d = state.data;
  const b = d.blocus;
  const lastCR = d.reports.find((r) => r.batiments_bloques?.length);
  const canDictate = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  el.innerHTML = `
    <div id="sightings"></div>
    <div id="pubres"></div>
    ${state.me.role === 'terrain' ? '<div class="card terrain-hint">📍 <b>Compte piquet</b> : touche les bâtiments que tu vois, puis 🔴 🟠 🟢. Confirme chaque matin, même si rien n’a changé : c’est ce qui rend l’info fiable.</div>' : ''}
    <div class="card" ${state.me.role === 'terrain' ? 'hidden' : ''}>
      <div class="kicker">Titre de l’accueil · ${esc(siteShort(state.modSite))} · un tap = publié</div>
      <div class="segmented status-seg" id="bstate" style="margin-top:10px">${['auto', 'actif', 'partiel', 'leve'].map((k) => `<button data-s="${k}" class="${(b.auto ? 'auto' : b.state) === k ? 'on ' + ({ auto: 'auto', actif: 'bloque', partiel: 'partiel', leve: 'ouvert' }[k]) : ''}">${{ auto: '🤖 Auto', actif: '🔴 Blocus', partiel: '🟠 Partiel', leve: '🟢 Levé' }[k]}</button>`).join('')}</div>
      <p class="faint small" id="bhint" style="margin:6px 2px 0">${b.auto ? `Automatique : le titre suit les bâtiments (actuellement « ${esc(BLOCUS[blocusNow(b)])} »).` : 'Choisi à la main : il ne bouge plus avec les bâtiments. Touche « Auto » pour qu’il les suive.'}</p>
      <div class="field"><input type="text" id="bmsg" maxlength="400" placeholder="Message court (ex : AG 12h au Déambu, piquet dès 7h)" value="${esc(b.message)}"></div>
      <label class="check small"><input type="checkbox" id="bnotify" checked> Prévenir les abonné·es (notification, Telegram, email) si le titre change</label>
    </div>

    <div class="card quick" style="margin-top:12px">
      <div class="kicker">⚡ Saisie éclair : écris ou dicte comme tu parles</div>
      <div class="quick-row">
        <textarea id="qtext" rows="2" placeholder="Thémis, Nautibus bloqués. Darwin partiel. Le reste ouvert."></textarea>
        ${canDictate ? `<button class="mic" id="mic" type="button" aria-label="Dicter">🎙️</button>` : ''}
      </div>
      <div id="qpreview" class="qpreview faint small">Exemples : « toute la Doua bloquée » · « Lippmann débloqué » · « tout est ouvert »</div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn red" id="qapply" disabled>Appliquer</button>
        ${lastCR ? `<button class="btn ghost small" id="qcr">📋 Reprendre l’AG (${lastCR.batiments_bloques.length})</button>` : ''}
        <button class="btn ghost small" id="qall">🟢 Tout rouvrir</button>
        <button class="btn ghost small" id="qstory">📸 Story Insta</button>
      </div>
    </div>

    <h2 class="section">Bâtiments <span class="faint small">touche pour sélectionner, puis choisis la couleur · ✏️ ou appui long pour la note</span></h2>
    <div id="tiles"></div>

    <details class="card" style="margin-top:14px" ${d.buildings.length ? "" : "open"} ${state.me.role === 'terrain' ? 'hidden' : ''}><summary class="kicker" style="cursor:pointer">＋ Ajouter un bâtiment</summary>
      <form class="form" id="addb" style="margin-top:10px">
        <div class="field"><label>Nom du bâtiment (ajouté à ${esc(siteShort(state.modSite))})</label><input type="text" id="bn" required maxlength="80"></div>
        <button class="btn small">Ajouter</button></form></details>

    <div class="actionbar" id="abar" hidden>
      <span id="abar-n" class="mono"></span>
      <button data-set="bloque" class="ab red">🔴 Bloqué</button>
      <button data-set="partiel" class="ab orange">🟠 Partiel</button>
      <button data-set="ouvert" class="ab green">🟢 Ouvert</button>
      <button data-set="edit" id="abar-edit" class="ab ghost" hidden aria-label="Modifier le bâtiment">✏️</button>
      <button data-set="clear" class="ab ghost" aria-label="Désélectionner">✕</button>
    </div>
    <div class="actionbar undo" id="undo" hidden><span id="undo-txt"></span><button class="ab ghost" id="undo-btn">↩️ Annuler</button></div>`;

  // Blocus : publication immédiate au tap
  $('#bstate').onclick = async (e) => {
    const s = e.target.closest('[data-s]')?.dataset.s;
    if (!s) return;
    const prevCls = $$('#bstate button').map((x) => x.className);
    $$('#bstate button').forEach((x) => (x.className = x.dataset.s === s ? 'on ' + ({ auto: 'auto', actif: 'bloque', partiel: 'partiel', leve: 'ouvert' }[s] || '') : ''));
    let r;
    try { r = await act(() => api('/api/mod/blocus', { method: 'PUT', body: { state: s, from: state.data.blocus.state, message: $('#bmsg').value, notify: $('#bnotify').checked } })); }
    catch { $$('#bstate button').forEach((x, i) => (x.className = prevCls[i])); return; }
    Object.assign(state.data.blocus, r, { auto: s === 'auto' });
    toast(s === 'auto' ? `Automatique : « ${BLOCUS[r.effective]} »` : BLOCUS[s]);
    const h = $('#bhint');
    if (h) h.textContent = s === 'auto' ? `Automatique : le titre suit les bâtiments (actuellement « ${BLOCUS[r.effective]} »).` : 'Choisi à la main : il ne bouge plus avec les bâtiments. Touche « Auto » pour qu’il les suive.';
  };
  $('#bmsg').onchange = () => act(() => api('/api/mod/blocus', { method: 'PUT', body: { state: state.data.blocus.state, message: $('#bmsg').value, notify: false } }), 'Message publié.');
  drawSightings();
  if (!d.buildings.length) $('#tiles').insertAdjacentHTML('beforebegin', `<div class="card muted">Aucun bâtiment pour ${esc(siteShort(state.modSite))}. Ajoute-les en bas de la page (« ＋ Ajouter un bâtiment »).</div>`);

  // Saisie éclair
  const qt = $('#qtext');
  let parsed = { changes: new Map(), unknown: [] };
  const preview = () => {
    parsed = parseQuick(qt.value, state.data.buildings);
    const all = [...parsed.changes].map(([id, st]) => ({ b: state.data.buildings.find((x) => x.id === id), st })).filter((x) => x.b);
    const list = all.filter((x) => x.b.status !== x.st);
    const same = all.filter((x) => x.b.status === x.st);
    const btn = $('#qapply');
    btn.disabled = !list.length;
    btn.textContent = list.length ? `Appliquer ${list.length} changement${list.length > 1 ? 's' : ''}` : 'Appliquer';
    $('#qpreview').innerHTML = qt.value.trim()
      ? (list.length ? list.map(({ b, st }) => `<span class="pill ${STATUS[st].pill}">${STATUS[st].dot} ${esc(b.name)}</span>`).join(' ') : '<span class="faint">Aucun changement détecté. Mets un mot comme « bloqué », « partiel » ou « ouvert ».</span>')
        + (same.length ? `<span class="faint small">· déjà à jour : ${same.slice(0, 6).map((x) => esc(x.b.name)).join(', ')}${same.length > 6 ? '…' : ''}</span>` : '')
        + (parsed.unknown.length ? `<div class="small" style="color:var(--orange);margin-top:6px">Pas reconnu : ${parsed.unknown.map(esc).join(', ')}</div>` : '')
      : 'Exemples : « toute la Doua bloquée » · « Lippmann débloqué » · « tout est ouvert »';
  };
  qt.oninput = preview;
  qt.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#qapply').click(); };
  $('#qapply').onclick = async () => {
    const list = [...parsed.changes].map(([id, status]) => ({ id, status }));
    await applyChanges(list, 'Saisie éclair');
    qt.value = ''; preview();
  };
  if ($('#qcr')) $('#qcr').onclick = () => { qt.value = `${lastCR.batiments_bloques.join(', ')} bloqués`; preview(); qt.focus(); };
  $('#qall').onclick = () => { if (confirm('Passer TOUS les bâtiments en ouvert ?')) applyChanges(state.data.buildings.map((x) => ({ id: x.id, status: 'ouvert' })), 'Tout rouvert'); };
  $('#qstory').onclick = () => openStory('campus');
  if ($('#mic')) {
    $('#mic').onclick = () => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new R();
      rec.lang = 'fr-FR'; rec.interimResults = true; rec.maxAlternatives = 1;
      const base = qt.value ? qt.value.trim() + '. ' : '';
      $('#mic').classList.add('on');
      rec.onresult = (ev) => { qt.value = base + [...ev.results].map((r) => r[0].transcript).join(' '); preview(); };
      rec.onend = () => $('#mic')?.classList.remove('on');
      rec.onerror = (ev) => { toast(ev.error === 'not-allowed' ? 'Autorise le micro pour dicter.' : 'Dictée interrompue.'); };
      rec.start();
    };
  }

  // Tuiles à sélection multiple
  const sel = new Set();
  window.drawTiles = drawTiles;
  function drawTiles() {
    const byCampus = {};
    for (const x of state.data.buildings) (byCampus[x.campus] ||= []).push(x);
    const box = $('#tiles');
    if (!box) return;
    box.innerHTML = Object.entries(byCampus).map(([campus, list]) => `
      <div class="campus-block">
        <div class="campus-head"><span class="kicker">${esc(campus)}</span><span class="faint small">${list.filter((x) => x.status === 'bloque').length}/${list.length} bloqués</span><button class="btn small ghost" data-campus="${esc(campus)}">${list.every((x) => sel.has(x.id)) ? 'Aucun' : 'Tout'}</button></div>
        <div class="qtiles">${list.map((x) => `<button class="qt ${x.status} ${sel.has(x.id) ? 'sel' : ''}" data-id="${esc(x.id)}"><span class="qdot">${STATUS[x.status].dot}</span><span class="qn">${esc(x.name)}${x.yesterday && x.status === 'inconnu' ? `<small class="qyday">dernière info ${STATUS[x.yesterday].dot}</small>` : ''}</span>${x.note ? '<span class="qnote">✎</span>' : ''}</button>`).join('')}</div>
      </div>`).join('');
    const bar = $('#abar');
    bar.hidden = !sel.size;
    $('#abar-n').textContent = `${sel.size} sélect.`;
    $('#abar-edit').hidden = sel.size !== 1;
  }
  drawTiles();
  // Appui long (0,8 s, doigt immobile) = éditer la note / renommer / supprimer.
  // Annulé dès que le doigt bouge ou que la page défile, pour ne pas ouvrir la fiche en scrollant.
  let pressTimer = null;
  let pressStart = null;
  const cancelPress = () => {
    if (pressTimer && pressTimer !== 'long') clearTimeout(pressTimer);
    if (pressTimer !== 'long') pressTimer = null;
    pressStart = null;
    $$('.qt.pressing').forEach((x) => x.classList.remove('pressing'));
  };
  $('#tiles').addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.qt');
    if (!t || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelPress();
    pressStart = { x: e.clientX, y: e.clientY, scroll: window.scrollY };
    t.classList.add('pressing');
    pressTimer = setTimeout(() => {
      t.classList.remove('pressing');
      if (!pressStart || Math.abs(window.scrollY - pressStart.scroll) > 4) { pressTimer = null; return; }
      pressTimer = 'long'; navigator.vibrate?.(15); editBuilding(t.dataset.id);
    }, 800);
  });
  $('#tiles').addEventListener('pointermove', (e) => { if (pressStart && (Math.abs(e.clientX - pressStart.x) > 8 || Math.abs(e.clientY - pressStart.y) > 8)) cancelPress(); });
  $('#tiles').addEventListener('pointerup', () => { if (pressTimer !== 'long') cancelPress(); });
  $('#tiles').addEventListener('pointercancel', cancelPress);
  $('#tiles').addEventListener('pointerleave', () => { if (pressTimer !== 'long') cancelPress(); });
  // un seul écouteur de défilement pour toute la session (sinon un de plus à chaque rafraîchissement)
  window.__tilesScroll = () => { if (pressStart) cancelPress(); };
  if (!window.__tilesScrollOn) { window.__tilesScrollOn = true; window.addEventListener('scroll', () => window.__tilesScroll?.(), { passive: true }); }
  $('#tiles').addEventListener('contextmenu', (e) => { if (e.target.closest('.qt')) e.preventDefault(); });
  $('#tiles').onclick = (e) => {
    const c = e.target.closest('[data-campus]')?.dataset.campus;
    if (c) {
      const ids = state.data.buildings.filter((x) => x.campus === c).map((x) => x.id);
      const all = ids.every((id) => sel.has(id));
      ids.forEach((id) => (all ? sel.delete(id) : sel.add(id)));
      return drawTiles();
    }
    const t = e.target.closest('.qt');
    if (!t) return;
    if (pressTimer === 'long') { pressTimer = null; return; }
    sel.has(t.dataset.id) ? sel.delete(t.dataset.id) : sel.add(t.dataset.id);
    if (navigator.vibrate) navigator.vibrate(8);
    drawTiles();
  };
  $('#abar').onclick = async (e) => {
    const s = e.target.closest('[data-set]')?.dataset.set;
    if (!s) return;
    if (s === 'edit') { const id = [...sel][0]; sel.clear(); drawTiles(); return editBuilding(id); }
    if (s !== 'clear') await applyChanges([...sel].map((id) => ({ id, status: s })), STATUS[s].label);
    sel.clear();
    drawTiles();
  };
  $('#undo-btn').onclick = async () => {
    if (!lastUndo) return;
    const prev = lastUndo; lastUndo = null;
    $('#undo').hidden = true;
    const r = await act(() => api('/api/mod/buildings-batch', { method: 'PUT', body: { changes: prev, undo: true } }), 'Annulé, aucune notification ne partira.');
    if (r?.conflicts?.length) toast(`⚠ Pas annulé pour ${r.conflicts.map((c) => c.name).join(', ')} : un·e autre modo l’a changé entre-temps.`);
    for (const c of prev) { const x = state.data.buildings.find((y) => y.id === c.id); if (x) x.status = c.status; }
    drawTiles();
  };
  $('#addb').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/buildings', { method: 'POST', body: { name: $('#bn').value } }), 'Bâtiment ajouté.'); await refresh(); render(true); };
}
function editBuilding(id) {
  const x = state.data.buildings.find((y) => y.id === id);
  if (!x) return;
  sheet(`<h3>${esc(x.name)}</h3><form class="form" id="eb">
    <div class="field"><label>Note visible par tous (ex : entrée côté tram ouverte)</label><input type="text" id="en" maxlength="240" value="${esc(x.note)}"></div>
    <div class="field" ${state.me?.role === 'terrain' ? 'hidden' : ''}><label>Nom</label><input type="text" id="enm" maxlength="80" value="${esc(x.name)}"></div>
    <div class="btn-row"><button class="btn">Enregistrer</button>${state.me?.role === 'terrain' ? '' : '<button type="button" class="btn red ghost" id="edel">Supprimer le bâtiment</button>'}</div>
    ${x.proofAt ? `<button type="button" class="btn ghost" id="eproof" style="width:100%;margin-top:8px">📷 Voir la photo du piquet (${esc(ago(x.proofAt))})</button>` : ''}
    <p class="faint small">Astuce : appui long sur une tuile pour ouvrir cette fiche.</p></form>`, (root, close) => {
    if ($('#eproof', root)) $('#eproof', root).onclick = async () => {
      try {
        const r = await fetch(`/api/mod/buildings/${encodeURIComponent(id)}/proof`, { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Photo expirée.');
        const url = URL.createObjectURL(await r.blob());
        close();
        sheet(`<h3>📷 ${esc(x.name)}</h3><p class="faint small">Photo prise sur place par un compte piquet · effacée après 24 h.</p><img src="${url}" alt="Photo du piquet" style="display:block;width:100%;border-radius:16px">
          <button type="button" class="btn red ghost" id="pblock" style="width:100%;margin-top:10px">🚫 Fausse info : bloquer ce téléphone</button>
          <p class="faint small">Les comptes piquet sont partagés : ça bloque seulement le téléphone qui a envoyé cette photo. Remets ensuite le bon état du bâtiment.</p>`, (r2, close2) => {
          $('#pblock', r2).onclick = async () => { if (!confirm('Bloquer le téléphone qui a envoyé cette photo ? Il ne pourra plus mettre à jour les bâtiments.')) return; await act(() => api(`/api/mod/buildings/${encodeURIComponent(id)}/proof/block`, { method: 'POST' }), '🚫 Téléphone bloqué.'); close2(); };
        });
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60e3);
      } catch (err) { toast(err.message); }
    };
    $('#eb', root).onsubmit = async (e) => {
      e.preventDefault();
      await act(() => api(`/api/mod/buildings/${id}`, { method: 'PUT', body: { note: $('#en', root).value, ...(state.me?.role === 'terrain' ? {} : { name: $('#enm', root).value }) } }), 'Enregistré.');
      x.note = $('#en', root).value; x.name = $('#enm', root).value || x.name;
      close(); window.drawTiles?.();
    };
    if ($('#edel', root)) $('#edel', root).onclick = async () => { if (!confirm('Supprimer ce bâtiment de la liste ?')) return; await act(() => api(`/api/mod/buildings/${id}`, { method: 'DELETE' }), 'Supprimé.'); close(); await refresh(); render(true); };
  });
}

// =====================================================================
// Stories Instagram (1080 × 1920), générées dans le navigateur
// =====================================================================
const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function fitFont(ctx, text, maxW, size, min, weight = 800, fam = SF) {
  for (; size > min; size -= 4) { ctx.font = `${weight} ${size}px ${fam}`; if (ctx.measureText(text).width <= maxW) break; }
  return size;
}
function drawBlock(ctx, text, x, y, maxW, size, weight, color, lh = 1.18, maxLines = 4, fam = SF) {
  ctx.font = `${weight} ${size}px ${fam}`;
  ctx.fillStyle = color;
  let lines = wrapText(ctx, text, maxW);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  return y + lines.length * size * lh;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function storyFrame(ctx, W, H, accent) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, H * 0.75);
  g.addColorStop(0, accent + '66'); g.addColorStop(1, '#00000000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // pluie de code discrète
  ctx.font = `28px ${MONO}`;
  const chars = 'LYON1BLOCUSAG01✊';
  for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(0,255,156,${Math.random() * 0.12})`; ctx.fillText(chars[i % chars.length], (i * 137) % W, (i * 263) % H); }
  // lignes de balayage
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  // en-tête
  ctx.fillStyle = '#fff'; ctx.font = `800 64px ${MONO}`; ctx.fillText('LYON 1', 80, 200);
  ctx.fillStyle = '#ff453a'; ctx.font = `800 40px ${MONO}`; ctx.fillText('LA DOUA EN LUTTE', 80, 255);
  ctx.fillStyle = '#a1a1aa'; ctx.font = `500 30px ${SF}`;
  ctx.fillText(new Date().toLocaleString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), 80, 300);
  // pied
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; rrect(ctx, 80, H - 250, W - 160, 130, 30); ctx.fill();
  ctx.fillStyle = '#ff453a'; ctx.font = `800 36px ${MONO}`; ctx.fillText('🔔 ACTIVE LES NOTIFS', 120, H - 172);
  ctx.fillStyle = '#d1d1d6'; ctx.font = `500 30px ${SF}`; ctx.fillText(`Infos en direct : ${location.host}`, 120, H - 130);
}
function pill(ctx, x, y, text, bg, fg) {
  ctx.font = `800 34px ${MONO}`;
  const w = ctx.measureText(text).width + 48;
  ctx.fillStyle = bg; rrect(ctx, x, y, w, 64, 32); ctx.fill();
  ctx.fillStyle = fg; ctx.fillText(text, x + 24, y + 44);
  return w;
}
function storyCampus(ctx, W, H) {
  const d = state.data;
  const st = blocusNow(d.blocus);
  const color = { actif: '#ff453a', partiel: '#ff9f0a', leve: '#30d158', inconnu: '#a1a1aa' }[st];
  storyFrame(ctx, W, H, color);
  let y = 420;
  pill(ctx, 80, y - 70, `● LIVE · ${(state.data.scope === ALL ? 'TOUS LES SITES' : siteShort(state.data.scope)).toUpperCase()}`, 'rgba(255,69,58,0.18)', '#ff453a');
  const title = BLOCUS[st];
  const size = fitFont(ctx, title, W - 160, 150, 80);
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 40;
  y = drawBlock(ctx, title, 80, y + 120, W - 160, size, 900, color, 1.0, 2);
  ctx.restore();
  if (d.blocus.message) y = drawBlock(ctx, d.blocus.message, 80, y + 20, W - 160, 46, 600, '#f2f2f7', 1.25, 3);
  const groups = [['bloque', '🔴 BLOQUÉS', '#ff453a'], ['partiel', '🟠 PARTIELS', '#ff9f0a']];
  y += 50;
  for (const [k, label, c] of groups) {
    const list = d.buildings.filter((x) => x.status === k);
    if (!list.length) continue;
    ctx.fillStyle = c; ctx.font = `800 38px ${MONO}`; ctx.fillText(`${label} (${list.length})`, 80, y + 40);
    y += 70;
    // noms en « tuiles »
    let x = 80;
    ctx.font = `800 46px ${SF}`;
    for (const b of list) {
      const w = ctx.measureText(b.name).width + 56;
      if (x + w > W - 80) { x = 80; y += 92; }
      if (y > H - 520) { ctx.fillStyle = c; ctx.fillText('…', x, y + 58); break; }
      ctx.fillStyle = c + '33'; rrect(ctx, x, y, w, 76, 22); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 3; rrect(ctx, x, y, w, 76, 22); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(b.name, x + 28, y + 54);
      x += w + 16;
    }
    y += 120;
  }
  const open = d.buildings.filter((x) => x.status === 'ouvert').length;
  if (open) { ctx.fillStyle = '#30d158'; ctx.font = `800 38px ${MONO}`; ctx.fillText(`🟢 OUVERTS : ${open}`, 80, y + 30); y += 80; }
  if (!d.buildings.some((x) => x.status === 'bloque' || x.status === 'partiel') && !open) { y = drawBlock(ctx, 'Aucun bâtiment signalé pour le moment.', 80, y + 30, W - 160, 44, 600, '#a1a1aa'); }
  const ev = d.events[0];
  if (ev && y < H - 560) {
    const top = Math.max(y + 20, H - 560);
    ctx.fillStyle = 'rgba(191,90,242,0.16)'; rrect(ctx, 80, top, W - 160, 260, 34); ctx.fill();
    ctx.fillStyle = '#bf5af2'; ctx.font = `800 34px ${MONO}`; ctx.fillText(`PROCHAIN RDV · ${EVENT_TYPE[ev.type][0].toUpperCase()}`, 120, top + 62);
    drawBlock(ctx, ev.title, 120, top + 125, W - 240, 50, 800, '#fff', 1.15, 1);
    ctx.fillStyle = '#d1d1d6'; ctx.font = `600 38px ${SF}`;
    ctx.fillText(`${dayLabel(ev.start)} · ${hhmm(ev.start)}${ev.place ? ' · ' + ev.place : ''}`.slice(0, 48), 120, top + 210);
  }
}
function storyEvent(ctx, W, H, ev) {
  const [label, tone] = EVENT_TYPE[ev.type];
  const color = { purple: '#bf5af2', red: '#ff453a', orange: '#ff9f0a', green: '#30d158', grey: '#0a84ff' }[tone];
  storyFrame(ctx, W, H, color);
  pill(ctx, 80, 380, `📣 ${label.toUpperCase()}`, color + '30', color);
  let y = drawBlock(ctx, ev.title, 80, 560, W - 160, fitFont(ctx, ev.title, (W - 160) * 2, 110, 70, 900), 900, '#fff', 1.05, 4);
  y += 60;
  ctx.fillStyle = color; ctx.font = `900 64px ${SF}`; ctx.fillText(dayLabel(ev.start).replace(/^./, (c) => c.toUpperCase()), 80, y + 60);
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 30; ctx.font = `900 230px ${MONO}`; ctx.fillText(hhmm(ev.start), 70, y + 300); ctx.restore();
  y += 380;
  if (ev.place) y = drawBlock(ctx, `📍 ${ev.place}`, 80, y, W - 160, 56, 800, '#fff', 1.2, 2);
  if (ev.address) y = drawBlock(ctx, ev.address, 80, y + 6, W - 160, 38, 500, '#a1a1aa', 1.25, 2);
  if (ev.description) drawBlock(ctx, ev.description, 80, y + 50, W - 160, 40, 500, '#d1d1d6', 1.35, Math.max(1, Math.floor((H - 330 - y - 50) / 54)));
}
function storyReport(ctx, W, H, r) {
  storyFrame(ctx, W, H, '#0a84ff');
  pill(ctx, 80, 380, '📝 COMPTE RENDU D’AG', 'rgba(10,132,255,0.2)', '#0a84ff');
  let y = drawBlock(ctx, r.titre, 80, 540, W - 160, 76, 900, '#fff', 1.1, 3);
  if (r.resume) y = drawBlock(ctx, r.resume, 80, y + 10, W - 160, 38, 500, '#d1d1d6', 1.3, 3);
  y += 30;
  const C = { decision: '#bf5af2', vote: '#0a84ff', action: '#00ff9c', alerte: '#ff453a', info: '#8e8e93' };
  for (const f of r.flashs) {
    if (y > H - 470) break;
    ctx.font = `500 36px ${SF}`;
    const lines = wrapText(ctx, f.texte, W - 260).slice(0, 2);
    const h = 90 + lines.length * 46;
    ctx.fillStyle = 'rgba(28,28,30,0.9)'; rrect(ctx, 80, y, W - 160, h, 26); ctx.fill();
    ctx.fillStyle = C[f.type]; rrect(ctx, 80, y, 12, h, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 40px ${SF}`; ctx.fillText(`${FLASH_ICO[f.type]} ${f.titre}`.slice(0, 40), 120, y + 58);
    ctx.fillStyle = '#d1d1d6'; ctx.font = `500 36px ${SF}`; lines.forEach((l, i) => ctx.fillText(l, 120, y + 108 + i * 46));
    y += h + 18;
  }
}
async function storyPoll(ctx, W, H, p) {
  storyFrame(ctx, W, H, '#0a84ff');
  pill(ctx, 80, 380, `🗳️ VOTE ANONYME · ${p.total} VOTE${p.total > 1 ? 'S' : ''}`, 'rgba(10,132,255,0.2)', '#0a84ff');
  let y = drawBlock(ctx, p.question, 80, 560, W - 160, 84, 900, '#fff', 1.1, 3) + 40;
  const total = p.counts.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...p.counts);
  p.options.forEach((o, i) => {
    const pct = Math.round((p.counts[i] / total) * 100);
    ctx.fillStyle = 'rgba(118,118,128,0.25)'; rrect(ctx, 80, y, W - 160, 120, 28); ctx.fill();
    ctx.fillStyle = p.counts[i] === max ? '#00ff9c55' : '#0a84ff55'; rrect(ctx, 80, y, Math.max(56, (W - 160) * pct / 100), 120, 28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 48px ${SF}`; ctx.fillText(o.slice(0, 26), 120, y + 78);
    ctx.font = `800 52px ${MONO}`; const t = `${pct} %`; ctx.fillText(t, W - 120 - ctx.measureText(t).width, y + 80);
    y += 145;
  });
  ctx.fillStyle = '#a1a1aa'; ctx.font = `500 34px ${SF}`; ctx.fillText(p.open ? `Vote en cours · clôture dans ${remaining(p.closesAt)}` : 'Vote clos · résultat indicatif', 80, y + 40);
}

// =====================================================================
// Kit promo et partage des votes : images dessinées par le navigateur (aucune IA, aucun service externe)
// =====================================================================
const siteHost = () => location.host;
const voteUrl = (p) => `${location.origin}/#/votes/${p.id}`;
// QR code dessiné en carrés (bibliothèque locale /vendor/qrcode.js)
function drawQR(ctx, text, x, y, size, dark = '#000', light = '#fff') {
  if (typeof window.qrcode !== 'function') return;
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = Math.round(size * 0.06);
  const cell = (size - pad * 2) / n;
  ctx.fillStyle = light; rrect(ctx, x, y, size, size, Math.round(size * 0.06)); ctx.fill();
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + pad + c * cell), Math.floor(y + pad + r * cell), Math.ceil(cell), Math.ceil(cell));
}
// Zone où le modo pose le sticker « lien » d'Instagram
function linkZone(ctx, x, y, w, label = 'COLLE LE STICKER LIEN ICI') {
  ctx.save();
  ctx.setLineDash([18, 14]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  rrect(ctx, x, y, w, 110, 55); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `800 32px ${MONO}`;
  const t = `🔗 ${label}`; ctx.fillText(t, x + (w - ctx.measureText(t).width) / 2, y + 68);
}
// Mini téléphone avec l'interface du site (pour les visuels de promo)
function phoneMock(ctx, x, y, w, { notif = false } = {}) {
  const h = w * 2.05;
  ctx.save();
  ctx.shadowColor = 'rgba(255,69,58,0.45)'; ctx.shadowBlur = 60;
  ctx.fillStyle = '#111'; rrect(ctx, x, y, w, h, w * 0.16); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#3a3a3c'; ctx.lineWidth = 6; rrect(ctx, x, y, w, h, w * 0.16); ctx.stroke();
  const ix = x + w * 0.06, iy = y + w * 0.06, iw = w * 0.88, ih = h - w * 0.12;
  ctx.save(); rrect(ctx, ix, iy, iw, ih, w * 0.11); ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(ix, iy, iw, ih);
  const u = iw / 100; // unité relative
  ctx.fillStyle = '#ff453a'; ctx.fillRect(ix, iy + u * 12, iw, u * 9);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${u * 4.2}px ${MONO}`; ctx.fillText('ALERTE · BLOQUÉ : THÉMIS · NAUTIBUS', ix + u * 4, iy + u * 18);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${u * 5}px ${MONO}`; ctx.fillText('LYON 1 ·', ix + u * 6, iy + u * 32);
  ctx.fillStyle = '#ff453a'; ctx.fillText('LA DOUA EN LUTTE', ix + u * 34, iy + u * 32);
  const g = ctx.createLinearGradient(ix, iy + u * 38, ix + iw, iy + u * 90);
  g.addColorStop(0, '#4a0b08'); g.addColorStop(1, '#000');
  ctx.fillStyle = g; rrect(ctx, ix + u * 5, iy + u * 38, iw - u * 10, u * 58, u * 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,69,58,0.6)'; ctx.lineWidth = u * 0.6; rrect(ctx, ix + u * 5, iy + u * 38, iw - u * 10, u * 58, u * 7); ctx.stroke();
  ctx.fillStyle = '#00ff9c'; ctx.font = `800 ${u * 3.6}px ${MONO}`; ctx.fillText('CAMPUS DE LA DOUA', ix + u * 11, iy + u * 48);
  ctx.save(); ctx.shadowColor = '#ff453a'; ctx.shadowBlur = u * 4;
  ctx.fillStyle = '#ff453a'; ctx.font = `900 ${u * 10.5}px ${SF}`; ctx.fillText('BLOCUS', ix + u * 11, iy + u * 62); ctx.fillText('EN COURS', ix + u * 11, iy + u * 74);
  ctx.restore();
  [['2', 'bloqués', '#ff453a'], ['1', 'partiel', '#ff9f0a'], ['13', 'ouverts', '#30d158']].forEach(([n, l, c], i) => {
    const bx = ix + u * (11 + i * 26);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rrect(ctx, bx, iy + u * 79, u * 23, u * 13, u * 3); ctx.fill();
    ctx.fillStyle = c; ctx.font = `800 ${u * 6}px ${MONO}`; ctx.fillText(n, bx + u * 3, iy + u * 86.5);
    ctx.fillStyle = '#a1a1aa'; ctx.font = `500 ${u * 3}px ${SF}`; ctx.fillText(l, bx + u * 3, iy + u * 90.5);
  });
  ['Thémis', 'Nautibus'].forEach((t, i) => {
    const bx = ix + u * (6 + i * 30);
    ctx.fillStyle = 'rgba(255,69,58,0.25)'; rrect(ctx, bx, iy + u * 103, u * 27, u * 9, u * 4.5); ctx.fill();
    ctx.fillStyle = '#ff453a'; ctx.font = `700 ${u * 4}px ${SF}`; ctx.fillText(`● ${t}`, bx + u * 3, iy + u * 109);
  });
  ctx.fillStyle = 'rgba(0,255,156,0.08)'; rrect(ctx, ix + u * 5, iy + u * 118, iw - u * 10, u * 34, u * 5); ctx.fill();
  ctx.fillStyle = '#00ff9c'; ctx.font = `500 ${u * 3.3}px ${MONO}`;
  ['[07:42] Thémis → BLOQUÉ', '[07:43] AG 12h · Amphi Thémis', '[07:51] Vote anonyme ouvert', '[08:02] Nautibus → BLOQUÉ'].forEach((t, i) => ctx.fillText(t, ix + u * 9, iy + u * (126 + i * 7)));
  ctx.fillStyle = 'rgba(191,90,242,0.14)'; rrect(ctx, ix + u * 5, iy + u * 157, iw - u * 10, u * 22, u * 5); ctx.fill();
  ctx.fillStyle = '#bf5af2'; ctx.font = `800 ${u * 3.2}px ${MONO}`; ctx.fillText('PROCHAIN RDV · AG', ix + u * 9, iy + u * 165);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${u * 4.4}px ${SF}`; ctx.fillText('AG de mobilisation · 12:00', ix + u * 9, iy + u * 173);
  ctx.fillStyle = 'rgba(18,18,20,0.95)'; ctx.fillRect(ix, iy + ih - u * 16, iw, u * 16);
  ['⚡', '🏛️', '📅', '💬', '•••'].forEach((t, i) => { ctx.fillStyle = i === 0 ? '#00ff9c' : '#8e8e93'; ctx.font = `${u * 5}px ${SF}`; ctx.fillText(t, ix + u * (9 + i * 19), iy + ih - u * 6); });
  if (notif) {
    ctx.fillStyle = 'rgba(44,44,46,0.97)'; rrect(ctx, ix + u * 4, iy + u * 3, iw - u * 8, u * 22, u * 5); ctx.fill();
    ctx.fillStyle = '#ff453a'; rrect(ctx, ix + u * 8, iy + u * 7, u * 9, u * 9, u * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${u * 3.8}px ${SF}`; ctx.fillText('🔴 La Doua : 2 bâtiments bloqués', ix + u * 20, iy + u * 12);
    ctx.fillStyle = '#d1d1d6'; ctx.font = `500 ${u * 3.3}px ${SF}`; ctx.fillText('Bloqué : Thémis, Nautibus · maintenant', ix + u * 20, iy + u * 19);
  }
  ctx.restore();
  return h;
}
function promoHeader(ctx, W, top = 130) {
  ctx.fillStyle = '#fff'; ctx.font = `800 78px ${MONO}`; ctx.fillText('LYON 1', 80, top + 60);
  ctx.fillStyle = '#ff453a'; ctx.font = `800 50px ${MONO}`; ctx.fillText('LA DOUA EN LUTTE', 80, top + 125);
}
function featureRows(ctx, x, y, w, rows, size = 42, gap = 82) {
  rows.forEach(([ico, txt], i) => {
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; rrect(ctx, x, y + i * gap, w, gap - 14, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `${size}px ${SF}`; ctx.fillText(ico, x + 24, y + i * gap + (gap - 14) / 2 + size * 0.36);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${size * 0.86}px ${SF}`; ctx.fillText(txt, x + 24 + size * 1.5, y + i * gap + (gap - 14) / 2 + size * 0.3);
  });
}

// ---------- Story promo du site (1080 × 1920) ----------
function promoStory(ctx, W, H) {
  storyFrame(ctx, W, H, '#ff453a');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 330); // cache l'en-tête standard : celui-ci est plus grand
  promoHeader(ctx, W, 110);
  let y = drawBlock(ctx, 'TOUTES LES INFOS DE LA LUTTE, EN DIRECT', 80, 430, W - 160, 76, 900, '#fff', 1.05, 3);
  y = drawBlock(ctx, 'Gratuit · anonyme · sans compte', 80, y + 10, W - 160, 38, 600, '#00ff9c', 1.2, 1);
  featureRows(ctx, 80, y + 30, W - 160, [
    ['🔴', 'Bâtiments bloqués en direct'],
    ['🔔', 'Notif dès qu’un bâtiment est bloqué'],
    ['📣', 'AG, manifs, rassemblements'],
    ['🗳️', 'Votes anonymes de ton AG'],
    ['💬', 'Chat anonyme, sans compte'],
    ['🛡️', 'Témoigner des violences'],
  ], 40, 74);
  const qy = H - 780;
  ctx.fillStyle = '#ff453a'; rrect(ctx, 80, qy, W - 160, 150, 36); ctx.fill();
  const cta = 'AJOUTE L’APP À TON ÉCRAN D’ACCUEIL';
  const cs = fitFont(ctx, cta, W - 220, 46, 28, 900);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${cs}px ${SF}`;
  ctx.fillText(cta, (W - ctx.measureText(cta).width) / 2, qy + 75 + cs * 0.36);
  drawQR(ctx, location.origin, 80, qy + 180, 230);
  ctx.fillStyle = '#fff'; ctx.font = `800 44px ${MONO}`; ctx.fillText(siteHost(), 340, qy + 270);
  ctx.fillStyle = '#a1a1aa'; ctx.font = `500 32px ${SF}`; ctx.fillText('Scanne ou touche le lien ↓', 340, qy + 325);
  linkZone(ctx, 340, qy + 350, W - 420, 'STICKER LIEN');
}

// ---------- Publication Instagram promo (1080 × 1350) ----------
function promoPost(ctx, W, H) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.85, H * 0.35, 0, W * 0.85, H * 0.35, W);
  g.addColorStop(0, '#ff453a55'); g.addColorStop(1, '#00000000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  promoHeader(ctx, W, 40);
  drawBlock(ctx, 'Blocus, AG, manifs : sache tout, tout de suite.', 70, 300, 560, 62, 900, '#fff', 1.08, 4);
  featureRows(ctx, 70, 600, 560, [['🔴', 'Bâtiments en direct'], ['🔔', 'Notifs gratuites'], ['🗳️', 'Votes anonymes'], ['💬', 'Chat anonyme']], 36, 74);
  phoneMock(ctx, 660, 250, 360, { notif: true });
  ctx.fillStyle = '#ff453a'; rrect(ctx, 70, H - 250, W - 140, 190, 36); ctx.fill();
  drawQR(ctx, location.origin, 95, H - 228, 146);
  ctx.fillStyle = '#fff'; ctx.font = `900 46px ${SF}`; ctx.fillText('Installe l’app gratuite', 270, H - 165);
  ctx.font = `800 36px ${MONO}`; ctx.fillText(siteHost(), 270, H - 110);
}

// ---------- Carrousel « installer l'app + activer les notifications » (4 × 1080 × 1350) ----------
function tutoFrame(ctx, W, H, n, accent = '#ff453a') {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.2);
  g.addColorStop(0, accent + '55'); g.addColorStop(1, '#00000000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  ctx.fillStyle = '#fff'; ctx.font = `800 40px ${MONO}`; ctx.fillText('LYON 1', 70, 90);
  ctx.fillStyle = '#ff453a'; ctx.font = `800 28px ${MONO}`; ctx.fillText('LA DOUA EN LUTTE', 70, 130);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; rrect(ctx, W - 170, 52, 100, 54, 27); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `800 30px ${MONO}`; ctx.fillText(`${n}/4`, W - 150, 89);
  ctx.fillStyle = '#6e6e73'; ctx.font = `600 28px ${MONO}`; ctx.fillText(siteHost(), 70, H - 50);
}
function stepCards(ctx, x, y, w, steps, accent) {
  steps.forEach(([title, sub], i) => {
    const h = 170;
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; rrect(ctx, x, y + i * (h + 22), w, h, 30); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + 70, y + i * (h + 22) + h / 2, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = `900 48px ${MONO}`; const t = String(i + 1); ctx.fillText(t, x + 70 - ctx.measureText(t).width / 2, y + i * (h + 22) + h / 2 + 17);
    const ts = fitFont(ctx, title, w - 170, 40, 26, 800);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${ts}px ${SF}`; ctx.fillText(title, x + 140, y + i * (h + 22) + 72);
    if (sub) drawBlock(ctx, sub, x + 140, y + i * (h + 22) + 128, w - 170, 28, 500, '#a1a1aa', 1.2, 1);
  });
}
function tuto1(ctx, W, H) {
  tutoFrame(ctx, W, H, 1);
  drawBlock(ctx, 'Reçois une notif dès qu’un bâtiment est bloqué', 70, 260, 600, 66, 900, '#fff', 1.08, 5);
  drawBlock(ctx, '4 étapes · 30 secondes · gratuit, sans compte, sans email', 70, 640, 560, 34, 600, '#00ff9c', 1.25, 3);
  phoneMock(ctx, 650, 200, 360, { notif: true });
  ctx.fillStyle = '#fff'; ctx.font = `800 40px ${SF}`; ctx.fillText('Fais défiler →', 70, H - 130);
}
function tuto2(ctx, W, H) {
  tutoFrame(ctx, W, H, 2, '#0a84ff');
  drawBlock(ctx, '📱 Sur iPhone', 70, 250, W - 140, 72, 900, '#fff', 1.1, 1);
  drawBlock(ctx, 'Avec Safari (iOS 16.4 minimum)', 70, 310, W - 140, 32, 600, '#a1a1aa', 1.2, 1);
  stepCards(ctx, 70, 370, W - 140, [
    [`Ouvre ${siteHost()} dans Safari`, 'Scanne le QR code ou touche le lien'],
    ['Touche Partager ⎋', 'Le carré avec la flèche, en bas de l’écran'],
    ['« Sur l’écran d’accueil » → Ajouter', 'L’icône LYON 1 apparaît avec tes apps'],
    ['Ouvre l’app depuis l’icône', 'Important : les notifs ne marchent que là'],
  ], '#0a84ff');
}
function tuto3(ctx, W, H) {
  tutoFrame(ctx, W, H, 3, '#30d158');
  drawBlock(ctx, '🤖 Sur Android', 70, 250, W - 140, 72, 900, '#fff', 1.1, 1);
  drawBlock(ctx, 'Avec Chrome (ou Samsung Internet)', 70, 310, W - 140, 32, 600, '#a1a1aa', 1.2, 1);
  stepCards(ctx, 70, 370, W - 140, [
    [`Ouvre ${siteHost()} dans Chrome`, 'Scanne le QR code ou touche le lien'],
    ['Touche « Installer l’app » sur l’accueil', 'Ou menu ⋮ → « Installer l’application »'],
    ['Confirme « Installer »', 'L’icône LYON 1 apparaît avec tes apps'],
    ['Ouvre l’app depuis l’icône', 'C’est elle qui t’enverra les notifs'],
  ], '#30d158');
}
function tuto4(ctx, W, H) {
  tutoFrame(ctx, W, H, 4);
  drawBlock(ctx, '🔔 Active les notifications', 70, 250, W - 140, 66, 900, '#fff', 1.1, 2);
  stepCards(ctx, 70, 330, W - 140, [
    ['Dans l’app : onglet « Alertes »', 'Menu « Plus » sur téléphone'],
    ['Choisis ton site (La Doua, IUT…)', 'Et ce que tu veux recevoir'],
    ['« Activer les notifications » → Autoriser', 'Teste avec le bouton « Tester »'],
  ], '#ff453a');
  ctx.fillStyle = 'rgba(255,69,58,0.18)'; rrect(ctx, 70, H - 380, W - 140, 270, 34); ctx.fill();
  drawQR(ctx, location.origin, 100, H - 350, 210);
  drawBlock(ctx, 'Anonyme : aucun compte, aucun email, aucun numéro.', 340, H - 290, W - 450, 34, 700, '#fff', 1.25, 3);
  ctx.fillStyle = '#ff453a'; ctx.font = `800 34px ${MONO}`; ctx.fillText(siteHost(), 340, H - 150);
}

// ---------- Votes : story « vote en cours » et story des résultats ----------
function storyVote(ctx, W, H, p) {
  storyFrame(ctx, W, H, '#bf5af2');
  pill(ctx, 80, 380, `🗳️ ${(p.ag || 'VOTE ANONYME').toUpperCase().slice(0, 34)}`, 'rgba(191,90,242,0.22)', '#bf5af2');
  let y = drawBlock(ctx, p.question, 80, 560, W - 160, fitFont(ctx, p.question, (W - 160) * 2.2, 92, 60, 900), 900, '#fff', 1.08, 4) + 30;
  const optH = p.options.length > 3 ? 88 : 104;
  p.options.slice(0, 5).forEach((o) => {
    ctx.fillStyle = 'rgba(118,118,128,0.28)'; rrect(ctx, 80, y, W - 160, optH, 28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${optH * 0.42}px ${SF}`; ctx.fillText(o.slice(0, 30), 124, y + optH * 0.64);
    y += optH + 16;
  });
  ctx.fillStyle = '#00ff9c'; ctx.font = `800 40px ${SF}`;
  const t = `Vote anonyme · 1 vote par téléphone${p.open ? ' · clôture dans ' + remaining(p.closesAt) : ''}`;
  const yText = drawBlock(ctx, t, 80, y + 40, W - 160, 34, 700, '#00ff9c', 1.2, 2);
  const qy = Math.min(Math.max(yText + 20, H - 620), H - 530);
  drawQR(ctx, voteUrl(p), 80, qy, 220);
  drawBlock(ctx, 'Scanne ou touche le lien pour voter', 330, qy + 70, W - 410, 40, 800, '#fff', 1.15, 2);
  linkZone(ctx, 330, qy + 150, W - 410, 'STICKER LIEN');
}
function storyResults(ctx, W, H, p) {
  storyFrame(ctx, W, H, '#00ff9c');
  pill(ctx, 80, 380, `📊 RÉSULTATS · ${(p.ag || 'VOTE ANONYME').toUpperCase().slice(0, 30)}`, 'rgba(0,255,156,0.16)', '#00ff9c');
  let y = drawBlock(ctx, p.question, 80, 560, W - 160, 72, 900, '#fff', 1.1, 3) + 30;
  const counts = p.counts || p.options.map(() => 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const winners = counts.filter((c) => c === max).length;
  if (total && winners === 1) {
    const w = p.options[counts.indexOf(max)];
    ctx.save(); ctx.shadowColor = '#00ff9c'; ctx.shadowBlur = 30;
    y = drawBlock(ctx, `✅ ${w}`, 80, y + 70, W - 160, fitFont(ctx, `✅ ${w}`, W - 160, 110, 60, 900), 900, '#00ff9c', 1.05, 2);
    ctx.restore();
    y += 20;
  }
  counts.forEach((n, i) => {
    const pct = total ? Math.round((n / total) * 100) : 0;
    ctx.fillStyle = 'rgba(118,118,128,0.25)'; rrect(ctx, 80, y, W - 160, 110, 28); ctx.fill();
    ctx.fillStyle = n === max && total ? '#00ff9c66' : '#0a84ff55'; rrect(ctx, 80, y, Math.max(56, (W - 160) * pct / 100), 110, 28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 44px ${SF}`; ctx.fillText(p.options[i].slice(0, 24), 120, y + 70);
    ctx.font = `800 48px ${MONO}`; const t = `${pct} %`; ctx.fillText(t, W - 120 - ctx.measureText(t).width, y + 72);
    y += 130;
  });
  drawBlock(ctx, `${total} vote${total > 1 ? 's' : ''} · vote anonyme et indicatif : les décisions se prennent en AG`, 80, y + 40, W - 160, 34, 600, '#a1a1aa', 1.25, 2);
}

// ---------- Générateur : choix du modèle, aperçu, téléchargement, partage ----------
// Modèle : [clé, libellé, données, largeur, hauteur, fonction de dessin]
async function openStory(kind = 'campus') {
  const d = state.data;
  const polls = (await api('/api/mod/polls').catch(() => [])).filter((p) => inScope(p) && !p.hidden);
  const S = [1080, 1920], P = [1080, 1350];
  const tpl = [
    ['promo', '📣 Promo (story)', null, ...S, promoStory],
    ['post', '🖼️ Promo (publication)', null, ...P, promoPost],
    ['tuto', '🔔 Tuto notifs (4 images)', null, ...P, [tuto1, tuto2, tuto3, tuto4]],
    ['campus', '🏛️ Statut du site', null, ...S, storyCampus],
    ...d.events.slice(0, 3).map((e) => [`ev:${e.id}`, `📣 ${EVENT_TYPE[e.type][0]} · ${e.title.slice(0, 22)}`, e, ...S, (c, w, h) => storyEvent(c, w, h, e)]),
    ...(d.reports[0] ? [[`cr:${d.reports[0].id}`, `📝 CR · ${d.reports[0].titre.slice(0, 20)}`, d.reports[0], ...S, (c, w, h) => storyReport(c, w, h, d.reports[0])]] : []),
    ...polls.filter((p) => p.open).slice(0, 3).map((p) => [`vote:${p.id}`, `🗳️ Vote · ${p.question.slice(0, 22)}`, p, ...S, (c, w, h) => storyVote(c, w, h, p)]),
    ...polls.filter((p) => p.total).slice(0, 3).map((p) => [`res:${p.id}`, `📊 Résultats · ${p.question.slice(0, 18)}`, p, ...S, (c, w, h) => storyResults(c, w, h, p)]),
  ];
  sheet(`<h3>📸 Images à publier</h3>
    <div class="tabs-inline" id="skind" style="flex-wrap:wrap">${tpl.map(([k, l]) => `<button data-k="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div class="story-prev" id="sprev"></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn red" id="sshare">Partager</button><button class="btn ghost" id="sdl">Télécharger</button><button class="btn ghost" id="slink" hidden>🔗 Copier le lien</button></div>
    <p class="faint small" id="shint">Créées sur ton téléphone, sans IA ni service externe, avec les infos à jour.</p>`, (root) => {
    let files = [];
    let current = null;
    const draw = async (k) => {
      $$('#skind button', root).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      current = tpl.find((o) => o[0] === k) || tpl[0];
      const [, , data, w, h, fns] = current;
      files = [];
      for (const [i, fn] of [].concat(fns).entries()) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        await fn(c.getContext('2d'), w, h);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        files.push(new File([blob], `ladoua-en-lutte-${current[0].split(':')[0]}${[].concat(fns).length > 1 ? '-' + (i + 1) : ''}.png`, { type: 'image/png' }));
      }
      $('#sprev', root).innerHTML = files.map((f) => `<img src="${URL.createObjectURL(f)}" alt="Aperçu" style="aspect-ratio:${w}/${h}">`).join('');
      const isVote = current[0].startsWith('vote:') || current[0].startsWith('res:');
      $('#slink', root).hidden = !isVote;
      $('#shint', root).textContent = files.length > 1 ? `${files.length} images : publie-les ensemble en carrousel (dans l’ordre).` : current[0].startsWith('vote:') ? 'Publie en story, puis ajoute le sticker « Lien » d’Instagram sur la zone en pointillés avec le lien copié.' : h === 1350 ? 'Format publication 4:5 (1080 × 1350).' : 'Format story 1080 × 1920.';
    };
    $('#skind', root).onclick = (e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) draw(k); };
    const download = () => files.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }, i * 400));
    $('#sdl', root).onclick = download;
    $('#sshare', root).onclick = async () => {
      if (!files.length) return;
      if (navigator.canShare?.({ files })) { try { await navigator.share({ files }); } catch {} }
      else { download(); toast('Images téléchargées : publie-les sur Instagram.'); }
    };
    $('#slink', root).onclick = async () => { try { await navigator.clipboard.writeText(voteUrl(current[2])); toast('Lien du vote copié ✅'); } catch { prompt('Lien du vote :', voteUrl(current[2])); } };
    draw(tpl.some((o) => o[0] === kind) ? kind : 'promo');
  });
}
async function modStory(el) {
  el.innerHTML = `
    <div class="card"><div class="kicker">📣 Faire connaître le site</div>
      <p class="muted">Story et publication de promo, carrousel qui explique comment installer l’app et activer les notifications. Avec le QR code et l’adresse du site.</p>
      <div class="btn-row"><button class="btn red" data-open="promo">Story promo</button><button class="btn ghost" data-open="post">Publication</button><button class="btn ghost" data-open="tuto">Tuto notifs</button></div></div>
    <div class="card" style="margin-top:12px"><div class="kicker">📸 Infos du jour · ${esc(siteShort(state.modSite))}</div>
      <p class="muted">Statut du site, prochain rendez-vous, compte rendu, votes en cours et résultats.</p>
      <div class="btn-row"><button class="btn ghost" data-open="campus">Statut du site</button><a class="btn ghost" href="#/modo" id="tovotes">Votes et résultats →</a></div></div>
    <p class="faint small">Toutes les images sont dessinées sur ton téléphone à partir des infos du site : aucune IA, aucun service extérieur, gratuit.</p>`;
  el.onclick = (e) => { const k = e.target.closest('[data-open]')?.dataset.open; if (k) openStory(k); };
  $('#tovotes').onclick = (e) => { e.preventDefault(); state.modTab = 'votes'; render(true); };
}

async function modAgenda(el) {
  const all = (await api('/api/mod/events/all')).filter((x) => inScope(x));
  let editing = null;
  const local = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  el.innerHTML = `
    <div class="card"><form class="form" id="ev">
      <div class="kicker" id="evk">Nouveau rendez-vous</div>
      <div class="grid cols-2">
        <div class="field"><label>Type</label><select id="et">${Object.entries(EVENT_TYPE).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Date et heure</label><input type="datetime-local" id="ed" required></div>
      </div>
      <div class="field"><label>Titre</label><input type="text" id="eti" maxlength="120" required placeholder="AG de mobilisation"></div>
      <div class="grid cols-2">
        <div class="field"><label>Lieu</label><input type="text" id="ep" maxlength="140" placeholder="Amphi Thémis, Doua"></div>
        <div class="field"><label>Adresse (pour l’itinéraire)</label><input type="text" id="ea" maxlength="200" placeholder="Bd du 11 Novembre 1918, Villeurbanne"></div>
      </div>
      <div class="field"><label>Infos (ordre du jour, parcours, consignes)</label><textarea id="eds" maxlength="1500"></textarea></div>
      <label class="check"><input type="checkbox" id="en"> Alerter les abonné·es (notification + email)</label>
      ${state.me.role === 'admin' ? allSitesBox('eall') : ''}
      <div class="btn-row"><button class="btn">Publier</button><button type="button" class="btn ghost" id="ecancel" hidden>Annuler</button></div>
    </form></div>
    <h2 class="section">Tous les rendez-vous</h2>
    <div class="list">${all.map((e) => `<div class="row"><span class="pill ${EVENT_TYPE[e.type][1]}">${EVENT_TYPE[e.type][0]}</span><div class="grow"><div class="title">${esc(e.title)}</div><div class="sub">${esc(dayLabel(e.start))} ${esc(hhmm(e.start))} · ${esc(e.place)} ${e.site === ALL_SITES ? '· 🌍 tous les sites' : ''}</div></div>
      <button class="icon-btn" data-edit="${esc(e.id)}">${icon('edit', 18)}</button><button class="icon-btn" data-del="${esc(e.id)}">${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  $('#ev').onsubmit = async (e) => {
    e.preventDefault();
    const body = { version: editing ? all.find((y) => y.id === editing)?.updatedAt : undefined, type: $('#et').value, start: new Date($('#ed').value).toISOString(), title: $('#eti').value, place: $('#ep').value, address: $('#ea').value, description: $('#eds').value, notify: $('#en').checked };
    if ($('#eall')) { if (editing) body.allSites = $('#eall').checked; else if ($('#eall').checked) body.site = ALL_SITES; }
    const er = await act(() => (editing ? api(`/api/mod/events/${editing}`, { method: 'PUT', body }) : api('/api/mod/events', { method: 'POST', body })));
    toast(editing ? 'Modifié.' : `✅ Publié${reachText(er.reach)}`);
    render(true);
  };
  $('#ecancel').onclick = () => render(true);
  el.onclick = async (e) => {
    const del = e.target.closest('[data-del]')?.dataset.del;
    const ed = e.target.closest('[data-edit]')?.dataset.edit;
    if (del && confirm('Supprimer ce rendez-vous ?')) { await act(() => api(`/api/mod/events/${del}`, { method: 'DELETE' }), 'Supprimé.'); render(true); }
    if (ed) {
      const x = all.find((y) => y.id === ed);
      editing = ed;
      $('#evk').textContent = 'Modifier le rendez-vous';
      $('#et').value = x.type; $('#ed').value = local(x.start); $('#eti').value = x.title; $('#ep').value = x.place; $('#ea').value = x.address; $('#eds').value = x.description;
      if ($('#eall')) $('#eall').checked = x.site === ALL_SITES;
      $('#ecancel').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
}

// ----- Comptes rendus : PDF → IA en direct → relecture → publication -----
async function modReports(el) {
  const reports = (await api('/api/mod/reports')).filter((x) => inScope(x));
  el.innerHTML = `
    <div class="card">
      <div class="kicker">Importer un compte rendu d’AG</div>
      <p class="muted small">Dépose le PDF (même scanné). L’IA le lit, retire les noms des personnes et le transforme en flash infos. Tu relis avant de publier.${state.data.aiEnabled ? '' : ' <b style="color:var(--orange)">Aucune IA configurée : extraction simple du texte. Ajoute une clé Gemini gratuite (GEMINI_API_KEY).</b>'}</p>
      <label class="drop" id="drop"><input type="file" id="pdf" accept="application/pdf" hidden><div style="font-size:34px">📄</div><b>Choisir un PDF</b><div class="faint small">ou glisse-le ici · 25 Mo max</div></label>
    </div>
    <div id="ai" hidden style="margin-top:14px"></div>
    <div id="editor"></div>
    <h2 class="section">Comptes rendus</h2>
    <div class="list">${reports.map((r) => `<div class="row"><span class="pill ${r.status === 'published' ? 'green' : 'orange'}">${r.status === 'published' ? 'Publié' : 'Brouillon'}</span><div class="grow"><div class="title">${esc(r.titre)}</div><div class="sub">${esc(r.fileName || '')} · ${esc(ago(r.createdAt))} · ${esc(r.org)}</div></div><button class="icon-btn" data-open="${esc(r.id)}">${icon('edit', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  const drop = $('#drop');
  const go = (file) => { if (file) analyze(file, el); };
  $('#pdf').onchange = (e) => go(e.target.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer.files[0]); };
  el.querySelector('.list').onclick = (e) => { const id = e.target.closest('[data-open]')?.dataset.open; if (id) openEditor(reports.find((r) => r.id === id)); };
}

async function analyze(file, el) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return toast('Il faut un fichier PDF.');
  const ai = $('#ai');
  ai.hidden = false;
  ai.innerHTML = `<div class="terminal"><div class="bar"><i></i><i></i><i></i><span>ia@lyon1:~$ analyse ${esc(file.name)}</span></div><div class="body" id="ailog"></div></div>`;
  $('#editor').innerHTML = '';
  const log = $('#ailog');
  const line = (t, cls = '') => { const d = document.createElement('div'); d.className = `line ${cls}`; d.innerHTML = `<span class="t">[${hhmm(new Date().toISOString())}]</span> ${esc(t)}`; log.appendChild(d); log.scrollTop = 1e9; };
  const stream = document.createElement('div');
  stream.className = 'line stream cursor';
  let streamed = '';
  line(`> upload ${file.name}…`, 'info');
  try {
    const res = await fetch('/api/mod/reports/analyze', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name), 'X-Site': state.modSite || '' }, body: file, credentials: 'same-origin' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Erreur ${res.status}`); }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!raw.trim()) continue;
        const ev = JSON.parse(raw);
        if (ev.t === 'log') line(ev.m, 'ok');
        else if (ev.t === 'delta') {
          if (!stream.isConnected) { line('> génération des flash infos en direct :', 'info'); log.appendChild(stream); }
          streamed += ev.d;
          stream.textContent = streamed.length > 1600 ? '…' + streamed.slice(-1600) : streamed;
          log.scrollTop = 1e9;
        } else if (ev.t === 'error') { stream.classList.remove('cursor'); line(`ERREUR : ${ev.m}`, 'alert'); toast(ev.m); }
        else if (ev.t === 'done') {
          stream.classList.remove('cursor');
          line(`✓ ${ev.report.flashs.length} flash infos, ${ev.report.votes.length} vote(s), ${ev.report.rdv.length} rdv. Relis puis publie ↓`, 'ok');
          openEditor(ev.report);
        }
      }
    }
  } catch (err) { line(`ERREUR : ${err.message}`, 'alert'); toast(err.message); }
}

function openEditor(r) {
  const draft = structuredClone(r);
  const box = $('#editor');
  const setPath = (obj, path, v) => { const k = path.split('.'); let o = obj; while (k.length > 1) o = o[k.shift()]; o[k[0]] = v; };
  const opts = (map, cur) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
  const draw = () => {
    box.innerHTML = `
    <div class="card" style="margin-top:14px;border-color:rgba(0,255,156,0.35)">
      <div class="kicker">Relecture ${draft.status === 'published' ? '(publié)' : '(brouillon)'}</div>
      <div class="form" style="margin-top:10px">
        <div class="field"><label>Titre</label><input type="text" data-k="titre" value="${esc(draft.titre)}"></div>
        <div class="grid cols-2">
          <div class="field"><label>Date (AAAA-MM-JJ)</label><input type="text" data-k="date" value="${esc(draft.date)}"></div>
          <div class="field"><label>Lieu</label><input type="text" data-k="lieu" value="${esc(draft.lieu)}"></div>
        </div>
        <div class="field"><label>Participant·es</label><input type="text" data-k="participants" value="${esc(draft.participants)}"></div>
        <div class="field"><label>Résumé (2 phrases)</label><textarea data-k="resume">${esc(draft.resume)}</textarea></div>
        <div class="kicker">Flash infos</div>
        ${draft.flashs.map((f, i) => `<div class="card" style="background:rgba(0,0,0,0.3)"><div class="grid cols-2"><select data-k="flashs.${i}.type">${opts({ decision: '⚖️ Décision', vote: '🗳️ Vote', action: '📣 Action', info: 'ℹ️ Info', alerte: '🚨 Alerte' }, f.type)}</select><input type="text" data-k="flashs.${i}.titre" value="${esc(f.titre)}"></div><textarea data-k="flashs.${i}.texte" style="margin-top:8px;min-height:60px">${esc(f.texte)}</textarea><button type="button" class="btn small ghost" data-rm="flashs.${i}" style="margin-top:6px">Retirer</button></div>`).join('')}
        <button type="button" class="btn small ghost" id="addf">${icon('plus', 16)} Ajouter un flash</button>
        ${list('votes', 'Votes', (v) => `${v.question} (pour ${v.pour || '?'} / contre ${v.contre || '?'} / abst. ${v.abstention || '?'}) → ${v.resultat}`)}
        ${list('rdv', 'Rendez-vous annoncés', (e) => `${EVENT_TYPE[e.type][0]} · ${e.titre} · ${e.date} ${e.heure} · ${e.lieu}`)}
        ${list('batiments_bloques', 'Bâtiments bloqués cités', (b) => b)}
        ${list('revendications', 'Revendications', (t) => t)}
        ${draft.status !== 'published' ? `
          <label class="check"><input type="checkbox" id="impE" ${draft.rdv.length ? 'checked' : ''}> Ajouter les rendez-vous datés à l’agenda</label>
          <label class="check"><input type="checkbox" id="impD"> Ajouter les revendications à la page Revendications</label>
          <label class="check"><input type="checkbox" id="notif"> Envoyer le résumé aux abonné·es</label>` : ''}
        <div class="btn-row">
          ${draft.status !== 'published' ? '<button type="button" class="btn green" id="pub">Publier</button>' : '<button type="button" class="btn ghost" id="unpub">Dépublier</button>'}
          <button type="button" class="btn ghost" id="savedraft">Enregistrer</button>
          <button type="button" class="btn red" id="delr">Supprimer</button>
        </div>
      </div>
    </div>`;
  };
  function list(key, label, line) {
    if (!draft[key].length) return '';
    return `<div class="kicker">${label}</div><div class="list">${draft[key].map((x, i) => `<div class="row"><div class="grow small">${esc(line(x))}</div><button type="button" class="icon-btn" data-rm="${key}.${i}">${icon('trash', 16)}</button></div>`).join('')}</div>`;
  }
  draw();
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  box.oninput = (e) => { const k = e.target.dataset.k; if (k) setPath(draft, k, e.target.value); };
  box.onchange = box.oninput;
  const save = async (extra = {}) => { const r = await api(`/api/mod/reports/${draft.id}`, { method: 'PUT', body: { ...draft, version: draft.updatedAt, ...extra } }); draft.updatedAt = r.updatedAt; return r; };
  box.onclick = async (e) => {
    const rm = e.target.closest('[data-rm]')?.dataset.rm;
    if (rm) { const [k, i] = rm.split('.'); draft[k].splice(Number(i), 1); draw(); return; }
    const id = e.target.id;
    if (id === 'addf') { draft.flashs.push({ type: 'info', titre: '', texte: '' }); draw(); }
    if (id === 'savedraft') { await act(() => save(), 'Enregistré.'); }
    if (id === 'pub') { await act(() => save({ publish: true, importEvents: $('#impE')?.checked, importDemands: $('#impD')?.checked, notify: $('#notif')?.checked }), 'Publié ✅'); await refresh(); render(true); }
    if (id === 'unpub') { await act(() => save({ unpublish: true }), 'Dépublié.'); await refresh(); render(true); }
    if (id === 'delr' && confirm('Supprimer ce compte rendu ?')) { await act(() => api(`/api/mod/reports/${draft.id}`, { method: 'DELETE' }), 'Supprimé.'); await refresh(); render(true); }
  };
}

function modFlash(el) {
  el.innerHTML = `
    <div class="card"><form class="form" id="ff">
      <div class="kicker">Flash info (affiché en haut de l’accueil + fil live)</div>
      <div class="segmented" id="fl"><button type="button" data-l="alerte">🚨 Alerte</button><button type="button" data-l="info" class="on">ℹ️ Info</button><button type="button" data-l="ok">✅ Bonne nouvelle</button></div>
      <textarea id="ft" maxlength="280" required placeholder="Ex : Nasse en cours place Bellecour, évitez le secteur."></textarea>
      <div class="field"><label>Visible sur l’accueil pendant</label>
        <div class="segmented ttl-seg" id="fttl">${[[1, '1 h'], [6, '6 h'], [24, '24 h'], [72, '3 jours'], [0, 'Sans limite']].map(([v, l]) => `<button type="button" data-ttl="${v}" class="${v === 24 ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="faint small" style="margin:4px 2px 0">Ensuite, il disparaît tout seul de l’accueil (il reste ici, dans l’historique).</p></div>
      ${state.me.role === 'admin' ? allSitesBox('fall') : ''}
      ${state.me.role === 'admin' ? `<label class="check official-box"><input type="checkbox" id="foff"> <span>📢 <b>Annonce officielle</b> : notification sur <b>tous les téléphones abonnés</b> (tous sites, tous réglages) + Telegram, signée « Administration du site »</span></label>` : ''}
      <button class="btn">Publier</button></form></div>
    <h2 class="section">Flash publiés</h2>
    <div class="list" id="flist"><div class="empty">Chargement…</div></div>`;
  let level = 'info';
  let ttl = 24;
  $('#fttl').onclick = (e) => { const v = e.target.closest('[data-ttl]')?.dataset.ttl; if (v !== undefined) { ttl = Number(v); $$('#fttl button').forEach((b) => b.classList.toggle('on', b.dataset.ttl === v)); } };
  drawFlashList();
  $('#fl').onclick = (e) => { if (e.target.dataset.l) { level = e.target.dataset.l; $$('#fl button').forEach((b) => b.classList.toggle('on', b === e.target)); } };
  if ($('#foff')) $('#foff').onchange = () => { const on = $('#foff').checked; if ($('#fall')) { $('#fall').checked = on || $('#fall').checked; $('#fall').disabled = on; } $('#ff .btn:not(.ghost)').textContent = on ? '📢 Envoyer à tout le monde' : 'Publier'; };
  $('#ff').onsubmit = async (e) => { e.preventDefault(); const all = $('#fall')?.checked; const official = $('#foff')?.checked;
    if (official && !confirm('Envoyer cette annonce en notification sur TOUS les téléphones abonnés et sur Telegram, au nom de l’administration du site ?')) return;
    if (!official && all && !confirm(`Publier ce flash pour TOUS les sites${level === 'alerte' ? ' (alerte : notification à tout le monde)' : ''} ?`)) return;
    const fr = await act(() => api('/api/mod/flashes', { method: 'POST', body: { level, ttl, text: $('#ft').value, ...(official ? { official: true } : all ? { site: ALL_SITES } : {}) } }));
    toast(`✅ Publié${reachText(fr.reach)}`); await refresh(); render(true); };
  el.querySelector('.list').onclick = async (e) => {
    const id = e.target.closest('[data-del]')?.dataset.del;
    if (id) { if (!confirm('Supprimer ce flash ?')) return; await act(() => api(`/api/mod/flashes/${id}`, { method: 'DELETE' }), 'Supprimé.'); await refresh(); return drawFlashList(); }
    const ex = e.target.closest('[data-ext]');
    if (ex) { await act(() => api(`/api/mod/flashes/${ex.dataset.id}`, { method: 'PUT', body: { ttl: Number(ex.dataset.ext) } }), Number(ex.dataset.ext) ? `Visible ${ex.dataset.ext} h de plus.` : 'Retiré de l’accueil.'); await refresh(); drawFlashList(); }
  };
}
// Historique des flash : en ligne (avec le temps restant) puis expirés
async function drawFlashList() {
  const box = $('#flist');
  if (!box) return;
  let list;
  try { list = (await api('/api/mod/flashes')).filter((f) => inScope(f)); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const live = (f) => !f.expiresAt || new Date(f.expiresAt).getTime() > Date.now();
  const left = (f) => { const min = Math.max(1, Math.ceil((new Date(f.expiresAt).getTime() - Date.now()) / 60e3)); const h = Math.floor(min / 60), m = min % 60; return h >= 24 ? `${Math.round(min / 1440)} j` : h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`; };
  const row = (f) => `<div class="row ${live(f) ? '' : 'expired'}"><span>${f.level === 'alerte' ? '🚨' : f.level === 'ok' ? '✅' : 'ℹ️'}</span><div class="grow"><div>${esc(f.text)}</div>
      <div class="sub">${esc(ago(f.at))} · ${esc(f.org)} ${f.site === ALL_SITES ? '· 🌍 tous les sites' : ''} · ${live(f) ? (f.expiresAt ? `<b class="ttl-left">⏳ encore ${left(f)}</b>` : '<b class="ttl-left">∞ sans limite</b>') : '<b>⌛ expiré</b>'}</div>
      <div class="btn-row ttl-acts">${live(f) ? `<button class="btn small ghost" data-ext="24" data-id="${esc(f.id)}">+24 h</button><button class="btn small ghost" data-ext="1" data-id="${esc(f.id)}" title="Retirer de l’accueil dans 1 h">Finir dans 1 h</button>` : `<button class="btn small ghost" data-ext="24" data-id="${esc(f.id)}">↺ Remettre 24 h</button>`}</div></div>
    <button class="icon-btn" data-del="${esc(f.id)}" aria-label="Supprimer">${icon('trash', 18)}</button></div>`;
  const on = list.filter(live), off = list.filter((f) => !live(f));
  box.innerHTML = (on.length ? on.map(row).join('') : '<div class="empty">Aucun flash en ligne.</div>') + (off.length ? `<div class="kicker" style="padding:12px 16px 4px">Expirés (plus sur l’accueil)</div>${off.slice(0, 30).map(row).join('')}` : '');
}

function modDemands(el) {
  const ctx = state.data.context || {};
  el.innerHTML = `
    <details class="card"><summary class="kicker" style="cursor:pointer">✍️ Texte « ${esc(ctx.title || 'Le contexte')} » (en haut de la page)</summary>
      <form class="form" id="ctxf" style="margin-top:10px">
        <div class="field"><label>Titre</label><input type="text" id="cxt" maxlength="80" value="${esc(ctx.title || 'Le contexte')}"></div>
        <div class="field"><label>Texte (une ligne vide entre deux paragraphes)</label><textarea id="cxx" style="min-height:220px">${esc(ctx.text || '')}</textarea></div>
        <div class="field"><label>Appel en gros (bandeau rouge)</label><input type="text" id="cxc" maxlength="300" value="${esc(ctx.call || '')}"></div>
        <div class="field"><label>Texte de fin</label><textarea id="cxe">${esc(ctx.closing || '')}</textarea></div>
        <div class="field"><label>Source / précision</label><input type="text" id="cxs" maxlength="600" value="${esc(ctx.source || '')}"></div>
        <button class="btn small">Enregistrer</button>
      </form></details>
    <div class="card"><form class="form" id="df">
      <div class="kicker">Nouvelle revendication</div>
      <div class="field"><input type="text" id="dt" maxlength="160" required placeholder="Intitulé court"></div>
      <div class="field"><input type="text" id="dc" maxlength="60" list="dcats" placeholder="Catégorie (ex : Bourses, Logement, Examens)"><datalist id="dcats">${[...new Set(state.data.demands.map((d) => d.category))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><textarea id="dx" maxlength="2000" placeholder="Explication (facultatif)"></textarea></div>
      <button class="btn">Ajouter</button></form></div>
    <h2 class="section">Revendications</h2>
    <div class="list">${state.data.demands.map((d) => `<div class="row" data-id="${esc(d.id)}"><div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">${esc(d.category)} · ✊ ${d.support}</div></div>
      <select data-status style="width:auto">${Object.entries(DEMAND_STATUS).map(([k, [l]]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" data-del>${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucune.</div>'}</div>`;
  $('#ctxf').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/context', { method: 'PUT', body: { title: $('#cxt').value, text: $('#cxx').value, call: $('#cxc').value, closing: $('#cxe').value, source: $('#cxs').value } }), 'Texte enregistré.'); await refresh(); };
  $('#df').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/demands', { method: 'POST', body: { title: $('#dt').value, category: $('#dc').value, text: $('#dx').value } }), 'Ajoutée.'); await refresh(); render(true); };
  el.querySelector('.list').onchange = (e) => { if (e.target.matches('[data-status]')) act(() => api(`/api/mod/demands/${e.target.closest('.row').dataset.id}`, { method: 'PUT', body: { status: e.target.value, version: state.raw.demands.find((x) => x.id === e.target.closest('.row').dataset.id)?.updatedAt } }), 'Statut mis à jour.'); };
  el.querySelector('.list').onclick = async (e) => { if (e.target.closest('[data-del]') && confirm('Supprimer ?')) { await act(() => api(`/api/mod/demands/${e.target.closest('.row').dataset.id}`, { method: 'DELETE' }), 'Supprimée.'); await refresh(); render(true); } };
}

function modContacts(el) {
  el.innerHTML = `
    <div class="card"><form class="form" id="cf">
      <div class="kicker">Ajouter un contact (« Parler à qui ? »)</div>
      <div class="field"><input type="text" id="cn" maxlength="100" required placeholder="Nom du syndicat / collectif"></div>
      <div class="field"><input type="text" id="cr" maxlength="160" placeholder="Rôle (ex : aide juridique, permanence, soutien psy)"></div>
      <div class="field"><input type="text" id="ch" maxlength="300" placeholder="Comment les joindre (ex : permanence lundi 12h, local Thémis)"></div>
      <div class="field"><input type="text" id="cl" maxlength="300" placeholder="Lien : https://…, mailto:… ou tel:…"></div>
      <button class="btn">Ajouter</button></form></div>
    <div class="list" style="margin-top:14px">${state.data.contacts.map((c) => `<div class="row"><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.role)} ${esc(c.how)}</div></div><button class="icon-btn" data-del="${esc(c.id)}">${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  $('#cf').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/contacts', { method: 'POST', body: { name: $('#cn').value, role: $('#cr').value, how: $('#ch').value, link: $('#cl').value } }), 'Ajouté.'); await refresh(); render(true); };
  el.querySelector('.list').onclick = async (e) => { const id = e.target.closest('[data-del]')?.dataset.del; if (id && confirm('Supprimer ?')) { await act(() => api(`/api/mod/contacts/${id}`, { method: 'DELETE' }), 'Supprimé.'); await refresh(); render(true); } };
}

async function modChat(el) {
  const [list, bl] = await Promise.all([api('/api/mod/chat/reported'), api('/api/mod/chat-banned')]);
  el.innerHTML = `
    <form class="card form" id="blf" style="margin-bottom:14px">
      <div class="kicker">🚫 Liste noire du chat</div>
      <p class="muted small" style="margin:6px 0">${bl.base} mots et expressions interdits sont déjà intégrés (gros mots, insultes, propos racistes, sexistes, LGBTphobes, validistes, menaces). Les messages qui en contiennent sont supprimés sur le téléphone avant d’être envoyés, et refusés par le serveur. Les variantes (majuscules, accents, s4l0pe, connnnard, s.a.l.o.p.e) sont reconnues. Ajoute ici d’autres mots ou expressions, un par ligne (surnoms visant quelqu’un, nouvelles insultes…).</p>
      <div class="field"><textarea name="words" rows="4" placeholder="un mot ou une expression par ligne">${esc(bl.extra.join('\n'))}</textarea></div>
      <button class="btn small">Enregistrer la liste</button>
    </form>`
    + `
    <p class="muted small">Messages signalés ou masqués. Un message est masqué automatiquement après 3 signalements. Sur le chat public, tes messages s’affichent avec le badge de ton organisation.</p>
    <div class="list">${list.map((m) => `<div class="row"><div class="grow"><div class="title">${esc(m.nick)} <span class="faint small">#${esc(m.channel)} · ${esc(ago(m.at))}</span></div><div>${m.photo ? (m.photo.gone ? '📸 <i>photo expirée ou supprimée</i>' : `📸 Photo <button class="btn small ghost" data-modsnap="${esc(m.photo.id)}">Voir</button> <button class="btn small red" data-delsnap="${esc(m.id)}">Supprimer la photo</button>`) : ''}${esc(m.text)}</div><div class="sub">${m.reports} signalement(s) ${m.hidden ? '· <b style="color:var(--red)">masqué</b>' : ''}</div></div>
      ${m.hidden ? `<button class="btn small ghost" data-restore="${esc(m.id)}">Rétablir</button>` : `<button class="btn small red" data-hide="${esc(m.id)}">Masquer</button>`}</div>`).join('') || '<div class="empty">Rien à modérer 👌</div>'}</div>`;
  $('#blf').onsubmit = async (e) => { e.preventDefault(); const r = await act(() => api('/api/mod/chat-banned', { method: 'PUT', body: { words: e.target.words.value } }), 'Liste noire enregistrée.'); state.chatRules = null; e.target.words.value = r.extra.join('\n'); };
  el.onclick = async (e) => {
    if (e.target.dataset.modsnap) return openSnap(e.target.dataset.modsnap, true);
    if (e.target.dataset.delsnap) { if (confirm('Supprimer définitivement cette photo ?')) { await act(() => api(`/api/mod/chat/${e.target.dataset.delsnap}?photo=delete`, { method: 'DELETE' }), 'Photo supprimée.'); render(true); } return; }
    const h = e.target.dataset.hide; const r = e.target.dataset.restore;
    if (h) { await act(() => api(`/api/mod/chat/${h}`, { method: 'DELETE' }), 'Masqué.'); render(true); }
    if (r) { await act(() => api(`/api/mod/chat/${r}/restore`, { method: 'POST' }), 'Rétabli.'); render(true); }
  };
}

async function modInstagram(el) {
  const cfg = await api('/api/mod/instagram');
  el.innerHTML = `
    <div class="card">
      <div class="kicker">📷 Canal Instagram officiel</div>
      <p class="muted small">Le canal est lu périodiquement et analysé par l’IA (clé Gemini ou Groq obligatoire). Seuls les bâtiments au nom exact, les AG/manifs datées et les flashs sont publiés, sans doublon. ⚠ Instagram bloque souvent la lecture sans connexion : si une erreur s’affiche, ça ne marchera pas sans cookie de session.</p>
      <form class="form" id="instagram-config">
        <div class="field"><label>URL du canal</label><input type="url" id="instagram-url" value="${esc(cfg.url)}" required></div>
        <div class="field"><label>Compte Instagram des stories</label><input type="url" id="instagram-account-url" value="${esc(cfg.accountUrl)}" required></div>
        <div class="grid cols-2">
          <div class="field"><label>Site ciblé</label><select id="instagram-site">${siteList().map((x) => `<option value="${esc(x.id)}" ${x.id === cfg.site ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Lecture toutes les (minutes)</label><input type="number" id="instagram-interval" min="5" max="1440" value="${esc(cfg.interval)}"></div>
        </div>
        <label class="check"><input type="checkbox" id="instagram-enabled" ${cfg.enabled ? 'checked' : ''}> Activation automatique</label>
        <div class="btn-row"><button class="btn" type="submit">Enregistrer</button><button type="button" class="btn ghost" id="instagram-sync">Synchroniser maintenant</button></div>
      </form>
      <div id="instagram-status" class="terminal" style="margin-top:12px"><div class="body">${cfg.status.lastError ? `<span style="color:var(--red)">⚠ ${esc(cfg.status.lastError)}</span>` : cfg.status.lastCheck ? `Dernière lecture ${esc(ago(cfg.status.lastCheck))}<br>Messages vus : ${cfg.status.sourceCount || 0}<br>Analyse : ${esc(cfg.status.sourceModel || 'inconnue')}<br><pre>${esc(JSON.stringify(cfg.status.applied || {}, null, 2))}</pre>` : 'Pas encore lu.'}</div></div>
    </div>`;
  $('#instagram-config', el).onsubmit = async (e) => {
    e.preventDefault();
    await act(() => api('/api/mod/instagram', { method: 'PUT', body: { url: $('#instagram-url', el).value, accountUrl: $('#instagram-account-url', el).value, site: $('#instagram-site', el).value, interval: Number($('#instagram-interval', el).value), enabled: $('#instagram-enabled', el).checked } }), 'Instagram enregistré.');
  };
  $('#instagram-sync', el).onclick = async () => {
    $('#instagram-status', el).innerHTML = '<div class="body">Lecture du canal…</div>';
    try {
      const r = await act(() => api('/api/mod/instagram/sync', { method: 'POST' }));
      if (r.channel?.error) toast(`Canal : ${r.channel.error}`);
      const ca = r.channel?.applied || {};
      const sa = r.stories?.applied || {};
      const storyCount = r.stories?.storyCount || 0;
      $('#instagram-status', el).innerHTML = `<div class="body">Canal : ${(ca.buildings || []).length} bâtiment(s), ${(ca.events || []).length} événement(s), ${(ca.flashes || []).length} flash(s).<br>Stories : ${storyCount} lue(s), ${(sa.buildings || []).length} bâtiment(s), ${(sa.events || []).length} événement(s), ${(sa.flashes || []).length} flash(s).<pre>${esc(JSON.stringify({ channel: ca, stories: sa }, null, 2))}</pre></div>`;
    } catch (e) { $('#instagram-status', el).innerHTML = `<div class="body" style="color:var(--red)">⚠ ${esc(e.message)}</div>`; }
  };
}

async function modAccounts(el) {
  const mods = await api('/api/mod/mods');
  el.innerHTML = `
    <div class="card"><form class="form" id="mf">
      <div class="kicker">Créer un accès modo (un par personne)</div>
      <div class="grid cols-2"><div class="field"><label>Identifiant</label><input type="text" id="mu" required pattern="[a-z0-9._\\-]{3,40}" placeholder="ag.doua.marie"></div>
      <div class="field"><label>Nom affiché publiquement (AG, syndicat…)</label><input type="text" id="mo" required maxlength="80" placeholder="AG Doua · Solidaires"></div></div>
      <div class="field"><label>Sites où ce modo peut agir</label></div>
      <div class="chips" id="msitesNew">${siteList().map((x) => `<label class="check" style="padding:2px 8px 2px 0"><input type="checkbox" name="ns" value="${esc(x.id)}" ${x.id === state.modSite ? 'checked' : ''}> ${esc(x.short)}</label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="ma"> Admin : tous les sites, comptes et réglages</label>
      <label class="check"><input type="checkbox" id="mt"> <span>📍 Compte <b>piquet</b> : seulement les bâtiments, photo obligatoire, connexion par lien ou QR code, sans mot de passe</span></label>
      <button class="btn">Créer et générer le mot de passe</button></form></div>
    ${modPushSummary(mods)}
    <div class="list" style="margin-top:14px">${mods.map((m) => `<div class="row"><div class="grow"><div class="title">${esc(m.username)} ${m.role === 'admin' ? '<span class="pill purple">admin</span>' : m.role === 'terrain' ? '<span class="pill orange">📍 piquet</span>' : ''} ${m.disabled ? '<span class="pill grey">désactivé</span>' : m.modPush ? `<span class="pill green" title="Dernière activation ${esc(ago(m.modPushAt))}">🔔 alertes · ${m.modPush} tél.</span>` : '<span class="pill orange">🔕 alertes non activées</span>'}</div><div class="sub">${esc(m.org)} · ${m.role === 'admin' ? 'tous les sites' : esc((m.sites || []).map(siteShort).join(', ') || 'aucun site')}</div></div>
      ${m.id === state.me.id ? '' : `<button class="btn small ghost" data-edit="${esc(m.id)}">Modifier</button>`}${m.role === 'terrain' ? `<button class="btn small ghost" data-link="${esc(m.id)}">Nouveau lien</button>` : `<button class="btn small ghost" data-reset="${esc(m.id)}">Nouveau mdp</button>`}${m.disabled || m.id === state.me.id ? '' : `<button class="btn small red" data-off="${esc(m.id)}">Désactiver</button>`}</div>`).join('')}</div>`;
  const showLink = (m) => sheet(`<h3>📍 Lien piquet · ${esc(m.org)}</h3>
    <p class="muted">À ouvrir sur le téléphone de la personne du piquet (ou à scanner) : elle est connectée directement, avec seulement les bâtiments de ${esc((m.sites || []).map(siteShort).join(', '))}.</p>
    <div class="qr-box">${qrImg(m.link)}</div>
    <div class="secret" style="font-size:12px;word-break:break-all">${esc(m.link)}</div>
    <div class="btn-row"><button class="btn" id="lcopy">Copier le lien</button>${navigator.share ? '<button class="btn ghost" id="lshare">Partager…</button>' : ''}</div>
    <p class="faint small">Envoie-le par Signal. Il ne sera plus affiché : en cas de perte, « Nouveau lien » (l’ancien cessera de marcher).</p>`, (root) => {
      $('#lcopy', root).onclick = async () => { try { await navigator.clipboard.writeText(m.link); toast('Lien copié ✅'); } catch { prompt('Lien :', m.link); } };
      if ($('#lshare', root)) $('#lshare', root).onclick = () => navigator.share({ title: 'Accès piquet · La Doua en lutte', text: 'Ton accès piquet pour mettre à jour les bâtiments :', url: m.link }).catch(() => {});
    });
  const showPw = (m) => sheet(`<h3>Accès pour ${esc(m.username)}</h3><p class="muted">Transmets-le en main propre ou par messagerie chiffrée (Signal). Il ne sera plus affiché.</p><div class="secret">${esc(m.password)}</div><p class="faint small">La personne pourra le changer dans « Mon compte ».</p>`);
  // comptes piquet partagés : l'admin peut débloquer tous les téléphones bloqués par les modos
  el.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:14px"><div class="kicker">📍 Comptes piquet partagés</div><p class="muted small">Un même lien peut servir à plusieurs personnes. Chaque mise à jour est tracée par téléphone (« tél. ab12cd » dans le journal) ; un·e modo peut bloquer un téléphone qui envoie de fausses infos depuis la photo du piquet.</p><button type="button" class="btn ghost small" id="unblock">Débloquer tous les téléphones bloqués</button></div>`);
  $('#unblock', el).onclick = async () => { if (!confirm('Débloquer tous les téléphones piquet bloqués ?')) return; const r = await act(() => api('/api/mod/blocked-devices', { method: 'DELETE' })); toast(`${r.n} téléphone(s) débloqué(s).`); };
  $('#mf').onsubmit = async (e) => { e.preventDefault(); const m = await act(() => api('/api/mod/mods', { method: 'POST', body: { username: $('#mu').value, org: $('#mo').value, role: $('#ma').checked ? 'admin' : $('#mt').checked ? 'terrain' : 'mod', sites: $$('input[name=ns]:checked').map((x) => x.value) } })); m.link ? showLink(m) : showPw(m); await modAccounts(el); };
  el.querySelector('.list').onclick = async (e) => {
    const r = e.target.dataset.reset; const o = e.target.dataset.off; const ed = e.target.dataset.edit; const lk = e.target.dataset.link;
    if (lk && confirm('Générer un nouveau lien terrain ? L’ancien lien et les téléphones déjà connectés ne marcheront plus.')) { showLink(await act(() => api(`/api/mod/mods/${lk}/link`, { method: 'POST' }))); await modAccounts(el); return; }
    if (ed) {
      const m = mods.find((x) => x.id === ed);
      sheet(`<h3>${esc(m.username)}</h3><form class="form" id="emf">
        <div class="field"><label>Nom affiché</label><input type="text" id="emo" maxlength="80" value="${esc(m.org)}"></div>
        <div class="field"><label>Sites</label></div>
        ${siteList().map((x) => `<label class="check"><input type="checkbox" name="es" value="${esc(x.id)}" ${(m.sites || []).includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}
        <label class="check"><input type="checkbox" id="ema" ${m.role === 'admin' ? 'checked' : ''}> Admin (tous les sites)</label>
        <button class="btn">Enregistrer</button></form>`, (root, close) => {
        $('#emf', root).onsubmit = async (ev) => { ev.preventDefault(); await act(() => api(`/api/mod/mods/${ed}`, { method: 'PUT', body: { org: $('#emo', root).value, role: $('#ema', root).checked ? 'admin' : 'mod', sites: $$('input[name=es]:checked', root).map((x) => x.value) } }), 'Compte mis à jour.'); close(); await modAccounts(el); };
      });
    }
    if (r && confirm('Générer un nouveau mot de passe ? L’ancien ne marchera plus.')) { showPw(await act(() => api(`/api/mod/mods/${r}/reset`, { method: 'POST' }))); await modAccounts(el); }
    if (o && confirm('Désactiver ce compte ?')) { await act(() => api(`/api/mod/mods/${o}`, { method: 'DELETE' }), 'Désactivé.'); await modAccounts(el); }
  };
}

async function modSites(el) {
  el.innerHTML = `
    <div id="tgbox"><div class="card muted small">📣 Vérification de la chaîne Telegram…</div></div>
    <p class="muted small">Chaque site a ses bâtiments, son titre d’accueil, ses votes d’AG, ses revendications, son blog et ses notifications. Les modos ne voient et ne modifient que les sites que tu leur donnes (onglet Comptes). Le site principal s’affiche par défaut aux étudiant·es.</p>
    <div class="list">${siteList().map((x) => `<div class="row" data-id="${esc(x.id)}"><div class="grow"><div class="title">${esc(x.name)} ${x.id === defaultSite() ? '<span class="pill red">principal</span>' : ''}</div><div class="sub">Nom court : ${esc(x.short)} · ${state.raw.buildings.filter((b) => b.site === x.id).length} bâtiment(s)</div></div>
      <button class="btn small ghost" data-edit>Modifier</button>${x.id === defaultSite() ? '' : '<button class="icon-btn" data-del>' + icon('trash', 18) + '</button>'}</div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><form class="form" id="sf">
      <div class="kicker">Ajouter un site</div>
      <div class="grid cols-2"><div class="field"><label>Nom complet</label><input type="text" id="sn" required maxlength="80" placeholder="IUT Lyon 1 · Bourg-en-Bresse"></div>
      <div class="field"><label>Nom court (onglets)</label><input type="text" id="ss" maxlength="30" placeholder="IUT Bourg"></div></div>
      <button class="btn">Ajouter</button></form></div>`;
  telegramCard();
  $('#sf').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/sites', { method: 'POST', body: { name: $('#sn').value, short: $('#ss').value } }), 'Site ajouté.'); await refresh(); render(true); };
  el.querySelector('.list').onclick = async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const x = siteList().find((y) => y.id === row.dataset.id);
    if (e.target.closest('[data-del]') && confirm(`Supprimer le site « ${x.name} » ? (seulement s’il est vide)`)) { await act(() => api(`/api/mod/sites/${x.id}`, { method: 'DELETE' }), 'Supprimé.'); await refresh(); render(true); }
    if (e.target.closest('[data-edit]')) sheet(`<h3>${esc(x.name)}</h3><form class="form" id="esf">
      <div class="field"><label>Nom complet</label><input type="text" id="esn" maxlength="80" value="${esc(x.name)}"></div>
      <div class="field"><label>Nom court</label><input type="text" id="ess" maxlength="30" value="${esc(x.short)}"></div>
      <div class="field"><label>Chaîne Telegram propre à ce site (facultatif : @nom, lien t.me ou -100…)</label><input type="text" id="est" maxlength="80" placeholder="vide = chaîne principale" value="${esc(state.tgSites?.[x.id] || '')}"></div>
      <button class="btn">Enregistrer</button></form>`, (root, close) => {
      $('#esf', root).onsubmit = async (ev) => { ev.preventDefault(); await act(() => api(`/api/mod/sites/${x.id}`, { method: 'PUT', body: { name: $('#esn', root).value, short: $('#ess', root).value, telegramChatId: $('#est', root).value.trim() } }), 'Site mis à jour.'); close(); await refresh(); render(true); };
    });
  };
}

async function modJournal(el) {
  const list = await api('/api/mod/audit');
  el.innerHTML = `<div class="terminal"><div class="bar"><i></i><i></i><i></i><span>audit.log</span></div><div class="body" style="max-height:none">${list.map((a) => `<div class="line"><span class="t">[${esc(fmt(a.at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}]</span> ${a.siteName ? `<b>[${esc(a.siteName)}]</b> ` : ''}${esc(a.by)} (${esc(a.org)}) · ${esc(a.action)} · ${esc(a.detail)}</div>`).join('') || '<div class="line">vide</div>'}</div></div>`;
}

function modMe(el) {
  el.innerHTML = `
    <div class="card" style="max-width:460px"><form class="form" id="pw">
      <div class="kicker">Changer mon mot de passe</div>
      <div class="field"><input type="password" id="pc" autocomplete="current-password" placeholder="Mot de passe actuel" required></div>
      <div class="field"><input type="password" id="pn" autocomplete="new-password" minlength="10" placeholder="Nouveau (10 caractères min.)" required></div>
      <button class="btn">Changer</button></form></div>
    <button class="btn ghost" id="logout" style="margin-top:14px">Se déconnecter</button>`;
  $('#pw').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/password', { method: 'POST', body: { current: $('#pc').value, next: $('#pn').value } }), 'Mot de passe changé.'); e.target.reset(); };
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.me = null; render(true); };
}

// =====================================================================
// Votes anonymes, blog, témoignages
// =====================================================================
function remaining(iso) {
  const s = (new Date(iso) - Date.now()) / 1000;
  if (s <= 0) return 'clos';
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `${Math.floor(s / 86400)} j ${Math.floor((s % 86400) / 3600)} h`;
}
function pollHtml(p) {
  const voted = p.myVote !== null;
  const total = p.counts ? p.counts.reduce((a, b) => a + b, 0) : p.total;
  return `<div class="card poll" data-poll="${esc(p.id)}">
    <div class="chips">${siteTag(p)}<span class="pill ${p.open ? 'red' : 'grey'}">${p.open ? `● EN COURS · clôture dans ${esc(remaining(p.closesAt))}` : 'CLOS'}</span><span class="pill grey">${p.total} vote${p.total > 1 ? 's' : ''}</span><span class="pill grey" title="Vote ouvert à tout le campus pour prendre la température : ce n’est pas une décision officielle">💬 avis indicatif</span></div>
    <h3 style="margin:10px 0 4px;font-size:20px">${esc(p.question)}</h3>
    ${p.description ? `<p class="muted" style="margin:0 0 6px">${esc(p.description)}</p>` : ''}
    <div class="opts">${p.options.map((o, i) => {
      const n = p.counts ? p.counts[i] : null;
      const pct = n !== null && total ? Math.round((n / total) * 100) : 0;
      if (p.open && !voted) return `<button class="opt" data-opt="${i}">${esc(o)}</button>`;
      return `<div class="opt res ${p.myVote === i ? 'mine' : ''}"><i style="width:${pct}%"></i><span>${p.myVote === i ? '✓ ' : ''}${esc(o)}</span><b>${n === null ? '?' : pct + ' %'}</b></div>`;
    }).join('')}</div>
    <div class="faint small" style="margin-top:8px">${voted ? 'Ton vote est enregistré (anonyme). ' : ''}${!p.counts ? 'Résultats affichés à la clôture. ' : ''}Lancé par ${esc(p.org)} · fin ${esc(fmt(p.closesAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div>
    <button class="btn small ghost" data-share-poll="${esc(p.id)}" style="margin-top:10px">${icon('share', 16)} Partager ce vote</button>
  </div>`;
}
async function viewPolls(focusId) {
  view().innerHTML = `
    <h1 class="large-title">Votes anonymes</h1>
    <p class="subtitle">Donne ton avis en un tap. Aucun compte, aucune trace de qui a voté quoi. 1 vote par appareil.</p>
    <div class="notice">ℹ️ Ce sont des <b>votes d’avis indicatifs</b>, ouverts à tout le campus : ils servent à prendre la température, ce ne sont pas des décisions officielles. Les décisions se votent en AG.</div>
    <div id="polls"><div class="empty faint mono typing">chargement</div></div>`;
  try {
    const polls = await api('/api/polls');
    const box = $('#polls');
    if (!box) return;
    const mine = polls.filter((p) => inScope(p));
    const ags = [...new Set(mine.map((p) => p.ag || 'Vote'))];
    box.innerHTML = mine.length ? ags.map((ag) => `<div class="ag-head">🗳️ ${esc(ag)}</div>${mine.filter((p) => (p.ag || 'Vote') === ag).map(pollHtml).join('')}`).join('') : `<div class="card empty"><div class="big">🗳️</div>Aucun vote ${state.data.scope === ALL ? '' : 'pour ' + esc(siteShort(state.data.scope)) + ' '}pour le moment. Chaque AG lance ses votes ici.</div>`;
    // Lien direct vers un vote (#/votes/<id>) : on l'amène à l'écran et on le met en avant
    const target = focusId && box.querySelector(`[data-poll="${CSS.escape(focusId)}"]`);
    if (target) { target.classList.add('focus'); setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }
    else if (focusId && polls.some((p) => p.id === focusId)) { const p = polls.find((x) => x.id === focusId); if (p.site && p.site !== scopeSite()) { state.site = p.site; store.set('l1-site', p.site); applyScope(); return viewPolls(focusId); } }
    box.onclick = async (e) => {
      const sh = e.target.closest('[data-share-poll]')?.dataset.sharePoll;
      if (sh) {
        const p = polls.find((x) => x.id === sh);
        try { if (navigator.share) await navigator.share({ title: p.question, text: `🗳️ Vote anonyme · ${p.question}`, url: voteUrl(p) }); else { await navigator.clipboard.writeText(voteUrl(p)); toast('Lien du vote copié.'); } } catch {}
        return;
      }
      const opt = e.target.closest('[data-opt]');
      if (!opt) return;
      const card = opt.closest('[data-poll]');
      if (state.voting) return;
      state.voting = true;
      const pid = card.dataset.poll;
      $$('button', card).forEach((b) => (b.disabled = true));
      try {
        opt.classList.add('voting');
        const proof = await votePow(pid);
        const p = await api(`/api/polls/${pid}/vote`, { method: 'POST', body: { option: Number(opt.dataset.opt), ...proof } });
        // la carte a pu être redessinée entre-temps : on reprend la carte affichée
        const now = $(`[data-poll="${CSS.escape(pid)}"]`) || card;
        now.outerHTML = pollHtml(p);
        toast('A voté ✊');
      } catch (err) {
        toast(/fetch|network|load failed/i.test(err.message) ? 'Pas de réseau : ton vote n’est pas parti, réessaie.' : err.message);
        $$(`[data-poll="${CSS.escape(pid)}"] button`).forEach((b) => (b.disabled = false));
      } finally { state.voting = false; }
    };
  } catch (err) { $('#polls').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

// Petit calcul anti-bourrage fait par le téléphone avant chaque vote (≈ 1 s, en arrière-plan)
async function votePow(pid) {
  const ch = await api(`/api/polls/${encodeURIComponent(pid)}/challenge`);
  const nonce = await new Promise((resolve, reject) => {
    let w;
    try { w = new Worker('/pow-worker.js'); } catch { return reject(new Error('Ton navigateur bloque le vote : mets-le à jour ou essaie avec un autre.')); }
    const t = setTimeout(() => { w.terminate(); reject(new Error('Le vote prend trop de temps : réessaie.')); }, 60000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); e.data.nonce >= 0 ? resolve(e.data.nonce) : reject(new Error('Réessaie.')); };
    w.onerror = () => { clearTimeout(t); w.terminate(); reject(new Error('Le vote n’a pas pu être préparé : recharge la page.')); };
    w.postMessage({ token: ch.token, bits: ch.bits });
  });
  return { token: ch.token, nonce };
}

// ----- Blog -----
async function viewBlog(id) {
  if (id) {
    if (!view().querySelector('.prose')) view().innerHTML = '<div class="empty faint mono typing">chargement</div>';
    try {
      const p = await api(`/api/blog/${encodeURIComponent(id)}`);
      view().innerHTML = `
        <a href="#/blog" style="display:inline-block;margin-top:10px">‹ Blog</a>
        <article class="article">
          ${p.cover ? `<img class="cover" src="${esc(p.cover)}" alt="">` : ''}
          <div class="chips" style="margin-top:14px"><span class="pill ${p.kind === 'tribune' ? 'orange' : 'blue'}">${p.kind === 'tribune' ? 'Tribune' : 'Article'}</span></div>
          <h1 class="large-title">${esc(p.title)}</h1>
          <p class="subtitle">${esc(p.author)} · ${esc(fmt(p.publishedAt, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
          <div class="prose">${p.html}</div>
        </article>
        <button class="btn ghost" id="share-post" style="margin-top:20px">${icon('share', 18)} Partager</button>`;
      $('#share-post').onclick = async () => { try { if (navigator.share) await navigator.share({ title: p.title, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Lien copié.'); } } catch {} };
    } catch (err) { view().innerHTML = `<div class="empty">${esc(err.message)} <a href="#/blog">Retour</a></div>`; }
    return;
  }
  view().innerHTML = `
    <h1 class="large-title">Blog</h1>
    <p class="subtitle">Analyses, récits de lutte, tribunes des étudiant·es.</p>
    <button class="btn neon" id="propose">✍️ Proposer une tribune</button>
    <div id="posts" style="margin-top:16px"><div class="empty faint mono typing">chargement</div></div>`;
  $('#propose').onclick = () => sheet(`
    <h3>Proposer une tribune</h3>
    <form class="form" id="tf">
      <div class="field"><label>Titre</label><input type="text" id="tt" maxlength="140" required></div>
      <div class="field"><label>Ton texte (sauts de ligne = paragraphes, **gras**)</label><textarea id="tb" maxlength="12000" required style="min-height:200px"></textarea></div>
      <div class="field"><label>Signature (facultatif, ex : « Une étudiante de L3 bio »)</label><input type="text" id="ts" maxlength="60"></div>
      <p class="faint small">Anonyme. Relue par les modos avant publication. N’écris pas de nom de personne.</p>
      <button class="btn">Envoyer</button>
    </form>`, (root, close) => {
    $('#tf', root).onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('/api/blog/submit', { method: 'POST', body: { title: $('#tt', root).value, body: $('#tb', root).value, signature: $('#ts', root).value } }); close(); toast(r.message); }
      catch (err) { toast(err.message); }
    };
  });
  try {
    const posts = (await api('/api/blog')).filter((p) => inScope(p));
    const box = $('#posts');
    if (!box) return;
    box.innerHTML = posts.length ? `<div class="grid cols-2">${posts.map((p) => `
      <a class="card post" href="#/blog/${esc(p.id)}">
        ${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : ''}
        <span class="pill ${p.kind === 'tribune' ? 'orange' : 'blue'}">${p.kind === 'tribune' ? 'Tribune' : 'Article'}</span>
        <h3>${esc(p.title)}</h3><p class="muted">${esc(p.excerpt)}…</p>
        <div class="faint small">${esc(p.author)} · ${esc(ago(p.publishedAt))}</div></a>`).join('')}</div>`
      : '<div class="card empty"><div class="big">✍️</div>Aucun article pour l’instant. Propose la première tribune !</div>';
  } catch (err) { $('#posts').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

// ----- Témoignages -----
// Les photos sont ré-encodées dans le navigateur : cela efface les données EXIF (position GPS, modèle du téléphone, date).
async function cleanImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image illisible'))), 'image/jpeg', 0.88));
}
function uploadFile(blob, type, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/uploads');
    x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} if (x.status < 300) resolve(j); else reject(new Error(j.error || `Erreur ${x.status}`)); };
    x.onerror = () => reject(new Error('Connexion perdue pendant l’envoi.'));
    x.send(blob);
  });
}
async function prepareAndUpload(file, onProgress) {
  if (file.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(file.name)) {
    const blob = await cleanImage(file);
    return uploadFile(blob, 'image/jpeg', onProgress);
  }
  const type = file.type || (/\.mov$/i.test(file.name) ? 'video/quicktime' : /\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4');
  return uploadFile(file, type, onProgress);
}
function mediaHtml(m, sensitive = true) {
  const inner = m.kind === 'video' ? `<video src="${esc(m.url)}" controls preload="none" playsinline></video>` : `<img src="${esc(m.url)}" alt="Photo jointe au témoignage" loading="lazy">`;
  return `<div class="media ${sensitive ? 'veiled' : ''}">${inner}${sensitive ? '<button class="veil" type="button">⚠️ Contenu sensible<br><small>Toucher pour afficher</small></button>' : ''}</div>`;
}
async function viewTestimonies() {
  view().innerHTML = `
    <h1 class="large-title">Témoignages</h1>
    <p class="subtitle">Violences subies pendant la mobilisation : raconte, documente, ne reste pas seul·e.</p>
    <div class="card" style="border-color:rgba(255,69,58,0.4)">
      <div class="kicker" style="color:var(--red)">Avant de déposer</div>
      <ul class="safe">
        <li>🕶️ <b>Anonyme</b> : pas de compte, ton IP n’est pas enregistrée.</li>
        <li>🛡️ <b>Relu par les modos</b> avant toute publication. Rien n’est public automatiquement.</li>
        <li>📍 Les <b>métadonnées</b> des photos et vidéos (position GPS, modèle de téléphone, heure) sont <b>supprimées</b>.</li>
        <li>👤 Évite les <b>visages reconnaissables</b> d’autres manifestant·es : les modos peuvent publier ton texte sans tes images.</li>
        <li>⚖️ Pour porter plainte, <b>garde l’original</b> de tes fichiers sur ton téléphone et note la date, l’heure et le lieu exacts.</li>
      </ul>
      <button class="btn red" id="depose">Déposer un témoignage</button>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="kicker">Être accompagné·e</div>
      <div class="list" style="margin-top:8px;background:transparent;border:0">
        <a class="row" href="#/contacts" style="color:inherit;padding-left:0"><div class="grow"><div class="title">Syndicats & legal team</div><div class="sub">Contacts listés par les organisations étudiantes</div></div><span class="chev">${icon('chev', 18)}</span></a>
        <a class="row" href="tel:0969390000" style="color:inherit;padding-left:0"><div class="grow"><div class="title">Défenseur des droits · 09 69 39 00 00</div><div class="sub">Saisine gratuite en cas de manquement des forces de l’ordre</div></div><span class="pill blue">Appeler</span></a>
        <a class="row" href="tel:3114" style="color:inherit;padding-left:0"><div class="grow"><div class="title">3114 · écoute 24 h/24</div><div class="sub">Si c’est trop lourd à porter, parles-en</div></div><span class="pill blue">Appeler</span></a>
      </div>
    </div>
    <h2 class="section">Témoignages publiés</h2>
    <div id="tems"><div class="empty faint mono typing">chargement</div></div>`;
  let cats = {};
  $('#depose').onclick = () => openTestimonyForm(cats);
  try {
    const r = await api('/api/testimonies');
    cats = r.categories;
    const box = $('#tems');
    if (!box) return;
    r.items = r.items.filter((t) => inScope(t));
    box.innerHTML = r.items.length ? r.items.map((t) => `
      <div class="card testimony">
        <div class="chips"><span class="pill red">${esc(t.categoryLabel)}</span>${t.date ? `<span class="pill grey">${esc(isoDate(t.date))}</span>` : ''}${t.place ? `<span class="pill grey">${icon('pin', 12)} ${esc(t.place)}</span>` : ''}</div>
        <p class="ttext">${esc(t.text)}</p>
        ${t.media.length ? `<div class="media-grid">${t.media.map((m) => mediaHtml(m, t.sensitive)).join('')}</div>` : ''}
        <div class="faint small">Publié ${esc(ago(t.publishedAt))} · témoignage anonyme vérifié par les modos</div>
      </div>`).join('') : '<div class="card empty"><div class="big">🤝</div>Aucun témoignage publié.</div>';
    box.onclick = (e) => { const v = e.target.closest('.veil'); if (v) { v.parentElement.classList.remove('veiled'); v.remove(); } };
  } catch (err) { $('#tems').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
function openTestimonyForm(cats) {
  const entries = Object.entries(cats).length ? Object.entries(cats) : [['police', 'Violences policières'], ['vigiles', 'Vigiles / sécurité'], ['administration', 'Pression de l’administration'], ['agression', 'Agression'], ['discrimination', 'Discrimination'], ['autre', 'Autre']];
  sheet(`
    <h3>Déposer un témoignage</h3>
    <form class="form" id="tmf">
      <div class="field"><label>Type de violence</label><select id="tc">${entries.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
      <div class="grid cols-2">
        <div class="field"><label>Date</label><input type="text" id="td" placeholder="AAAA-MM-JJ" pattern="\\d{4}-\\d{2}-\\d{2}" inputmode="numeric"></div>
        <div class="field"><label>Lieu</label><input type="text" id="tp" maxlength="140" placeholder="Ex : entrée du Déambu, cours Lafayette"></div>
      </div>
      <div class="field"><label>Ce qui s’est passé</label><textarea id="tx" maxlength="8000" required style="min-height:160px" placeholder="Décris les faits, sans donner ton nom ni celui d’autres personnes."></textarea></div>
      <div class="field"><label>Photos / vidéos (6 max · vidéo ${state.data?.maxVideoMb || 45} Mo max)</label><input type="file" id="tf" accept="image/*,video/mp4,video/quicktime,video/webm" multiple></div>
      <div id="tfl"></div>
      <div class="field"><label>Contact pour être recontacté·e (facultatif, visible seulement par les modos)</label><input type="text" id="tco" maxlength="160" placeholder="Email jetable, pseudo Signal…"></div>
      <label class="check"><input type="checkbox" id="tok" required> J’accepte que ce témoignage soit relu par les modos et publié anonymement s’ils le valident.</label>
      <button class="btn red" id="tsend">Envoyer</button>
    </form>`, (root, close) => {
    const list = $('#tfl', root);
    $('#tf', root).onchange = (e) => {
      const files = [...e.target.files].slice(0, 6);
      list.innerHTML = files.map((f, i) => `<div class="upl" data-i="${i}"><span>${f.type.startsWith('video') ? '🎬' : '🖼️'} ${esc(f.name.slice(0, 40))}</span><span class="faint">${(f.size / 1048576).toFixed(1)} Mo</span><i></i></div>`).join('');
    };
    $('#tmf', root).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#tsend', root);
      btn.disabled = true;
      try {
        const files = [...$('#tf', root).files].slice(0, 6);
        const ids = [];
        for (const [i, f] of files.entries()) {
          btn.textContent = `Envoi du fichier ${i + 1}/${files.length}…`;
          const bar = $(`.upl[data-i="${i}"] i`, root);
          const r = await prepareAndUpload(f, (p) => { if (bar) bar.style.width = `${Math.round(p * 100)}%`; });
          ids.push(r.id);
        }
        btn.textContent = 'Envoi du témoignage…';
        const r = await api('/api/testimonies', { method: 'POST', body: { category: $('#tc', root).value, date: $('#td', root).value, place: $('#tp', root).value, text: $('#tx', root).value, contact: $('#tco', root).value, media: ids, consent: $('#tok', root).checked } });
        close();
        sheet(`<div class="empty"><div class="big">💚</div><b>Merci pour ton courage.</b><p class="muted">${esc(r.message)}</p></div>`);
      } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Envoyer'; }
    };
  });
}

// ----- Modos : votes -----
async function modPolls(el) {
  const polls = (await api('/api/mod/polls')).filter((x) => inScope(x));
  el.innerHTML = `
    <div class="card"><form class="form" id="pf">
      <div class="kicker">Nouveau vote anonyme · ${esc(siteShort(state.modSite))}</div>
      <div class="field"><label>Qui lance ce vote (facultatif, affiché au-dessus)</label><input type="text" id="pag" maxlength="80" value="${esc(store.get('l1-ag2-' + state.modSite, ''))}" placeholder="Ex : Collectif ${esc(siteShort(state.modSite))} en lutte"></div>
      <div class="field"><label>Question</label><input type="text" id="pq" maxlength="200" required placeholder="Faut-il reconduire le blocus demain ?"></div>
      <div class="field"><label>Précision (facultatif)</label><input type="text" id="pd" maxlength="600"></div>
      <div class="field"><label>Choix (un par ligne, 2 à 8)</label><textarea id="po" required>Pour\nContre\nAbstention</textarea></div>
      <div class="grid cols-2">
        <div class="field"><label>Durée</label><select id="pdur"><option value="1h">1 heure</option><option value="3h">3 heures</option><option value="6h">6 heures</option><option value="12h">12 heures</option><option value="24h" selected>24 heures</option><option value="48h">48 heures</option><option value="72h">3 jours</option><option value="7j">7 jours</option><option value="custom">Date précise…</option></select></div>
        <div class="field" id="pcw" hidden><label>Clôture le</label><input type="datetime-local" id="pc"></div>
      </div>
      <label class="check"><input type="checkbox" id="plive" checked> Résultats visibles pendant le vote (sinon : à la clôture)</label>
      <button class="btn">Lancer le vote</button></form></div>
    <h2 class="section">Votes</h2>
    ${polls.map((p) => `<div class="card" data-id="${esc(p.id)}">
      <div class="chips"><span class="pill ${p.open ? 'red' : 'grey'}">${p.open ? 'En cours · ' + esc(remaining(p.closesAt)) : 'Clos'}</span>${p.hidden ? '<span class="pill grey">masqué</span>' : ''}<span class="pill grey">${p.total} votes</span></div>
      <div class="faint small" style="margin-top:6px">${esc(p.ag || '')} · ${esc(p.org)}</div>
      <b style="display:block;margin:4px 0 8px">${esc(p.question)}</b>
      ${p.options.map((o, i) => `<div class="kv"><span>${esc(o)}</span><b class="mono">${p.counts[i]}${p.suspectCounts?.[i] ? ` <span class="faint">(dont ${p.suspectCounts[i]} suspects)</span>` : ''}</b></div>`).join('')}
      ${p.suspect ? `<div class="card" style="background:rgba(255,159,10,.12);margin-top:8px">⚠ <b>${p.suspect} vote(s) suspect(s)</b> : téléphones tout neufs arrivés en rafale depuis un même réseau (bourrage possible). <button class="btn small ghost" data-a="purge">Retirer les votes suspects</button></div>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn small ghost" data-a="link">🔗 Lien</button>${p.open ? '<button class="btn small ghost" data-a="story">📸 Story du vote</button>' : ''}${p.total ? '<button class="btn small ghost" data-a="res">📊 Story résultats</button>' : ''}${p.open ? '<button class="btn small red" data-a="close">Clore maintenant</button>' : ''}<button class="btn small ghost" data-a="extend">+24 h</button><button class="btn small ghost" data-a="hide">${p.hidden ? 'Afficher' : 'Masquer'}</button><button class="btn small ghost" data-a="del">Supprimer</button></div>
    </div>`).join('') || '<div class="empty">Aucun vote.</div>'}`;
  $('#pdur').onchange = (e) => ($('#pcw').hidden = e.target.value !== 'custom');
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const custom = $('#pdur').value === 'custom';
    await act(() => api('/api/mod/polls', { method: 'POST', body: { ag: (store.set('l1-ag2-' + state.modSite, $('#pag').value), $('#pag').value), question: $('#pq').value, description: $('#pd').value, options: $('#po').value.split('\n'), duration: $('#pdur').value, closesAt: custom && $('#pc').value ? new Date($('#pc').value).toISOString() : undefined, results: $('#plive').checked ? 'live' : 'after' } }), 'Vote lancé.');
    render(true);
  };
  el.onclick = async (e) => {
    const a = e.target.dataset.a;
    const card = e.target.closest('[data-id]');
    if (!a || !card) return;
    const id = card.dataset.id;
    const p = polls.find((x) => x.id === id);
    if (a === 'link') { try { await navigator.clipboard.writeText(voteUrl(p)); toast('Lien du vote copié : colle-le dans un sticker « Lien » de ta story.'); } catch { prompt('Lien du vote :', voteUrl(p)); } return; }
    if (a === 'story') return openStory(`vote:${id}`);
    if (a === 'res') return openStory(`res:${id}`);
    if (a === 'close' && confirm('Clore ce vote maintenant ?')) await act(() => api(`/api/mod/polls/${id}`, { method: 'PUT', body: { close: true } }), 'Clos.');
    if (a === 'extend') await act(() => api(`/api/mod/polls/${id}`, { method: 'PUT', body: { extendHours: 24 } }), 'Prolongé de 24 h.');
    if (a === 'purge' && confirm('Retirer les votes suspects de ce vote ? Les vrais votes restent.')) { const r = await act(() => api(`/api/mod/polls/${id}/purge-suspects`, { method: 'POST' })); toast(`${r.n} vote(s) suspect(s) retiré(s).`); }
    if (a === 'hide') await act(() => api(`/api/mod/polls/${id}`, { method: 'PUT', body: { hidden: !p.hidden } }), 'OK.');
    if (a === 'del' && confirm('Supprimer ce vote et ses résultats ?')) await act(() => api(`/api/mod/polls/${id}`, { method: 'DELETE' }), 'Supprimé.');
    render(true);
  };
}

// ----- Modos : blog -----
async function modBlog(el) {
  const posts = (await api('/api/mod/posts')).filter((x) => inScope(x));
  const pending = posts.filter((p) => p.status === 'pending');
  const ST = { draft: ['Brouillon', 'grey'], pending: ['À relire', 'orange'], published: ['Publié', 'green'], rejected: ['Refusé', 'red'] };
  el.innerHTML = `
    ${pending.length ? `<h2 class="section" style="margin-top:0">📥 Tribunes à relire (${pending.length})</h2>${pending.map((p) => `
      <div class="card" data-id="${esc(p.id)}"><b>${esc(p.title)}</b><div class="faint small">${esc(p.author)} · ${esc(ago(p.createdAt))}</div>
      <div class="small" style="max-height:220px;overflow:auto;margin:8px 0;white-space:pre-wrap">${esc(p.body)}</div>
      <div class="btn-row"><button class="btn small green" data-s="published">Publier</button><button class="btn small red" data-s="rejected">Refuser</button></div></div>`).join('')}` : ''}
    <div class="card" style="margin-top:12px"><form class="form" id="bf">
      <div class="kicker">Nouvel article</div>
      <div class="field"><label>Titre</label><input type="text" id="bt" maxlength="140" required></div>
      <div class="field"><label>Signature</label><input type="text" id="ba" maxlength="60" value="${esc(state.me.org)}"></div>
      <div class="field"><label>Image de couverture (facultatif)</label><input type="file" id="bc" accept="image/*"></div>
      <div class="field"><label>Texte (paragraphes séparés par une ligne vide, « ## » pour un intertitre, **gras**, liens auto)</label><textarea id="bb" required style="min-height:220px"></textarea></div>
      <div class="btn-row"><button class="btn green" data-pub="1">Publier</button><button class="btn ghost" data-pub="0">Brouillon</button></div></form></div>
    <h2 class="section">Articles</h2>
    <div class="list">${posts.filter((p) => p.status !== 'pending').map((p) => `<div class="row" data-id="${esc(p.id)}"><span class="pill ${ST[p.status][1]}">${ST[p.status][0]}</span><div class="grow"><div class="title">${esc(p.title)}</div><div class="sub">${p.kind === 'tribune' ? 'Tribune · ' : ''}${esc(p.author)} · ${esc(ago(p.createdAt))}</div></div>
      ${p.status === 'published' ? '<button class="btn small ghost" data-s="draft">Dépublier</button>' : '<button class="btn small green" data-s="published">Publier</button>'}<button class="icon-btn" data-del>${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  let publish = true;
  $$('#bf [data-pub]').forEach((b) => (b.onclick = () => (publish = b.dataset.pub === '1')));
  $('#bf').onsubmit = async (e) => {
    e.preventDefault();
    let cover;
    const f = $('#bc').files[0];
    if (f) { try { cover = (await prepareAndUpload(f, () => {})).id; } catch (err) { return toast(err.message); } }
    await act(() => api('/api/mod/posts', { method: 'POST', body: { title: $('#bt').value, author: $('#ba').value, body: $('#bb').value, cover, publish } }), publish ? 'Publié.' : 'Brouillon enregistré.');
    render(true);
  };
  el.onclick = async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const s = e.target.dataset.s;
    if (s) { await act(() => api(`/api/mod/posts/${row.dataset.id}`, { method: 'PUT', body: { status: s } }), 'Mis à jour.'); render(true); }
    if (e.target.closest('[data-del]') && confirm('Supprimer cet article ?')) { await act(() => api(`/api/mod/posts/${row.dataset.id}`, { method: 'DELETE' }), 'Supprimé.'); render(true); }
  };
}

// ----- Modos : témoignages -----
async function modTestimonies(el) {
  const [itemsAll, q] = await Promise.all([api('/api/mod/testimonies'), api('/api/mod/queue')]);
  const items = itemsAll.filter((x) => inScope(x));
  const ST = { pending: ['À relire', 'orange'], published: ['Publié', 'green'], rejected: ['Refusé', 'grey'] };
  el.innerHTML = `
    <p class="muted small">Rien n’est public sans ta validation. Retire tout nom, visage reconnaissable d’un tiers ou détail identifiant. Tu peux publier le texte sans les médias (décoche-les).${q.ffmpeg ? '' : ' <b style="color:var(--orange)">ffmpeg absent : les métadonnées des vidéos ne sont pas retirées.</b>'}</p>
    ${items.map((t) => `
      <div class="card" data-id="${esc(t.id)}" style="${t.status === 'pending' ? 'border-color:rgba(255,159,10,0.5)' : ''}">
        <div class="chips"><span class="pill ${ST[t.status][1]}">${ST[t.status][0]}</span><span class="pill red">${esc(t.categoryLabel)}</span><span class="pill grey">reçu ${esc(ago(t.createdAt))}</span></div>
        <div class="grid cols-2" style="margin-top:10px">
          <div class="field"><label>Date</label><input type="text" value="${esc(t.date)}" disabled></div>
          <div class="field"><label>Lieu</label><input type="text" data-f="place" value="${esc(t.place)}"></div>
        </div>
        <div class="field" style="margin-top:8px"><label>Texte (modifiable pour anonymiser)</label><textarea data-f="text" style="min-height:140px">${esc(t.text)}</textarea></div>
        ${t.contact ? `<div class="notice" style="margin-top:8px">📇 Contact privé : <b>${esc(t.contact)}</b> <button class="btn small ghost" data-a="rmcontact">Effacer</button></div>` : ''}
        ${t.media.length ? `<div class="media-grid" style="margin-top:8px">${t.media.map((m) => `<div><div class="media">${m.kind === 'video' ? `<video src="${esc(m.url)}" controls preload="metadata" playsinline></video>` : `<img src="${esc(m.url)}" alt="">`}</div>
          <label class="check small"><input type="checkbox" data-m="${esc(m.id)}" ${m.public || t.status !== 'published' ? 'checked' : ''}> publier</label>
          <div class="small ${m.cleaned ? 'faint' : ''}" style="${m.cleaned ? '' : 'color:var(--orange)'}">${m.cleaned ? '✓ métadonnées retirées' : '⚠️ métadonnées non retirées'}</div>
          <button class="btn small ghost" data-rm="${esc(m.id)}">Supprimer le fichier</button></div>`).join('')}</div>` : ''}
        <label class="check"><input type="checkbox" data-f="sensitive" ${t.sensitive !== false ? 'checked' : ''}> Flouter les médias (contenu sensible)</label>
        <div class="btn-row">
          <button class="btn small green" data-a="published">${t.status === 'published' ? 'Mettre à jour' : 'Publier'}</button>
          ${t.status !== 'rejected' ? '<button class="btn small ghost" data-a="rejected">Refuser</button>' : ''}
          ${t.status === 'published' ? '<button class="btn small ghost" data-a="pending">Dépublier</button>' : ''}
          <button class="btn small red" data-a="delete">Supprimer définitivement</button>
        </div>
      </div>`).join('') || '<div class="card empty">Aucun témoignage reçu.</div>'}`;
  el.onclick = async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const a = e.target.dataset.a;
    const rm = e.target.dataset.rm;
    if (rm && confirm('Supprimer ce fichier définitivement ?')) { await act(() => api(`/api/mod/testimonies/${id}`, { method: 'PUT', body: { removeMedia: rm } }), 'Fichier supprimé.'); return render(true); }
    if (!a) return;
    if (a === 'rmcontact') { await act(() => api(`/api/mod/testimonies/${id}`, { method: 'PUT', body: { removeContact: true } }), 'Contact effacé.'); return render(true); }
    if (a === 'delete') { if (confirm('Supprimer ce témoignage et ses fichiers ?')) { await act(() => api(`/api/mod/testimonies/${id}`, { method: 'DELETE' }), 'Supprimé.'); render(true); } return; }
    if (a === 'published' && !confirm('Publier ce témoignage ? Vérifie qu’aucune personne n’est identifiable.')) return;
    await act(() => api(`/api/mod/testimonies/${id}`, { method: 'PUT', body: {
      version: items.find((x) => x.id === id)?.updatedAt,
      status: a, text: $('[data-f=text]', card).value, place: $('[data-f=place]', card).value, sensitive: $('[data-f=sensitive]', card).checked,
      publishMedia: $$('[data-m]', card).filter((c) => c.checked).map((c) => c.dataset.m),
    } }), 'Enregistré.');
    render(true);
  };
}

// ---------- Données + temps réel ----------
async function refresh() {
  state.raw = await api('/api/state');
  applyScope();
  const tg = document.getElementById('tg-mini');
  if (tg && state.raw.telegramUrl) tg.href = state.raw.telegramUrl;
  setOnline(state.raw.online);
}
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { await refresh(); } catch { return; }
    const r = route().split('/')[0];
    if (r === 'chat') { renderNav(); renderAlertBar(); return; }
    if (r === 'modo' && state.me) { renderNav(); renderAlertBar(); if (state.me.role === 'terrain') { if (!$('.sheet') && !$('.cam') && !view().contains(document.activeElement)) render(true); else state.terrainStale = true; return; } if (state.modTab === 'situation') { window.drawTiles?.(); const h = $('#bhint'); if (h && state.data.blocus.auto) h.textContent = `Automatique : le titre suit les bâtiments (actuellement « ${BLOCUS[blocusNow(state.data.blocus)]} »).`; } return; }
    if ($('.sheet') || $('.cam') || view().contains(document.activeElement)) return;
    render();
  }, 250);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.raw) scheduleRefresh(); });
function connectLive() {
  const es = new EventSource('/api/live');
  for (const ev of ['buildings', 'events', 'flashes', 'reports', 'demands', 'contacts', 'blocus']) es.addEventListener(ev, scheduleRefresh);
  es.addEventListener('online', (e) => setOnline(JSON.parse(e.data).online));
  es.addEventListener('hello', (e) => setOnline(JSON.parse(e.data).online));
  es.addEventListener('feed', (e) => {
    const f = JSON.parse(e.data);
    if (state.data) state.data.feed.unshift(f);
    typeFeedLine(f);
    if (f.level === 'alert' && document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Lyon 1 · La Doua en lutte', { body: f.text, icon: '/icon.svg' });
  });
  es.addEventListener('chat', (e) => onChat(JSON.parse(e.data)));
  es.addEventListener('sighting', () => { scheduleRefresh(); if (route() === 'modo' && state.modTab === 'situation') drawSightings(); });
  es.addEventListener('going', (e) => {
    const { id, count } = JSON.parse(e.data);
    const ev = state.raw?.events.find((x) => x.id === id);
    if (ev) ev.goingCount = count;
    const b = $(`[data-going="${CSS.escape(id)}"] b`);
    if (b) b.textContent = count;
  });
  // Entraide : nouvelles annonces en direct, sauf si la personne est en train d'écrire une réponse
  es.addEventListener('entraide', () => {
    if (route().split('/')[0] !== 'entraide' || $('.sheet') || view().contains(document.activeElement)) return;
    if ($$('.ent-form input').some((i) => i.value.trim())) return;
    const y = window.scrollY; Promise.resolve(viewEntraide()).then(() => window.scrollTo(0, y));
  });
  es.addEventListener('pages', scheduleRefresh);
  es.addEventListener('poll', (e) => {
    let d = {}; try { d = JSON.parse(e.data || '{}'); } catch {}
    if (!d.vote) return scheduleRefresh(); // vote créé, clos, supprimé par un·e modo : tout se met à jour
    // simple bulletin : seulement la page des votes, au plus toutes les 10 s, jamais pendant qu'on vote
    if (route().split('/')[0] !== 'votes' || state.pollRefresh) return;
    state.pollRefresh = setTimeout(() => { state.pollRefresh = null; if (route().split('/')[0] === 'votes' && !state.voting && !$('.sheet')) render(); }, 10000);
  });
  for (const [ev, r] of [['blog', 'blog'], ['testimonies', 'temoignages']]) es.addEventListener(ev, () => { if (route() === r && !$('.sheet')) render(); });
  es.addEventListener('chat-react', (e) => { const { id, reactions } = JSON.parse(e.data); updateReacts(id, reactions); });
  es.addEventListener('chat-del', (e) => { const id = JSON.parse(e.data).id; $(`.msg[data-id="${CSS.escape(id)}"]`)?.remove(); });
  es.addEventListener('demand', (e) => {
    const { id, support } = JSON.parse(e.data);
    const d = state.data?.demands.find((x) => x.id === id);
    if (d) d.support = support;
    const b = $(`.support[data-id="${CSS.escape(id)}"] b`);
    if (b) b.textContent = support;
  });
  es.onerror = () => {
    $('#online-side').textContent = 'reconnexion…';
    if (es.readyState === 2) { es.close(); setTimeout(connectLive, 5000); } // fermé pour de bon (ex. redéploiement) : on relance
  };
  es.onopen = () => scheduleRefresh();
}

// ---------- Fond animé « pluie de code » ----------
function matrix() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#bg');
  const ctx = c.getContext('2d');
  const chars = 'LYON1BLOCUSAGGREVE01ÉTUDIANT·ES✊0110';
  let cols = [];
  let fs = 14;
  const resize = () => { c.width = innerWidth; c.height = innerHeight; cols = Array(Math.ceil(c.width / fs)).fill(0).map(() => Math.random() * -50); };
  resize();
  addEventListener('resize', resize);
  let last = 0;
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (document.hidden || t - last < 70) return;
    last = t;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = `${fs}px ui-monospace, Menlo, monospace`;
    cols.forEach((y, i) => {
      ctx.fillStyle = Math.random() < 0.03 ? '#ff453a' : '#00ff9c';
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, y * fs);
      cols[i] = y * fs > c.height && Math.random() > 0.975 ? 0 : y + 1;
    });
  };
  requestAnimationFrame(tick);
}


// =====================================================================
// App sur l'écran d'accueil + notifications sur le téléphone
// =====================================================================
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; refreshAppCards(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('App installée ✊'); refreshAppCards(); api('/api/hit', { method: 'POST', body: { event: 'install' } }).catch(() => {}); });

async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn('SW', e); return null; }
}
async function currentPushSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function enablePush(kinds, sites) {
  if (!pushSupported()) {
    if (isIOS && !isStandalone()) { showInstallHelp(true); return false; }
    toast('Ce navigateur ne gère pas les notifications. Essaie Chrome ou Safari.');
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications refusées. Tu peux les réactiver dans les réglages du téléphone.'); return false; }
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
  await navigator.serviceWorker.ready;
  const { key } = await api('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), kinds, sites } });
  store.set('l1-push', { kinds, sites });
  return true;
}
async function disablePush() {
  const sub = await currentPushSub();
  if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  store.set('l1-push', null);
}
function showInstallHelp(forPush = false) {
  if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; refreshAppCards(); }); return; }
  const ios = isIOS;
  sheet(`<h3>📲 Installer l’app</h3>
    ${forPush ? '<p class="notice">Sur iPhone, les notifications marchent seulement une fois l’app ajoutée à l’écran d’accueil.</p>' : ''}
    ${ios ? `<ol class="steps">
      <li>Ouvre ce site dans <b>Safari</b>.</li>
      <li>Touche le bouton <b>Partager</b> <span class="kbd">⎋</span> (carré avec une flèche vers le haut, en bas de l’écran).</li>
      <li>Fais défiler et choisis <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li>
      <li>Ouvre l’app depuis ton écran d’accueil, va dans <b>Alertes</b> et active les notifications.</li></ol>`
    : `<ol class="steps">
      <li>Ouvre le menu du navigateur <span class="kbd">⋮</span> (en haut à droite dans Chrome).</li>
      <li>Choisis <b>« Installer l’application »</b> ou <b>« Ajouter à l’écran d’accueil »</b>.</li>
      <li>L’icône <b>LYON 1 / LA DOUA EN LUTTE</b> apparaît avec tes autres apps.</li></ol>`}
    <p class="faint small">C’est gratuit, sans store, et ça ne prend presque pas de place.</p>`);
}
function appCardHtml() {
  if (isStandalone()) return '';
  return `<button class="card app-card" data-install type="button"><span class="app-ico">📲</span><span class="grow"><b>Installer l’app sur ton téléphone</b><span class="muted small">Une icône sur l’écran d’accueil + notifications quand un bâtiment est bloqué.</span></span><span class="chev">${icon('chev', 18)}</span></button>`;
}
function refreshAppCards() { $$('[data-install]').forEach((b) => (b.hidden = isStandalone())); }
document.addEventListener('click', (e) => { if (e.target.closest('[data-install]')) showInstallHelp(); });

// ---------- Pop-up d'accueil : installer l'app + activer les notifications ----------
// Dans un navigateur : à chaque visite (une fois par session). Dans l'app installée : seulement si les notifs ne sont pas activées.
const sess = { get(k) { try { return sessionStorage.getItem(k); } catch { return '1'; } }, set(k) { try { sessionStorage.setItem(k, '1'); } catch {} } };
async function welcomePopup() {
  if (sess.get('l1-welcome') || route().startsWith('modo') || route().startsWith('terrain') || $('.sheet') || $('.react-pop')) return;
  const standalone = isStandalone();
  let pushOn = false;
  try { pushOn = !!(await currentPushSub()) && Notification.permission === 'granted'; } catch {}
  if (store.get('l1-oldpush')) pushOn = true;
  if (standalone && (pushOn || !pushSupported())) return;
  if (!standalone && pushOn && !isIOS && !installPrompt) return; // déjà abonné·e et rien à installer
  sess.set('l1-welcome');
  const needInstall = !standalone;
  const iosBrowser = isIOS && !standalone;
  sheet(`<div class="welcome">
      <div class="welcome-head"><div class="kicker">LYON 1 · LA DOUA EN LUTTE</div><h2>Ne rate rien de la mobilisation ✊</h2>
      <p class="muted">Bâtiments bloqués, AG, manifs, votes : sois prévenu·e en direct, gratuitement, sans compte.</p></div>
      ${needInstall ? `<button class="welcome-step" id="w-install" type="button"><span class="w-ico">📲</span><span class="grow"><b>1. Installer l’app</b><span>Une icône sur ton écran d’accueil, ouverte en 1 tap${isIOS ? ' (obligatoire sur iPhone pour les notifs)' : ''}.</span></span><span class="chev">${icon('chev', 18)}</span></button>` : ''}
      ${pushOn ? '' : `<button class="welcome-step" id="w-push" type="button"><span class="w-ico">🔔</span><span class="grow"><b>${needInstall ? '2. ' : ''}Activer les notifications</b><span>${iosBrowser ? 'Après avoir installé l’app, ouvre-la et active-les ici.' : 'Une alerte sur ton téléphone dès qu’un bâtiment est bloqué ou qu’une AG est annoncée.'}</span></span><span class="chev">${icon('chev', 18)}</span></button>`}
      <button class="btn ghost w-later" id="w-later" type="button">Plus tard</button>
    </div>`, (el, close) => {
    $('#w-later', el).onclick = close;
    if ($('#w-install', el)) $('#w-install', el).onclick = () => { close(); showInstallHelp(); };
    if ($('#w-push', el)) $('#w-push', el).onclick = async () => {
      if (iosBrowser) { close(); showInstallHelp(true); return; }
      const b = $('#w-push', el); b.disabled = true;
      try {
        const ok = await enablePush(['buildings', 'urgent', 'events', 'reports'], [publicSite()]);
        if (ok) { toast('Notifications activées ✊ Règle-les dans Alertes.'); b.classList.add('done'); $('b', b).textContent = '✓ Notifications activées'; if (!$('#w-install', el)) setTimeout(close, 900); }
      } catch (e) { toast(e.message); }
      b.disabled = false;
    };
  });
}

// ---------- Démarrage ----------
(async function start() {
  render(true);
  matrix();
  try { state.me = await api('/api/auth/me'); } catch {}
  try { await refresh(); } catch (e) { view().innerHTML = `<div class="empty">Serveur injoignable. ${esc(e.message)}</div>`; }
  render(true);
  connectLive();
  registerSW();
  setTimeout(welcomePopup, 1800);
  // audience anonyme : une visite par ouverture (navigateur ou app installée)
  if (!sess.get('l1-hit')) { sess.set('l1-hit'); api('/api/hit', { method: 'POST', body: { mode: isStandalone() ? 'app' : 'browser' } }).catch(() => {}); }
  setInterval(() => { if (route() === '' && !document.hidden) { const m = $('.hero .meta'); if (m && state.data) m.textContent = heroMeta(state.data); } }, 30000);
})();

// =====================================================================
// Signalements des étudiant·es, « J'y vais », frise, page droits, entraide
// =====================================================================
const SIGHT_LABEL = { bloque: 'bloqué', partiel: 'partiellement bloqué', ouvert: 'ouvert' };
// Signalement affiché publiquement (assez de personnes + photos, pas de réponse des modos en 5 min)
function crowdOf(b) { return (state.raw?.sightings || []).find((s) => s.building === b.id && s.crowd) || null; }
function sightLine(b) {
  const list = (state.raw?.sightings || []).filter((s) => s.building === b.id && !s.crowd);
  if (!list.length) return '';
  return `<div class="sight-line">${list.map((s) => `👀 ${s.count} signalement${s.count > 1 ? 's' : ''} : ${esc(SIGHT_LABEL[s.status])}`).join(' · ')} <span class="faint">(non confirmé)</span></div>`;
}
function openSighting(id) {
  const b = state.raw.buildings.find((x) => x.id === id);
  if (!b) return;
  sheet(`<h2 style="margin:0 0 4px">👀 ${esc(b.name)}</h2>
    <p class="muted small" style="margin:0 0 14px">Tu es sur place ? Dis ce que tu vois. C’est anonyme. Les modos vérifient puis confirment. Sans réponse en 5 min, l’état peut s’afficher selon les personnes sur place.</p>
    <button type="button" class="see-photo need" id="sp-lbl"><span id="sp-txt">📷 1. Prends une photo de l’entrée (obligatoire)</span><small>C’est la preuve : vue seulement par les modos, effacée ensuite. Pas de visage. Aucun import.</small></button>
    <p class="faint small" style="margin:0 0 8px">2. Choisis ce que tu vois :</p>
    <div class="see-grid locked" id="sp-grid">
      <button class="ab red" data-st="bloque">🔴 Bloqué</button>
      <button class="ab orange" data-st="partiel">🟠 Partiel</button>
      <button class="ab green" data-st="ouvert">🟢 Ouvert</button>
    </div>`, (el, close) => {
    let photo = null;
    $('#sp-lbl', el).onclick = () => {
      $('#sp-txt', el).textContent = '⏳ Préparation…';
      openTerrainCamera(async (blob) => {
        if (!blob) { $('#sp-txt', el).textContent = '📷 Prends une photo de l’entrée (obligatoire)'; return; }
        try {
          photo = await shrinkPhoto(blob);
          $('#sp-txt', el).textContent = '✅ Photo prise (touche pour la refaire)';
          $('#sp-lbl', el).classList.add('on');
          $('#sp-lbl', el).classList.remove('need');
          $('#sp-grid', el).classList.remove('locked');
        } catch {
          photo = null;
          $('#sp-txt', el).textContent = '📷 Photo illisible, réessaie';
        }
      });
    };
    el.onclick = async (e) => {
      const st = e.target.closest('[data-st]')?.dataset.st;
      if (!st) return;
      if (!photo) { const l = $('#sp-lbl', el); l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake'); return toast('📷 Prends d’abord une photo de l’entrée : c’est obligatoire.'); }
      if (el.dataset.busy) return;
      el.dataset.busy = '1'; $('#sp-grid', el).classList.add('locked');
      try {
        let r;
        if (photo) {
          const q = new URLSearchParams({ building: id, status: st });
          const res = await fetch(`/api/sightings/photo?${q}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: photo });
          r = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(r.error || 'Envoi impossible.');
        } else r = await api('/api/sightings', { method: 'POST', body: { building: id, status: st } });
        toast(r.message); close();
      } catch (err) { toast(err.message); }
      delete el.dataset.busy; $('#sp-grid', el)?.classList.remove('locked');
    };
  });
}
async function drawSightings() {
  const box = $('#sightings');
  if (!box) return;
  let r;
  try { r = await api('/api/mod/sightings'); } catch { return; }
  const list = r.list.filter((x) => inScope(x));
  const strong = list.filter((x) => x.count >= (r.alertMin || r.threshold));
  // nouveau signalement à vérifier pendant que le modo a l'écran ouvert
  const keyNow = strong.map((x) => `${x.building}|${x.status}`);
  if (state.sightSeen && keyNow.some((k) => !state.sightSeen.includes(k))) { navigator.vibrate?.([30, 60, 30]); toast('👀 Nouveau signalement à vérifier en haut de la page'); }
  state.sightSeen = keyNow;
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card sight-card ${strong.length ? 'hot' : ''}" style="margin-bottom:12px">
    <div class="kicker">📣 Signalements avec photo · à vérifier dès le 1er · affiché publiquement à ${r.threshold}</div>
    ${list.map((x) => `<div class="sight-row" data-b="${esc(x.building)}" data-st="${esc(x.status)}" data-from="${esc(x.current)}">
      <div class="grow"><b>${esc(x.name)}</b> → ${STATUS[x.status].dot} ${esc(STATUS[x.status].label)}
        <div class="faint small">${x.count} personne${x.count > 1 ? 's' : ''} · dernier ${esc(ago(x.last))} · affiché : ${esc(STATUS[x.current].label)}</div>
        ${x.crowd ? '<div class="crowd-mod">📢 Affiché publiquement « selon les personnes sur place » : confirme ou ignore</div>' : x.publicAt ? `<div class="crowd-mod soon">⏱ Affiché publiquement dans ${Math.max(1, Math.ceil((new Date(x.publicAt) - Date.now()) / 60e3))} min si personne ne valide</div>` : ''}</div>
      <button class="btn small ${x.status === 'bloque' ? 'red' : x.status === 'partiel' ? 'orange' : 'green'}" data-ok>✓ Confirmer</button>
      ${x.photos?.length ? `<button class="btn small ghost" data-photos="${esc(x.photos.join(','))}">📷 ${x.photos.length} photo${x.photos.length > 1 ? 's' : ''}</button>` : ''}
      <button class="btn small ghost" data-no>Ignorer</button>
      ${x.count >= (r.alertMin || r.threshold) ? '<button class="btn small ghost" data-remind title="Renvoyer la notification aux modos du site">🔔 Prévenir les modos</button>' : ''}
    </div>`).join('')}
    <p class="faint small" style="margin:8px 0 0">Vérifie (sur place, dans un groupe, ou par un·e camarade) avant de confirmer : un signalement peut être une blague ou une manip.</p>
  </div>`;
  box.onclick = async (e) => {
    const row = e.target.closest('.sight-row');
    if (!row) return;
    const ph = e.target.closest('[data-photos]')?.dataset.photos;
    if (ph) return showSightPhotos(ph.split(','), row.querySelector('b')?.textContent || '');
    if (e.target.closest('[data-ok]')) {
      await applyChanges([{ id: row.dataset.b, status: row.dataset.st, from: row.dataset.from }], 'Signalement confirmé');
      drawSightings();
    } else if (e.target.closest('[data-remind]')) {
      const res = await act(() => api('/api/mod/sightings/remind', { method: 'POST', body: { building: row.dataset.b } }));
      toast(res.sent ? `🔔 Notification envoyée sur ${res.sent} téléphone${res.sent > 1 ? 's' : ''} de modo.` : 'Aucun modo de ce site n’a encore activé les alertes sur son téléphone.');
    } else if (e.target.closest('[data-no]')) {
      await act(() => api('/api/mod/sightings/ignore', { method: 'POST', body: { building: row.dataset.b } }), 'Signalements ignorés.');
      drawSightings();
    }
  };
}

const myGoing = () => store.get('l1-going', []);
async function toggleGoing(id, btn) {
  try {
    const r = await api(`/api/events/${encodeURIComponent(id)}/going`, { method: 'POST' });
    const list = myGoing().filter((x) => x !== id);
    if (r.going) list.push(id);
    store.set('l1-going', list.slice(-100));
    btn.classList.toggle('on', r.going);
    $('b', btn).textContent = r.count;
    const ev = state.raw?.events.find((x) => x.id === id);
    if (ev) ev.goingCount = r.count;
    toast(r.going ? (store.get('l1-push', null)?.kinds?.includes('events') ? 'Noté ✊ Rappel 1 h avant par notification.' : 'Noté ✊ Active les notifs (Alertes) pour le rappel 1 h avant.') : 'Retiré.');
  } catch (e) { toast(e.message); }
}

// ----- Frise -----
async function viewFrise() {
  if (!view().querySelector('.frise-stats')) view().innerHTML = '<div class="empty mono typing">Chargement de la frise…</div>';
  const sc = scopeSite();
  let f;
  try { f = await api(`/api/frise?site=${encodeURIComponent(sc)}`); } catch (e) { view().innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (route() !== 'frise') return;
  const dayName = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  view().innerHTML = `
    <h1 class="large-title">Frise de la lutte</h1>
    <p class="subtitle">Jour ${f.today} de la mobilisation, tous sites ensemble. Remplie automatiquement : blocages, AG, votes, revendications obtenues.</p>
    <div class="frise-stats">
      <div><b>${f.today}</b><span>jours</span></div>
      <div><b>${f.stats.days}</b><span>jours d’action</span></div>
      <div><b>${f.stats.ag}</b><span>AG</span></div>
      <div><b>${f.stats.votes}</b><span>votes</span></div>
      <div class="win"><b>${f.stats.wins}</b><span>obtenues</span></div>
    </div>
    ${f.days.length ? `<div class="frise">${f.days.map((d) => `
      <div class="frise-day">
        <div class="frise-num mono">J${d.num}</div>
        <div class="frise-body">
          <div class="frise-date">${esc(dayName(d.day))}</div>
          ${d.items.map((i) => `<div class="frise-item fi-${esc(i.kind)}">${i.link ? `<a href="${esc(i.link)}">` : ''}<span>${i.icon}</span> ${esc(i.text)}${i.link ? '</a>' : ''}${i.url ? ` <a class="frise-src" href="${esc(i.url)}" target="_blank" rel="noopener">📰 ${esc(i.source || 'source')}</a>` : i.source ? ` <span class="frise-src">${esc(i.source)}</span>` : ''}${i.hist && state.me ? ` <button class="linklike faint small" data-hdel="${esc(i.hid)}">✕</button>` : ''}</div>`).join('')}
        </div>
      </div>`).join('')}</div>` : '<div class="card empty"><div class="big">🗓️</div>La frise se remplit toute seule dès que des bâtiments sont bloqués, que des AG ont lieu ou que des votes se terminent.</div>'}
    <p class="faint small" style="margin-top:12px">📰 Les journées d’avant le site viennent de la presse locale (lien sur chaque ligne). Un oubli, une erreur ? Signale-le dans le <a href="#/chat">chat</a>.</p>
    ${state.me ? `<form class="card form" id="fhist" style="margin-top:16px"><div class="kicker">Modo · ajouter une journée passée à la frise</div>
      <div class="grid cols-2"><div class="field"><label>Date</label><input type="date" name="date" required></div>
      <div class="field"><label>Type</label><select name="kind"><option value="blocage">🔴 Blocus / blocage</option><option value="ag">🗣️ AG</option><option value="manif">📣 Manif / rassemblement</option><option value="win">✊ Victoire</option><option value="alerte">🚨 Répression / incident</option><option value="autre">📍 Autre</option></select></div></div>
      <div class="field"><label>Ce qui s’est passé</label><input type="text" name="text" maxlength="300" required placeholder="Ex : AG au Déambu, 350 personnes, blocus reconduit"></div>
      <div class="grid cols-2"><div class="field"><label>Source (facultatif)</label><input type="text" name="source" maxlength="80" placeholder="Ex : CR de l’AG, Lyon Capitale"></div>
      <div class="field"><label>Lien (facultatif)</label><input type="url" name="url" maxlength="400" placeholder="https://…"></div></div>
      <button class="btn small">Ajouter à la frise</button></form>` : ''}
    ${state.me?.role === 'admin' ? `<form class="card form" id="fstart" style="margin-top:16px"><div class="kicker">Admin · premier jour de la mobilisation</div><div class="btn-row"><input type="date" id="fdate" value="${esc(f.start)}"><button class="btn small">Enregistrer</button></div></form>` : ''}`;
  if ($('#fhist')) $('#fhist').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/frise/history', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }), 'Ajouté à la frise.'); viewFrise(); };
  view().onclick = async (e) => { const id = e.target.closest('[data-hdel]')?.dataset.hdel; if (id && confirm('Retirer cette ligne de la frise ?')) { await act(() => api(`/api/mod/frise/history/${id}`, { method: 'DELETE' }), 'Retiré.'); viewFrise(); } };
  if ($('#fstart')) $('#fstart').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/frise/start', { method: 'PUT', body: { start: $('#fdate').value } }), 'Date enregistrée.'); viewFrise(); };
}

// ----- Tes droits -----
async function viewDroits() {
  let p;
  try { p = await api('/api/pages/droits'); } catch (e) { p = { published: false, title: 'Tes droits pendant le blocage' }; }
  if (route() !== 'droits') return;
  view().innerHTML = `
    <h1 class="large-title">${esc(p.title)}</h1>
    ${p.published ? `<p class="subtitle">Absences, examens, bourses, interpellation. Validé par les syndicats${p.by ? ' (' + esc(p.by) + ')' : ''} · MAJ ${esc(ago(p.updatedAt))}.</p>
      <article class="card prose droits">${p.html}</article>
      <a class="card" href="#/contacts" style="display:flex;gap:12px;align-items:center;margin-top:14px;color:inherit">${icon('people')}<div class="grow"><b>Une question précise ?</b><div class="muted small">Syndicats, legal team, écoute : page « Parler à qui ? »</div></div><span class="chev">${icon('chev', 18)}</span></a>`
    : `<div class="card empty"><div class="big">⚖️</div>Cette page est en cours de relecture par les syndicats.<br>En attendant, contacte-les directement : <a href="#/contacts">Parler à qui ?</a></div>`}`;
}

// ----- Entraide -----
const ENT_KIND = { propose: ['Je propose', 'green'], cherche: ['Je cherche', 'blue'] };
async function viewEntraide(focus) {
  let data;
  try { data = await api('/api/entraide'); } catch (e) { view().innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (route().split('/')[0] !== 'entraide') return;
  const mine = store.get('l1-entraide', {});
  state.entFilter ||= 'tout';
  const sc = scopeSite();
  const items = data.items.filter((a) => inScope(a, sc) && (state.entFilter === 'tout' || a.kind === state.entFilter || a.cat === state.entFilter));
  view().innerHTML = `
    <h1 class="large-title">Entraide</h1>
    <p class="subtitle">Cours à rattraper, hébergement, repas solidaires, trajets… Propose ou demande un coup de main. Anonyme, sans numéro ni email : on échange dans les réponses, puis on se retrouve sur le campus.</p>
    <div class="btn-row"><button class="btn green" data-new="propose">＋ Je propose</button><button class="btn" data-new="cherche">＋ Je cherche</button></div>
    <div class="chips ent-filters" style="margin:14px 0 4px">${[['tout', 'Tout'], ['propose', 'Offres'], ['cherche', 'Demandes'], ...Object.entries(data.cats)].map(([k, l]) => `<button class="chip ${state.entFilter === k ? 'on' : ''}" data-f="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    ${items.map((a) => `
      <div class="card ent ${focus === a.id ? 'focus' : ''}" data-id="${esc(a.id)}" id="ent-${esc(a.id)}">
        <div class="chips"><span class="pill ${ENT_KIND[a.kind][1]}">${ENT_KIND[a.kind][0]}</span><span class="pill grey">${esc(a.catLabel)}</span>${siteTag(a)}</div>
        <div class="title" style="margin-top:8px">${esc(a.title)}</div>
        ${a.text ? `<div class="desc">${esc(a.text)}</div>` : ''}
        <div class="faint small" style="margin-top:6px">${esc(a.nick)} · ${esc(ago(a.at))} · expire ${esc(fmt(a.expires, { day: 'numeric', month: 'short' }))}</div>
        ${a.replies.length ? `<div class="ent-replies">${a.replies.map((r) => `<div class="ent-reply"><b>${esc(r.nick)}${r.author ? ' <span class="pill green">auteur·e</span>' : ''}</b> <span class="faint small">${esc(ago(r.at))}</span><div>${esc(r.text)}</div><button class="linklike faint small" data-rep="${esc(r.id)}">Signaler</button></div>`).join('')}</div>` : ''}
        <form class="ent-form" data-reply>
          <input type="text" name="text" maxlength="500" placeholder="Répondre (lieu, horaire, pseudo Signal…)" required>
          <button class="btn small">Envoyer</button>
        </form>
        <div class="btn-row" style="margin-top:6px">
          <button class="linklike faint small" data-report>Signaler l’annonce</button>
          ${mine[a.id] ? '<button class="linklike small" data-del style="color:var(--red)">Supprimer mon annonce</button>' : ''}
        </div>
      </div>`).join('') || '<div class="card empty"><div class="big">🤝</div>Aucune annonce pour l’instant. Lance la première !</div>'}
    <p class="faint small">Les annonces disparaissent au bout de 14 jours. 3 signalements = annonce masquée en attendant un·e modo. Ne donne jamais ton adresse : rendez-vous dans un lieu public du campus.</p>`;
  if (focus) $(`#ent-${CSS.escape(focus)}`)?.scrollIntoView({ block: 'center' });
  view().onclick = async (e) => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (f) { state.entFilter = f; return viewEntraide(); }
    const nw = e.target.closest('[data-new]')?.dataset.new;
    if (nw) return newEntraide(nw, data.cats);
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('[data-rep]')) { await act(() => api(`/api/entraide/${id}/report`, { method: 'POST', body: { reply: e.target.closest('[data-rep]').dataset.rep } }), 'Merci, signalé aux modos.'); return; }
    if (e.target.closest('[data-report]')) { if (confirm('Signaler cette annonce aux modos ?')) await act(() => api(`/api/entraide/${id}/report`, { method: 'POST' }), 'Merci, signalé aux modos.'); return; }
    if (e.target.closest('[data-del]') && confirm('Supprimer ton annonce ?')) {
      await act(() => api(`/api/entraide/${id}?secret=${encodeURIComponent(mine[id])}`, { method: 'DELETE' }), 'Annonce supprimée.');
      delete mine[id]; store.set('l1-entraide', mine); viewEntraide();
    }
  };
  view().onsubmit = async (e) => {
    const form = e.target.closest('[data-reply]');
    if (!form) return;
    e.preventDefault();
    const id = form.closest('[data-id]').dataset.id;
    try { await api(`/api/entraide/${id}/reply`, { method: 'POST', body: { text: form.text.value, nick: nick(), secret: mine[id] } }); viewEntraide(id); } catch (err) { toast(err.message); }
  };
}
function newEntraide(kind, cats) {
  sheet(`<h2 style="margin:0 0 4px">${kind === 'propose' ? '🤝 Je propose' : '🙋 Je cherche'}</h2>
    <p class="muted small" style="margin:0 0 12px">Pas de numéro, pas d’email, pas d’adresse : les échanges se font dans les réponses.</p>
    <form class="form" id="entf">
      <div class="field"><label>Catégorie</label><select name="cat">${Object.entries(cats).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label>Titre</label><input type="text" name="title" maxlength="90" required placeholder="${kind === 'propose' ? 'Ex : notes de L2 bio cell à partager' : 'Ex : cherche un canapé pour 2 nuits'}"></div>
      <div class="field"><label>Détails (facultatif)</label><textarea name="text" maxlength="800" placeholder="Quand, où sur le campus, ce dont tu as besoin…"></textarea></div>
      <p class="faint small">Publié sous ton pseudo <b>${esc(nick())}</b> (changeable dans le chat).</p>
      <button class="btn green">Publier l’annonce</button>
    </form>`, (el, close) => {
    $('#entf', el).onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api('/api/entraide', { method: 'POST', body: { ...fd, nick: nick(), kind, site: publicSite() } });
        const mine = store.get('l1-entraide', {}); mine[r.id] = r.secret; store.set('l1-entraide', mine);
        close(); toast('Annonce publiée ✊'); viewEntraide(r.id);
      } catch (err) { toast(err.message); }
    };
  });
}
async function modEntraide(el) {
  const all = (await api('/api/mod/entraide')).filter((a) => inScope(a));
  const flagged = (a) => a.hidden || a.reports || a.repliesAll.some((r) => r.reports || r.hidden);
  all.sort((a, b) => flagged(b) - flagged(a) || b.at.localeCompare(a.at));
  el.innerHTML = `
    <p class="muted small">Les annonces sont publiées tout de suite (sans numéro ni email, c’est bloqué automatiquement). Elles sont masquées dès 3 signalements : vérifie ici, puis rétablis ou supprime. Supprime toute annonce qui donne une adresse, vend quelque chose ou cible quelqu’un.</p>
    ${all.map((a) => `
      <div class="card" data-id="${esc(a.id)}" style="${flagged(a) ? 'border-color:rgba(255,159,10,0.5)' : ''}">
        <div class="chips"><span class="pill ${ENT_KIND[a.kind][1]}">${ENT_KIND[a.kind][0]}</span><span class="pill grey">${esc(a.catLabel)}</span>${a.hidden ? '<span class="pill red">masquée</span>' : ''}${a.reports ? `<span class="pill orange">${a.reports} signalement(s)</span>` : ''}</div>
        <div class="title" style="margin-top:6px">${esc(a.title)}</div>
        ${a.text ? `<div class="desc">${esc(a.text)}</div>` : ''}
        <div class="faint small">${esc(a.nick)} · ${esc(ago(a.at))}</div>
        ${a.repliesAll.map((r) => `<div class="ent-reply ${r.hidden ? 'off' : ''}" data-r="${esc(r.id)}"><b>${esc(r.nick)}</b> ${r.reports ? `<span class="pill orange">${r.reports}</span>` : ''} ${r.hidden ? '<span class="pill red">masquée</span>' : ''}<div>${esc(r.text)}</div>
          <button class="linklike small" data-act="${r.hidden ? 'restore' : 'hide'}">${r.hidden ? 'Rétablir' : 'Masquer'}</button></div>`).join('')}
        <div class="btn-row" style="margin-top:8px">
          ${a.hidden ? '<button class="btn small green" data-act="restore">Rétablir</button>' : '<button class="btn small ghost" data-act="hide">Masquer</button>'}
          <button class="btn small red" data-act="delete">Supprimer</button>
        </div>
      </div>`).join('') || '<div class="card empty">Aucune annonce.</div>'}`;
  el.onclick = async (e) => {
    const action = e.target.closest('[data-act]')?.dataset.act;
    if (!action) return;
    const id = e.target.closest('[data-id]').dataset.id;
    const reply = e.target.closest('[data-r]')?.dataset.r;
    if (action === 'delete' && !confirm('Supprimer définitivement cette annonce ?')) return;
    await act(() => api(`/api/mod/entraide/${id}/moderate`, { method: 'POST', body: { action, reply } }), 'Fait.');
    modEntraide(el);
  };
}
async function modDroits(el) {
  const p = await api('/api/mod/pages/droits');
  el.innerHTML = `
    <div class="card"><div class="kicker">⚖️ Page « ${esc(p.title)} » · ${p.published ? '<span style="color:var(--green)">publiée</span>' : '<span style="color:var(--orange)">brouillon, invisible du public</span>'}</div>
      <p class="muted small">Un brouillon est déjà écrit. <b>Fais-le relire par tes syndicats ou ta legal team</b> avant de publier : une erreur sur les droits peut coûter cher à un·e étudiant·e. ${p.canEdit ? '' : 'Seul·e l’admin peut modifier et publier cette page : envoie-lui tes corrections.'}</p>
      ${p.updatedAt ? `<p class="faint small">MAJ ${esc(ago(p.updatedAt))}${p.by ? ' par ' + esc(p.by) : ''}</p>` : ''}
    </div>
    ${p.canEdit ? `<form class="form card" id="dform" style="margin-top:12px">
      <div class="field"><label>Titre</label><input type="text" name="title" maxlength="120" value="${esc(p.title)}"></div>
      <div class="field"><label>Texte · « ## » titre, « - » puce, « > » encadré, **gras**</label><textarea name="body" style="min-height:420px;font-family:ui-monospace,Menlo,monospace">${esc(p.body)}</textarea></div>
      <div class="btn-row"><button class="btn" data-pub="0">Enregistrer en brouillon</button><button class="btn green" data-pub="1">${p.published ? 'Mettre à jour (publié)' : 'Publier'}</button>${p.published ? '<button class="btn ghost" data-pub="-1">Dépublier</button>' : ''}</div>
    </form>` : ''}
    <h2 class="section">Aperçu</h2><article class="card prose droits">${p.html}</article>`;
  if (!p.canEdit) return;
  $('#dform').onsubmit = (e) => e.preventDefault();
  $('#dform').onclick = async (e) => {
    const v = e.target.closest('[data-pub]')?.dataset.pub;
    if (v === undefined) return;
    e.preventDefault();
    const f = $('#dform');
    if (v === '1' && !p.published && !confirm('La page a bien été relue par les syndicats / la legal team ?')) return;
    await act(() => api('/api/mod/pages/droits', { method: 'PUT', body: { title: f.title.value, body: f.body.value, ...(v === '0' ? {} : { published: v === '1' }) } }), v === '1' ? 'Page publiée.' : v === '-1' ? 'Page dépubliée.' : 'Brouillon enregistré.');
    modDroits(el);
  };
}

// =====================================================================
// Charte du chat + liste noire (vérifiée avant l'envoi)
// =====================================================================
const CHARTER_V = 2; // v2 : photos éphémères
const charterOk = () => store.get('l1-charte', 0) >= CHARTER_V;
function charterHtml(gate) {
  return `<div class="${gate ? 'card charter' : ''}" id="${gate ? 'charter-gate' : 'charter-read'}">
    <div class="kicker">📜 Charte du chat · 30 secondes${store.get('l1-charte', 0) >= 1 && store.get('l1-charte', 0) < CHARTER_V ? ' · <span style="color:var(--orange)">mise à jour : photos</span>' : ''}</div>
    <ol class="charter-list">
      <li><b>Respect.</b> Pas d’insultes ni de gros mots. Zéro propos raciste, sexiste, LGBTphobe ou validiste.</li>
      <li><b>Personne n’est visé.</b> Pas de menace, pas de harcèlement, pas d’appel à la violence contre quelqu’un.</li>
      <li><b>Anonymat.</b> Ne donne aucun nom, numéro étudiant, adresse ou photo : ni les tiens, ni ceux des autres.</li>
      <li><b>Infos vérifiées.</b> Pas de fausses infos (lieu, horaire, annulation). Les infos sûres sont dans Bâtiments et Agenda.</li>
      <li><b>Débattre, oui.</b> Le désaccord est bienvenu, l’attaque perso non. Pas de pub, pas de spam.</li>
      <li><b>📸 Photos.</b> Prises avec la caméra, vues <b>une seule fois</b> par personne pendant 10 s, effacées après 24 h. Jamais de visage reconnaissable sans accord (manifestant·es, passant·es, agents), jamais de plaque, de carte étudiante ou de document. Rien d’intime, rien de violent. Ne fais pas de capture d’écran : ton pseudo s’affiche sur la photo que tu regardes, et les modos peuvent voir et supprimer toutes les photos.</li>
    </ol>
    <p class="faint small">🚫 Les messages avec un mot interdit sont supprimés avant d’être envoyés. 3 signalements = message masqué. Les modos peuvent masquer tout message ou photo qui ne respecte pas la charte.</p>
    ${gate ? `<div class="charter-accept"><label class="check"><input type="checkbox" id="charter-chk"> J’ai lu la charte et je m’engage à la respecter</label>
    <button class="btn green" id="charter-ok" disabled style="margin-top:8px;width:100%">J’accepte et j’entre dans le chat</button></div>` : ''}
  </div>`;
}
async function loadChatRules() {
  if (state.chatRules) return;
  try { state.chatRules = (await api('/api/chat-rules')).words; } catch { state.chatRules = []; }
}
// Même normalisation que le serveur (lib/moderation.js)
const LEET_C = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '€': 'e' };
const normWord = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[0134578@$€]/g, (c) => LEET_C[c]).replace(/[^a-z]+/g, ' ').replace(/([a-z])\1+/g, '$1').trim();
function findBannedLocal(text) {
  const list = state.chatRules || [];
  if (!list.length || !text) return null;
  const n = ` ${normWord(text)} `;
  const glued = ` ${n.replace(/\b([a-z]) (?=[a-z]\b)/g, '$1').replace(/([a-z])\1+/g, '$1')} `;
  return list.find((w) => n.includes(` ${w} `) || glued.includes(` ${w} `)) || null;
}

function updateReacts(id, reactions) {
  const m = (state.chatMsgs || []).find((x) => x.id === id);
  if (m) m.reactions = reactions;
  const el = $(`.msg[data-id="${CSS.escape(id)}"] .reacts`);
  if (el) el.outerHTML = reactsHtml({ id, reactions });
}

// Case « tous les sites » (admin uniquement) dans les formulaires Flash et Agenda
function allSitesBox(id) {
  return `<label class="check all-sites"><input type="checkbox" id="${id}"> <span>🌍 <b>Tous les sites</b> : visible par tout le monde (La Doua, IUT, Rockefeller, Lyon Sud, Gerland…), notifications et Telegram de chaque site</span></label>`;
}

// ---------- Alertes modo sur ce téléphone ----------
async function modPushCard() {
  const box = $('#modpush');
  if (!box) return;
  if (!pushSupported()) {
    box.innerHTML = isIOS && !isStandalone() ? `<div class="card modpush">🔔 <b>Alertes modo</b> : sur iPhone, installe d’abord l’app (Partager → Sur l’écran d’accueil) pour recevoir les signalements à vérifier.</div>` : '';
    if (isIOS && !isStandalone() && !sess.get('l1-modpush-ask') && !$('.sheet')) {
      sess.set('l1-modpush-ask');
      sheet(`<h3>🔔 Active tes alertes modo</h3><p class="muted">Sur iPhone, les notifications marchent seulement dans l’app installée. Ajoute-la à ton écran d’accueil, ouvre-la, connecte-toi : la fenêtre pour activer les alertes apparaîtra.</p>
        <button class="btn green" id="mp-inst" style="width:100%">📲 Comment installer l’app</button><button class="btn ghost" id="mp-no" style="width:100%;margin-top:8px">Plus tard</button>`, (el, close) => {
        $('#mp-no', el).onclick = close;
        $('#mp-inst', el).onclick = () => { close(); showInstallHelp(true); };
      });
    }
    return;
  }
  const sub = await currentPushSub().catch(() => null);
  let on = false;
  if (sub && Notification.permission === 'granted') { try { on = (await api('/api/mod/push/status', { method: 'POST', body: { endpoint: sub.endpoint } })).on; } catch {} }
  // Notifications déjà autorisées sur ce téléphone : on active les alertes modo sans rien demander
  if (!on && Notification.permission === 'granted' && !store.get('l1-modpush-off', false)) {
    try { await subscribeModPush(); on = true; toast('🔔 Alertes modo activées sur ce téléphone'); } catch {}
  }
  // Refusées auparavant : le navigateur ne redemandera plus, on explique où les réautoriser
  if (!on && Notification.permission === 'denied' && !sess.get('l1-modpush-ask') && !$('.sheet')) {
    sess.set('l1-modpush-ask');
    sheet(`<h3>🔕 Notifications bloquées sur ce téléphone</h3><p class="muted">Tu les as refusées pour ce site un jour : il ne peut plus te les redemander. Pour recevoir les signalements à vérifier :</p>
      <ol class="steps">${isIOS ? '<li>Réglages de l’iPhone → <b>Notifications</b>.</li><li>Choisis l’app <b>La Doua en lutte</b> et active <b>Autoriser les notifications</b>.</li>' : '<li>Touche le <b>cadenas</b> (ou ⓘ) à gauche de l’adresse du site.</li><li><b>Autorisations</b> → <b>Notifications</b> → <b>Autoriser</b>.</li>'}<li>Reviens ici et touche <b>Activer</b> dans l’encart « Alertes modo ».</li></ol>
      <button class="btn ghost" id="mp-no" style="width:100%">Compris</button>`, (el, close) => { $('#mp-no', el).onclick = close; });
  }
  // Pas encore autorisées : on le propose à chaque ouverture de l'espace modo (une fois par visite, et à chaque connexion)
  if (!on && Notification.permission === 'default' && !sess.get('l1-modpush-ask') && !$('.sheet')) {
    sess.set('l1-modpush-ask');
    sheet(`<h3>🔔 Active tes alertes modo</h3><p class="muted">Des étudiant·es signalent des bâtiments sur tes sites. Active les notifications pour être prévenu·e et les vérifier tout de suite.</p>
      <button class="btn green" id="mp-yes" style="width:100%">Activer les alertes modo</button><button class="btn ghost" id="mp-no" style="width:100%;margin-top:8px">Plus tard</button>`, (el, close) => {
      $('#mp-no', el).onclick = close;
      $('#mp-yes', el).onclick = async () => { close(); try { const ok = await subscribeModPush(true); if (ok) toast('🔔 Alertes modo activées ✊ Les signalements en attente arrivent.'); } catch (e) { toast(e.message); } modPushCard(); };
    });
  }
  box.innerHTML = `<div class="card modpush ${on ? 'on' : ''}"><div class="grow">🔔 <b>Alertes modo sur ce téléphone</b><div class="muted small">${on ? 'Activées : tu es prévenu·e quand 3 étudiant·es signalent un bâtiment de tes sites.' : 'Sois prévenu·e dès que 3 étudiant·es signalent un bâtiment de tes sites, pour vérifier et valider.'}</div></div>
    <button class="btn small ${on ? 'ghost' : 'green'}" id="modpush-btn">${on ? 'Désactiver' : 'Activer'}</button></div>`;
  $('#modpush-btn').onclick = async () => {
    try {
      if (on) {
        const s = await currentPushSub();
        if (s) await api('/api/mod/push/unsubscribe', { method: 'POST', body: { endpoint: s.endpoint } });
        store.set('l1-modpush-off', true);
        toast('Alertes modo désactivées sur ce téléphone.');
      } else if (await subscribeModPush(true)) toast('Alertes modo activées ✊');
    } catch (e) { toast(e.message); }
    modPushCard();
  };
}

async function subscribeModPush(ask = false) {
  if (ask) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications refusées. Autorise-les dans les réglages du téléphone.'); return false; }
  }
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
  await navigator.serviceWorker.ready;
  const { key } = await api('/api/push/key');
  let s = await reg.pushManager.getSubscription();
  if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api('/api/mod/push/subscribe', { method: 'POST', body: { subscription: s.toJSON() } });
  store.set('l1-modpush-off', false);
  return true;
}

// =====================================================================
// Photos éphémères du chat : caméra seulement, 1 vue, 10 s, floue ensuite
// =====================================================================
const seenSnaps = () => store.get('l1-snaps-seen', {});
function markSnapSeen(pid) {
  const s = seenSnaps(); s[pid] = 1;
  const k = Object.keys(s); if (k.length > 500) for (const x of k.slice(0, k.length - 500)) delete s[x];
  store.set('l1-snaps-seen', s);
  $$(`[data-snap="${CSS.escape(pid)}"]`).forEach((b) => { b.classList.remove('new'); b.classList.add('seen'); $('.snap-label', b).innerHTML = b.closest('.msg.me') ? '📸 Envoyée' : '👁 Vue'; });
}
function snapHtml(m, me) {
  const p = m.photo;
  const st = p.gone ? 'gone' : me || seenSnaps()[p.id] ? 'seen' : 'new';
  const label = st === 'gone' ? '⌛ Expirée' : st === 'seen' ? (me ? '📸 Envoyée' : '👁 Vue') : '📸 Touche pour voir<small>1 seule fois · 10 s</small>';
  const ratio = p.w && p.h ? `${p.w} / ${p.h}` : '3 / 4';
  return `<button class="snap ${st}" data-snap="${esc(p.id)}" style="aspect-ratio:${ratio}" aria-label="Photo éphémère">
    ${p.thumb ? `<span class="snap-bg" style="background-image:url('${p.thumb}')"></span>` : '<span class="snap-bg empty"></span>'}
    <span class="snap-label">${label}</span></button>`;
}

let snapOpening = false;
async function openSnap(pid, asMod = false) {
  if (!asMod && seenSnaps()[pid] && !state.me) return toast('Déjà vue : une seule vue par personne.');
  if (snapOpening || $('.snap-view')) return;
  snapOpening = true;
  try { await openSnapInner(pid); } finally { snapOpening = false; }
}
async function openSnapInner(pid) {
  let blob;
  try {
    const r = await fetch(`/api/chat/photo/${encodeURIComponent(pid)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); if (r.status === 410 && !state.me) markSnapSeen(pid); return toast(j.error || 'Photo indisponible.'); }
    blob = await r.blob();
  } catch { return toast('Connexion impossible.'); }
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch { if (!state.me) markSnapSeen(pid); return toast('Photo illisible.'); }
  blob = null;
  const ov = document.createElement('div');
  ov.className = 'snap-view';
  ov.innerHTML = `<canvas></canvas><div class="snap-bar"><i></i></div><div class="snap-hint">Touche pour fermer · la photo disparaît dans <b>10</b> s</div>`;
  document.body.appendChild(ov);
  const cv = $('canvas', ov);
  const draw = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    const k = Math.min(cv.width / bmp.width, cv.height / bmp.height);
    const w = bmp.width * k, h = bmp.height * k;
    c.drawImage(bmp, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    // filigrane : qui regarde, et quand (une capture d'écran montre qui l'a prise)
    const who = `${state.me ? 'MODO ' + state.me.org : nick()} · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    c.save(); c.translate(cv.width / 2, cv.height / 2); c.rotate(-Math.PI / 7);
    c.font = `700 ${Math.round(16 * dpr)}px ui-monospace, Menlo, monospace`; c.fillStyle = 'rgba(255,255,255,0.16)'; c.textAlign = 'center';
    for (let y = -cv.height; y < cv.height; y += 90 * dpr) for (let x = -cv.width; x < cv.width; x += 300 * dpr) c.fillText(who, x + ((y / (90 * dpr)) % 2) * 150 * dpr, y);
    c.restore();
  };
  draw();
  addEventListener('resize', draw);
  let left = 10;
  const tick = setInterval(() => { left--; const b = $('.snap-hint b', ov); if (b) b.textContent = left; if (left <= 0) close(); }, 1000);
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    clearInterval(tick); removeEventListener('resize', draw);
    document.removeEventListener('visibilitychange', onHide); removeEventListener('blur', close); removeEventListener('pagehide', close);
    const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); cv.width = cv.height = 1;
    bmp.close?.(); ov.remove();
    if (!state.me) markSnapSeen(pid);
  }
  const onHide = () => { if (document.hidden) close(); };
  ov.addEventListener('click', close);
  ov.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', onHide);
  addEventListener('blur', close); // on quitte l'app (centre de contrôle, autre app…) : la photo se ferme
  addEventListener('pagehide', close);
}

const SNAP_RATIO = 3 / 4; // largeur / hauteur des photos du chat (aperçu = photo envoyée = bulle)
async function openCamera() {
  if (!state.me && !charterOk()) return toast('Accepte d’abord la nouvelle charte du chat (photos).');
  let facing = store.get('l1-cam', 'environment');
  let stream = null;
  const ov = document.createElement('div');
  ov.className = 'cam';
  ov.innerHTML = `<div class="cam-frame"><video autoplay playsinline muted></video><div class="cam-flash"></div></div>
    <div class="cam-top"><button class="cam-x" aria-label="Fermer">✕</button><span>Photo éphémère · vue 1 fois</span><button class="cam-flip" aria-label="Changer de caméra">🔄</button></div>
    <div class="cam-bottom"><p>⚠️ Pas de visage reconnaissable sans accord</p><button class="cam-shot" aria-label="Prendre et envoyer"></button></div>`;
  document.body.appendChild(ov);
  const video = $('video', ov);
  let closed = false, seq = 0, shooting = false;
  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const close = () => { closed = true; stop(); ov.remove(); };
  async function start() {
    stop();
    const my = ++seq;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1440 } }, audio: false });
      // fenêtre fermée ou autre caméra demandée entre-temps : ce flux est coupé tout de suite
      if (closed || my !== seq) { st.getTracks().forEach((t) => t.stop()); return; }
      stream = st;
      video.srcObject = stream;
      video.classList.toggle('mirror', facing === 'user');
    } catch (e) { close(); toast(e.name === 'NotAllowedError' ? 'Autorise la caméra pour envoyer une photo.' : 'Caméra indisponible.'); }
  }
  $('.cam-x', ov).onclick = close;
  $('.cam-flip', ov).onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; store.set('l1-cam', facing); start(); };
  $('.cam-shot', ov).onclick = async () => {
    if (!video.videoWidth || shooting) return;
    shooting = true;
    // Même cadre que l'aperçu : portrait 3:4, recadré au centre (comme object-fit: cover)
    const vw = video.videoWidth, vh = video.videoHeight;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vw / vh > SNAP_RATIO) { sw = Math.round(vh * SNAP_RATIO); sx = Math.round((vw - sw) / 2); }
    else { sh = Math.round(vw / SNAP_RATIO); sy = Math.round((vh - sh) / 2); }
    const k = Math.min(1, 1280 / sh);
    const w = Math.round(sw * k), h = Math.round(sh * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    if (facing === 'user') { c.translate(w, 0); c.scale(-1, 1); }
    c.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    // vignette minuscule (16 px) : sert seulement de fond flou, rien n'y est reconnaissable
    const tc = document.createElement('canvas'); tc.width = 16; tc.height = Math.max(4, Math.round(16 * h / w));
    tc.getContext('2d').drawImage(cv, 0, 0, tc.width, tc.height);
    const thumb = tc.toDataURL('image/jpeg', 0.5);
    $('.cam-flash', ov).classList.add('on');
    navigator.vibrate?.(20);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.82));
    close();
    try {
      const q = new URLSearchParams({ channel: state.chatChannel, nick: nick(), charter: String(store.get('l1-charte', 0)), w, h });
      const r = await fetch(`/api/chat/photo?${q}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg', 'X-Thumb': thumb }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast(j.error || 'Envoi impossible.');
      markSnapSeen(j.photo.id);
      toast('📸 Photo envoyée');
    } catch { toast('Envoi impossible, vérifie ta connexion.'); }
  };
  start();
}

// Admin : qui reçoit les alertes modo (signalements à vérifier), et quels sites ne sont couverts par personne
function modPushSummary(mods) {
  const active = mods.filter((m) => !m.disabled);
  const on = active.filter((m) => m.modPush);
  const covers = (m, id) => m.role === 'admin' || (m.sites || []).includes(id);
  const rows = siteList().map((x) => {
    const team = active.filter((m) => m.role !== 'admin' && covers(m, x.id));
    const ok = team.filter((m) => m.modPush);
    return `<div class="mp-site ${team.length && !ok.length ? 'warn' : ''}"><b>${esc(x.short)}</b><span>${team.length ? `${ok.length}/${team.length} modo${team.length > 1 ? 's' : ''} ${ok.length ? '🔔' : '🔕'}` : '<i>aucun modo</i>'}</span>${team.length ? `<small>${team.map((m) => `${m.modPush ? '🔔' : '🔕'} ${esc(m.org)}`).join(' · ')}</small>` : ''}</div>`;
  }).join('');
  const missing = siteList().filter((x) => { const t = active.filter((m) => m.role !== 'admin' && covers(m, x.id)); return t.length && !t.some((m) => m.modPush); });
  return `<div class="card" style="margin-top:14px"><div class="kicker">🔔 Alertes modo sur téléphone · ${on.length}/${active.length} compte${active.length > 1 ? 's' : ''} actif${active.length > 1 ? 's' : ''}</div>
    <p class="muted small" style="margin:6px 0 10px">Un modo reçoit une notification dès qu’une personne signale un bâtiment de ses sites (photo à l’appui), seulement s’il a touché « Activer » dans l’espace modo sur son téléphone.${missing.length ? ` <b style="color:var(--orange)">Personne n’est prévenu pour : ${missing.map((x) => esc(x.short)).join(', ')}.</b> Relance ces modos.` : ''}</p>
    <div class="mp-grid">${rows}</div></div>`;
}

// Admin : état de la chaîne Telegram (jeton, chaîne, droits du bot), dernière erreur et message de test
async function telegramCard() {
  const box = $('#tgbox');
  if (!box) return;
  let t;
  try { t = await api('/api/mod/telegram'); } catch (e) { box.innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
  state.tgSites = Object.fromEntries(t.sites.map((x) => [x.id, x.chat]));
  const ok = !t.problem && t.chats.length && t.chats.every((c) => c.ok);
  const line = (good, txt) => `<div class="tg-line ${good ? 'ok' : 'ko'}">${good ? '✅' : '❌'} ${txt}</div>`;
  const st = t.status;
  box.innerHTML = `<div class="card tg-diag ${ok ? 'ok' : 'ko'}">
    <div class="kicker">📣 Chaîne Telegram · ${ok ? 'reliée' : 'à réparer'}</div>
    ${line(t.configured.token && t.bot, t.bot ? `Bot <b>@${esc(t.bot.username)}</b> reconnu` : 'Jeton du bot (TELEGRAM_BOT_TOKEN)')}
    ${line(t.configured.chat, t.configured.chat ? `Chaîne principale : <b>${esc(t.mainChat)}</b>${t.url ? ` · <a href="${esc(t.url)}" target="_blank" rel="noopener">ouvrir</a>` : ''}` : 'Chaîne principale (TELEGRAM_CHAT_ID)')}
    ${t.chats.map((c) => line(c.ok, `${esc(c.title || c.chat)} <span class="faint">(${esc(c.chat)}${c.botStatus ? ' · bot ' + esc(c.botStatus) : ''})</span>${c.problem ? `<div class="tg-fix">${esc(c.problem)}</div>` : ''} <button class="btn small ghost" data-tgtest="${esc(c.chat)}">Envoyer un test</button>`)).join('')}
    ${t.problem ? `<div class="tg-fix">⚠️ ${esc(t.problem)}</div>` : ''}
    ${(t.warnings || []).map((w) => `<div class="tg-fix">⚠️ ${esc(w)}</div>`).join('')}
    <p class="faint small" style="margin:8px 0 0">${st.sent} message(s) envoyé(s) depuis le dernier démarrage${st.lastOkAt ? ` · dernier ${esc(ago(st.lastOkAt))}` : ''}${st.lastError ? `<br><span style="color:var(--red)">Dernière erreur ${esc(ago(st.lastErrorAt))} (${esc(st.lastErrorChat || '')}) : ${esc(st.lastError)}</span>` : ''}</p>
    ${!t.configured.token || !t.configured.chat ? `<details style="margin-top:8px"><summary class="small" style="cursor:pointer">Comment relier la chaîne (5 min)</summary><ol class="steps small">
      <li>Sur Telegram, ouvre <b>@BotFather</b> → <code>/newbot</code> → copie le <b>jeton</b>.</li>
      <li>Crée une <b>chaîne</b> (publique, ex. @ladoualyon1), puis <b>Administrateurs → Ajouter</b> ton bot avec « Publier des messages ».</li>
      <li>Sur Render → ton service → <b>Environment</b> : <code>TELEGRAM_BOT_TOKEN</code> = le jeton, <code>TELEGRAM_CHAT_ID</code> = @nom_de_la_chaine. Enregistre (le site redémarre).</li>
      <li>Reviens ici et touche « Envoyer un test ».</li></ol></details>` : ''}
  </div>`;
  box.onclick = async (e) => {
    const chat = e.target.closest('[data-tgtest]')?.dataset.tgtest;
    if (!chat) return;
    e.target.disabled = true;
    const r = await act(() => api('/api/mod/telegram/test', { method: 'POST', body: { chat } })).catch(() => null);
    if (r) toast(r.ok ? `✅ Message de test envoyé dans ${r.chat}` : `❌ ${r.error}`);
    telegramCard();
  };
}

// ---------- Bilan de publication + story Insta prête en un tap ----------
function reachText(r) {
  if (!r) return '';
  const parts = [];
  if (r.phones) parts.push(`📲 ${r.phones} téléphone${r.phones > 1 ? 's' : ''}${r.delaySec ? ` dans ${r.delaySec >= 60 ? Math.round(r.delaySec / 60) + ' min' : r.delaySec + ' s'}` : ''}`);
  if (r.emails && r.emailMode === 'instant') parts.push(`✉️ ${r.emails} email${r.emails > 1 ? 's' : ''}`);
  if (r.telegram) parts.push('📣 Telegram');
  if (r.online) parts.push(`👀 ${r.online} en direct`);
  return parts.length ? ' · ' + parts.join(' · ') : '';
}
let pubTimer = null;
async function publishedCard(reach, list) {
  const box = $('#pubres');
  if (!box) return;
  const names = (st) => list.filter((c) => c.status === st).map((c) => state.data.buildings.find((b) => b.id === c.id)?.name).filter(Boolean);
  const summary = [['bloque', '🔴'], ['partiel', '🟠'], ['ouvert', '🟢']].map(([k, d]) => (names(k).length ? `${d} ${names(k).join(', ')}` : '')).filter(Boolean).join(' · ');
  const r = reach || { phones: 0, telegram: 0, online: 0 };
  box.innerHTML = `<div class="card pub-card">
    <div class="pub-head"><b>✅ Publié</b><button class="pub-x" aria-label="Fermer">✕</button></div>
    <div class="pub-sum">${esc(summary)}</div>
    <div class="pub-reach">
      <span><b>${r.phones}</b> téléphone${r.phones > 1 ? 's' : ''} ${r.delaySec ? `<small>notifiés dans ${r.delaySec >= 60 ? Math.round(r.delaySec / 60) + ' min' : r.delaySec + ' s'}</small>` : '<small>notifiés</small>'}</span>
      ${r.emails && r.emailMode === 'instant' ? `<span><b>${r.emails}</b> email${r.emails > 1 ? 's' : ''}<small>envoyés</small></span>` : ''}
      <span><b>${r.telegram ? '✓' : '✕'}</b> Telegram<small>${r.telegram ? 'envoyé' : 'non relié'}</small></span>
      <span><b>${r.online}</b> en direct<small>sur le site</small></span>
    </div>
    <button class="btn red pub-share" id="pubshare" disabled>📸 Préparation de la story…</button>
    <p class="faint small" style="margin:6px 0 0">Story avec le lien du site, prête à poster : site d’abord, Insta ensuite ✊</p>
  </div>`;
  $('.pub-x', box).onclick = () => (box.innerHTML = '');
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => { if ($('#pubres')) $('#pubres').innerHTML = ''; }, 120000);
  // la story est préparée tout de suite, pour que le partage parte au premier tap
  let file = null;
  try {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    await storyCampus(c.getContext('2d'), 1080, 1920);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    file = new File([blob], `ladoua-en-lutte-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`, { type: 'image/png' });
  } catch {}
  const btn = $('#pubshare');
  if (!btn) return;
  btn.disabled = !file;
  btn.textContent = file ? '📸 Partager la story Insta' : '📸 Story indisponible';
  btn.onclick = async () => {
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch {} }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); toast('Story téléchargée : publie-la sur Instagram avec le sticker lien.'); }
  };
}

// =====================================================================
// Admin : audience anonyme (visites, appareils, app installée, notifications)
// =====================================================================
const AUD = { browser: '#0a84ff', app: '#25a848' }; // validé (contraste, daltonisme) sur le fond sombre
async function modAudience(el) {
  const a = await api('/api/mod/audience');
  const n = (x) => Number(x || 0).toLocaleString('fr-FR');
  const tile = (big, label, sub = '') => `<div class="aud-tile"><b>${big}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const per = (r, t) => `<div class="aud-row"><span class="aud-k">${t}</span><span><b>${n(r.devices)}</b> appareils</span><span><i class="sw" style="background:${AUD.browser}"></i>${n(r.devicesBrowser)} navigateur</span><span><i class="sw" style="background:${AUD.app}"></i>${n(r.devicesApp)} app</span><span class="faint">${n(r.visits)} visites</span></div>`;
  const max = Math.max(1, ...a.series.map((d) => d.browser + d.app));
  const dayLbl = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const kindLbl = { buildings: 'Bâtiments bloqués', urgent: 'Alertes urgentes', events: 'AG & manifs', reports: 'Comptes rendus' };
  el.innerHTML = `
    <p class="muted small">Chiffres anonymes : chaque téléphone ou ordinateur est compté par une empreinte aléatoire, sans nom ni adresse IP. Le site ne peut pas savoir si c’est un·e étudiant·e ou un membre du personnel (il n’y a pas de compte).${a.since ? ` Comptage depuis le ${esc(dayLbl(a.since))}.` : ' Le comptage commence avec cette mise à jour.'}</p>
    <div class="aud-tiles">
      ${tile(n(a.push.total), '🔔 notifications activées', `téléphones / ordinateurs abonnés · ${n(a.push.allSites)} suivent tous les sites`)}
      ${tile(n(a.everApp), '📲 ont ouvert l’app installée', `${n(a.month.installs)} installation${a.month.installs > 1 ? 's' : ''} vue${a.month.installs > 1 ? 's' : ''} sur 30 j`)}
      ${tile(n(a.month.devices), '👀 appareils sur 30 jours', `${n(a.week.devices)} sur 7 j · ${n(a.today.devices)} aujourd’hui`)}
      ${tile(n(a.emails.confirmed), '✉️ emails confirmés', 'récap ou alertes par email')}
    </div>

    <div class="card" style="margin-top:12px">
      <div class="kicker">Appareils par jour · 30 derniers jours</div>
      <div class="aud-legend"><span><i class="sw" style="background:${AUD.browser}"></i>Navigateur</span><span><i class="sw" style="background:${AUD.app}"></i>App installée</span></div>
      <div class="aud-chart" role="img" aria-label="Appareils par jour sur 30 jours, navigateur et app installée">
        ${a.series.map((d) => `<div class="aud-col" data-tip="${esc(dayLbl(d.day))} · ${d.browser + d.app} appareil(s) · ${d.browser} navigateur · ${d.app} app · ${d.visits} visite(s)">
          <div class="aud-bar">${d.app ? `<i style="height:${(d.app / max) * 100}%;background:${AUD.app}"></i>` : ''}${d.browser ? `<i style="height:${(d.browser / max) * 100}%;background:${AUD.browser}"></i>` : ''}</div></div>`).join('')}
      </div>
      <div class="aud-axis"><span>${esc(dayLbl(a.series[0].day))}</span><span>max ${n(max)} / jour</span><span>aujourd’hui</span></div>
      <div class="aud-tip" id="audtip" hidden></div>
      <details style="margin-top:8px"><summary class="small" style="cursor:pointer">Voir le tableau</summary>
        <table class="aud-table"><tr><th>Jour</th><th>Navigateur</th><th>App</th><th>Visites</th></tr>${a.series.slice().reverse().map((d) => `<tr><td>${esc(dayLbl(d.day))}</td><td>${d.browser}</td><td>${d.app}</td><td>${d.visits}</td></tr>`).join('')}</table></details>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="kicker">Appareils uniques</div>
      ${per(a.today, 'Aujourd’hui')}${per(a.week, '7 jours')}${per(a.month, '30 jours')}
    </div>

    <div class="grid cols-2" style="margin-top:12px">
      <div class="card"><div class="kicker">🔔 Notifications par site</div>
        ${a.push.bySite.map((x) => `<div class="aud-line"><span>${esc(x.short)}</span><b>${n(x.push)}</b></div>`).join('')}
        <p class="faint small" style="margin:6px 0 0">Un abonné « tous les sites » compte dans chaque site.</p></div>
      <div class="card"><div class="kicker">🔔 Notifications par type</div>
        ${Object.entries(kindLbl).map(([k, l]) => `<div class="aud-line"><span>${l}</span><b>${n(a.push.kinds[k])}</b></div>`).join('')}</div>
    </div>
    <p class="faint small" style="margin-top:10px">« App installée » = appareils qui ont ouvert le site depuis l’icône de l’écran d’accueil. Une installation n’est vue directement que sur Android/ordinateur ; sur iPhone elle est comptée dès la première ouverture de l’app.</p>`;
  const tip = $('#audtip');
  const chart = $('.aud-chart', el);
  const show = (e) => {
    const col = e.target.closest('.aud-col');
    if (!col) { tip.hidden = true; return; }
    tip.textContent = col.dataset.tip; tip.hidden = false;
    const r = chart.getBoundingClientRect(), c = col.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(r.width - 220, c.left - r.left - 100))}px`;
    $$('.aud-col.on', chart).forEach((x) => x.classList.remove('on')); col.classList.add('on');
  };
  chart.addEventListener('pointermove', show);
  chart.addEventListener('pointerdown', show);
  chart.addEventListener('pointerleave', () => { tip.hidden = true; $$('.aud-col.on', chart).forEach((x) => x.classList.remove('on')); });
}

// ---------- Compte piquet : connexion par lien ----------
function openTerrainCamera(done) {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Caméra indisponible sur cet appareil.');
  const ov = document.createElement('div');
  ov.className = 'cam';
  ov.innerHTML = `<div class="cam-frame"><video autoplay playsinline muted></video><div class="cam-flash"></div></div>
    <div class="cam-top"><button class="cam-x" aria-label="Fermer">✕</button><span>Photo obligatoire · aucun import</span><button class="cam-flip" aria-label="Changer de caméra">🔄</button></div>
    <div class="cam-bottom"><p>Photo prise directement sur place</p><button class="cam-shot" aria-label="Prendre la photo"></button></div>`;
  document.body.appendChild(ov);
  const video = $('video', ov);
  let stream = null, facing = 'environment', closed = false, seq = 0;
  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  let shot = false;
  const close = () => { if (closed) return; closed = true; stop(); ov.remove(); if (!shot) done(null); };
  const start = async () => {
    stop();
    const my = ++seq;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1440 } }, audio: false });
      if (closed || my !== seq) { st.getTracks().forEach((t) => t.stop()); return; }
      stream = st;
      video.srcObject = stream;
      video.classList.toggle('mirror', facing === 'user');
    } catch (e) {
      close();
      toast(e.name === 'NotAllowedError' ? 'Autorise la caméra pour prendre la photo.' : 'Caméra indisponible.');
    }
  };
  $('.cam-x', ov).onclick = close;
  $('.cam-flip', ov).onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
  $('.cam-shot', ov).onclick = () => {
    if (!video.videoWidth) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vw / vh > 3 / 4) { sw = Math.round(vh * 3 / 4); sx = Math.round((vw - sw) / 2); }
    else { sh = Math.round(vw / (3 / 4)); sy = Math.round((vh - sh) / 2); }
    const k = Math.min(1, 1280 / sh);
    const cv = document.createElement('canvas');
    cv.width = Math.round(sw * k);
    cv.height = Math.round(sh * k);
    const c = cv.getContext('2d');
    if (facing === 'user') { c.translate(cv.width, 0); c.scale(-1, 1); }
    c.drawImage(video, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    $('.cam-flash', ov).classList.add('on');
    navigator.vibrate?.(20);
    shot = true;
    cv.toBlob((blob) => { close(); done(blob); }, 'image/jpeg', 0.82);
  };
  start();
}

async function terrainLogin(token) {
  view().innerHTML = '<div class="empty mono typing">Connexion…</div>';
  try {
    state.me = await api('/api/auth/terrain', { method: 'POST', body: { token } });
    history.replaceState(null, '', '#/modo'); // le lien n'apparaît plus dans l'historique
    toast(`📍 Connecté·e : ${state.me.org}`);
    render(true);
  } catch (e) {
    view().innerHTML = `<div class="card empty"><div class="big">🔒</div>${esc(e.message)}</div>`;
  }
}
// QR code (bibliothèque qrcode-generator déjà chargée)
function qrImg(text) {
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createImgTag(6, 12, 'QR code du lien'); } catch { return ''; }
}

// ---------- Photo de preuve d'un signalement ----------
// réduite et ré-encodée dans le téléphone (les données cachées comme la position GPS disparaissent)
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('photo'))), 'image/jpeg', 0.8));
}
async function showSightPhotos(ids, name) {
  const urls = [];
  for (const id of ids) {
    try { const r = await fetch(`/api/mod/sightings/photo/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) urls.push(URL.createObjectURL(await r.blob())); } catch {}
  }
  if (!urls.length) return toast('Photos expirées.');
  sheet(`<h3>📷 ${esc(name)} · ${urls.length} photo${urls.length > 1 ? 's' : ''}</h3><p class="faint small">Envoyées par les étudiant·es qui ont signalé. Effacées avec le signalement (2 h max ou dès ta confirmation).</p>
    <div class="sight-photos">${urls.map((u) => `<img src="${u}" alt="Photo du signalement">`).join('')}</div>`);
}
