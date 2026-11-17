// Lyon 1 · La Doua en lutte : application monopage (sans framework).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = { data: null, me: null, chatChannel: store.get('l1-channel', 'general'), chatMsgs: [], dirty: false, modTab: 'situation', campus: 'Tous', demandCat: 'Toutes' };

async function api(path, { method = 'GET', body, raw } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (method !== 'GET' && body === undefined && !raw) { opt.headers['Content-Type'] = 'application/json'; opt.body = '{}'; }
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
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
  { id: 'contacts', label: 'Parler à qui ?', icon: 'people' },
  { id: 'alertes', label: 'Alertes email', icon: 'bell' },
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
};
const EVENT_TYPE = { AG: ['AG', 'purple'], manif: ['Manif', 'red'], rassemblement: ['Rassemblement', 'orange'], action: ['Action', 'green'], autre: ['Rendez-vous', 'grey'] };
const FLASH_ICO = { decision: '⚖️', vote: '🗳️', info: 'ℹ️', action: '📣', alerte: '🚨' };
const DEMAND_STATUS = { 'en-lutte': ['En lutte', 'red'], obtenu: ['Obtenu ✊', 'green'], refuse: ['Refusé', 'grey'] };

// ---------- Dates (heure de Paris) ----------
const TZ = 'Europe/Paris';
const igUrl = () => state.data?.instagram || 'https://www.instagram.com/lyon1_ladoua.enlutte/';
const igHandle = () => '@' + ((igUrl().match(/instagram\.com\/([^/?#]+)/) || [0, 'lyon1_ladoua.enlutte'])[1]);
const igCard = (text = 'Photos, vidéos et stories de la mobilisation') => `<a class="card ig-card" href="${esc(igUrl())}" target="_blank" rel="noopener" style="margin-top:14px"><span class="ig-ico">IG</span><div class="grow"><b>Suis ${esc(igHandle())}</b><div class="muted small">${esc(text)}</div></div><span class="chev">${icon('chev', 18)}</span></a>`;
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
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
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
  if (!blocked.length && !partial.length && d.blocus.state !== 'actif') { bar.hidden = true; return; }
  const parts = [];
  if (d.blocus.state === 'actif') parts.push(`${BLOCUS.actif}${d.blocus.message ? ' : ' + d.blocus.message : ''}`);
  if (blocked.length) parts.push(`BLOQUÉ : ${blocked.map((b) => b.name).join(' · ')}`);
  if (partial.length) parts.push(`PARTIEL : ${partial.map((b) => b.name).join(' · ')}`);
  const txt = esc(parts.join('   ///   '));
  bar.innerHTML = `<span class="tag">ALERTE</span><span class="mask"><span class="ticker"><span>${txt}</span><span aria-hidden="true">${txt}</span></span></span>`;
  bar.onclick = () => (location.hash = '#/batiments');
  bar.hidden = false;
}

function setOnline(n) {
  const txt = `${n} connecté·e${n > 1 ? 's' : ''}`;
  $('#online-side').textContent = txt;
  $('#online-top').textContent = txt;
}

// ---------- Rendu ----------
const view = () => $('#view');
function render(force = false) {
  const active = document.activeElement;
  if (!force && active && view().contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) { state.dirty = true; return; }
  state.dirty = false;
  renderNav();
  renderAlertBar();
  const [r, arg] = route().split('/');
  if (!state.data) { view().innerHTML = '<div class="empty"><div class="big typing mono">_</div>Connexion au flux…</div>'; return; }
  const views = { '': viewLive, batiments: viewBuildings, agenda: viewAgenda, chat: viewChat, cr: arg ? () => viewReport(arg) : viewReports, revendications: viewDemands, votes: viewPolls, blog: () => viewBlog(arg), temoignages: viewTestimonies, contacts: viewContacts, alertes: viewAlerts, plus: viewPlus, modo: viewModo };
  (views[r] || viewLive)();
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
    <section class="hero ${esc(b.state)}">
      <div class="kicker">Lyon 1 · La Doua en lutte</div>
      <div class="state" data-glitch="${esc(BLOCUS[b.state])}">${esc(BLOCUS[b.state])}</div>
      ${b.message ? `<div class="msg">${esc(b.message)}</div>` : '<div class="msg muted">Les infos sont mises à jour en direct par les étudiant·es syndiqué·es.</div>'}
      <div class="meta">MAJ ${esc(ago(b.updatedAt))}${b.by ? ' · ' + esc(b.by) : ''}</div>
      <div class="stats">
        <a class="stat red" href="#/batiments"><b>${blocked.length}</b><span>bloqué${blocked.length > 1 ? 's' : ''}</span></a>
        <a class="stat orange" href="#/batiments"><b>${partial.length}</b><span>partiel${partial.length > 1 ? 's' : ''}</span></a>
        <a class="stat green" href="#/batiments"><b>${open.length}</b><span>ouvert${open.length > 1 ? 's' : ''}</span></a>
        <a class="stat" href="#/agenda"><b>${d.events.length}</b><span>RDV</span></a>
      </div>
    </section>

    ${d.pollsOpen ? `<a class="card" href="#/votes" style="display:flex;gap:14px;align-items:center;margin-top:14px;color:inherit;border-color:rgba(10,132,255,0.5)"><div style="font-size:28px">🗳️</div><div class="grow"><b>${d.pollsOpen} vote${d.pollsOpen > 1 ? 's' : ''} anonyme${d.pollsOpen > 1 ? 's' : ''} en cours</b><div class="muted small">Un tap, aucune trace. Donne ton avis.</div></div><span class="chev">${icon('chev', 18)}</span></a>` : ''}

    ${d.flashes.length ? `<h2 class="section">⚡ Flash infos</h2>${d.flashes.slice(0, 4).map((f) => `
      <div class="flash ${f.level === 'alerte' ? 'alerte' : f.level === 'ok' ? 'action' : 'vote'}"><div class="ico">${f.level === 'alerte' ? '🚨' : f.level === 'ok' ? '✅' : 'ℹ️'}</div><div><div class="fx">${esc(f.text)}</div><div class="faint small mono">${esc(ago(f.at))} · ${esc(f.org || '')}</div></div></div>`).join('')}` : ''}

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

    ${igCard()}
    <a class="card" href="#/alertes" style="display:flex;gap:14px;align-items:center;margin-top:24px;color:inherit;border-color:rgba(255,69,58,0.4)">
      <div style="font-size:30px">🔔</div>
      <div class="grow"><b>Reçois les alertes par email</b><div class="muted small">Bâtiment bloqué = email rouge, lisible en 3 secondes. ${d.subscribers} inscrit·es.</div></div>
      <span class="chev">${icon('chev', 18)}</span>
    </a>`;
  const f = $('#feed');
  if (f) f.scrollTop = 0;
}
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

// ===== Bâtiments =====
function viewBuildings() {
  const d = state.data;
  const campuses = ['Tous', ...new Set(d.buildings.map((b) => b.campus))];
  if (!campuses.includes(state.campus)) state.campus = 'Tous';
  const order = { bloque: 0, partiel: 1, ouvert: 2, inconnu: 3 };
  const list = d.buildings.filter((b) => state.campus === 'Tous' || b.campus === state.campus).sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const count = (s) => d.buildings.filter((b) => b.status === s).length;
  view().innerHTML = `
    <h1 class="large-title">Bâtiments</h1>
    <p class="subtitle">Rouge = bloqué. Mis à jour par les modos sur place. ${count('bloque')} bloqué(s), ${count('partiel')} partiel(s), ${count('ouvert')} ouvert(s).</p>
    <div class="segmented" id="campus">${campuses.map((c) => `<button data-c="${esc(c)}" class="${c === state.campus ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
    <div class="grid cols-3">${list.map((b) => `
      <div class="bld ${esc(b.status)}">
        <div class="status">${STATUS[b.status].dot} ${STATUS[b.status].label}</div>
        <div class="name">${esc(b.name)}</div>
        <div class="campus">${esc(b.campus)}</div>
        ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
        <div class="when">${b.updatedAt ? 'MAJ ' + esc(ago(b.updatedAt)) : ''}</div>
      </div>`).join('') || '<div class="empty">Aucun bâtiment.</div>'}
    </div>
    <p class="faint small" style="margin-top:18px">Une info fausse ou périmée ? Signale-la dans le <a href="#/chat">chat</a> : les modos la corrigent.</p>`;
  $('#campus').onclick = (e) => { const c = e.target.dataset?.c; if (c) { state.campus = c; render(true); } };
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
        <div class="card event">
          <div class="time"><b>${esc(hhmm(e.start))}</b><span>${esc(fmt(e.start, { day: 'numeric', month: 'short' }))}</span></div>
          <div class="grow" style="flex:1;min-width:0">
            <span class="pill ${EVENT_TYPE[e.type][1]}">${EVENT_TYPE[e.type][0]}</span>
            <div class="title" style="margin-top:6px">${esc(e.title)}</div>
            <div class="place">${icon('pin', 14)} ${esc(e.place || 'Lieu à confirmer')}${e.address ? ' · ' + esc(e.address) : ''}</div>
            ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
            <div class="actions">
              ${e.place || e.address ? `<a class="btn small ghost" target="_blank" rel="noopener" href="https://www.openstreetmap.org/search?query=${encodeURIComponent([e.address || e.place, 'Lyon'].join(' '))}">${icon('pin', 16)} Itinéraire</a>` : ''}
              <button class="btn small ghost" data-ics="${esc(e.id)}">${icon('calendar', 16)} Calendrier</button>
              <button class="btn small ghost" data-share="${esc(e.id)}">${icon('share', 16)} Partager</button>
            </div>
            <div class="faint small" style="margin-top:8px">Annoncé par ${esc(e.org || 'les modos')}</div>
          </div>
        </div>`).join('')}`).join('')
    : '<div class="card empty"><div class="big">📅</div>Aucun rendez-vous annoncé.<br>Inscris-toi aux <a href="#/alertes">alertes</a> pour être prévenu·e.</div>'}`;
  view().onclick = async (ev) => {
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
          <span class="pill blue">${r.flashs.length} flash</span>
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
  const cats = ['Toutes', ...new Set(all.map((d) => d.category))];
  if (!cats.includes(state.demandCat)) state.demandCat = 'Toutes';
  const mine = store.get('l1-supported', []);
  const list = all.filter((d) => state.demandCat === 'Toutes' || d.category === state.demandCat).sort((a, b) => (a.status === 'en-lutte' ? 0 : 1) - (b.status === 'en-lutte' ? 0 : 1) || b.support - a.support);
  view().innerHTML = `
    <h1 class="large-title">Revendications</h1>
    <p class="subtitle">Ce que porte la mobilisation. Soutiens d’un tap, anonymement.</p>
    ${cats.length > 2 ? `<div class="tabs-inline" id="cats">${cats.map((c) => `<button data-c="${esc(c)}" class="${c === state.demandCat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
    ${list.length ? list.map((d) => `
      <div class="card demand">
        <div class="grow">
          <div class="chips"><span class="pill ${DEMAND_STATUS[d.status][1]}">${DEMAND_STATUS[d.status][0]}</span><span class="pill grey">${esc(d.category)}</span></div>
          <h3>${esc(d.title)}</h3>
          ${d.text ? `<p>${esc(d.text)}</p>` : ''}
        </div>
        <button class="support ${mine.includes(d.id) ? 'done' : ''}" data-id="${esc(d.id)}" aria-label="Soutenir"><span>✊</span><b>${d.support}</b><span>${mine.includes(d.id) ? 'soutenu' : 'soutenir'}</span></button>
      </div>`).join('') : '<div class="card empty"><div class="big">✊</div>Les revendications votées en AG apparaîtront ici.</div>'}`;
  const cat = $('#cats');
  if (cat) cat.onclick = (e) => { if (e.target.dataset.c) { state.demandCat = e.target.dataset.c; render(true); } };
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
const ANIMALS = ['Hibou', 'Renard', 'Loutre', 'Lynx', 'Corbeau', 'Castor', 'Panda', 'Moineau', 'Blaireau', 'Héron', 'Chouette', 'Hérisson', 'Faucon', 'Belette', 'Tortue'];
const COLORS = ['Rouge', 'Noir', 'Vert', 'Bleu', 'Fauve', 'Gris', 'Doré', 'Violet'];
function nick() {
  let n = store.get('l1-nick', null);
  if (!n) { n = `${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]} ${COLORS[Math.floor(Math.random() * COLORS.length)]} ${Math.floor(Math.random() * 90 + 10)}`; store.set('l1-nick', n); }
  return n;
}
function msgHtml(m) {
  const me = m.nick === nick() && !m.mod;
  return `<div class="msg ${me ? 'me' : ''} ${m.mod ? 'modo' : ''}" data-id="${esc(m.id)}">
    <div class="who">${m.mod ? '🛡️ ' : ''}<b>${esc(m.nick)}</b>${m.mod ? ` <span class="pill green" style="padding:1px 6px;font-size:10px">${esc(m.mod)}</span>` : ''} <span class="faint">${esc(hhmm(m.at))}</span>${me ? '' : ` <button class="rep" data-rep="${esc(m.id)}">signaler</button>`}</div>
    <div class="bubble">${esc(m.text)}</div></div>`;
}
async function viewChat() {
  const chans = state.data.channels;
  if (!chans.some((c) => c.id === state.chatChannel)) state.chatChannel = chans[0]?.id;
  const ch = chans.find((c) => c.id === state.chatChannel);
  view().innerHTML = `
    <div class="chat">
      <div class="chat-head"><h1 class="large-title" style="margin:8px 0 2px">Chat anonyme</h1></div>
      <div class="tabs-inline" id="chans">${chans.map((c) => `<button data-c="${esc(c.id)}" class="${c.id === state.chatChannel ? 'on' : ''}"># ${esc(c.name)}</button>`).join('')}</div>
      <div class="notice">🕶️ Pas de compte, pas d’email. Tu es <b>${esc(nick())}</b> · <a href="#" id="renick">changer</a>. Ne donne jamais ton nom, ton numéro étudiant ni d’info qui t’identifie. ${ch ? esc(ch.description) : ''}</div>
      <div class="msgs" id="msgs"><div class="empty faint mono">chargement…</div></div>
      <form class="composer" id="composer">
        <textarea id="text" rows="1" maxlength="600" placeholder="Message dans #${esc(ch?.name || '')}" aria-label="Message"></textarea>
        <button type="submit" aria-label="Envoyer">${icon('send', 20)}</button>
      </form>
    </div>`;
  $('#chans').onclick = (e) => { const c = e.target.dataset.c; if (c) { state.chatChannel = c; store.set('l1-channel', c); render(true); } };
  $('#renick').onclick = (e) => {
    e.preventDefault();
    sheet(`<h3>Ton pseudo</h3><form class="form" id="nf"><div class="field"><input type="text" id="nn" maxlength="24" value="${esc(nick())}"></div><p class="faint small">2 à 24 caractères. Évite ton vrai nom.</p><button class="btn">Valider</button></form>`, (root, close) => {
      $('#nf', root).onsubmit = (ev) => { ev.preventDefault(); const v = $('#nn', root).value.trim(); if (v.length >= 2) { store.set('l1-nick', v); close(); render(true); } };
    });
  };
  const ta = $('#text');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });
  $('#composer').onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    const btn = $('#composer button');
    btn.disabled = true;
    try { await api('/api/chat', { method: 'POST', body: { channel: state.chatChannel, nick: nick(), text } }); ta.value = ''; ta.style.height = ''; }
    catch (err) { toast(err.message); }
    btn.disabled = false;
    ta.focus();
  };
  $('#msgs').onclick = async (e) => {
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
  if (near || m.nick === nick()) box.scrollTop = 1e9;
}

// ===== Contacts =====
function viewContacts() {
  const cs = state.data.contacts;
  view().innerHTML = `
    <h1 class="large-title">Parler à qui ?</h1>
    <p class="subtitle">Syndicats, collectifs, soutien. Tu n’es pas seul·e.</p>
    ${cs.length ? `<div class="list">${cs.map((c) => `
      <div class="row"><div style="font-size:26px">✊</div><div class="grow"><div class="title">${esc(c.name)}</div>${c.role ? `<div class="sub">${esc(c.role)}</div>` : ''}${c.how ? `<div class="sub" style="color:var(--text)">${esc(c.how)}</div>` : ''}</div>
      ${c.link ? `<a class="btn small ghost" href="${esc(c.link)}" target="_blank" rel="noopener">Contacter</a>` : ''}</div>`).join('')}</div>`
      : '<div class="card muted">Les syndicats et collectifs ajouteront leurs contacts ici.</div>'}
    <h2 class="section">🕶️ Parler anonymement</h2>
    <a class="card" href="#/chat" style="display:block;color:inherit">Le <b>chat anonyme</b> est ouvert à tou·tes, sans compte. Salon <b>#Entraide</b> pour les cours, partiels, logement, soutien.</a>
    ${igCard('Les infos de la mobilisation, en direct sur Instagram')}
    <h2 class="section">🆘 Urgences & écoute</h2>
    <div class="list">
      <a class="row" href="tel:112" style="color:inherit"><div class="grow"><div class="title">112</div><div class="sub">Urgences (police, pompiers, SAMU)</div></div><span class="pill red">Appeler</span></a>
      <a class="row" href="tel:15" style="color:inherit"><div class="grow"><div class="title">15</div><div class="sub">SAMU, urgence médicale</div></div><span class="pill red">Appeler</span></a>
      <a class="row" href="tel:3114" style="color:inherit"><div class="grow"><div class="title">3114</div><div class="sub">Prévention du suicide, 24h/24, gratuit</div></div><span class="pill blue">Appeler</span></a>
      <a class="row" href="tel:0800235236" style="color:inherit"><div class="grow"><div class="title">Fil Santé Jeunes · 0 800 235 236</div><div class="sub">Écoute anonyme et gratuite pour les 12-25 ans</div></div><span class="pill blue">Appeler</span></a>
    </div>`;
}

// ===== Alertes email =====
function viewAlerts() {
  const d = state.data;
  const campuses = [...new Set(d.buildings.map((b) => b.campus))];
  view().innerHTML = `
    <h1 class="large-title">Alertes email</h1>
    <p class="subtitle">Un bâtiment est bloqué ? Tu reçois un email rouge, lisible en 3 secondes. Désinscription en un clic.</p>
    <div class="card">
      <form class="form" id="sub">
        <div class="field"><label for="email">Ton email (perso ou étudiant)</label><input type="email" id="email" required autocomplete="email" placeholder="prenom.nom@exemple.fr"></div>
        <div><div class="field"><label>Je veux être prévenu·e pour</label></div>
          <label class="check"><input type="checkbox" name="a" value="buildings" checked> 🔴 Bâtiments bloqués / rouverts et blocus</label>
          <label class="check"><input type="checkbox" name="a" value="events" checked> 📣 Nouvelles AG, manifs, rassemblements</label>
          <label class="check"><input type="checkbox" name="a" value="reports" checked> 📝 Comptes rendus d’AG</label>
        </div>
        <div><div class="field"><label>Campus (aucun coché = tous)</label></div>
          ${campuses.map((c) => `<label class="check"><input type="checkbox" name="c" value="${esc(c)}"> ${esc(c)}</label>`).join('')}
        </div>
        <button class="btn red">🔔 M’inscrire</button>
        <p class="faint small">Ton email sert uniquement à ces alertes. Il n’est jamais affiché ni transmis. ${d.mailEnabled ? 'Tu recevras un email de confirmation.' : ''}</p>
      </form>
    </div>
    <div class="card" style="margin-top:14px;display:flex;gap:14px;align-items:center">
      <div style="font-size:26px">📲</div><div class="muted small">Astuce : ajoute ce site à ton écran d’accueil (Partager → « Sur l’écran d’accueil ») pour l’ouvrir comme une app.</div>
    </div>`;
  $('#sub').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#sub button');
    btn.disabled = true;
    try {
      const r = await api('/api/subscribe', { method: 'POST', body: { email: $('#email').value, alerts: $$('input[name=a]:checked').map((x) => x.value), campuses: $$('input[name=c]:checked').map((x) => x.value) } });
      $('#sub').innerHTML = `<div class="empty"><div class="big">✅</div>${esc(r.message)}</div>`;
    } catch (err) { toast(err.message); btn.disabled = false; }
  };
}

// ===== Menu « Plus » (mobile) =====
function viewPlus() {
  const items = NAV.filter((n) => !TABS.some((t) => t.id === n.id));
  const sub = { votes: 'Donne ton avis, anonymement', blog: 'Articles et tribunes', temoignages: 'Violences : témoigner', cr: 'Les AG en flash infos', revendications: 'Soutiens les revendications', contacts: 'Syndicats, écoute, urgences', alertes: 'Emails bâtiments bloqués', modo: 'Accès syndicats' };
  view().innerHTML = `<h1 class="large-title">Plus</h1><p class="subtitle">Tout ce qu’il faut savoir sur la mobilisation.</p>
    <div class="menu-grid">${items.map((n) => `<a href="#/${n.id}">${icon(n.icon)}<span>${n.label}<br><small>${sub[n.id] || ''}</small></span></a>`).join('')}</div>
    ${igCard()}`;
}

// ---------- Feuille modale ----------
function sheet(html, setup) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('.sheet-backdrop', root).onclick = (e) => { if (e.target.classList.contains('sheet-backdrop')) close(); };
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  setup?.($('.sheet', root), close);
  $('.sheet input, .sheet textarea', root)?.focus();
}

// =====================================================================
// Espace modos
// =====================================================================
const MOD_TABS = [
  ['situation', '🚧 Bâtiments'], ['story', '📸 Story Insta'], ['agenda', '📅 Agenda'], ['cr', '🤖 CR + IA'], ['flash', '⚡ Flash'],
  ['votes', '🗳️ Votes'], ['blog', '✍️ Blog'], ['temoignages', '🛡️ Témoignages'], ['revendications', '✊ Revendications'], ['contacts', '📇 Contacts'], ['chat', '🛡️ Chat'], ['comptes', '👥 Comptes'], ['journal', '📜 Journal'], ['moi', '🔑 Mon compte'],
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
      try { state.me = await api('/api/auth/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } }); toast(`Connecté·e : ${state.me.org}`); render(true); }
      catch (err) { toast(err.message); }
    };
    return;
  }
  const tabs = MOD_TABS.filter(([id]) => id !== 'comptes' || state.me.role === 'admin');
  view().innerHTML = `
    <h1 class="large-title">Espace modos</h1>
    <p class="subtitle mono small">${esc(state.me.username)} · ${esc(state.me.org)} · ${state.me.role === 'admin' ? 'admin' : 'modo'} · <span id="mstats">…</span></p>
    <div class="tabs-inline" id="mtabs">${tabs.map(([id, l]) => `<button data-t="${id}" class="${id === state.modTab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="mod"></div>`;
  $('#mtabs').onclick = (e) => { if (e.target.dataset.t) { state.modTab = e.target.dataset.t; render(true); } };
  api('/api/mod/stats').then((s) => { const el = $('#mstats'); if (el) el.textContent = `${s.subscribers} abonné·es · IA ${s.aiEnabled ? s.aiProviders.join(' → ') : 'sans IA'} · email ${s.mailEnabled ? 'ON' : 'OFF'}${s.reported ? ` · ${s.reported} msg signalé(s)` : ''}`; }).catch(() => {});
  const fn = { story: modStory, votes: modPolls, blog: modBlog, temoignages: modTestimonies, situation: modSituation, agenda: modAgenda, cr: modReports, flash: modFlash, revendications: modDemands, contacts: modContacts, chat: modChat, comptes: modAccounts, journal: modJournal, moi: modMe }[state.modTab] || modSituation;
  try { await fn($('#mod')); } catch (err) { if (/Connexion modo/.test(err.message)) { state.me = null; render(true); } else toast(err.message); }
}
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message); throw e; } };

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
  const r = await act(() => api('/api/mod/buildings-batch', { method: 'PUT', body: { changes: list } }));
  if (!r.changed) return toast('Déjà à jour.');
  for (const c of list) { const b = state.data.buildings.find((x) => x.id === c.id); if (b) b.status = c.status; }
  window.drawTiles?.();
  showUndo(r.previous, `${label} · ${r.changed} bâtiment${r.changed > 1 ? 's' : ''}`);
}

function modSituation(el) {
  const d = state.data;
  const b = d.blocus;
  const lastCR = d.reports.find((r) => r.batiments_bloques?.length);
  const canDictate = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  el.innerHTML = `
    <div class="card">
      <div class="kicker">Blocus général · un tap = publié</div>
      <div class="segmented status-seg" id="bstate" style="margin-top:10px">${Object.entries(BLOCUS).map(([k, l]) => `<button data-s="${k}" class="${k === b.state ? 'on ' + ({ actif: 'bloque', partiel: 'partiel', leve: 'ouvert' }[k] || '') : ''}">${{ actif: '🔴 Blocus', partiel: '🟠 Partiel', leve: '🟢 Pas de blocus', inconnu: '?' }[k]}</button>`).join('')}</div>
      <div class="field"><input type="text" id="bmsg" maxlength="400" placeholder="Message court (ex : AG 12h au Déambu, piquet dès 7h)" value="${esc(b.message)}"></div>
      <label class="check small"><input type="checkbox" id="bnotify" checked> Alerte email si le statut change</label>
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

    <h2 class="section">Bâtiments <span class="faint small">touche pour sélectionner, puis choisis la couleur</span></h2>
    <div id="tiles"></div>

    <details class="card" style="margin-top:14px"><summary class="kicker" style="cursor:pointer">＋ Ajouter un bâtiment</summary>
      <form class="form" id="addb" style="margin-top:10px">
        <div class="grid cols-2"><div class="field"><label>Nom</label><input type="text" id="bn" required maxlength="80"></div>
        <div class="field"><label>Campus</label><input type="text" id="bc" list="campuses" maxlength="60" required><datalist id="campuses">${[...new Set(d.buildings.map((x) => x.campus))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
        <button class="btn small">Ajouter</button></form></details>

    <div class="actionbar" id="abar" hidden>
      <span id="abar-n" class="mono"></span>
      <button data-set="bloque" class="ab red">🔴 Bloqué</button>
      <button data-set="partiel" class="ab orange">🟠 Partiel</button>
      <button data-set="ouvert" class="ab green">🟢 Ouvert</button>
      <button data-set="clear" class="ab ghost" aria-label="Désélectionner">✕</button>
    </div>
    <div class="actionbar undo" id="undo" hidden><span id="undo-txt"></span><button class="ab ghost" id="undo-btn">↩️ Annuler</button></div>`;

  // Blocus : publication immédiate au tap
  $('#bstate').onclick = async (e) => {
    const s = e.target.closest('[data-s]')?.dataset.s;
    if (!s) return;
    $$('#bstate button').forEach((x) => (x.className = x.dataset.s === s ? 'on ' + ({ actif: 'bloque', partiel: 'partiel', leve: 'ouvert' }[s] || '') : ''));
    await act(() => api('/api/mod/blocus', { method: 'PUT', body: { state: s, message: $('#bmsg').value, notify: $('#bnotify').checked } }), BLOCUS[s]);
    state.data.blocus.state = s;
  };
  $('#bmsg').onchange = () => act(() => api('/api/mod/blocus', { method: 'PUT', body: { state: state.data.blocus.state, message: $('#bmsg').value, notify: false } }), 'Message publié.');

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
        <div class="qtiles">${list.map((x) => `<button class="qt ${x.status} ${sel.has(x.id) ? 'sel' : ''}" data-id="${esc(x.id)}"><span class="qdot">${STATUS[x.status].dot}</span><span class="qn">${esc(x.name)}</span>${x.note ? '<span class="qnote">✎</span>' : ''}</button>`).join('')}</div>
      </div>`).join('');
    const bar = $('#abar');
    bar.hidden = !sel.size;
    $('#abar-n').textContent = `${sel.size} sélect.`;
  }
  drawTiles();
  let pressTimer = null;
  $('#tiles').addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.qt');
    if (!t) return;
    // appui long = éditer la note / supprimer
    pressTimer = setTimeout(() => { pressTimer = 'long'; editBuilding(t.dataset.id); }, 550);
  });
  $('#tiles').addEventListener('pointerup', () => { if (pressTimer !== 'long') clearTimeout(pressTimer); });
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
    if (s !== 'clear') await applyChanges([...sel].map((id) => ({ id, status: s })), STATUS[s].label);
    sel.clear();
    drawTiles();
  };
  $('#undo-btn').onclick = async () => {
    if (!lastUndo) return;
    const prev = lastUndo; lastUndo = null;
    $('#undo').hidden = true;
    await act(() => api('/api/mod/buildings-batch', { method: 'PUT', body: { changes: prev, undo: true } }), 'Annulé, aucun email ne partira.');
    for (const c of prev) { const x = state.data.buildings.find((y) => y.id === c.id); if (x) x.status = c.status; }
    drawTiles();
  };
  $('#addb').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/buildings', { method: 'POST', body: { name: $('#bn').value, campus: $('#bc').value } }), 'Bâtiment ajouté.'); await refresh(); render(true); };
}
function editBuilding(id) {
  const x = state.data.buildings.find((y) => y.id === id);
  if (!x) return;
  sheet(`<h3>${esc(x.name)}</h3><form class="form" id="eb">
    <div class="field"><label>Note visible par tous (ex : entrée côté tram ouverte)</label><input type="text" id="en" maxlength="240" value="${esc(x.note)}"></div>
    <div class="field"><label>Nom</label><input type="text" id="enm" maxlength="80" value="${esc(x.name)}"></div>
    <div class="btn-row"><button class="btn">Enregistrer</button><button type="button" class="btn red ghost" id="edel">Supprimer le bâtiment</button></div>
    <p class="faint small">Astuce : appui long sur une tuile pour ouvrir cette fiche.</p></form>`, (root, close) => {
    $('#eb', root).onsubmit = async (e) => {
      e.preventDefault();
      await act(() => api(`/api/mod/buildings/${id}`, { method: 'PUT', body: { note: $('#en', root).value, name: $('#enm', root).value } }), 'Enregistré.');
      x.note = $('#en', root).value; x.name = $('#enm', root).value || x.name;
      close(); window.drawTiles?.();
    };
    $('#edel', root).onclick = async () => { if (!confirm('Supprimer ce bâtiment de la liste ?')) return; await act(() => api(`/api/mod/buildings/${id}`, { method: 'DELETE' }), 'Supprimé.'); close(); await refresh(); render(true); };
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
  ctx.fillStyle = '#ff6fae'; ctx.font = `800 40px ${MONO}`; ctx.fillText(igHandle(), 120, H - 172);
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
  const st = d.blocus.state;
  const color = { actif: '#ff453a', partiel: '#ff9f0a', leve: '#30d158', inconnu: '#a1a1aa' }[st];
  storyFrame(ctx, W, H, color);
  let y = 420;
  pill(ctx, 80, y - 70, '● LIVE · STATUT DU CAMPUS', 'rgba(255,69,58,0.18)', '#ff453a');
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
  pill(ctx, 80, 380, `🗳️ VOTE ANONYME · ${p.total} VOTES`, 'rgba(10,132,255,0.2)', '#0a84ff');
  let y = drawBlock(ctx, p.question, 80, 560, W - 160, 84, 900, '#fff', 1.1, 3) + 40;
  const total = p.counts.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...p.counts);
  p.options.forEach((o, i) => {
    const pct = Math.round((p.counts[i] / total) * 100);
    ctx.fillStyle = 'rgba(118,118,128,0.25)'; rrect(ctx, 80, y, W - 160, 120, 28); ctx.fill();
    ctx.fillStyle = p.counts[i] === max ? '#00ff9c55' : '#0a84ff55'; rrect(ctx, 80, y, Math.max(56, (W - 160) * pct / 100), 120, 28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 48px ${SF}`; ctx.fillText(o.slice(0, 26), 120, y + 78);
    ctx.font = `800 52px ${MONO}`; const t = `${pct}%`; ctx.fillText(t, W - 120 - ctx.measureText(t).width, y + 80);
    y += 145;
  });
  ctx.fillStyle = '#a1a1aa'; ctx.font = `500 34px ${SF}`; ctx.fillText(p.open ? `Vote en cours · clôture dans ${remaining(p.closesAt)}` : 'Vote clos · résultat indicatif', 80, y + 40);
}

async function openStory(kind = 'campus') {
  const d = state.data;
  const polls = await api('/api/mod/polls').catch(() => []);
  const options = [
    ['campus', '🏛️ Statut du campus', null],
    ...d.events.slice(0, 4).map((e) => [`ev:${e.id}`, `📣 ${EVENT_TYPE[e.type][0]} · ${e.title.slice(0, 26)}`, e]),
    ...(d.reports[0] ? [[`cr:${d.reports[0].id}`, `📝 CR · ${d.reports[0].titre.slice(0, 24)}`, d.reports[0]]] : []),
    ...polls.filter((p) => !p.hidden && p.total).slice(0, 2).map((p) => [`poll:${p.id}`, `🗳️ ${p.question.slice(0, 28)}`, p]),
  ];
  sheet(`<h3>📸 Story Instagram</h3>
    <div class="tabs-inline" id="skind">${options.map(([k, l]) => `<button data-k="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div class="story-prev"><img id="simg" alt="Aperçu de la story"></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn red" id="sshare">Partager</button><a class="btn ghost" id="sdl" download="story-ladoua-en-lutte.png">Télécharger</a></div>
    <p class="faint small">Format 1080 × 1920, prêt pour Instagram. Sur téléphone, « Partager » ouvre directement Instagram.</p>`, (root) => {
    let blob = null;
    const draw = async (k) => {
      $$('#skind button', root).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      const opt = options.find((o) => o[0] === k) || options[0];
      const c = document.createElement('canvas');
      c.width = 1080; c.height = 1920;
      const ctx = c.getContext('2d');
      if (k.startsWith('ev:')) storyEvent(ctx, 1080, 1920, opt[2]);
      else if (k.startsWith('cr:')) storyReport(ctx, 1080, 1920, opt[2]);
      else if (k.startsWith('poll:')) await storyPoll(ctx, 1080, 1920, opt[2]);
      else storyCampus(ctx, 1080, 1920);
      blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const url = URL.createObjectURL(blob);
      $('#simg', root).src = url;
      $('#sdl', root).href = url;
      $('#sdl', root).download = `story-ladoua-en-lutte-${k.split(':')[0]}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
    };
    $('#skind', root).onclick = (e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) draw(k); };
    $('#sshare', root).onclick = async () => {
      if (!blob) return;
      const file = new File([blob], 'story-ladoua-en-lutte.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch {} }
      else { $('#sdl', root).click(); toast('Image téléchargée : publie-la en story.'); }
    };
    draw(options.some((o) => o[0] === kind) ? kind : 'campus');
  });
}
async function modStory(el) {
  el.innerHTML = `<div class="card"><div class="kicker">Stories Instagram prêtes à publier</div><p class="muted">Statut du campus, prochain rendez-vous, dernier compte rendu ou résultat de vote, au format 1080 × 1920, aux couleurs du site et avec les infos à jour.</p><button class="btn red" id="ostory">📸 Créer une story</button></div>`;
  $('#ostory').onclick = () => openStory('campus');
}

async function modAgenda(el) {
  const all = await api('/api/mod/events/all');
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
      <label class="check"><input type="checkbox" id="en"> Alerter les abonné·es par email</label>
      <div class="btn-row"><button class="btn">Publier</button><button type="button" class="btn ghost" id="ecancel" hidden>Annuler</button></div>
    </form></div>
    <h2 class="section">Tous les rendez-vous</h2>
    <div class="list">${all.map((e) => `<div class="row"><span class="pill ${EVENT_TYPE[e.type][1]}">${EVENT_TYPE[e.type][0]}</span><div class="grow"><div class="title">${esc(e.title)}</div><div class="sub">${esc(dayLabel(e.start))} ${esc(hhmm(e.start))} · ${esc(e.place)}</div></div>
      <button class="icon-btn" data-edit="${esc(e.id)}">${icon('edit', 18)}</button><button class="icon-btn" data-del="${esc(e.id)}">${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  $('#ev').onsubmit = async (e) => {
    e.preventDefault();
    const body = { type: $('#et').value, start: new Date($('#ed').value).toISOString(), title: $('#eti').value, place: $('#ep').value, address: $('#ea').value, description: $('#eds').value, notify: $('#en').checked };
    await act(() => (editing ? api(`/api/mod/events/${editing}`, { method: 'PUT', body }) : api('/api/mod/events', { method: 'POST', body })), editing ? 'Modifié.' : 'Publié.');
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
      $('#ecancel').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
}

// ----- Comptes rendus : PDF → IA en direct → relecture → publication -----
async function modReports(el) {
  const reports = await api('/api/mod/reports');
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
    const res = await fetch('/api/mod/reports/analyze', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) }, body: file, credentials: 'same-origin' });
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
  const save = (extra = {}) => api(`/api/mod/reports/${draft.id}`, { method: 'PUT', body: { ...draft, ...extra } });
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
      <button class="btn">Publier</button></form></div>
    <h2 class="section">Flash publiés</h2>
    <div class="list">${state.data.flashes.map((f) => `<div class="row"><span>${f.level === 'alerte' ? '🚨' : f.level === 'ok' ? '✅' : 'ℹ️'}</span><div class="grow"><div>${esc(f.text)}</div><div class="sub">${esc(ago(f.at))} · ${esc(f.org)}</div></div><button class="icon-btn" data-del="${esc(f.id)}">${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucun.</div>'}</div>`;
  let level = 'info';
  $('#fl').onclick = (e) => { if (e.target.dataset.l) { level = e.target.dataset.l; $$('#fl button').forEach((b) => b.classList.toggle('on', b === e.target)); } };
  $('#ff').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/flashes', { method: 'POST', body: { level, text: $('#ft').value } }), 'Publié.'); await refresh(); render(true); };
  el.querySelector('.list').onclick = async (e) => { const id = e.target.closest('[data-del]')?.dataset.del; if (id) { await act(() => api(`/api/mod/flashes/${id}`, { method: 'DELETE' }), 'Retiré.'); await refresh(); render(true); } };
}

function modDemands(el) {
  el.innerHTML = `
    <div class="card"><form class="form" id="df">
      <div class="kicker">Nouvelle revendication</div>
      <div class="field"><input type="text" id="dt" maxlength="160" required placeholder="Intitulé court"></div>
      <div class="field"><input type="text" id="dc" maxlength="40" placeholder="Catégorie (ex : Bourses, Logement, Examens)"></div>
      <div class="field"><textarea id="dx" maxlength="2000" placeholder="Explication (facultatif)"></textarea></div>
      <button class="btn">Ajouter</button></form></div>
    <h2 class="section">Revendications</h2>
    <div class="list">${state.data.demands.map((d) => `<div class="row" data-id="${esc(d.id)}"><div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">${esc(d.category)} · ✊ ${d.support}</div></div>
      <select data-status style="width:auto">${Object.entries(DEMAND_STATUS).map(([k, [l]]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" data-del>${icon('trash', 18)}</button></div>`).join('') || '<div class="empty">Aucune.</div>'}</div>`;
  $('#df').onsubmit = async (e) => { e.preventDefault(); await act(() => api('/api/mod/demands', { method: 'POST', body: { title: $('#dt').value, category: $('#dc').value, text: $('#dx').value } }), 'Ajoutée.'); await refresh(); render(true); };
  el.querySelector('.list').onchange = (e) => { if (e.target.matches('[data-status]')) act(() => api(`/api/mod/demands/${e.target.closest('.row').dataset.id}`, { method: 'PUT', body: { status: e.target.value } }), 'Statut mis à jour.'); };
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
  const list = await api('/api/mod/chat/reported');
  el.innerHTML = `
    <p class="muted small">Messages signalés ou masqués. Un message est masqué automatiquement après 3 signalements. Sur le chat public, tes messages s’affichent avec le badge de ton organisation.</p>
    <div class="list">${list.map((m) => `<div class="row"><div class="grow"><div class="title">${esc(m.nick)} <span class="faint small">#${esc(m.channel)} · ${esc(ago(m.at))}</span></div><div>${esc(m.text)}</div><div class="sub">${m.reports} signalement(s) ${m.hidden ? '· <b style="color:var(--red)">masqué</b>' : ''}</div></div>
      ${m.hidden ? `<button class="btn small ghost" data-restore="${esc(m.id)}">Rétablir</button>` : `<button class="btn small red" data-hide="${esc(m.id)}">Masquer</button>`}</div>`).join('') || '<div class="empty">Rien à modérer 👌</div>'}</div>`;
  el.onclick = async (e) => {
    const h = e.target.dataset.hide; const r = e.target.dataset.restore;
    if (h) { await act(() => api(`/api/mod/chat/${h}`, { method: 'DELETE' }), 'Masqué.'); render(true); }
    if (r) { await act(() => api(`/api/mod/chat/${r}/restore`, { method: 'POST' }), 'Rétabli.'); render(true); }
  };
}

async function modAccounts(el) {
  const mods = await api('/api/mod/mods');
  el.innerHTML = `
    <div class="card"><form class="form" id="mf">
      <div class="kicker">Créer un accès modo (un par personne)</div>
      <div class="grid cols-2"><div class="field"><label>Identifiant</label><input type="text" id="mu" required pattern="[a-z0-9._\\-]{3,40}" placeholder="solidaires.marie"></div>
      <div class="field"><label>Organisation (affichée publiquement)</label><input type="text" id="mo" required maxlength="80" placeholder="Solidaires Étudiant·es"></div></div>
      <label class="check"><input type="checkbox" id="ma"> Admin (peut créer d’autres comptes)</label>
      <button class="btn">Créer et générer le mot de passe</button></form></div>
    <div class="list" style="margin-top:14px">${mods.map((m) => `<div class="row"><div class="grow"><div class="title">${esc(m.username)} ${m.role === 'admin' ? '<span class="pill purple">admin</span>' : ''} ${m.disabled ? '<span class="pill grey">désactivé</span>' : ''}</div><div class="sub">${esc(m.org)}</div></div>
      <button class="btn small ghost" data-reset="${esc(m.id)}">Nouveau mdp</button>${m.disabled || m.id === state.me.id ? '' : `<button class="btn small red" data-off="${esc(m.id)}">Désactiver</button>`}</div>`).join('')}</div>`;
  const showPw = (m) => sheet(`<h3>Accès pour ${esc(m.username)}</h3><p class="muted">Transmets-le en main propre ou par messagerie chiffrée (Signal). Il ne sera plus affiché.</p><div class="secret">${esc(m.password)}</div><p class="faint small">La personne pourra le changer dans « Mon compte ».</p>`);
  $('#mf').onsubmit = async (e) => { e.preventDefault(); const m = await act(() => api('/api/mod/mods', { method: 'POST', body: { username: $('#mu').value, org: $('#mo').value, role: $('#ma').checked ? 'admin' : 'mod' } })); showPw(m); await modAccounts(el); };
  el.querySelector('.list').onclick = async (e) => {
    const r = e.target.dataset.reset; const o = e.target.dataset.off;
    if (r && confirm('Générer un nouveau mot de passe ? L’ancien ne marchera plus.')) { showPw(await act(() => api(`/api/mod/mods/${r}/reset`, { method: 'POST' }))); await modAccounts(el); }
    if (o && confirm('Désactiver ce compte ?')) { await act(() => api(`/api/mod/mods/${o}`, { method: 'DELETE' }), 'Désactivé.'); await modAccounts(el); }
  };
}

async function modJournal(el) {
  const list = await api('/api/mod/audit');
  el.innerHTML = `<div class="terminal"><div class="bar"><i></i><i></i><i></i><span>audit.log</span></div><div class="body" style="max-height:none">${list.map((a) => `<div class="line"><span class="t">[${esc(fmt(a.at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}]</span> ${esc(a.by)} (${esc(a.org)}) · ${esc(a.action)} · ${esc(a.detail)}</div>`).join('') || '<div class="line">vide</div>'}</div></div>`;
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
    <div class="chips"><span class="pill ${p.open ? 'red' : 'grey'}">${p.open ? `● EN COURS · clôture dans ${esc(remaining(p.closesAt))}` : 'CLOS'}</span><span class="pill grey">${p.total} vote${p.total > 1 ? 's' : ''}</span></div>
    <h3 style="margin:10px 0 4px;font-size:20px">${esc(p.question)}</h3>
    ${p.description ? `<p class="muted" style="margin:0 0 6px">${esc(p.description)}</p>` : ''}
    <div class="opts">${p.options.map((o, i) => {
      const n = p.counts ? p.counts[i] : null;
      const pct = n !== null && total ? Math.round((n / total) * 100) : 0;
      if (p.open && !voted) return `<button class="opt" data-opt="${i}">${esc(o)}</button>`;
      return `<div class="opt res ${p.myVote === i ? 'mine' : ''}"><i style="width:${pct}%"></i><span>${p.myVote === i ? '✓ ' : ''}${esc(o)}</span><b>${n === null ? '?' : pct + '%'}</b></div>`;
    }).join('')}</div>
    <div class="faint small" style="margin-top:8px">${voted ? 'Ton vote est enregistré (anonyme). ' : ''}${!p.counts ? 'Résultats affichés à la clôture. ' : ''}Lancé par ${esc(p.org)} · fin ${esc(fmt(p.closesAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div>
  </div>`;
}
async function viewPolls() {
  view().innerHTML = `
    <h1 class="large-title">Votes anonymes</h1>
    <p class="subtitle">Donne ton avis en un tap. Aucun compte, aucune trace de qui a voté quoi. 1 vote par appareil.</p>
    <div class="notice">ℹ️ Ces votes sont <b>indicatifs</b> : ils servent à prendre la température. Les décisions se votent en AG.</div>
    <div id="polls"><div class="empty faint mono typing">chargement</div></div>`;
  try {
    const polls = await api('/api/polls');
    const box = $('#polls');
    if (!box) return;
    box.innerHTML = polls.length ? polls.map(pollHtml).join('') : '<div class="card empty"><div class="big">🗳️</div>Aucun vote en cours. Les modos en lanceront ici.</div>';
    box.onclick = async (e) => {
      const opt = e.target.closest('[data-opt]');
      if (!opt) return;
      const card = opt.closest('[data-poll]');
      $$('button', card).forEach((b) => (b.disabled = true));
      try {
        const p = await api(`/api/polls/${card.dataset.poll}/vote`, { method: 'POST', body: { option: Number(opt.dataset.opt) } });
        card.outerHTML = pollHtml(p);
        toast('A voté ✊');
      } catch (err) { toast(err.message); $$('button', card).forEach((b) => (b.disabled = false)); }
    };
  } catch (err) { $('#polls').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

// ----- Blog -----
async function viewBlog(id) {
  if (id) {
    view().innerHTML = '<div class="empty faint mono typing">chargement</div>';
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
    const posts = await api('/api/blog');
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
        <a class="row" href="tel:3114" style="color:inherit;padding-left:0"><div class="grow"><div class="title">3114 · écoute 24h/24</div><div class="sub">Si c’est trop lourd à porter, parles-en</div></div><span class="pill blue">Appeler</span></a>
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
      <div class="field"><label>Photos / vidéos (6 max · vidéo 150 Mo max)</label><input type="file" id="tf" accept="image/*,video/mp4,video/quicktime,video/webm" multiple></div>
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
  const polls = await api('/api/mod/polls');
  el.innerHTML = `
    <div class="card"><form class="form" id="pf">
      <div class="kicker">Nouveau vote anonyme</div>
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
      <b style="display:block;margin:8px 0">${esc(p.question)}</b>
      ${p.options.map((o, i) => `<div class="kv"><span>${esc(o)}</span><b class="mono">${p.counts[i]}</b></div>`).join('')}
      <div class="btn-row" style="margin-top:8px">${p.open ? '<button class="btn small red" data-a="close">Clore maintenant</button>' : ''}<button class="btn small ghost" data-a="extend">+24 h</button><button class="btn small ghost" data-a="hide">${p.hidden ? 'Afficher' : 'Masquer'}</button><button class="btn small ghost" data-a="del">Supprimer</button></div>
    </div>`).join('') || '<div class="empty">Aucun vote.</div>'}`;
  $('#pdur').onchange = (e) => ($('#pcw').hidden = e.target.value !== 'custom');
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const custom = $('#pdur').value === 'custom';
    await act(() => api('/api/mod/polls', { method: 'POST', body: { question: $('#pq').value, description: $('#pd').value, options: $('#po').value.split('\n'), duration: $('#pdur').value, closesAt: custom && $('#pc').value ? new Date($('#pc').value).toISOString() : undefined, results: $('#plive').checked ? 'live' : 'after' } }), 'Vote lancé.');
    render(true);
  };
  el.onclick = async (e) => {
    const a = e.target.dataset.a;
    const card = e.target.closest('[data-id]');
    if (!a || !card) return;
    const id = card.dataset.id;
    const p = polls.find((x) => x.id === id);
    if (a === 'close' && confirm('Clore ce vote maintenant ?')) await act(() => api(`/api/mod/polls/${id}`, { method: 'PUT', body: { close: true } }), 'Clos.');
    if (a === 'extend') await act(() => api(`/api/mod/polls/${id}`, { method: 'PUT', body: { extendHours: 24 } }), 'Prolongé de 24 h.');
    if (a === 'hide') await act(() => api(`/api/mod/polls/${id}`, { method: 'PUT', body: { hidden: !p.hidden } }), 'OK.');
    if (a === 'del' && confirm('Supprimer ce vote et ses résultats ?')) await act(() => api(`/api/mod/polls/${id}`, { method: 'DELETE' }), 'Supprimé.');
    render(true);
  };
}

// ----- Modos : blog -----
async function modBlog(el) {
  const posts = await api('/api/mod/posts');
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
  const [items, q] = await Promise.all([api('/api/mod/testimonies'), api('/api/mod/queue')]);
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
      status: a, text: $('[data-f=text]', card).value, place: $('[data-f=place]', card).value, sensitive: $('[data-f=sensitive]', card).checked,
      publishMedia: $$('[data-m]', card).filter((c) => c.checked).map((c) => c.dataset.m),
    } }), 'Enregistré.');
    render(true);
  };
}

// ---------- Données + temps réel ----------
async function refresh() {
  state.data = await api('/api/state');
  const ig = document.getElementById('ig-side');
  if (ig) { ig.href = igUrl(); ig.querySelector('b').textContent = igHandle(); }
  setOnline(state.data.online);
}
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { await refresh(); } catch { return; }
    const r = route().split('/')[0];
    if (r === 'chat') { renderNav(); renderAlertBar(); return; }
    if (r === 'modo' && state.me) { renderNav(); renderAlertBar(); if (state.modTab === 'situation') window.drawTiles?.(); return; }
    render();
  }, 250);
}
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
  es.addEventListener('poll', () => { scheduleRefresh(); if (route() === 'votes' && !$('.sheet')) viewPolls(); });
  for (const [ev, r] of [['blog', 'blog'], ['testimonies', 'temoignages']]) es.addEventListener(ev, () => { if (route() === r && !$('.sheet')) render(); });
  es.addEventListener('chat-del', (e) => { const id = JSON.parse(e.data).id; $(`.msg[data-id="${CSS.escape(id)}"]`)?.remove(); });
  es.addEventListener('demand', (e) => {
    const { id, support } = JSON.parse(e.data);
    const d = state.data?.demands.find((x) => x.id === id);
    if (d) d.support = support;
    const b = $(`.support[data-id="${CSS.escape(id)}"] b`);
    if (b) b.textContent = support;
  });
  es.onerror = () => { $('#online-side').textContent = 'reconnexion…'; };
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

// ---------- Démarrage ----------
(async function start() {
  render(true);
  matrix();
  try { state.me = await api('/api/auth/me'); } catch {}
  try { await refresh(); } catch (e) { view().innerHTML = `<div class="empty">Serveur injoignable. ${esc(e.message)}</div>`; }
  render(true);
  connectLive();
  setInterval(() => { if (route() === '' && !document.hidden) { const m = $('.hero .meta'); if (m && state.data) m.textContent = `MAJ ${ago(state.data.blocus.updatedAt)}${state.data.blocus.by ? ' · ' + state.data.blocus.by : ''}`; } }, 30000);
})();
