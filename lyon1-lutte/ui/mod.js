// =====================================================================
// Espace modo — code chargé UNIQUEMENT après connexion.
// Servi par la route protégée /api/mod/ui.js (voir server.js) : un visiteur
// anonyme ne reçoit JAMAIS ce fichier. C'est ici que va, petit à petit, tout
// ce qui n'a pas besoin d'être dans le code public (outils modo/admin).
//
// Pattern (à suivre par Claude ET Copilot, pour ne rien casser) :
//   1. Couper une fonction mod* depuis public/app.js (définition entière).
//   2. La coller ici, à l'intérieur de la fonction ci-dessous.
//   3. L'ajouter dans Object.assign(MODV, { <onglet>: <fonction> }).
//   4. La retirer de l'objet `localFn` dans viewModo (public/app.js).
//   5. Tester : connexion modo + l'onglet déplacé + une page publique.
// Les fonctions ici partagent le même scope global que app.js : elles peuvent
// appeler esc, api, act, $, $$, state, render, toast, siteList, etc.
// Ne déplacer une fonction que si elle n'est PAS aussi utilisée par une vue
// publique (ex. pollHtml, pollTimeline, mediaHtml restent dans app.js).
// =====================================================================
(function () {
  const MODV = (window.MODV = window.MODV || {});

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
        ${a.text ? `<div class="desc">${linkify(a.text)}</div>` : ''}
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

async function modEnsemble(el) {
  const list = await api('/api/mod/ensemble');
  const row = (x, kind) => `<div class="row" data-eid="${esc(x.id)}"><div class="grow"><div class="title">${kind === 'p' ? `n°${x.num} · ${esc(x.title)}` : `↳ modification : ${esc(x.text.slice(0, 140))}`}</div>
    <div class="sub">${esc(ago(x.at))} · ${x.reports} signalement(s) · pont ${x.bridge}${x.hidden ? ' · <b style="color:var(--red)">masqué</b>' : ''}</div></div>
    <button class="btn small ${x.hidden ? '' : 'red ghost'}" data-eh="${x.hidden ? 0 : 1}">${x.hidden ? 'Rétablir' : 'Masquer'}</button></div>`;
  el.innerHTML = `<div class="card"><div class="kicker">🕊️ On en parle · <a href="#/ensemble">ouvrir la page</a></div>
    <p class="muted small">Espace neutre : on ne masque <b>que</b> ce qui enfreint la charte (insulte, attaque contre des personnes, info personnelle). Une idée qui ne te plaît pas reste en ligne. 3 signalements de téléphones connus = masqué automatiquement en attendant un·e modo.</p></div>
    <div class="list">${list.map((p) => row(p, 'p') + p.amends.map((a) => row(a, 'a')).join('')).join('') || '<div class="empty">Aucune idée pour le moment.</div>'}</div>`;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-eh]');
    if (!b) return;
    const id = b.closest('[data-eid]').dataset.eid;
    await act(() => api(`/api/mod/ensemble/${encodeURIComponent(id)}`, { method: 'PUT', body: { hidden: b.dataset.eh === '1' } }), 'OK.');
    modEnsemble(el);
  };
}

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
          <div class="small ${m.cleaned ? 'faint' : ''}" style="${m.cleaned ? '' : 'color:var(--orange)'}">${m.cleaned ? '✓ métadonnées retirées' : '⚠️ métadonnées non retirées : ne sera pas publié'}</div>
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

  Object.assign(MODV, { journal: modJournal, moi: modMe, revendications: modDemands, contacts: modContacts, sites: modSites, audience: modAudience, flash: modFlash, chat: modChat, entraide: modEntraide, droits: modDroits , agenda: modAgenda, cr: modReports, ensemble: modEnsemble, blog: modBlog, temoignages: modTestimonies });
})();
