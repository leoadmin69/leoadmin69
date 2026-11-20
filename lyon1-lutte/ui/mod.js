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

  Object.assign(MODV, { journal: modJournal, moi: modMe, revendications: modDemands, contacts: modContacts, sites: modSites, audience: modAudience, flash: modFlash, chat: modChat, entraide: modEntraide, droits: modDroits });
})();
