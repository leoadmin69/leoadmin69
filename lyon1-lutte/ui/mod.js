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

  Object.assign(MODV, { journal: modJournal, moi: modMe, revendications: modDemands, contacts: modContacts, sites: modSites, audience: modAudience });
})();
